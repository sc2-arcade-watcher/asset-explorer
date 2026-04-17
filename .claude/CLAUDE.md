# Explorer — SC2Mapster Asset Explorer

Static site for browsing StarCraft II modding assets.
Served at `https://asset-explorer.sc2arcade.com`

## Architecture

- **Pure static site** — no build system, vanilla HTML/CSS/JS with ES modules
- **Web content lives in `site/`** — Caddy mounts `./site:/srv:ro`; `Caddyfile` and `docker-compose.yml` stay at repo root (not web-accessible)
- **Assets hosted externally** at `https://star-assets.github.io/` (separate repos per asset type)
- **Vendored deps:** Three.js (`site/lib/three/`), JSZip (`site/lib/jszip.js`), PhotoSwipe 5 (`site/lib/photoswipe/`, lazy-loaded on first lightbox open)
- **No build step** — site is pure static files; `package.json` exists only for test tooling (`@playwright/test`)

## HTML Pages

Every category page is a thin stub: import `initPage` + `createItemList` (or `createLocalItemList`), call both. The shared shell (header, search, grid container, footer, preloader) is injected by `init-page.js`.

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
- **`site/src/script.js`** — `createItemList(config)` is the main engine. Loads dual INI files, merges by filename, renders an infinite-scroll grid, debounced search (300ms), clipboard copy via `[data-copy]`, fade-in images, grid toolbar (preview size + batch size), PhotoSwipe lightbox. Key config:
  - `thumbnail: { size }` + `hrefBuilder(item)` — default renderer; skip by passing custom `renderItemFn`
  - `onItemClick(item, e)` or `lightbox: true` (default) — click behavior; modifier/middle click always passes through to the anchor
  - `batchSize` (default 200, picker: 100/200/500/all), `previewSize` (small/medium/large/list, persisted in `localStorage`)
  - `createLocalItemList` — variant for single-file lists (terrain-doodads, terrain-tilesets, terrain-cliffs) hitting `baseUrl` directly instead of star-assets.github.io
- **`site/src/player.js`** — `<glb-viewer>` custom web component (Shadow DOM, Three.js). Auto-rotates GLB models, draggable panel on models.html.
- **`site/src/styles.css`** — Dark sci-fi theme (`#0b0f14` bg, `#e04a14` SC2Mapster orange accent), "Starcraft" custom font for h1, "Michroma" for body. `[data-preview-size]` on `.icons-grid` drives tile sizing via `--tile-scale`; `.icon-item::before` carries the hover border. Responsive at 600px.
- **`site/src/discord-widgets.js`** — Vanilla ES module. Fetches Discord widget API per server (name, online count, banner), caches in `localStorage` with 2-hour TTL, falls back to a static invite card. Used by `index.html`.

## Data Format (`site/list/`)

INI files with section header = repo name, lines = filenames (no extension):
```
[buttons]
filename1
filename2
```
Each asset type has `{type}.ini` (DDS originals) + `{type}-png.ini` (PNG previews). Assets only render if present in both files. The terrain lists are single-file and consumed by `createLocalItemList`.

## Local Dev & Testing

Tests go through the real Caddy+imageproxy stack. `make` targets auto-start it via `docker compose` — there's no longer a python3 fallback.

```bash
cp .env.example .env && make dev           # start stack (no-store cache)
make test                                  # INI + api + browser; auto-starts stack
make test-ini                              # INI integrity only (no stack needed)
make test-smoke                            # api project; auto-starts stack
make test-browser                          # chromium project; auto-starts stack
BASE_URL=https://... make test-smoke       # target an external stack instead
HTTP_PORT=8091 make test                   # parallel stack on a different port
```

**Package manager:** pnpm. Run `pnpm install` once before tests.

**Parallel agents / worktrees:** each worktree has a distinct directory name, which docker-compose uses as the project name — so stacks don't collide. Give each agent a unique `HTTP_PORT` so host port bindings don't fight.

**CI** (`.github/workflows/test.yml`) runs three jobs on push/PR, all via the Makefile:
- `ini` — `make test-ini`, no server
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
├── package.json                        ← @playwright/test only
├── playwright.config.js
├── test/
│   ├── ini-integrity.sh
│   ├── smoke.spec.js   (HTTP/api tests)
│   └── browser.spec.js (chromium tests)
└── site/              ← Caddy root (mounted as /srv)
    ├── index.html
    ├── 404.html
    ├── <category>.html
    ├── img/           (bg.jpg, arc.png, logo.png, favicon.ico, discord.svg)
    ├── fonts/         (Starcraft-Regular, Michroma-Regular, SourceSansPro)
    ├── lib/           (three/, jszip.js, photoswipe/)
    ├── list/          (INI asset inventory files)
    └── src/           (init-page.js, script.js, player.js, styles.css, discord-widgets.js)
```

## Color Scheme

| Role | Value |
|------|-------|
| Primary accent | `#e04a14` (SC2Mapster orange) |
| Accent hover | `#ff6a30` |
| Glow | `rgba(224, 74, 20, 0.55)` |
| Background | `#0b0f14` |
| Surface | `#12181f` |
