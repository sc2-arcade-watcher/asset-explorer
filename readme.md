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

Pure static site — no build step, no framework. Vanilla HTML/CSS/ES modules served by Caddy, with an imageproxy sidecar for thumbnail resizing.

```
/ (repo root)
├── Caddyfile                          ← snippet-based config, env-driven
├── docker-compose.yml                 ← base service definitions
├── docker-compose.override.example.yml ← copy to .override.yml on server
├── .env.example                       ← copy to .env and fill in values
├── Makefile                           ← dev/test shortcuts
└── site/                              ← web root (Caddy mounts ./site:/srv)
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
cp .env.example .env          # adjust HTTP_PORT etc. if needed
make dev                      # start stack with cache disabled (no-store)
```

Opens at `http://localhost:8080`.

For production caching (`Cache-Control: public, max-age=3600`):

```bash
make up
```

## Testing

```bash
pnpm install                  # first time only
make test                     # INI integrity + HTTP smoke + browser tests
make test-ini                 # INI file pairing check (no stack needed)
make test-smoke               # Playwright tests (auto-starts static server)
```

To test against a running stack or production:

```bash
make test-smoke BASE_URL=http://localhost:8080
make test-smoke BASE_URL=https://asset-explorer.sc2arcade.com
```

CI runs `ini`, `smoke`, and `browser` jobs on every push and pull request.
Deployment-specific tests (full Docker stack with imageproxy) are run manually.

## Production Deployment

```bash
cp .env.example .env
cp docker-compose.override.example.yml docker-compose.override.yml
# edit both files for your environment
docker compose up -d
```

The override file binds the port to `127.0.0.1` (loopback only) so a host-level reverse proxy handles TLS.

## Attribution

All assets belong to their respective creators — Blizzard Entertainment and the SC2 modding community. This site claims no ownership. If you use community-made assets, credit the original authors and seek their approval.
