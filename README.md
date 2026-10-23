# Wanderwild

A mobile-first, location-based fantasy game: explore the real world on a fantasy-styled map, idle farm, and earn bonuses by walking.

## What works so far

- Installable PWA (Vite + TypeScript) that runs full screen on phones.
- Real-world map from OpenStreetMap, drawn as an old parchment map with MapLibre. Tiles and fonts come from [OpenFreeMap](https://openfreemap.org), which is free and needs no API key.
- A wanderer token that follows your GPS position, with a ring showing GPS accuracy. Drag the map to look around; the compass button snaps back to you.
- A "distance wandered" counter that only counts walking: it ignores GPS jitter, inaccurate fixes and anything faster than about 25 km/h. It is saved on the device. This is the base for walking bonuses later.

- **The Inkbound Bestiary.** Creatures that wandered off the margins of old maps now roam the streets around you, all drawn and animated in code with SVG and trigonometry (no image files).
  - Six **Wildlings** to bind and raise: Bramblet, Driftfin, Emberkit, Cragmite, Wisplume and Lumoth. Each one is an individual with its own colouring and temperament, and about 1 in 48 is Gilded.
  - Four **Blotspawn** to drive off with your companion: Smudgeling, Murkwing, Thornmaw and Wickwraith. Each is weak to one element.
  - Pick a starter, catch Wildlings by timing a binding seal against a closing ring, fight Blotspawn in turn-based battles, and level companions up to 30. Walking earns a seal every 100 m and gives your companion 1 XP every 25 m.
  - Spawns are deterministic per ~130 m cell and 15-minute window. Everything is saved on the device.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # style validation and walking-distance tests
npm run build    # production build in dist/
```

`npm run dev` also serves `/dev/gallery.html`, which draws every species with a few individual seeds (`?seed=N` for more).

Browsers only share GPS with secure pages, so to try it on a phone use the GitHub Pages deploy (below) or an HTTPS tunnel to the dev server. On `localhost` your desktop browser's location works, and Chrome DevTools > Sensors can fake a walk.

## Deploy

`.github/workflows/deploy.yml` tests and builds every push and pull request, and publishes `main` to GitHub Pages. Turn it on once under **Settings > Pages > Source: GitHub Actions**; the game is then at `https://<owner>.github.io/Wanderwild/`.

Every `claude/*` branch also gets a preview build on the same site, so work in progress can be tried on a phone before it is merged: `https://<owner>.github.io/Wanderwild/preview/<branch name with / replaced by ->/`. The list of live previews is at `/Wanderwild/preview/`. Pushing to a preview branch rebuilds the whole site from `main` (only `main` may deploy to Pages), and deleting the branch removes its preview. Previews share the main game's saved progress on the device, since they are on the same site.

## Layout

- `src/map/fantasyStyle.ts`: the parchment map style (OpenMapTiles schema).
- `src/map/player.ts`: the player token and accuracy ring.
- `src/geo/`: GPS watching and walking-distance filtering.
- `src/creatures/`: the species roster, procedural SVG art (`art/`), levelling, catching and battle maths, spawns and the saved collection.
- `src/ui/`: catch, battle, bestiary and starter screens.
- `src/map/creatures.ts`: wild creatures and your companion on the map.
- `src/main.ts`: wires the map, player, HUD and service worker together.
