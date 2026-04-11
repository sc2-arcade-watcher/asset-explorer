# Explorer — SC2Mapster Asset Explorer

Static site for browsing StarCraft II modding assets.
Served at `https://asset-explorer.sc2arcade.com`

## Architecture

- **Pure static site** — no build system, vanilla HTML/CSS/JS with ES modules
- **Web content lives in `site/`** — Caddy mounts `./site:/srv:ro`; `Caddyfile` and `docker-compose.yml` stay at repo root (not web-accessible)
- **Assets hosted externally** at `https://star-assets.github.io/` (separate repos per asset type)
- **Vendored deps:** Three.js (`site/lib/three/`), JSZip (`site/lib/jszip.js`)
- **No build step** — site is pure static files; `package.json` exists only for test tooling (`@playwright/test`)

## HTML Pages

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

All category pages share the same template: small-header + search + icons-grid + inline script calling `createItemList()`.

## Core JS

- **`site/src/script.js`** — `createItemList(config)` is the main engine. Loads dual INI files, merges by filename, renders paginated grid (200/page), debounced search (300ms), clipboard copy via `[data-copy]`, fade-in images.
- **`site/src/player.js`** — `<glb-viewer>` custom web component (Shadow DOM, Three.js). Auto-rotates GLB models, draggable panel on models.html.
- **`site/src/styles.css`** — Dark sci-fi theme (`#0b0f14` bg, `#e04a14` SC2Mapster orange accent), "Starcraft" custom font for h1, "Orbitron" for body. Responsive at 600px.
- **`site/src/discord-widgets.js`** — Vanilla ES module. Fetches Discord widget API (name, online count, banner) for each server. Caches responses in `localStorage` with 2-hour TTL. Falls back to static invite link card on failure. Used by `index.html` community section.

## Data Format (`site/list/`)

INI files with section header = repo name, lines = filenames (no extension):
```
[buttons]
filename1
filename2
```
Each asset type has `{type}.ini` (DDS originals) + `{type}-png.ini` (PNG previews). Assets only render if present in both files.

## Local Dev & Testing

```bash
cp .env.example .env && make dev     # start stack, cache disabled
make test                            # all tests (INI + HTTP smoke + browser)
make test-ini                        # INI integrity only (no stack needed)
make test-smoke BASE_URL=http://...  # smoke against a running stack
```

**Package manager:** pnpm. Run `pnpm install` once before tests.

**CI** (`.github/workflows/test.yml`) runs three jobs on push/PR:
- `ini` — bash, no server
- `smoke` — Playwright `request` fixture, python3 static server auto-started
- `browser` — Playwright chromium, python3 static server auto-started

Deployment smoke tests (full Docker stack + imageproxy) are manual only.

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
    ├── lib/           (Three.js, JSZip)
    ├── list/          (22 INI asset inventory files)
    └── src/           (script.js, player.js, styles.css, discord-widgets.js)
```

## Color Scheme

| Role | Value |
|------|-------|
| Primary accent | `#e04a14` (SC2Mapster orange) |
| Accent hover | `#ff6a30` |
| Glow | `rgba(224, 74, 20, 0.55)` |
| Background | `#0b0f14` |
| Surface | `#12181f` |
