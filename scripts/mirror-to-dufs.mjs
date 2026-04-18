#!/usr/bin/env node
/**
 * Mirror star-assets GitHub Pages repos onto a dufs instance via WebDAV PUT.
 *
 * Usage:
 *   DUFS_URL=https://dist.sc2arcade.com DUFS_AUTH=user:pass \
 *     node scripts/mirror-to-dufs.mjs [--only <repo>] [--dry-run] [--refresh] [--concurrency N]
 *
 * Credentials (first match wins):
 *   1. DUFS_URL / DUFS_AUTH env vars
 *   2. ./.env file (KEY=VALUE lines)
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// Derive the mirror list from site/list/*.ini section headers — that's the
// source of truth for what the app actually fetches. Section headers that
// look like paths (e.g. `assets/Tilesets`) are already served from dufs as
// one-off uploads and are skipped here.
// ---------------------------------------------------------------------------
const LIST_DIR = 'site/list';
// INI sections that aren't real github.com/star-assets/<name> repos.
const SECTION_SKIP = new Set([
  'models-all-races-glb', // stale / non-existent repo
]);
// Repos needed by hardcoded URLs in HTML (not referenced via an INI section).
const EXTRA_REPOS = ['models-glb'];

function discoverRepos() {
  const headers = new Set();
  for (const f of readdirSync(LIST_DIR)) {
    if (!f.endsWith('.ini')) continue;
    const text = readFileSync(join(LIST_DIR, f), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\[(.+?)\]$/);
      if (!m) continue;
      const name = m[1];
      if (name.includes('/')) continue;    // terrain paths — already on dufs
      if (SECTION_SKIP.has(name)) continue;
      headers.add(name);
    }
  }
  for (const r of EXTRA_REPOS) headers.add(r);
  return [...headers].sort();
}

const ALL_REPOS = discoverRepos();

const GITHUB_ORG = 'star-assets';
const DEFAULT_CACHE_DIR = '.mirror-cache';
const SKIP_NAMES = new Set(['README.md', 'LICENSE', 'LICENSE.txt', '.gitattributes', 'index.html']);

const MIME = {
  '.png': 'image/png',
  '.dds': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const { values: args, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'dry-run':     { type: 'boolean', default: false },
    'refresh':     { type: 'boolean', default: false },
    'only':        { type: 'string',  multiple: true },
    'concurrency': { type: 'string',  default: '8' },
    'help':        { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

if (args.help) {
  console.log(`Usage: node scripts/mirror-to-dufs.mjs [options]

Options:
  --only <repo>        Mirror only this repo (repeatable)
  --dry-run            Print what would be uploaded, don't actually upload
  --refresh            Re-upload even files that already exist on dufs
  --concurrency N      Parallel upload workers (default: 8)
  --help               Show this help

Env vars (also read from .env):
  DUFS_URL             Base URL of the dufs instance (required)
  DUFS_AUTH            user:pass for HTTP Basic auth (required)
  DUFS_CACHE_DIR       Where to clone source repos (default: .mirror-cache)
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Config from env / .env
// ---------------------------------------------------------------------------
function loadDotEnv() {
  try {
    const text = readFileSync('.env', 'utf8');
    const result = {};
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) result[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    return result;
  } catch {
    return {};
  }
}

const dotenv = loadDotEnv();
const DUFS_URL = (process.env.DUFS_URL || dotenv.DUFS_URL || '').replace(/\/$/, '');
const DUFS_AUTH = process.env.DUFS_AUTH || dotenv.DUFS_AUTH || '';
const CACHE_DIR = process.env.DUFS_CACHE_DIR || dotenv.DUFS_CACHE_DIR || DEFAULT_CACHE_DIR;

const missing = [];
if (!DUFS_URL) missing.push('DUFS_URL');
if (!DUFS_AUTH) missing.push('DUFS_AUTH');
if (missing.length) {
  console.error(`Error: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} required. Set in env or .env.`);
  process.exit(1);
}

const concurrency = Math.max(1, parseInt(args.concurrency, 10) || 8);
const dryRun      = args['dry-run'];
const refresh     = args.refresh;
const onlyRepos   = args.only?.length ? new Set(args.only) : null;

const repos = onlyRepos ? ALL_REPOS.filter(r => onlyRepos.has(r)) : ALL_REPOS;
if (onlyRepos) {
  const unknown = [...onlyRepos].filter(r => !ALL_REPOS.includes(r));
  if (unknown.length) console.warn(`Warning: unknown repos ignored: ${unknown.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------
async function checkAuth() {
  const headers = authHeaders();
  const res = await fetch(DUFS_URL + '/', { method: 'HEAD', headers });
  if (res.status === 401 || res.status === 403) {
    console.error(`Error: dufs returned ${res.status} — DUFS_AUTH rejected. Check credentials.`);
    process.exit(1);
  }
  if (!res.ok && res.status !== 405) {
    console.error(`Error: dufs unreachable — HEAD / returned ${res.status}`);
    process.exit(1);
  }
}

function authHeaders() {
  const h = {};
  if (DUFS_AUTH) h['Authorization'] = 'Basic ' + Buffer.from(DUFS_AUTH).toString('base64');
  return h;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------
function tryRun(cmd) {
  try { execSync(cmd, { stdio: 'pipe' }); return true; }
  catch { return false; }
}

// Clone strategies, tried in order: ssh → https → gh CLI.
function cloneRepo(repo, dest) {
  const sshRemote   = `git@github.com:${GITHUB_ORG}/${repo}.git`;
  const httpsRemote = `https://github.com/${GITHUB_ORG}/${repo}.git`;

  if (tryRun(`git clone --depth=1 -q "${sshRemote}" "${dest}"`)) return 'ssh';
  console.log(`  [git] ssh failed, trying https…`);
  if (tryRun(`git clone --depth=1 -q "${httpsRemote}" "${dest}"`)) return 'https';
  console.log(`  [git] https failed, trying gh…`);
  if (tryRun(`gh repo clone ${GITHUB_ORG}/${repo} "${dest}" -- --depth=1 -q`)) return 'gh';
  throw new Error(`all clone strategies failed for ${repo}`);
}

// Re-sync an existing shallow clone. Short-circuit via `ls-remote` when the
// local tip already matches the remote — shallow clones can't do real
// incremental object fetches, so the cheapest "no change" path is a SHA
// compare. On mismatch, fetch the tip and hard-reset.
// Returns 'unchanged' | 'updated' | null (on failure).
function updateRepo(dest) {
  try {
    const remoteSha = execSync(`git -C "${dest}" ls-remote origin HEAD`, { stdio: ['ignore', 'pipe', 'pipe'] })
      .toString().split(/\s+/)[0];
    const localSha = execSync(`git -C "${dest}" rev-parse HEAD`, { stdio: ['ignore', 'pipe', 'pipe'] })
      .toString().trim();
    if (remoteSha && remoteSha === localSha) return 'unchanged';

    execSync(`git -C "${dest}" fetch --depth=1 origin HEAD -q`, { stdio: 'pipe' });
    execSync(`git -C "${dest}" reset --hard FETCH_HEAD -q`, { stdio: 'pipe' });
    return 'updated';
  } catch {
    return null;
  }
}

function cloneOrUpdate(repo) {
  const dest = join(CACHE_DIR, repo);

  if (existsSync(join(dest, '.git'))) {
    process.stdout.write(`  [git] updating ${repo}… `);
    const result = updateRepo(dest);
    if (result === 'unchanged') { console.log('unchanged'); return; }
    if (result === 'updated')   { console.log('updated');   return; }
    console.log('update failed, recloning…');
    rmSync(dest, { recursive: true, force: true });
  } else if (existsSync(dest)) {
    // Partial/corrupt directory from a previously aborted clone — clean it up.
    console.log(`  [git] clearing partial ${repo}…`);
    rmSync(dest, { recursive: true, force: true });
  }

  process.stdout.write(`  [git] cloning ${repo}… `);
  const method = cloneRepo(repo, dest);
  console.log(`ok (${method})`);
}

// ---------------------------------------------------------------------------
// File walk
// ---------------------------------------------------------------------------
function* walkFiles(dir, base = dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full, base);
    } else {
      yield relative(base, full);
    }
  }
}

// ---------------------------------------------------------------------------
// Upload worker pool
// ---------------------------------------------------------------------------
const isTTY = process.stdout.isTTY;

function renderProgress(repo, done, total, stats) {
  if (!isTTY) return;
  const pct = total ? Math.floor((done / total) * 100) : 100;
  const bar = '█'.repeat(Math.floor(pct / 5)).padEnd(20, '░');
  const line = `  [${bar}] ${pct.toString().padStart(3)}%  ${done}/${total}  ↑${stats.uploaded} =${stats.skipped} ✗${stats.failed}  ${repo}`;
  process.stdout.write('\r\x1b[2K' + line);
}

function clearProgress() {
  if (isTTY) process.stdout.write('\r\x1b[2K');
}

async function processRepo(repo) {
  const localDir = join(CACHE_DIR, repo);
  const files = [...walkFiles(localDir)];
  const total = files.length;
  const stats = { uploaded: 0, skipped: 0, failed: 0 };
  console.log(`  [files] ${total}`);

  let active = 0;
  let done = 0;
  const queue = [...files];
  const errors = [];
  let lastRender = 0;

  await new Promise((resolve) => {
    function next() {
      while (active < concurrency && queue.length) {
        const relPath = queue.shift();
        active++;
        uploadFile(repo, localDir, relPath, stats, errors).finally(() => {
          active--;
          done++;
          const now = Date.now();
          if (done === total || now - lastRender > 100) {
            renderProgress(repo, done, total, stats);
            lastRender = now;
          }
          if (queue.length === 0 && active === 0) resolve();
          else next();
        });
      }
      if (queue.length === 0 && active === 0) resolve();
    }
    renderProgress(repo, 0, total, stats);
    next();
  });

  clearProgress();
  for (const err of errors.slice(0, 20)) console.error(`  [error] ${err}`);
  if (errors.length > 20) console.error(`  [error] … and ${errors.length - 20} more`);
  return stats;
}

async function uploadFile(repo, localDir, relPath, stats, errors) {
  const fullPath = join(localDir, relPath);
  const targetUrl = `${DUFS_URL}/star-assets/${repo}/${relPath.replace(/\\/g, '/')}`;
  const ext = relPath.slice(relPath.lastIndexOf('.')).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    if (!refresh) {
      const head = await fetch(targetUrl, { method: 'HEAD', headers: authHeaders() });
      if (head.ok) {
        const remoteLen = head.headers.get('content-length');
        const localLen  = statSync(fullPath).size;
        if (remoteLen && parseInt(remoteLen, 10) === localLen) {
          if (dryRun) console.log(`  [skip] ${repo}/${relPath}`);
          stats.skipped++;
          return;
        }
      }
    }

    if (dryRun) {
      console.log(`  [upload] ${repo}/${relPath}`);
      stats.uploaded++;
      return;
    }

    const fileSize = statSync(fullPath).size;
    const body = readFileSync(fullPath);
    const res = await fetch(targetUrl, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': contentType, 'Content-Length': String(fileSize) },
      body,
    });

    if (!res.ok) throw new Error(`PUT ${res.status} ${res.statusText}`);
    stats.uploaded++;
  } catch (e) {
    stats.failed++;
    errors.push(`${repo}/${relPath}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`dufs target: ${DUFS_URL}`);
  console.log(`mode: ${dryRun ? 'DRY RUN' : 'LIVE'}${refresh ? ' + refresh' : ''}`);
  console.log(`repos: ${repos.join(', ')}\n`);

  if (!dryRun) await checkAuth();

  const totals = { uploaded: 0, skipped: 0, failed: 0 };
  let hasFailure = false;

  for (const repo of repos) {
    console.log(`\n=== ${repo} ===`);
    try {
      cloneOrUpdate(repo);
    } catch (e) {
      console.error(`  [error] git failed for ${repo}: ${e.message}`);
      totals.failed++;
      hasFailure = true;
      continue;
    }

    const stats = await processRepo(repo);
    console.log(`  uploaded: ${stats.uploaded}  skipped: ${stats.skipped}  failed: ${stats.failed}`);
    totals.uploaded += stats.uploaded;
    totals.skipped  += stats.skipped;
    totals.failed   += stats.failed;
    if (stats.failed) hasFailure = true;
  }

  console.log(`\n=== TOTAL ===`);
  console.log(`uploaded: ${totals.uploaded}  skipped: ${totals.skipped}  failed: ${totals.failed}`);

  if (hasFailure) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
