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

## Deployment

Static assets on Cloudflare Workers: `npx wrangler deploy`.

## Credits

The city flags and coats of arms come from Wikimedia Commons and are in the public domain. See `assets/symbols/CREDITS.txt`.
