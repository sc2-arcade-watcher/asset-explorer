import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AssetListSchema, ALLOWED_LISTS } from './list-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const listDir = join(__dirname, '..', 'site', 'list');

const errors = [];

const present = readdirSync(listDir).filter((f) => f.endsWith('.json'));
const presentNames = present.map((f) => f.replace(/\.json$/, ''));

const extras = presentNames.filter((n) => !ALLOWED_LISTS.includes(n));
if (extras.length) errors.push(`Unexpected JSON files: ${extras.join(', ')}`);

const missing = ALLOWED_LISTS.filter((n) => !presentNames.includes(n));
if (missing.length) errors.push(`Missing JSON files: ${missing.join(', ')}`);

for (const name of ALLOWED_LISTS) {
    if (!presentNames.includes(name)) continue;
    const path = join(listDir, `${name}.json`);
    let data;
    try {
        data = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
        errors.push(`${name}.json: invalid JSON — ${e.message}`);
        continue;
    }
    const result = AssetListSchema.safeParse(data);
    if (!result.success) {
        for (const issue of result.error.issues) {
            errors.push(`${name}.json: ${issue.path.join('.')} — ${issue.message}`);
        }
        continue;
    }
    if (result.data.category !== name) {
        errors.push(`${name}.json: category "${result.data.category}" must match filename`);
    }
    const seen = new Set();
    for (const item of result.data.items) {
        if (seen.has(item.name)) {
            errors.push(`${name}.json: duplicate item name "${item.name}"`);
        }
        seen.add(item.name);
    }
}

if (errors.length) {
    console.error(`list-integrity: ${errors.length} problem(s)`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
}

console.log(`list-integrity: OK (${ALLOWED_LISTS.length} files validated)`);
