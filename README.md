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

56 tests. They found two issues, both fixed in v10 and now guarded by regression tests: a first-time visitor was warned "Your current city will be lost" when picking a city (the starting houses counted as already built), and some text in the menu and HUD was under the 4.5:1 contrast of WCAG AA. The 13 tests added in v11 guard the v11 refinements below. If port 8794 is taken, run them on another port: `UPTIME_TEST_PORT=8797 npm test`.

## What's new in v11

A polish release:

- **Menu on short screens:** the Mayor's office can now scroll. On a short or landscape screen its title and buttons used to be cut off with no way to reach them.
- **Menu as a real dialog:** it is announced as a dialog, takes keyboard focus when it opens and hands it back when it closes; game shortcuts pause while it is open.
- **Market:** every resource gets its full name on its own line (they were cut to "Sili…", "Cop…" next to the price chart).
- **Screen readers:** the icon-only buttons (menu, speed, photo mode, fit, city log, hide panel) have real names, the speed buttons and photo mode say whether they are on, and the rule builder, tax slider and market buttons are labelled.
- **Keyboard:** one clear focus ring on everything; the side panel and the city log can be scrolled with the keyboard; Ctrl/Cmd shortcuts such as Ctrl+P (print) no longer toggle photo mode.
- **Reduced motion:** with "reduce motion" on in the system, pulses, blinking and sliding stop.
- **Live weather:** a slow answer for the previous city can no longer overwrite the weather of the city you just switched to (or keep refreshing the old city).
- **Contrast:** market prices, ledger amounts, the red buttons and the grey hint text now reach 4.5:1 (WCAG AA); locked buildings are greyed out without fading their text. Axe now scans all six side panels and the build list.
- **Weather badge:** while the live weather is on its way it says "Loading…" instead of "Weather offline".
- **Small fixes:** "Save" in the menu wrote the save twice; the tutorial no longer says the build list is "on the left" (on phones it is at the bottom).

## Deployment

Static assets on Cloudflare Workers: `npx wrangler deploy`.

## Credits

The city flags and coats of arms come from Wikimedia Commons and are in the public domain. See `assets/symbols/CREDITS.txt`.
