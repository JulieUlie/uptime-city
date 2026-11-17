# Uptime City

A cosy, board-game-style city builder set in Antwerp, Brussels, Ghent and Oasis Bay. Build, craft, connect IoT integrations and automate your city.

**Live:** https://uptimecity.julietous.workers.dev

## Structure

```
index.html        Game shell and HUD
css/game.css      Styles
js/main.js        Boot, game loop and input
js/game.js        Game state and simulation (no DOM or canvas code)
js/render.js      Canvas rendering
js/maps.js        City maps
js/config.js      Buildings, costs and balancing
js/ui.js          Panels and HUD
js/tutorial.js    First-run tutorial
js/weather.js     Weather effects
```

The simulation is kept separate from rendering: `game.js` contains only state and rules, and `render.js` draws it. It is vanilla JavaScript on a canvas, with no build step.

## Run locally

```bash
python -m http.server
```

## Tests

Playwright tests in TypeScript: `npm install`, then `npm test` (serves the game with `wrangler dev`, like Cloudflare does). The live weather from Open-Meteo is faked in the tests.

- `tests/logic/`: the simulation in `js/game.js`, driven directly: new cities in all four maps, placing and demolishing (with every refusal), power, the market, loans, the clock and autosave, crafting, disasters, saving and loading (also old or damaged saves).
- `tests/ui/`: the first-visit menu and city picker, the HUD and live weather (also offline), time and pause, the build list, tools, panels, keyboard shortcuts, saving across a reload, and axe scans.

43 tests. Known findings kept visible as `test.fail`: a first-time visitor is warned "Your current city will be lost" when picking a city (the starting houses count as already built), and some text in the menu and HUD is under the 4.5:1 contrast of WCAG AA.

## Deployment

Static assets on Cloudflare Workers: `npx wrangler deploy`.

## Credits

The city flags and coats of arms come from Wikimedia Commons and are in the public domain. See `assets/symbols/CREDITS.txt`.
