# Explorer — SC2 All Races Assets Archive

Static GitHub Pages site for browsing StarCraft II modding assets.
Live at `https://star-tools.github.io/explorer/`

## Architecture

- **Pure static site** — no build system, vanilla HTML/CSS/JS with ES modules
- **Assets hosted externally** at `https://star-assets.github.io/` (separate repos per asset type)
- **Vendored deps:** Three.js (`lib/three/`), JSZip (`lib/jszip.js`)
- **`package.json`** only has express/cors/local-server for local dev — no build step

## HTML Pages

| Page | Asset Type | Grid Class | List Key |
|------|-----------|------------|----------|
| `index.html` | Landing/nav | `.links` | — |
| `buttons.html` | Button icons | `.icons-grid` (76px) | `buttons` |
| `icons.html` | Small icons | `.icons-small-grid` (30px) | `icons` |
| `art.html` | Art | `.art-grid` (150x100px) | `art` |
| `portraits.html` | Portraits | `.portraits-grid` (100x150px) | `portraits` |
| `overlays.html` | Overlays | `.overlays-grid` | `overlays` |
| `consoles.html` | Console UI | `.art-grid` | `consoles` |
| `ui.html` | UI elements | `.ui-grid` | `ui` |
| `wireframes.html` | Wireframes | `.wireframes-grid` | `wireframes` |
| `models.html` | 3D models | `.icons-grid` | `models` |
| `sprites.html` | Sprites | `.sprites-grid` | `sprites` (hidden in nav) |

All category pages share the same template: small-header + search + icons-grid + inline script calling `createItemList()`.

## Core JS

- **`src/script.js`** — `createItemList(config)` is the main engine. Loads dual INI files, merges by filename, renders paginated grid (200/page), debounced search (300ms), clipboard copy via `[data-copy]`, fade-in images.
- **`src/player.js`** — `<glb-viewer>` custom web component (Shadow DOM, Three.js). Auto-rotates GLB models, draggable panel on models.html.
- **`src/styles.css`** — Dark sci-fi theme (`#0b0f14` bg, `#00d8ff` cyan accent), "Starcraft" custom font for h1, "Orbitron" for body. Responsive at 600px.

## Data Format (`list/`)

INI files with section header = repo name, lines = filenames (no extension):
```
[buttons]
filename1
filename2
```
Each asset type has `{type}.ini` (DDS originals) + `{type}-png.ini` (PNG previews). Assets only render if present in both files.

## Key Directories

- `fonts/` — Starcraft-Regular, Michroma-Regular, SourceSansPro
- `img/` — bg.jpg, discord.svg
- `lib/` — Vendored Three.js + JSZip
- `list/` — 22 INI asset inventory files
