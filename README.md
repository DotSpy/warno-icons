# warno-icons

Icon assets (`2v2\`, `3v3\`, `divisions\`) plus **WARNO Draft**, a free, fully static pick/ban draft site (in `site\`) in the spirit of [aoe2cm.net](https://aoe2cm.net/preset/jBIIg). It deploys to GitHub Pages and has no backend.

## How it works

- Vite + TypeScript, no framework. Icons are reused directly from the folders above (served in dev, copied into `dist\icons` on build).
- **The host's browser is the server.** The host creates a room and gets three links: *Team A captain*, *Team B captain*, *spectators*. Clients connect peer-to-peer (WebRTC via [PeerJS](https://peerjs.com), using PeerJS's free public broker only for the handshake).
- The host tab must stay open (the host can reload: the room is restored from localStorage). Timers run on the host; when a timer expires a random legal item is picked.
- Strict corporate networks without direct WebRTC paths may fail to connect (no TURN server is configured).

## Draft rules (defaults)

Steps are strings `TEAM ACTION TARGET TIMER` e.g. `A ban map 30` (`TEAM` A|B, `ACTION` pick|ban, `TARGET` map|side|division, `TIMER` seconds, 0 = none).

- **Maps:** global - a pick/ban removes the map for everyone.
- **Side:** `A pick side 30` lets that team choose NATO or Warsaw Pact; the opponent gets the other.
- **Divisions:** if the preset has a `pick side` step, each team picks only from its own side's divisions; without one, the whole pool is open. A division ban removes a division from the **opponent's** pool. A team can't pick the same division twice.
- **Division pick mode** (`"divisionPick"` in the preset JSON, or the editor select): `shared` (default) - both teams may pick the same division (blind-style); `exclusive` - one by one, a picked division is gone for the other team. Only matters when both teams can draw from the same pool (no side step). Note: picks are visible live; a truly hidden simultaneous blind reveal is not implemented.
- Added icons: 4th Marine Division (`divisions/nato/us/4th-marines.png`) and 1a División de Tanques (`divisions/pact/cub/1-tank.png`), from the WARNO wiki (256x256).
- Host controls: Start, Undo last, Reset (host can also act for either team).

## Results and history

- When a draft finishes, **Copy shareable result link** gives `#/result/<compressed-data>` containing the preset, teams, sides and the full pick/ban order. No server involved.
- The home page lists drafts this browser hosted or watched (localStorage): reopen, view result, export JSON, delete.

## Editing data

All in `site\src\data\`:

- `presets.json` - presets 1v1-5v5 with step order and timers.
- `maps.json` - map list (`icon` relative to repo root; no `icon` = placeholder tile) and per-mode `pools`.
- `divisions.json` - divisions (name, side, nation, icon). Names follow the WARNO fandom wiki.

The **Preset editor** (`#/editor`) builds custom presets (steps, timers, map/division pools), saves them in localStorage and supports JSON import/export.

## Development

```
cd site
npm install
npm run dev        # local dev server
npm run build      # outputs site\dist
npm run typecheck
```

## Deploying to GitHub Pages

Enable **Settings > Pages > Source: GitHub Actions**. `.github/workflows/pages.yml` builds and deploys `site\dist` on every push to `master`. The site uses relative URLs and hash routing, so it works under `https://<user>.github.io/<repo>/`.
