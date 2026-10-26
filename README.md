# Wanderwild

A mobile-first, location-based fantasy game: explore the real world on a fantasy-styled map, idle farm, and earn bonuses by walking.

## What works so far

- Installable PWA (Vite + TypeScript) that runs full screen on phones.
- Real-world map from OpenStreetMap, drawn as an old parchment map with MapLibre. Tiles and fonts come from [OpenFreeMap](https://openfreemap.org), which is free and needs no API key.
- A wanderer token that follows your GPS position, with a ring showing GPS accuracy. Drag the map to look around; the compass button snaps back to you.
- A "distance wandered" counter that only counts walking: it ignores GPS jitter, inaccurate fixes and anything faster than about 25 km/h.
- **Wayfarer levels.** XP from walking (30 per 100 m), shrines, befriending Wildlings and beating Blotspawn. Each level needs `100 × level^1.5` XP and unlocks features gradually; the satchel shows what comes next.
- **Currencies.** Coin from everything, Wanderlight only from walking (1 per 100 m), and realm materials.
- **Realms.** What is under you on the map decides your realm: parks and woods are the Wildwood, water and riversides Tidemere, shops and old town the Stoneward, cemeteries the Barrows, and homes the Hearthfields. A banner shows where you are.
- **Wayshrines.** Churches, libraries, monuments, viewpoints and town halls become shrines. Touch one within 40 m for coin, XP, that realm's material and a 10-minute blessing (+25% walking XP); each shrine then rests for 5 minutes.
- **Shared spawns.** `src/game/spawns.ts` derives creature spawns from a 150 m map cell plus the current 15-minute window, so friends standing together see the same ones and reopening the app cannot reroll them.
- **The Hearthstead** (from Wayfarer level 3). Herb Garden, Mine, Lumber Grove and Kennel produce while the app is closed, up to 8 hours of storage (24 hours at building level 9). Upgrade them with coin and materials.
- **Stride boost.** Every 100 m walked moves all Hearthstead timers forward 10 minutes, up to 8 hours a day.
- **Glyphwalking.** The shape of your walk is a spell. A Ring (a round loop of 250 m or more) can finish a companion's evolution, a Stroke (300 m dead straight) pays XP and Wanderlight, and a Knot (the same corner three times in 15 minutes) sets a Waymark where a creature always waits. The trail lives in memory only and is never saved.
- **Save system.** All progress is one versioned save in IndexedDB, with export and import as a file from the satchel to move to another phone.
- **The Inkbound Bestiary.** Creatures that wandered off the margins of old maps now roam the streets around you, all drawn and animated in code with SVG and trigonometry (no image files).
  - **Naming.** Every creature on your side is a **Wildling**, every foe is **Blotspawn**, and your **companion** is the Wildling walking with you.
  - Twelve **Wildlings**, two per element: Bramblet and Capling (grove), Driftfin and Shellop (tide), Emberkit and Sparkwick (ember), Cragmite and Pebblit (stone), Wisplume and Kitewisp (gale), Lumoth and Glimhare (lumen). Each has its own colouring (about 1 in 48 is Gilded) and its own small bonus of 0-10% on each stat. Befriending another of a kind you keep merges it in: each bonus becomes the better of the two plus 2%, up to 30%.
  - **Blotspawn** to drive off with your companion: Smudgeling, Murkwing, Thornmaw and Wickwraith, plus a **Taken** version of every Wildling, corrupted by spilled ink (about two foes in five). Each is weak to one element.
  - Pick a starter, befriend Wildlings by keeping them with you (meet one in person or by Farsight and ask it along; it joins your band after 3 to 8 hours, even with the app closed, or much sooner if you walk 400 to 1000 m together; driving off Blotspawn builds trust too), fight Blotspawn in turn-based battles, and level companions up to 30. Wildlings are rare and only kinds you lack, or clearly stronger ones, appear. You keep one of each kind: a stronger one of a kind you already have raises yours to its level. Wildlings outside your party rest in the **Roost**, where each gathers its home realm's material every 2 hours (up to a day while away). Keeping every kind of an element makes its Wildlings hit 10% harder. Walking gives your companion 1 XP every 25 m.
  - **Evolutions.** Each Wildling evolves once it reaches level 10 and has walked 1.5 km as your companion in its home realm: Bramblet → Thornwarden (Wildwood), Driftfin → Veilwyrm (Tidemere), Emberkit → Pyrevixen and Wisplume → Stormplume (Hearthfields), Cragmite → Bastilith (Stoneward), Lumoth → Gloamwing (Barrows), Capling → Mirecap (Wildwood), Shellop → Conchwarden (Tidemere), Sparkwick → Forgewyrm and Kitewisp → Tempestkite (Hearthfields), Pebblit → Cairnlord (Stoneward), Glimhare → Moonhare (Barrows). Progress shows in the bestiary, and evolving plays a full-screen transformation.
  - **Party battles.** Your companion leads a party of up to three (pick them in the satchel). Swap Wildlings mid-fight, and send in another when one is worn out. Those that fought get full XP, the bench half.
  - **Timing strikes.** Each attack shows a rune circle closing on the foe; tap as the rings meet for a critical hit.
  - **Wayfarer spells** charged by walking: Fireball after 300 m (damage grows with your level, ignores defence) and Mending after 500 m (heals the party). **Tonics** from the Herb Garden heal the active Wildling.
  - **Gear and the Forge** (from level 5, in the Hearthstead). Craft a Staff (Wildling damage and Fireball), Cloak (party health), Boots (stride boost and Wanderlight), Lantern (reach for creatures and shrines) and Charm (catch chance), each from a different realm's material. Rarities run Worn, Fine, Rare and Mythic (level 30); upgrade to +5, or +10 from level 15, and the look changes at +5 and +10. Your cloak, staff and lantern show on your map token. Spare gear can be salvaged.
  - **Runes** (from level 15) come from shrines and socket into gear at +5 and +10: Nightfang, Kinstone (Wildlings trust you sooner), Swiftsole, Seer and Warding.
  - **Wildling expeditions** (from level 8). Wildlings outside the party travel to a realm you have visited for 1, 2 or 4 hours and bring back its material, coin and Wildling XP. Walking speeds them up.
  - Each kind leans towards its realm: Bramble kin in the Wildwood, Tide kin by water, and more Blotspawn in the Barrows.

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
- `src/map/glyphLayer.ts`: Waymarks and the live ink trail.
- `src/game/`: game rules with no DOM: save, Wayfarer levels, realms, spawns, shrines, and `state.ts` which ties them together.
- `src/hud/`: the top bar, realm banner, toasts, satchel and Hearthstead panels.
- `src/creatures/`: the species roster, procedural SVG art (`art/`), levelling, catching and battle maths, spawns and the saved collection.
- `src/ui/`: catch, battle, bestiary and starter screens.
- `src/map/creatures.ts`: wild creatures and your companion on the map.
- `src/main.ts`: wires the map, player, HUD and service worker together.
