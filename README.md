# SC2Mapster Asset Explorer

Browse, preview, and copy StarCraft II modding asset names — buttons, icons, portraits, art, 3D models, UI, terrain.

Served at `https://asset-explorer.sc2arcade.com`.

![SC2Mapster Logo](site/img/arc.png)

## Features

- Live-filter search across every category
- Infinite-scroll grids with preview-size (small/medium/large/list) and batch-size controls
- In-page image lightbox (PhotoSwipe) with copy-name button; modifier-click bypasses to download
- 3D model previews via `<glb-viewer>` (Three.js)

## Architecture

Pure static site — no build step. Vanilla HTML/CSS/ES modules served by Caddy with an imageproxy sidecar for thumbnail resizing. The whole stack runs via `docker compose`. Assets themselves live at `https://star-assets.github.io/` and are indexed by INI files in `site/list/`.

## Running locally

```bash
cp .env.example .env
make dev          # cache disabled (no-store), http://localhost:8080
make up           # same stack with production caching
make down         # stop
```

Pick a different port with `HTTP_PORT=8091 make dev` — useful when running several worktrees or agents in parallel (docker-compose project names default to the worktree directory, so stacks don't clash).

## Testing

```bash
pnpm install                       # first time only
make test                          # INI + API smoke + browser (auto-starts docker stack)
make test-ini                      # INI pairing check, no stack needed
make test-smoke                    # API smoke, auto-starts stack
make test-browser                  # browser tests, auto-starts stack
BASE_URL=https://... make test-smoke   # target a remote stack instead
```

Tests go through the real Caddy+imageproxy stack — the same code path production serves. CI runs the same three `make` targets on every push and PR.

## Production

```bash
cp .env.example .env
cp docker-compose.override.example.yml docker-compose.override.yml
# edit both for your environment
docker compose up -d
```

The override binds the port to loopback so a host-level reverse proxy handles TLS.

## Attribution

All assets belong to their respective creators — Blizzard Entertainment and the SC2 modding community. This site claims no ownership. Credit original authors and seek their approval before reusing community work.
