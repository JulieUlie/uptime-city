// Boot, game loop, input.
import { GRID, HOUR_MS, BUILDINGS, RESOURCES, CUR } from './config.js';
import * as G from './game.js';
import { initRender, draw, cam, ui, screenToGrid, burst, demolish, disasterFx, unlockAudio, shootDroneAt, resetWorld, fitView, cancelFit, photo, togglePhoto, sim } from './render.js';
import { loadWeather, initWeatherBadge } from './weather.js';
import { MAPS, MAP_ORDER } from './maps.js';
import * as UI from './ui.js';
import { initTutorial, tickTutorial, startTutorial } from './tutorial.js';

const cv = document.getElementById('city');
let speed = 1, acc = 0, last = performance.now(), panelTimer = 0;

// ---------- boot ----------
// Panels sit just below the HUD, which wraps onto more rows on small screens: publish its bottom edge.
const hudEl = document.querySelector('.hud');
const setHudBottom = () => document.documentElement.style.setProperty('--hud-bottom', Math.round(hudEl.getBoundingClientRect().bottom) + 'px');
setHudBottom();
if ('ResizeObserver' in window) new ResizeObserver(setHudBottom).observe(hudEl);
else window.addEventListener('resize', setHudBottom);

if (!G.load()) G.newGame();
initRender(cv);
document.getElementById('s-city').textContent = MAPS[G.S.map].name;
UI.initPanel();
initWeatherBadge();
loadWeather(G.S.map, MAPS[G.S.map].name);
document.addEventListener('layout', () => fitView(true));
UI.renderBuildList();
UI.renderHud();
UI.renderPanel(true);
G.logs.slice().reverse().forEach(UI.pushLog);
let firstVisit = true;
try { firstVisit = !localStorage.getItem('uptime-city-seen'); localStorage.setItem('uptime-city-seen', '1'); } catch {}
document.getElementById('menu').hidden = !firstVisit;

// ---------- game events → visuals ----------
G.on((type, d) => {
  switch (type) {
    case 'log': UI.pushLog(d); break;
    case 'built': burst(d.x, d.y, 'confetti'); UI.renderBuildList(); break;
    case 'demolished': demolish(d.x, d.y, d.t); UI.renderBuildList(); break;
    case 'disaster': disasterFx(d); UI.renderBuildList(); UI.renderPanel(); UI.showInspector(null); break;
    case 'cleaned': burst(d % GRID, Math.floor(d / GRID), 'dust'); break;
    case 'repaired': burst(d % GRID, Math.floor(d / GRID), 'confetti'); break;
    case 'coins': burst(d.i % GRID, Math.floor(d.i / GRID), 'text', `+${CUR}${d.amt}`); break;
    case 'produced': burst(d.i % GRID, Math.floor(d.i / GRID), 'text', `+${RESOURCES[d.k].icon}`); break;
    case 'unlock': UI.toast(`🎉 New building: ${BUILDINGS[d].name}`, 'ok'); UI.renderBuildList(); break;
    case 'incident': UI.toast('🚨 Incident! Look for the red ! on the map', 'err'); break;
    case 'crafted': UI.toast(`🔧 Crafted ${RESOURCES[d].name}`, 'ok'); break;
    case 'ruleFired': UI.flashRule(d); break;
    case 'reset': resetWorld(); loadWeather(G.S.map, MAPS[G.S.map].name); UI.renderBuildList(); UI.renderPanel(true); UI.showInspector(null); document.getElementById('s-city').textContent = MAPS[G.S.map].name; renderCities(); break;
    case 'rules': case 'integration': UI.renderPanel(); break;
  }
});

// ---------- loop ----------
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (speed > 0) {
    acc += dt * 1000 * speed;
    let n = 0;
    while (acc >= HOUR_MS && n < 10) { acc -= HOUR_MS; G.tickHour(); n++; }
    G.S._frac = acc / HOUR_MS;
  }
  // one bad frame must never freeze the game: log it and keep the loop running
  try { draw(dt); } catch (e) { console.error('draw', e); }
  UI.animPanel(now / 1000);
  panelTimer += dt;
  if (panelTimer > 0.25) { panelTimer = 0; UI.renderHud(); UI.renderPanel(); tickTutorial(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// refresh affordability in the build list every couple of seconds
setInterval(() => { UI.renderBuildList(); tickTutorial(); }, 1000);

// ---------- speed ----------
function setSpeed(s) {
  speed = s; sim.speed = s;
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === s));
}
document.querySelectorAll('[data-speed]').forEach((b) => b.onclick = () => setSpeed(+b.dataset.speed));

