# Explorer — SC2Mapster Asset Explorer

Static site for browsing StarCraft II modding assets.
Served at `https://asset-explorer.sc2arcade.com`

## Architecture

- **Pure static site** — no build system, vanilla HTML/CSS/JS with ES modules
- **Web content lives in `site/`** — Caddy mounts `./site:/srv:ro`; `Caddyfile` and `docker-compose.yml` stay at repo root (not web-accessible)
- **Assets hosted externally** at `https://dist.sc2arcade.com/star-assets/` (mirrored from star-assets GitHub repos; served by [dufs](https://github.com/sigoden/dufs)); use `scripts/mirror-to-dufs.mjs` to sync
- **Vendored deps:** Three.js (`site/lib/three/`), JSZip (`site/lib/jszip.js`), PhotoSwipe 5 (`site/lib/photoswipe/`, lazy-loaded on first lightbox open)
- **No build step** — site is pure static files; `package.json` exists only for test tooling (`@playwright/test`)

## HTML Pages

Every category page is a thin stub: import `initPage` + `createItemList`, call both. The shared shell (header, search, grid container, footer, preloader) is injected by `init-page.js`.

| Page | Asset Type | Grid Class | List Key |
|------|-----------|------------|----------|
| `site/index.html` | Landing/nav | `.links` | — |
| `site/buttons.html` | Button icons | `.icons-grid` (76px) | `buttons` |
| `site/icons.html` | Small icons | `.icons-small-grid` (30px) | `icons` |
| `site/art.html` | Art | `.art-grid` (150x100px) | `art` |
| `site/portraits.html` | Portraits | `.portraits-grid` (100x150px) | `portraits` |
| `site/overlays.html` | Overlays | `.overlays-grid` | `overlays` |
| `site/consoles.html` | Console UI | `.art-grid` | `consoles` |
| `site/ui.html` | UI elements | `.ui-grid` | `ui` |
| `site/wireframes.html` | Wireframes | `.wireframes-grid` | `wireframes` |
| `site/models.html` | 3D models | `.icons-grid` | `models` |
| `site/sprites.html` | Sprites | `.sprites-grid` | `sprites` (hidden in nav) |
| `site/terrain-cliffs.html` | Terrain Cliffs | `.icons-grid` | `terrain-cliffs` |
| `site/terrain-doodads.html` | Terrain Doodads | `.icons-grid` | `terrain-doodads` |
| `site/terrain-tilesets.html` | Terrain Tilesets | `.icons-grid` | `terrain-tilesets` |

## Core JS

- **`site/src/init-page.js`** — `initPage({title, description, searchPlaceholder, gridClass, intro, preloaderLabel, ...})` writes document title/meta and appends the shared DOM shell. Every category page calls it first.
- **`site/src/script.js`** — `createItemList(config)` is the main engine. Loads a single JSON asset list from `site/list/{list}.json`, renders an infinite-scroll grid, debounced search (300ms), clipboard copy via `[data-copy]`, fade-in images, grid toolbar (preview size + batch size), PhotoSwipe lightbox. Items expose `name`, `download`, `image` (optionally `description`). Key config:
  - `thumbnail: { size }` + `hrefBuilder(item)` — default renderer (defaults to `item.download`); skip by passing custom `renderItemFn`
  - `onItemClick(item, e)` or `lightbox: true` (default) — click behavior; modifier/middle click always passes through to the anchor
  - `batchSize` (default 200, picker: 100/200/500/all), `previewSize` (small/medium/large/list, persisted in `localStorage`)
- **`site/src/player.js`** — `<glb-viewer>` custom web component (Shadow DOM, Three.js). Auto-rotates GLB models, draggable panel on models.html.
- **`site/src/styles.css`** — Dark sci-fi theme (`#0b0f14` bg, `#e04a14` SC2Mapster orange accent), "Starcraft" custom font for h1, "Michroma" for body. `[data-preview-size]` on `.icons-grid` drives tile sizing via `--tile-scale`; `.icon-item::before` carries the hover border. Responsive at 600px.
- **`site/src/discord-widgets.js`** — Vanilla ES module. Fetches Discord widget API per server (name, online count, banner), caches in `localStorage` with 2-hour TTL, falls back to a static invite card. Used by `index.html`.

## Data Format (`site/list/`)

One JSON file per category (13 total), validated by `test/list-schema.js` (Zod). Shape:
```json
{
  "category": "buttons",
  "name": "Buttons",
  "items": [
    { "name": "(0)wood0", "download": "buttons/(0)wood0.dds", "image": "buttons-png/(0)wood0.png" }
  ]
}
```
`assetBase` defaults to `https://dist.sc2arcade.com/star-assets/`; category JSONs omit it unless overriding. Three category shapes:
- **Paired** (art, buttons, consoles, icons, overlays, portraits, sprites, ui, wireframes) — `download` points at the DDS, `image` at the matching PNG. Pre-merged at generation time (only items present in both DDS and PNG indexes).
- **Models** (`models.json`) — `download` is the GLB (`models-glb/<name>.glb`), `image` is the PNG preview. Items without a GLB are dropped; `download` may be an empty string for entries kept as preview-only.
- **Terrain** (`terrain-cliffs`, `terrain-doodads`, `terrain-tilesets`) — `download === image`, both point at the JPG under `terrain-<category>/` using the original filename with literal spaces (no percent-encoding). Display `name` strips the `.jpg` extension but otherwise matches the filename exactly.

`item.description` is an optional string. `download` may be empty — the UI hides the download/viewer affordance when it is.

## Local Dev & Testing

Tests go through the real Caddy+imageproxy stack. `make` targets auto-start it via `docker compose` — there's no longer a python3 fallback.

The stack defaults to `CACHE_CONTROL=no-store` locally; production overrides via `docker-compose.override.yml`.

```bash
cp .env.example .env && make up            # start stack
make test                                  # list schema + api + browser; auto-starts stack
make test-lists                            # JSON schema integrity only (no stack needed)
make test-smoke                            # api project; auto-starts stack
make test-browser                          # chromium project; auto-starts stack
make test-fast                             # list schema + api + browser; stack must already be up
BASE_URL=https://... make test-smoke       # target an external stack instead
HTTP_PORT=8091 make test                   # parallel stack on a different port
```

**Package manager:** pnpm. Run `pnpm install` once before tests.

**Parallel agents / worktrees:** each worktree has a distinct directory name, which docker-compose uses as the project name — so stacks don't collide. Give each agent a unique `HTTP_PORT` so host port bindings don't fight.

Parallel workflow — main session owns Docker, subagents run list-schema checks only:
```bash
# main session (dangerouslyDisableSandbox): start stacks, run smoke+browser, teardown
make -C .worktrees/feat-a up HTTP_PORT=8091 && make -C .worktrees/feat-b up HTTP_PORT=8092
BASE_URL=http://localhost:8091 pnpm run test:smoke && BASE_URL=http://localhost:8091 pnpm run test:browser
make -C .worktrees/feat-a down && make -C .worktrees/feat-b down

# subagents: list schema only (no stack needed)
make -C .worktrees/feat-a test-lists
```

Use `make test-fast BASE_URL=http://localhost:PORT` to skip `make up` when the stack is already running.

**CI** (`.github/workflows/test.yml`) runs three jobs on push/PR, all via the Makefile:
- `lists` — `make test-lists`, no server
- `smoke` — `make test-smoke`, brings up docker stack, tears down after
- `browser` — `make test-browser`, same pattern

Deployment smoke tests hitting the live site are manual only:
`BASE_URL=https://asset-explorer.sc2arcade.com make test-smoke`.

## Key Directories

```
/ (repo root — not web-accessible)
├── Caddyfile                           ← snippets + {$VAR:default} env vars
├── docker-compose.yml                  ← base; vars from .env
├── docker-compose.override.example.yml ← copy to .override.yml on server
├── .env.example                        ← copy to .env
├── Makefile
├── package.json                        ← @playwright/test + zod (test tooling only)
├── playwright.config.js
├── test/
│   ├── list-schema.js    (Zod schema for asset lists)
│   ├── list-integrity.js (validates site/list/*.json)
│   ├── smoke.spec.js     (HTTP/api tests)
│   └── browser.spec.js   (chromium tests)
└── site/              ← Caddy root (mounted as /srv)
    ├── index.html
    ├── 404.html
    ├── <category>.html
    ├── img/           (bg.jpg, arc.png, logo.png, favicon.ico, discord.svg)
    ├── fonts/         (Michroma-Regular)
    ├── lib/           (three/, jszip.js, photoswipe/)
    ├── list/          (JSON asset inventory files, one per category)
    └── src/           (init-page.js, script.js, player.js, styles.css, discord-widgets.js)
```

## Agent conventions

- **Screenshot output (Playwright MCP):** when calling `mcp__playwright__browser_take_screenshot`, always pass `filename` with a `.playwright-mcp/` prefix — e.g. `".playwright-mcp/phase1-art.png"`. That directory is gitignored and stays out of the working tree. Do not write screenshots to the repo root.
- **Scratch files / verification artifacts:** `.playwright-mcp/`, `/test-results/`, and `$TMPDIR` are the legal homes. Don't commit any of them.

## Color Scheme

| Role | Value |
|------|-------|
| Primary accent | `#e04a14` (SC2Mapster orange) |
| Accent hover | `#ff6a30` |
| Glow | `rgba(224, 74, 20, 0.55)` |
| Background | `#0b0f14` |
| Surface | `#12181f` |
