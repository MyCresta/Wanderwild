# Wanderwild

A mobile-first, location-based fantasy game: explore the real world on a fantasy-styled map, idle farm, and earn bonuses by walking.

## What works so far

- Installable PWA (Vite + TypeScript) that runs full screen on phones.
- Real-world map from OpenStreetMap, drawn as an old parchment map with MapLibre. Tiles and fonts come from [OpenFreeMap](https://openfreemap.org), which is free and needs no API key.
- A wanderer token that follows your GPS position, with a ring showing GPS accuracy. Drag the map to look around; the compass button snaps back to you.
- A "distance wandered" counter that only counts walking: it ignores GPS jitter, inaccurate fixes and anything faster than about 25 km/h. 
- **Wayfarer levels.** XP from walking (30 per 100 m), shrines and, soon, catching. Each level needs `100 × level^1.5` XP and unlocks features gradually; the satchel shows what comes next.
- **Currencies.** Coin from everything, Wanderlight only from walking (1 per 100 m), and realm materials.
- **Realms.** What is under you on the map decides your realm: parks and woods are the Wildwood, water and riversides Tidemere, shops and old town the Stoneward, cemeteries the Barrows, and homes the Hearthfields. A banner shows where you are.
- **Wayshrines.** Churches, libraries, monuments, viewpoints and town halls become shrines. Touch one within 40 m for coin, XP, that realm's material and a 10-minute blessing (+25% walking XP); each shrine then rests for 5 minutes.
- **Shared spawns.** `src/game/spawns.ts` derives creature spawns from a 150 m map cell plus the current 15-minute window, so friends standing together see the same ones and reopening the app cannot reroll them.
- **Save system.** All progress is one versioned save in IndexedDB, with export and import as a file from the satchel to move to another phone.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # style validation and walking-distance tests
npm run build    # production build in dist/
```

Browsers only share GPS with secure pages, so to try it on a phone use the GitHub Pages deploy (below) or an HTTPS tunnel to the dev server. On `localhost` your desktop browser's location works, and Chrome DevTools > Sensors can fake a walk. Adding `?walk` to the address turns off GPS so you can walk by tapping the map instead.

## Deploy

`.github/workflows/deploy.yml` tests and builds every push and pull request, and publishes `main` to GitHub Pages. Turn it on once under **Settings > Pages > Source: GitHub Actions**; the game is then at `https://<owner>.github.io/Wanderwild/`.

Every `claude/*` branch also gets a preview build on the same site, so work in progress can be tried on a phone before it is merged: `https://<owner>.github.io/Wanderwild/preview/<branch name with / replaced by ->/`. The list of live previews is at `/Wanderwild/preview/`. Pushing to a preview branch rebuilds the whole site from `main` (only `main` may deploy to Pages), and deleting the branch removes its preview. Previews share the main game's saved progress on the device, since they are on the same site.

## Layout

- `src/map/fantasyStyle.ts`: the parchment map style (OpenMapTiles schema).
- `src/map/player.ts`: the player token and accuracy ring.
- `src/geo/`: GPS watching and walking-distance filtering.
- `src/map/realmProbe.ts`: reads loaded vector tiles to find the realm under a point and nearby shrines.
- `src/map/shrineLayer.ts`: wayshrine pins.
- `src/game/`: game rules with no DOM: save, Wayfarer levels, realms, spawns, shrines, and `state.ts` which ties them together.
- `src/hud/`: the top bar, realm banner, toasts and satchel panel.
- `src/main.ts`: wires the map, player, HUD and service worker together.
