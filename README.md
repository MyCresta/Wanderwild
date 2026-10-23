# Wanderwild

A mobile-first, location-based fantasy game: explore the real world on a fantasy-styled map, idle farm, and earn bonuses by walking.

## What works so far

- Installable PWA (Vite + TypeScript) that runs full screen on phones.
- Real-world map from OpenStreetMap, drawn as an old parchment map with MapLibre. Tiles and fonts come from [OpenFreeMap](https://openfreemap.org), which is free and needs no API key.
- A wanderer token that follows your GPS position, with a ring showing GPS accuracy. Drag the map to look around; the compass button snaps back to you.
- A "distance wandered" counter that only counts walking: it ignores GPS jitter, inaccurate fixes and anything faster than about 25 km/h. It is saved on the device. This is the base for walking bonuses later.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # style validation and walking-distance tests
npm run build    # production build in dist/
```

Browsers only share GPS with secure pages, so to try it on a phone use the GitHub Pages deploy (below) or an HTTPS tunnel to the dev server. On `localhost` your desktop browser's location works, and Chrome DevTools > Sensors can fake a walk.

## Deploy

`.github/workflows/deploy.yml` tests and builds every push and pull request, and publishes `main` to GitHub Pages. Turn it on once under **Settings > Pages > Source: GitHub Actions**; the game is then at `https://<owner>.github.io/Wanderwild/`.

## Layout

- `src/map/fantasyStyle.ts`: the parchment map style (OpenMapTiles schema).
- `src/map/player.ts`: the player token and accuracy ring.
- `src/geo/`: GPS watching and walking-distance filtering.
- `src/main.ts`: wires the map, player, HUD and service worker together.
