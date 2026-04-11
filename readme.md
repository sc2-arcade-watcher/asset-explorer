# SC2Mapster Asset Explorer

A **community resource** for browsing, previewing, and discovering StarCraft II modding assets — buttons, icons, portraits, art, 3D models, UI elements, terrain, and more.

Served at `https://asset-explorer.sc2arcade.com`

![SC2Mapster Logo](img/logo.png)

## Features

- **Landing page** listing all asset categories with community Discord widgets
- **Search** with debounced live filtering across all category pages
- **3D model previews** via a custom `<glb-viewer>` web component (Three.js)
- **Paginated grids** — 200 assets per page, fade-in images
- **Attribution** — assets belong to their respective creators; usage notice on every page

## Architecture

Pure static site — no build step, no framework. Vanilla HTML/CSS/ES modules.

```
/ (repo root)
├── Caddyfile
├── docker-compose.yml
└── site/               ← web root (Caddy mounts ./site:/srv)
    ├── index.html
    ├── 404.html
    ├── <category>.html
    ├── img/
    ├── fonts/
    ├── lib/            (Three.js, JSZip — vendored)
    ├── list/           (INI asset inventory files)
    └── src/
        ├── script.js           (createItemList engine)
        ├── player.js           (<glb-viewer> custom element)
        ├── styles.css          (dark theme, SC2Mapster orange accent)
        └── discord-widgets.js  (Discord API widget loader)
```

Assets are hosted externally at `https://star-assets.github.io/` and referenced by the INI inventory files in `site/list/`.

## Running Locally

```bash
docker compose up
```

Opens at `http://localhost:8080`.

## Attribution

All assets belong to their respective creators — Blizzard Entertainment and the SC2 modding community. This site claims no ownership. If you use community-made assets, credit the original authors and seek their approval.
