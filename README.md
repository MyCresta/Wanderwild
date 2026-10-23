# Wanderwild

A mobile-first, location-based fantasy game: explore the real world on a fantasy-styled map, idle farm, and earn bonuses by walking.

## What works so far

- Installable PWA (Vite + TypeScript) that runs full screen on phones.
- Real-world map from OpenStreetMap, drawn as an old parchment map with MapLibre. Tiles and fonts come from [OpenFreeMap](https://openfreemap.org), which is free and needs no API key.
- A wanderer token that follows your GPS position, with a ring showing GPS accuracy. Drag the map to look around; the compass button snaps back to you.
- A "distance wandered" counter that only counts walking: it ignores GPS jitter, inaccurate fixes and anything faster than about 25 km/h.
- **Wayfarer levels.** XP from walking (30 per 100 m), shrines, binding Wildlings and beating Blotspawn. Each level needs `100 × level^1.5` XP and unlocks features gradually; the satchel shows what comes next.
- **Currencies.** Coin from everything, Wanderlight only from walking (1 per 100 m), and realm materials.
- **Realms.** What is under you on the map decides your realm: parks and woods are the Wildwood, water and riversides Tidemere, shops and old town the Stoneward, cemeteries the Barrows, and homes the Hearthfields. A banner shows where you are.
- **Wayshrines.** Churches, libraries, monuments, viewpoints and town halls become shrines. Touch one within 40 m for coin, XP, that realm's material and a 10-minute blessing (+25% walking XP); each shrine then rests for 5 minutes.
- **Shared spawns.** `src/game/spawns.ts` derives creature spawns from a 150 m map cell plus the current 15-minute window, so friends standing together see the same ones and reopening the app cannot reroll them.
- **The Hearthstead** (from Wayfarer level 3). Herb Garden, Mine, Lumber Grove and Kennel produce while the app is closed, up to 8 hours of storage (24 hours at building level 9). Upgrade them with coin and materials.
- **Stride boost.** Every 100 m walked moves all Hearthstead timers forward 10 minutes, up to 8 hours a day.
- **Wild eggs** (from level 8). Shrines sometimes give a 2, 5 or 10 km egg; walk that far to hatch it. Longer eggs hold rarer creatures.
- **Save system.** All progress is one versioned save in IndexedDB, with export and import as a file from the satchel to move to another phone.
- **The Inkbound Bestiary.** Creatures that wandered off the margins of old maps now roam the streets around you, all drawn and animated in code with SVG and trigonometry (no image files).
  - Six **Wildlings** to bind and raise: Bramblet, Driftfin, Emberkit, Cragmite, Wisplume and Lumoth. Each one is an individual with its own colouring and temperament, and about 1 in 48 is Gilded.
  - Four **Blotspawn** to drive off with your companion: Smudgeling, Murkwing, Thornmaw and Wickwraith. Each is weak to one element.
  - Pick a starter, catch Wildlings by timing a binding seal against a closing ring, fight Blotspawn in turn-based battles, and level companions up to 30. Walking earns a seal every 100 m and gives your companion 1 XP every 25 m.
  - **Party battles.** Your companion leads a party of up to three (pick them in the satchel). Swap pets mid-fight, and send in another when one is worn out. Pets that fought get full XP, the bench half.
  - **Timing strikes.** Each attack shows a rune circle closing on the foe; tap as the rings meet for a critical hit.
  - **Wayfarer spells** charged by walking: Fireball after 300 m (damage grows with your level, ignores defence) and Mending after 500 m (heals the party). **Tonics** from the Herb Garden heal the active pet.
  - **Gear and the Forge** (from level 5, in the Hearthstead). Craft a Staff (pet damage and Fireball), Cloak (party health), Boots (stride boost and Wanderlight), Lantern (reach for creatures and shrines) and Charm (catch chance), each from a different realm's material. Rarities run Worn, Fine, Rare and Mythic (level 30); upgrade to +5, or +10 from level 15, and the look changes at +5 and +10. Your cloak, staff and lantern show on your map token. Spare gear can be salvaged.
  - **Runes** (from level 15) come from shrines and socket into gear at +5 and +10: Nightfang, Hatchstone, Swiftsole, Seer and Warding.
  - **Pet expeditions** (from level 8). Pets outside the party travel to a realm you have visited for 1, 2 or 4 hours and bring back its material, coin and pet XP. Walking speeds them up.
  - Eggs that hatch join the bestiary as new Wildlings.
  - Each creature leans towards its realm: Bramble kin in the Wildwood, Tide kin by water, and more Blotspawn in the Barrows.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # style validation and walking-distance tests
npm run build    # production build in dist/
```

`npm run dev` also serves `/dev/gallery.html`, which draws every species with a few individual seeds (`?seed=N` for more).

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
- `src/hud/`: the top bar, realm banner, toasts, satchel and Hearthstead panels.
- `src/creatures/`: the species roster, procedural SVG art (`art/`), levelling, catching and battle maths, spawns and the saved collection.
- `src/ui/`: catch, battle, bestiary and starter screens.
- `src/map/creatures.ts`: wild creatures and your companion on the map.
- `src/main.ts`: wires the map, player, HUD and service worker together.