// ---------- pointer: pan, zoom, hover, click ----------
let drag = null;
const tileAt = (e) => {
  const r = cv.getBoundingClientRect();
  const { gx, gy } = screenToGrid(e.clientX - r.left, e.clientY - r.top);
  const x = Math.floor(gx), y = Math.floor(gy);
  return x >= 0 && y >= 0 && x < GRID && y < GRID ? { x, y } : null;
};
cv.addEventListener('pointerdown', (e) => { unlockAudio(); drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => {
  { const r = cv.getBoundingClientRect(); ui.mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; }   // for drone sounds
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) { drag.moved = true; cv.classList.add('dragging'); }
    if (drag.moved) { cancelFit(); cam.x = drag.cx + dx / cam.z; cam.y = drag.cy + dy / cam.z; }
  }
  const t = tileAt(e);
  if (t) {
    let ok = true;
    if (ui.tool?.startsWith('disaster:')) ok = true;
    else if (ui.tool && ui.tool !== 'bulldoze') ok = G.isLot(t.x, t.y) && !G.tile(t.x, t.y);
    if (ui.tool === 'bulldoze') ok = !!G.tile(t.x, t.y);
    ui.hover = { ...t, ok };
  } else ui.hover = null;
});
cv.addEventListener('pointerup', (e) => {
  cv.classList.remove('dragging');
  const wasDrag = drag?.moved; drag = null;
  if (wasDrag) return;
  // drones overhead can be clicked: they come down and explode (radius 3)
  { const r = cv.getBoundingClientRect(); if (shootDroneAt(e.clientX - r.left, e.clientY - r.top, (x, y) => G.castDisaster('drone', x, y))) { UI.toast('💥 Drone hit! It is coming down…', 'err'); return; } }
  const t = tileAt(e);
  if (!t) { UI.showInspector(null); return; }
  if (ui.tool?.startsWith('disaster:')) {
    const err = G.castDisaster(ui.tool.slice(9), t.x, t.y);
    if (err) UI.toast(err, 'err'); else UI.setTool(null);
    return;
  }
  // rubble on a street: one click clears it
  if (G.hasRubble(t.x + t.y * GRID)) { const err = G.clean(t.x + t.y * GRID); if (err) UI.toast(err, 'err'); return; }
  if (ui.tool === 'bulldoze') { const err = G.bulldoze(t.x, t.y); if (err) UI.toast(err, 'err'); return; }
  if (ui.tool) {
    const err = G.place(ui.tool, t.x, t.y);
    if (err) UI.toast(err, 'err');
    else if (!e.shiftKey && G.canAfford(BUILDINGS[ui.tool])) { /* keep tool for quick repeated placement */ }
    return;
  }
  const i = G.mainIndex(t.x + t.y * GRID);
  if (G.S.tiles[i]) UI.showInspector(i); else UI.showInspector(null);
});
cv.addEventListener('pointerleave', () => { ui.hover = null; ui.mouse = null; });
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  cancelFit();
  // zoom towards the cursor
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left - r.width / 2, sy = e.clientY - r.top - r.height / 2;
  const z = Math.max(0.25, Math.min(2.4, cam.z * (e.deltaY < 0 ? 1.1 : 0.9)));
  const wx = sx / cam.z - cam.x, wy = sy / cam.z - cam.y;
  cam.z = z; cam.x = sx / z - wx; cam.y = sy / z - wy;
}, { passive: false });

// ---------- keyboard ----------
window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (e.target.matches('input, select')) return;
  if (e.key === 'Escape') { UI.setTool(null); UI.showInspector(null); document.getElementById('menu').hidden = true; }
  if (e.key === ' ') { e.preventDefault(); setSpeed(speed ? 0 : 1); }
  if (e.key === 'f') fitView(true);
  if (e.key === 'p') { togglePhoto(); syncPhoto(); }
  if (e.key === 'b') UI.setTool(ui.tool === 'bulldoze' ? null : 'bulldoze');
  if (e.key === '1') setSpeed(1); if (e.key === '2') setSpeed(3); if (e.key === '3') setSpeed(8);
});

// ---------- buttons ----------
document.getElementById('tool-bulldoze').onclick = () => UI.setTool(ui.tool === 'bulldoze' ? null : 'bulldoze');
const syncPhoto = () => { document.body.classList.toggle('photo', photo.on); document.getElementById('btn-photo').classList.toggle('on', photo.on); };
syncPhoto();
document.getElementById('btn-photo').onclick = () => { togglePhoto(); syncPhoto(); };
document.getElementById('btn-fit').onclick = () => fitView(true);
document.getElementById('btn-menu').onclick = () => { document.getElementById('menu').hidden = false; };
document.getElementById('m-close').onclick = () => { document.getElementById('menu').hidden = true; initTutorial(); };
document.getElementById('m-tut').onclick = () => { document.getElementById('menu').hidden = true; startTutorial(); };
if (!firstVisit) initTutorial();
document.getElementById('m-save').onclick = () => UI.toast(G.save() ? '💾 Saved!' : 'Could not save in this browser', G.save() ? 'ok' : 'err');
const CITY_ICONS = { antwerpen: '⚓', brussel: '⚛️', gent: '🏰', oasis: '🐐' };
function renderCities() {
  const box = document.getElementById('cities');
  box.innerHTML = MAP_ORDER.map((id) => `<button class="city ${G.S.map === id ? 'current' : ''}" data-city="${id}"><div class="band" style="background:${MAPS[id].color}"></div><span class="ic">${CITY_ICONS[id]}</span><b>${MAPS[id].name}</b><small>${MAPS[id].tagline}</small></button>`).join('');
  box.querySelectorAll('.city').forEach((b) => b.onclick = () => {
    // only what the player built counts: landmarks and the starting houses (base) are part of every new city
    const started = G.buildingsList().some((x) => !BUILDINGS[x.type].landmark && !BUILDINGS[x.type].base) || G.S.day > 1;
    if (started && !confirm(`Start a new city in ${MAPS[b.dataset.city].name}? Your current city will be lost.`)) return;
    G.wipe(b.dataset.city); document.getElementById('menu').hidden = true; initTutorial();
  });
}
renderCities();
document.getElementById('console-toggle').onclick = (e) => {
  const c = document.getElementById('console'); c.classList.toggle('collapsed');
  e.target.textContent = c.classList.contains('collapsed') ? '▴' : '▾';
};
window.addEventListener('beforeunload', () => G.save());

// dust storms announce themselves
window.addEventListener('duststorm', (e) => UI.toast(e.detail === 'start' ? '🌪️ A dust storm is rolling in…' : '🌤️ The dust storm has passed', e.detail === 'start' ? 'err' : 'ok'));
