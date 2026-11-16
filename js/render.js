// Canvas renderer: a toy board-game city in isometric view.
import { GRID, TILE_W, TILE_H, BUILDINGS, DISASTERS } from './config.js';
import { weather } from './weather.js';
import { ferryRoute, marinaOf } from './maps.js';
import { S, D, isRoad, isWater, isPark, isLot, buildingsList, efficiency, mapInfo, terrain } from './game.js';

// HH is a let: while a building is drawn it is shrunk by TALL and the drawing is stretched back,
// so footprints stay the same but everything that rises from the ground gets TALL x higher.
const HW = TILE_W / 2, HH0 = TILE_H / 2;
let HH = HH0;
const TALL = 1.4;
// level of detail: when zoomed out, skip details nobody can see anyway
let lod = false;
let cv, ctx, W = 0, H = 0, dpr = 1;
export const cam = { x: 0, y: 0, z: 1 };
export const sim = { speed: 1 };
let frameDt = 0.016;
export const ui = { hover: null, tool: null, selected: null };
const particles = [];
export const taxis = [];
const boats = [];
let time = 0;

const BANDS = ['#8b5a2b', '#7cc6e8', '#e87aa8', '#f29e4c', '#e05a5a', '#f2c94c', '#3fa77c', '#2f5fa8'];
const PASTELS = ['#f2a65a', '#f7c873', '#e98b7b', '#9fd3c7', '#f4b6c2', '#c9b6e4', '#a8d08d', '#f6e7a1'];

// ---------- helpers ----------
export function toScreen(gx, gy) { return { x: (gx - gy) * HW, y: (gx + gy) * HH }; }
export function screenToGrid(sx, sy) {
  const wx = (sx - W / 2) / cam.z - cam.x, wy = (sy - H / 2) / cam.z - cam.y;
  return { gx: (wx / HW + wy / HH) / 2, gy: (wy / HH - wx / HW) / 2 };
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
// soft, photo-like edges instead of cartoon ink lines
const INK = 'rgba(42,34,28,0.42)';
function poly(pts, fill, stroke = INK, lw = 0.7) {
  if (stroke === '#3b2f2a') { stroke = INK; lw *= 0.6; }
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n *= 9; n ^= n >>> 4; n *= 0x27d4eb2d; return (n ^ (n >>> 15)) >>> 0; };

// box on a tile: centre (cx, cy) of footprint, footprint fraction f, base z0, height h
function box(cx, cy, f, z0, h, col) {
  const t = [cx, cy - HH * f], r = [cx + HW * f, cy], b = [cx, cy + HH * f], l = [cx - HW * f, cy];
  const up = (p, z) => [p[0], p[1] - z];
  const z1 = z0 + h;
  const fg = (k) => { if (lod) return shade(col, k); const g = ctx.createLinearGradient(0, cy - z1, 0, cy + HH * f - z0); g.addColorStop(0, shade(col, k + 0.07)); g.addColorStop(1, shade(col, k - 0.08)); return g; };
  poly([up(l, z0), up(b, z0), up(b, z1), up(l, z1)], fg(-0.18));
  poly([up(b, z0), up(r, z0), up(r, z1), up(b, z1)], fg(-0.05));
  poly([up(t, z1), up(r, z1), up(b, z1), up(l, z1)], shade(col, 0.15));
  if (!lod && h >= 18 && f >= 0.25) {
    ctx.strokeStyle = 'rgba(0,0,0,0.09)'; ctx.lineWidth = 0.8; ctx.beginPath();
    for (let zz = z0 + 11; zz < z1 - 4; zz += 11) { const A = up(l, zz), Bq = up(b, zz), C = up(r, zz); ctx.moveTo(A[0], A[1]); ctx.lineTo(Bq[0], Bq[1]); ctx.lineTo(C[0], C[1]); }
    ctx.stroke();
    // darker plinth at street level and a light cornice under the roof
    if (z0 === 0) poly([up(l, 0), up(b, 0), up(r, 0), up(r, 2.5), up(b, 2.5), up(l, 2.5)], 'rgba(40,30,20,0.18)', null);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
    const A = up(l, z1 - 1), Bq = up(b, z1 - 1), C = up(r, z1 - 1); ctx.moveTo(A[0], A[1]); ctx.lineTo(Bq[0], Bq[1]); ctx.lineTo(C[0], C[1]); ctx.stroke();
  }
  return { t: up(t, z1), r: up(r, z1), b: up(b, z1), l: up(l, z1), lb: up(l, z0), bb: up(b, z0), rb: up(r, z0), z1 };
}
// window on the right face (u along face 0..1, v height px from base)
function winR(cx, cy, f, z, u, w, v, h, lit) {
  const bx = cx + HW * f * u, by = cy + HH * f - HH * f * u - z - v;
  const pts = [[bx, by], [bx + HW * f * w, by - HH * f * w], [bx + HW * f * w, by - HH * f * w - h], [bx, by - h]];
  windowPoly(pts, lit);
}
function winL(cx, cy, f, z, u, w, v, h, lit) {
  const bx = cx - HW * f + HW * f * u, by = cy + HH * f * u - z - v;
  const pts = [[bx, by], [bx + HW * f * w, by + HH * f * w], [bx + HW * f * w, by + HH * f * w - h], [bx, by - h]];
  windowPoly(pts, lit);
}
const lights = [];
lights.push = function (...items) {
  if (ghost) {
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'source-over';
    for (const L of items) {
      if (L.glow) ctx.drawImage(glowSprite(L.col, L.a), L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
      else poly(L, L.fill || '#ffd97a', null);
    }
    ctx.globalCompositeOperation = op;
  }
  return Array.prototype.push.apply(this, items);
};
function windowPoly(pts, lit) {
  if (lod) { if (lit) lights.push(pts); return; }   // zoomed out: unlit windows are invisible anyway
  // glass reflects the sky: light at the top, deeper blue below
  const g = ctx.createLinearGradient(0, pts[3][1], 0, pts[0][1]);
  g.addColorStop(0, '#e4f3fa'); g.addColorStop(0.45, '#8fbdd6'); g.addColorStop(1, '#4f7d99');
  poly(pts, g, 'rgba(250,246,236,0.95)', 0.9);
  const [a, b, c, d] = pts, h = a[1] - d[1];
  if (h > 5) {
    // mullion and transom
    ctx.strokeStyle = 'rgba(250,246,236,0.85)'; ctx.lineWidth = 0.6; ctx.beginPath();
    ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); ctx.lineTo((c[0] + d[0]) / 2, (c[1] + d[1]) / 2);
    ctx.moveTo(d[0] + (a[0] - d[0]) * 0.35, d[1] + (a[1] - d[1]) * 0.35); ctx.lineTo(c[0] + (b[0] - c[0]) * 0.35, c[1] + (b[1] - c[1]) * 0.35);
    ctx.stroke();
  }
  // stone sill
  ctx.strokeStyle = 'rgba(60,50,40,0.55)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(a[0] - 0.5, a[1] + 0.8); ctx.lineTo(b[0] + 0.5, b[1] + 0.8); ctx.stroke();
  if (lit) lights.push(pts);
}

// ---------- particles ----------
export function burst(gx, gy, kind, text) {
  const p = toScreen(gx + 0.5, gy + 0.5);
  if (kind === 'confetti') {
    for (let i = 0; i < 26; i++) (ghost ? [] : particles).push({ x: p.x, y: p.y - 20, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3 - 1, life: 1, col: PASTELS[i % PASTELS.length], kind: 'dot', g: 0.08 });
  } else if (kind === 'text') {
    (ghost ? [] : particles).push({ x: p.x, y: p.y - 30, vx: 0, vy: -0.5, life: 1.4, text, kind: 'text', g: 0 });
  } else if (kind === 'dust') {
    for (let i = 0; i < 14; i++) (ghost ? [] : particles).push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.2, life: 0.9, col: '#cbb89a', kind: 'puff', g: 0.01, r: 4 + Math.random() * 4 });
  }
}

// ---------- traffic ----------
// real-world paint mix: lots of white, black, grey and silver, a few colourful ones
const CAR_PAINT = ['#f1f1ee', '#ecebe6', '#1e1f22', '#2a2c30', '#8e9399', '#b8bcc1', '#5d6168', '#24395e', '#3a5f9a', '#8b1e22', '#c0392b', '#4b5d3a', '#7a5c3e', '#d9b44a', '#e67e22', '#2e8b7a'];
const carColour = () => CAR_PAINT[Math.floor(Math.random() * CAR_PAINT.length)];
function initTraffic() {
  taxis.length = 0; boats.length = 0; slots.clear();
  const roads = [], water = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (isRoad(x, y)) roads.push([x, y]);
    if (isWater(x, y)) water.push([x, y]);
  }
  // maps with their own fleet (Oasis Bay) have no ordinary private cars, only what the fleet lists
  const nT = mapInfo().fleet ? 0 : Math.min(22, Math.floor(roads.length / 7));
  const used = new Set();
  const spawnTile = () => {
    for (let k = 0; k < 30; k++) { const r = roads[Math.floor(Math.random() * roads.length)]; if (!used.has(r[1] * GRID + r[0])) { used.add(r[1] * GRID + r[0]); return r; } }
    return roads[Math.floor(Math.random() * roads.length)];
  };
  for (let i = 0; i < nT; i++) {
    const [x, y] = spawnTile();
    taxis.push(mover(x, y, isRoad, 0.9 + Math.random() * 0.7, carColour()));
  }
  // public transport, deliveries and cyclists
  const fleet = mapInfo().fleet || [
    // public transport: De Lijn livery (yellow buses, white trams with a yellow band)
    ['bus', 3, 0.55, '#f2c230'],
    ['tram', 3, 0.5, '#f4f2ec'],
    ['truck', 3, 0.6, null],
    ['bike', mapInfo().bikes || 7, 0.42, null],
    ['moto', 3, 1.1, null], ['taxi', 3, 0.9, null],
    ['police', 1, 1.0, '#f4f4f2'], ['ambulance', 1, 1.0, '#f2d230'], ['fire', 1, 0.8, '#c8202f'],
  ];
  for (const [kind, n, sp, col] of fleet) for (let i = 0; i < n && roads.length; i++) {
    const [x, y] = spawnTile();
    const m = mover(x, y, isRoad, sp + Math.random() * 0.15, col || carColour());
    m.kind = kind; m.lane = kind === 'tank' ? 0.5 : kind === 'bike' ? 0.37 : kind === 'goat' || kind === 'patrol' ? 0.43 : kind === 'cart' ? 0.32 : 0.2; m.seed = Math.random() * 7;
    if (kind === 'bike') { m.variant = Math.floor(Math.random() * 3); if (m.variant === 1) m.sp += 0.2; }
    if (kind === 'taxi') { m.col = '#1e1f22'; m.model = 0; }
    if (kind === 'police' || kind === 'ambulance') m.model = kind === 'police' ? 0 : 2;
    taxis.push(m);
  }
  const nB = Math.min(5, Math.floor(water.length / 12));
  for (let i = 0; i < nB; i++) {
    const [x, y] = water[Math.floor(Math.random() * water.length)];
    boats.push(mover(x, y, isWater, 0.35 + Math.random() * 0.25, null, i));
  }
}
// ferries sail their route and back, waiting at each end (the car ferry loads cars there)
let ferries = [];
// moored yachts along the pontoon in the marina
let marina = null;
function initMarina() {
  const m = marinaOf(S.map, GRID);
  if (!m) { marina = null; return; }
  const ym = (m.y0 + m.y1 + 1) / 2, yachts = [];
  let k = 0;
  for (let x = m.x0 + 0.6; x < m.x1 + 0.7; x += 0.62) for (const side of [-1, 1]) {
    k++;
    if (hash(k * 13 + 5) % 5 === 0) continue;               // a few empty berths
    const sail = hash(k * 7) % 2 === 0;
    yachts.push({ gx: x + 0.5, gy: ym + side * 0.62 + 0.5, side, sail, finger: true, seed: k,
      hull: ['#f6f5f1', '#f6f5f1', '#ecebe6', '#1e2a44', '#f6f5f1'][hash(k) % 5] });
  }
  marina = { x0: m.x0, x1: m.x1, ym, yachts };
}
function yacht(y) {
  const bob = Math.sin(time * 1.6 + y.seed) * 0.6;
  const pose = { gx: y.gx, gy: y.gy, dx: 0, dy: y.side };      // bow points away from the pontoon
  const pt = frameAng(pose, 0.3, 0.12, WD - bob);
  const deck = [[-1, -1], [0.4, -1], [1, 0], [0.4, 1], [-1, 1]];
  const mid = pt(0, 0, 0);
  for (let k = 0; k < deck.length; k++) {
    const [ua, va] = deck[k], [ub, vb] = deck[(k + 1) % deck.length];
    const A = pt(ua, va, 0), B = pt(ub, vb, 0);
    if ((A[1] + B[1]) / 2 - mid[1] < 0) continue;
    poly([pt(ua, va, 0), pt(ub, vb, 0), pt(ub, vb, 3.5), pt(ua, va, 3.5)], shade(y.hull, (A[0] + B[0]) / 2 > mid[0] ? -0.04 : -0.18));
  }
  poly(deck.map(([u, v]) => pt(u, v, 3.5)), '#c9a87a');      // teak deck
  obox(pt, -0.7, 0.05, 3.5, 6.5, '#f4f2ec', 0.65);          // cabin
  poly([pt(0.06, -0.45, 4.2), pt(0.06, 0.45, 4.2), pt(0.06, 0.45, 6), pt(0.06, -0.45, 6)], '#4f7d99', null);
  if (y.sail) {
    const m0 = pt(-0.1, 0, 6.5), m1 = pt(-0.1, 0, 30);
    ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.stroke();
    // furled sail on the boom
    const b0 = pt(-0.1, 0, 9), b1 = pt(-0.95, 0, 9);
    ctx.strokeStyle = '#2f5fa8'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
    if (night()) glow(m1, 4, '255,60,50', 0.9);
  }
}
function makeFerry(r, car) {
  const seg = [];
  let total = 0;
  for (let i = 0; i < r.length - 1; i++) { const L = Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]); seg.push(L); total += L; }
  return { r, seg, total, s: car ? 0 : Math.random() * total, dir: 1, wait: car ? 4 : 0, car, cars: car ? carLoad() : null };
}
const carLoad = () => [carColour(), carColour(), carColour()];
function initFerry() {
  ferries = [];
  const a = ferryRoute(S.map, GRID), b = ferryRoute(S.map, GRID, 'carFerry');
  if (a) ferries.push(makeFerry(a, false));
  if (b) ferries.push(makeFerry(b, true));
}
function ferryPose(f, dt) {
  if (f.wait > 0) f.wait -= dt;
  else {
    f.s += f.dir * dt * (f.car ? 0.4 : 0.55);
    const arrived = f.s >= f.total || f.s <= 0;
    if (arrived) {
      f.s = Math.max(0, Math.min(f.total, f.s)); f.dir = -f.dir;
      f.wait = f.car ? 5 : 3;
      if (f.car) f.cars = carLoad(); // unload and load new cars
    }
  }
  let s = f.s, i = 0;
  while (i < f.seg.length - 1 && s > f.seg[i]) { s -= f.seg[i]; i++; }
  const a = f.r[i], b = f.r[i + 1], u = Math.min(1, s / f.seg[i]);
  let dx = (b[0] - a[0]) / f.seg[i], dy = (b[1] - a[1]) / f.seg[i];
  // a car ferry is double-ended: it never turns, it just sails back
  if (f.dir < 0 && !f.car) { dx = -dx; dy = -dy; }
  return { gx: a[0] + (b[0] - a[0]) * u + 0.5, gy: a[1] + (b[1] - a[1]) * u + 0.5, dx, dy, f };
}
function drawFerry(pose) {
  if (pose.f.car) return drawCarFerry(pose);
  const pt = frameAng(pose, 0.85, 0.32, WD);
  // wake
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.4;
  for (const v of [-1, 1]) { const A = pt(-1, v * 0.8, 0), B = pt(-2.4, v * 1.8, 0); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); }
  obox(pt, -1, 1, 0, 6, '#2f4f7a');            // hull
  obox(pt, -0.95, 0.95, 6, 7.5, '#e9e6de');    // car deck
  // two cars on the deck
  obox(pt, -0.7, -0.2, 7.5, 11, '#b8bcc1', 0.45);
  obox(pt, 0.05, 0.5, 7.5, 11, '#8b1e22', 0.45);
  // wheelhouse on the side, with a funnel
  obox(pt, -0.25, 0.25, 7.5, 17, '#f4f2ec', 0.4, 0.55);
  const top = pt(0, 0.55, 17);
  ctx.fillStyle = '#e05a5a'; ctx.fillRect(top[0] - 1.5, top[1] - 6, 3, 6);
  if (nightFactor(S.hour) > 0.2) { const h = pt(1, 0, 8); lights.push({ glow: true, x: h[0], y: h[1], r: 18 }); }
}
function drawCarFerry(pose) {
  const f = pose.f, pt = frameAng(pose, 0.95, 0.42, WD);
  const moving = f.wait <= 0, fwd = f.dir > 0 ? 1 : -1;
  if (moving) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.3;
    for (const v of [-1, 1]) { const A = pt(-fwd, v * 0.8, 0), B = pt(-fwd * 2.2, v * 1.5, 0); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); }
  }
  obox(pt, -1, 1, 0, 5, '#e2b23a');               // yellow hull
  obox(pt, -1, 1, 5, 6, '#7e818a');               // car deck
  // loading ramps at both ends, down when docked
  const ramp = moving ? 6 : 1;
  for (const e of [-1, 1]) poly([pt(e, -0.7, 6), pt(e, 0.7, 6), pt(e * 1.12, 0.7, ramp), pt(e * 1.12, -0.7, ramp)], '#5d6168');
  // the cars it carries, in two lanes
  const slots = [[-0.6, -0.45], [0.05, -0.45], [-0.3, 0.45]];
  f.cars.forEach((col, k) => { const [u, v] = slots[k]; obox(pt, u, u + 0.42, 6, 9.5, col, 0.32, v); });
  // bridge on the side
  obox(pt, -0.15, 0.15, 6, 15, '#f4f2ec', 0.2, 0.85);
  if (night()) { glow(pt(0, 0.85, 15), 5, '255,214,140', 0.8); glow(pt(fwd, 0, 6), 9, '235,242,255', 0.7); }
}
// oriented box: u along the heading, v across; v0 shifts it sideways
function obox(pt, u0, u1, z0, z1, col, vw = 1, v0 = 0) {
  const c = [[u0, v0 - vw], [u1, v0 - vw], [u1, v0 + vw], [u0, v0 + vw]];
  const mid = pt((u0 + u1) / 2, v0, z0);
  for (let k = 0; k < 4; k++) {
    const [ua, va] = c[k], [ub, vb] = c[(k + 1) % 4];
    const A = pt(ua, va, z0), B = pt(ub, vb, z0);
    const mx = (A[0] + B[0]) / 2 - mid[0], my = (A[1] + B[1]) / 2 - mid[1];
    if (my < 0) continue;
    poly([pt(ua, va, z0), pt(ub, vb, z0), pt(ub, vb, z1), pt(ua, va, z1)], shade(col, mx > 0 ? -0.05 : -0.18));
  }
  poly(c.map(([u, v]) => pt(u, v, z1)), shade(col, 0.12));
}
let streetLamps = [];
function initLamps() {
  streetLamps = [];
  const road = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID && terrain[x + y * GRID] === 1;
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (!road(x, y) || (x + y) % 2) continue;  // every other street tile
    // stand on the sidewalk, on the first side that borders something other than street
    const sides = [[0, -1, 0.5, 0.07], [-1, 0, 0.07, 0.5], [0, 1, 0.5, 0.93], [1, 0, 0.93, 0.5]];
    const s2 = sides.find(([dx, dy]) => !road(x + dx, y + dy) && !(terrain[(x + dx) + (y + dy) * GRID] === 4));
    if (s2) streetLamps.push({ gx: x + s2[2], gy: y + s2[3], lx: x + 0.5, ly: y + 0.5 });
  }
  // small street trees on the sidewalks in between
  streetTrees = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (!road(x, y) || (x + y) % 2 === 0 || hash(x * 31 + y * 7) % 3 === 0) continue;
    const sides = [[0, -1, 0.5, 0.06], [-1, 0, 0.06, 0.5], [0, 1, 0.5, 0.94], [1, 0, 0.94, 0.5]];
    const s2 = sides.find(([dx, dy]) => !road(x + dx, y + dy) && terrain[(x + dx) + (y + dy) * GRID] !== 4 && terrain[(x + dx) + (y + dy) * GRID] !== 2);
    if (s2) streetTrees.push({ gx: x + s2[2], gy: y + s2[3], seed: x * 97 + y });
  }
}
let streetTrees = [];
// tropical palm for desert maps: curved ringed trunk, drooping fronds, a bunch of dates
function palm(px, py, s, seed) {
  const wind = weather.wind || 0, sway = Math.sin(time * (1.2 + wind / 15) + seed) * (1 + wind / 10);
  const h = 22 * s, lean = ((seed % 7) - 3) * 0.9;
  const tx = px + lean + sway, ty = py - h;
  ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 2.2 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + lean * 0.2, py - h * 0.6, tx, ty); ctx.stroke();
  ctx.strokeStyle = '#6e5234'; ctx.lineWidth = 0.5;
  for (let k = 1; k < 6; k++) { const u = k / 6, x = px + (tx - px) * u * u, y = py - h * u; ctx.beginPath(); ctx.moveTo(x - 1.1 * s, y); ctx.lineTo(x + 1.1 * s, y); ctx.stroke(); }
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2 + seed, L = (9 + (k % 3) * 2) * s, ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.45 + 4 * s;
    ctx.strokeStyle = k % 2 ? '#4f8a3a' : '#5f9c44'; ctx.lineWidth = 2.4 * s;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty - 3 * s + Math.sin(a) * L * 0.2, ex, ey); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#a0572e'; ctx.beginPath(); ctx.arc(tx + 1, ty + 2, 1.3 * s, 0, 7); ctx.fill();
}
function streetTree(t) {
  if (mapInfo().desert) return palm(toScreen(t.gx, t.gy).x, toScreen(t.gx, t.gy).y, 0.5, t.seed);
  const p = toScreen(t.gx, t.gy), s = 0.55 + (hash(t.seed) % 20) / 100;
  ctx.fillStyle = '#6b4a2b'; ctx.fillRect(p.x - 0.8, p.y - 9 * s, 1.6, 9 * s);
  const sway = Math.sin(time * (1.5 + (weather.wind || 0) / 12) + t.seed) * (0.8 + (weather.wind || 0) / 10);
  ctx.fillStyle = ['#4f8a3c', '#5a9444', '#4a8238'][hash(t.seed) % 3];
  ctx.beginPath(); ctx.arc(p.x + sway, p.y - 13 * s, 5.5 * s, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(p.x + sway - 1.5, p.y - 15 * s, 2.5 * s, 0, 7); ctx.fill();
}
function streetLamp(L) {
  const p = toScreen(L.gx, L.gy), q = toScreen(L.lx, L.ly);
  const H = 17;
  ctx.strokeStyle = '#3a3d42'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - H); ctx.lineTo(p.x + (q.x - p.x) * 0.35, p.y - H + (q.y - p.y) * 0.35 - 1); ctx.stroke();
  const hx = p.x + (q.x - p.x) * 0.35, hy = p.y - H + (q.y - p.y) * 0.35;
  ctx.fillStyle = night() ? '#fff1c8' : '#5a5e66'; ctx.fillRect(hx - 1.5, hy - 1, 3, 1.6);
  if (night()) {
    // warm pool of light on the street, kept small so it does not look like a building
    lights.push({ glow: true, x: q.x, y: q.y, r: 22, col: '255,205,120', a: 0.28 });
    lights.push({ glow: true, x: hx, y: hy, r: 5, col: '255,236,190', a: 0.9 });
  }
}
export const resetWorld = () => { worldGen++; if (dust.on) endDust(); gunshipEngine(false); outposts.length = 0; gunship = null; nextRun = 40; wrecks.length = 0; effects.length = 0; ufos.length = 0; shake.t = 0; initTraffic(); initFerry(); initLamps(); initMarina(); };

// ---------- demolition: the screen shakes, a fireball goes off, the building pancakes down in a cascade of rubble ----------
const wrecks = [];                       // buildings that are still collapsing (already gone from the game state)
const shake = { t: 0, dur: 0.7, amp: 0 };
const WRECK_T = 1.5;                     // seconds from bang to gone
// delay: seconds the building keeps standing before it blows (used to make disasters roll through a district)
export function demolish(gx, gy, t, delay = 0, quiet = false) {
  wrecks.push({ b: { ...t, x: gx, y: gy, i: -1, wreck: true, born: 1, damaged: false }, t: -delay, seed: hash(t.id || 1), quiet, boomed: false });
  stepWrecks(0);
}
function boom(w) {
  const { b } = w, k = b.size || 1;
  w.boomed = true;
  shake.t = shake.dur; shake.amp = Math.max(shake.t > 0 ? shake.amp : 0, 7 + k * 3);
  if (w.quiet) return;                    // zapped by a death ray: no fireball, the beam is the show
  const p = toScreen(b.x + k / 2, b.y + k / 2);
  const FIRE = ['#fff2b0', '#ffd34d', '#ff9a3c', '#e8502a'];
  // flash + fireball
  for (let i = 0; i < 10; i++) particles.push({ x: p.x + (Math.random() - 0.5) * 22 * k, y: p.y - 20 - Math.random() * 30, vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 1.6, life: 0.55, col: FIRE[i % 4], kind: 'puff', g: -0.02, r: 7 + Math.random() * 7 });
  // sparks flying out
  for (let i = 0; i < 34; i++) particles.push({ x: p.x, y: p.y - 30, vx: (Math.random() - 0.5) * 7, vy: -Math.random() * 6 - 1, life: 0.9, col: FIRE[i % 4], kind: 'dot', g: 0.22 });
  // a dark smoke column that lingers
  for (let i = 0; i < 12; i++) particles.push({ x: p.x + (Math.random() - 0.5) * 26 * k, y: p.y - 10 - Math.random() * 40, vx: (Math.random() - 0.5) * 0.6, vy: -0.4 - Math.random() * 0.8, life: 1.7, col: i % 2 ? '#5d5a57' : '#8a847b', kind: 'puff', g: -0.004, r: 6 + Math.random() * 6 });
}
function drawWreck(w) {
  const b = w.b, k = b.size || 1, p = toScreen(b.x + k / 2, b.y + k / 2);
  if (w.t < 0) { drawBuilding(b); return; }   // still standing, its turn hasn't come yet
  const u = Math.min(1, w.t / WRECK_T);
  const fall = u < 0.18 ? 0 : Math.pow((u - 0.18) / 0.82, 1.7);   // short tremble, then everything gives way
  const dir = w.seed % 2 ? 1 : -1;
  ctx.save();
  ctx.globalAlpha = 1 - Math.max(0, (u - 0.82) / 0.18);
  const jx = (u < 0.18 ? 2.2 : 1.2 * (1 - fall)) * Math.sin(time * 70 + w.seed);
  ctx.translate(p.x + jx, p.y);
  ctx.rotate(fall * 0.14 * dir);
  ctx.transform(1, 0, fall * 0.25 * dir, 1, 0, 0);                  // the top leans over as it goes
  ctx.scale(1, Math.max(0.03, 1 - fall));                            // floors stack down onto each other
  ctx.translate(-p.x, -p.y);
  drawBuilding(b);
  ctx.restore();
  if (ghost || u < 0.18 || u > 0.95) return;
  // cascade: chunks of wall break off the falling top and tumble down, dust rolls out at street level
  const top = p.y - 70 * (1 - fall) * Math.min(1.6, k);
  const RUB = ['#8a7a66', '#b9a88c', '#6e6259', '#d8d2c4', '#a0573f'];
  for (let i = 0; i < 3; i++) particles.push({ x: p.x + (Math.random() - 0.5) * HW * 0.9 * k, y: top + Math.random() * 20, vx: (Math.random() - 0.5) * 2.2, vy: Math.random() * 0.6, life: 0.7, col: RUB[(Math.random() * RUB.length) | 0], kind: 'dot', g: 0.32 });
  if (Math.random() < 0.6) particles.push({ x: p.x + (Math.random() - 0.5) * HW * 1.4 * k, y: p.y + (Math.random() - 0.5) * HH * k, vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 0.4, life: 1.1, col: '#cbb89a', kind: 'puff', g: 0, r: 5 + Math.random() * 6 });
}
function stepWrecks(dt) {
  for (let i = wrecks.length - 1; i >= 0; i--) {
    const w = wrecks[i]; w.t += dt;
    if (w.t >= 0 && !w.boomed) boom(w);
    if (w.t >= WRECK_T) { wrecks.splice(i, 1); burst(w.b.x + ((w.b.size || 1) - 1) / 2, w.b.y + ((w.b.size || 1) - 1) / 2, 'dust'); }
  }
}

// ---------- mountains (terrain) ----------
// Mountain tiles are grouped greedily into 3x3, 2x2 and 1x1 blocks, each drawn as one rock shape.
// Height depends on where it stands: the far upper-right of the board (high x, low y) gets the giants,
// everything nearer the viewer stays low so it never hides the city behind it.
let mtnCache = null;
function mountainBlocks() {
  if (mtnCache && mtnCache.map === S.map) return mtnCache.list;
  const used = new Uint8Array(GRID * GRID), list = [];
  const isM = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID && terrain[x + y * GRID] === 5 && !used[x + y * GRID];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (!isM(x, y)) continue;
    let k = 1;
    for (const s of [3, 2]) { let ok = true; for (let j = 0; j < s && ok; j++) for (let i = 0; i < s && ok; i++) ok = isM(x + i, y + j); if (ok) { k = s; break; } }
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) used[x + i + (y + j) * GRID] = 1;
    const seed = hash(x * 131 + y * 17 + 5);
    const back = Math.max(0, Math.min(1, ((x + k / 2) - (y + k / 2)) / GRID * 1.4 + 0.25));   // 1 = far upper-right
    const front = (x + y) / (2 * GRID);                                                      // 1 = closest to the viewer
    const hf = Math.max(0.18, back * back * 1.6 - front * 0.35);
    list.push({ x, y, k, seed, hf, shape: ['peak', 'twin', 'mesa', 'ridge', 'peak'][seed % 5] });
  }
  mtnCache = { map: S.map, list };
  return list;
}
function drawMountain(m) {
  const p = toScreen(m.x + m.k / 2, m.y + m.k / 2), W = HW * m.k * 0.98, D = HH * m.k * 0.98;
  const H = (34 + (m.seed % 4) * 9) * m.k * m.hf * (m.shape === 'mesa' ? 0.55 : 1);
  const L = '#b0744a', R = '#8e5a37', T = '#c98e5e', E = 'rgba(60,35,20,0.45)';
  const x = p.x, y = p.y;
  poly([[x - W, y], [x, y - D], [x + W, y], [x, y + D]], '#b98a5c', null);   // rocky foot
  const cap = (cx, h, w) => { if (h > 40) poly([[cx - w * 0.14, y - h * 0.84], [cx, y - h], [cx + w * 0.16, y - h * 0.82], [cx, y - h * 0.88]], '#ead2a8', null); };
  const strata = (cx, h, w) => { ctx.strokeStyle = 'rgba(70,40,20,0.3)'; ctx.lineWidth = 0.6; for (let k = 1; k < 4; k++) { const z = y - h * k / 4; ctx.beginPath(); ctx.moveTo(cx - w * (1 - k / 4) * 0.85, z + 2); ctx.lineTo(cx + w * (1 - k / 4) * 0.85, z + 3); ctx.stroke(); } };
  const peak = (cx, h, w, c1 = L, c2 = R) => {
    poly([[cx - w, y], [cx - w * 0.35, y - h * 0.5], [cx, y - h], [cx, y + D * 0.25]], c1, E, 0.8);
    poly([[cx, y - h], [cx + w * 0.4, y - h * 0.55], [cx + w, y], [cx, y + D * 0.25]], c2, E, 0.8);
    strata(cx, h, w); cap(cx, h, w);
  };
  if (m.shape === 'peak') peak(x + W * 0.05, H, W * 0.92);
  else if (m.shape === 'twin') { peak(x + W * 0.3, H, W * 0.7); peak(x - W * 0.3, H * 0.72, W * 0.65, T, L); }
  else if (m.shape === 'ridge') { peak(x + W * 0.45, H * 0.7, W * 0.5); peak(x, H, W * 0.6); peak(x - W * 0.45, H * 0.6, W * 0.5, T, L); }
  else {
    // mesa: steep sides, flat table top, layered red rock
    const tw = W * 0.55;
    poly([[x - W * 0.9, y], [x - tw, y - H], [x, y - H + D * 0.3], [x, y + D * 0.2]], L, E, 0.8);
    poly([[x, y - H + D * 0.3], [x + tw, y - H], [x + W * 0.9, y], [x, y + D * 0.2]], R, E, 0.8);
    poly([[x - tw, y - H], [x, y - H - D * 0.35], [x + tw, y - H], [x, y - H + D * 0.3]], T, E, 0.8);
    ctx.strokeStyle = 'rgba(120,50,25,0.45)'; ctx.lineWidth = 1;
    for (const f of [0.3, 0.55, 0.8]) { ctx.beginPath(); ctx.moveTo(x - W * 0.9 + (W * 0.9 - tw) * f, y - H * f); ctx.lineTo(x, y - H * f + D * 0.25); ctx.lineTo(x + W * 0.9 - (W * 0.9 - tw) * f, y - H * f); ctx.stroke(); }
  }
  // a few boulders and a goat path
  for (let k = 0; k < 2 + m.k; k++) { const a = k * 1.7 + m.seed, bx = x + Math.cos(a) * W * 0.75, by = y + Math.sin(a) * D * 0.6; ctx.fillStyle = k % 2 ? R : L; ctx.beginPath(); ctx.ellipse(bx, by, 2.5, 1.6, 0, 0, 7); ctx.fill(); }
}

// ---------- drone sound: a synthesised propeller hum (Web Audio, no files) ----------
// It fades in while the mouse is over a drone or the camera is zoomed in with drones in view.
let droneAudio = null;
const MASTER_VOLUME = 0.35;   // overall loudness of all sound effects (1 = full)
export function unlockAudio() {
  // browsers only allow sound after a click or key press, so this runs on the first pointer down
  if (droneAudio) { if (droneAudio.ac.state === 'suspended') droneAudio.ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  // every sound in the game goes through this one master volume
  const ac = new AC(), master = ac.createGain(); master.gain.value = MASTER_VOLUME; master.connect(ac.destination);
  const out = ac.createGain(); out.gain.value = 0; out.connect(master);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2; lp.connect(out);
  const oscs = [[96, 'sawtooth', 0.35], [97.3, 'sawtooth', 0.3], [192.5, 'square', 0.08], [48, 'triangle', 0.4]].map(([f, type, g]) => {
    const o = ac.createOscillator(), gg = ac.createGain(); o.type = type; o.frequency.value = f; gg.gain.value = g; o.connect(gg); gg.connect(lp); o.start(); return o;
  });
  // slow wobble in pitch, like a propeller drifting with the wind
  const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.7; lg.gain.value = 3; lfo.connect(lg); oscs.forEach((o) => lg.connect(o.frequency)); lfo.start();
  droneAudio = { ac, out, lp, master };
}
// short synthesised sound effects (need the audio context that unlockAudio() made on the first click)
function noiseBurst(ac, dur) {
  const b = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const src = ac.createBufferSource(); src.buffer = b; return src;
}
function sfx(build) { unlockAudio(); if (!droneAudio) return; const { ac, master } = droneAudio, out = ac.createGain(); out.connect(master); build(ac, out, ac.currentTime); }
// the cannon: a sharp crack with a deep thump under it, then a short echo
export function playCannon() {
  sfx((ac, out, t) => {
    out.gain.setValueAtTime(0.55, t);
    const n = noiseBurst(ac, 0.45), hp = ac.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1400; hp.Q.value = 0.7;
    n.connect(hp); hp.connect(out); n.start(t);
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.55);
    const e = noiseBurst(ac, 0.6), lp = ac.createBiquadFilter(), eg = ac.createGain(); lp.type = 'lowpass'; lp.frequency.value = 500; eg.gain.value = 0.25;
    e.connect(lp); lp.connect(eg); eg.connect(out); e.start(t + 0.22);
  });
}
// the crash on the ground: a long rumbling explosion
export function playBoom(size = 1) {
  sfx((ac, out, t) => {
    out.gain.setValueAtTime(0.7 * size, t);
    const n = noiseBurst(ac, 1.6), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1200, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.4);
    n.connect(lp); lp.connect(out); n.start(t);
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(25, t + 1);
    g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.2); o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.3);
  });
}
function droneVolume(level) {
  if (!droneAudio) return;
  const { ac, out, lp } = droneAudio, v = Math.max(0, Math.min(1, level)) * 0.18;
  out.gain.setTargetAtTime(v, ac.currentTime, 0.25);
  lp.frequency.setTargetAtTime(500 + level * 900, ac.currentTime, 0.3);   // closer = brighter
}

// ---------- drones: grey fixed-wing military drones circling slowly over maps that list them ----------
const drones = [];
function drawDrones() {
  if (!mapInfo().drones) { drones.length = 0; droneVolume(0); return; }
  let level = 0;
  const c = toScreen(GRID / 2, GRID / 2), span = GRID * HW;
  while (drones.length < mapInfo().drones) drones.push({ a: Math.random() * 6.28, r: 0.35 + Math.random() * 0.45, sp: (0.05 + Math.random() * 0.04) * (Math.random() < 0.5 ? -1 : 1), z: 150 + Math.random() * 60 });
  for (const d of drones) {
    if (d.down > time) continue;                       // shot down: a replacement arrives after 10 s
    if (d.down) { d.down = 0; d.a = Math.random() * 6.28; d.rT = d.r; d.r = 1.6; }   // ...flying in from beyond the board edge
    if (d.rT) { d.r += (d.rT - d.r) * Math.min(1, frameDt * 0.8); if (Math.abs(d.r - d.rT) < 0.01) { d.r = d.rT; d.rT = 0; } }
    d.a += d.sp * frameDt * (sim.speed || 0.3);
    const gx = c.x + Math.cos(d.a) * span * d.r, gy = c.y + Math.sin(d.a) * span * d.r * 0.5;   // wide orbit over the board
    const x = gx, y = gy - d.z, dir = Math.atan2(Math.cos(d.a) * 0.5 * Math.sign(d.sp), -Math.sin(d.a) * Math.sign(d.sp));
    // faint shadow on the ground
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.beginPath(); ctx.ellipse(gx, gy, 10, 3, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(dir); ctx.scale(1, 0.6);
    ctx.fillStyle = '#9aa0a6'; ctx.strokeStyle = 'rgba(40,40,45,0.6)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 1.8, 0, 0, 7); ctx.fill(); ctx.stroke();                  // fuselage
    ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(-2, -12); ctx.lineTo(-4, -12); ctx.lineTo(-3, 0); ctx.lineTo(-4, 12); ctx.lineTo(-2, 12); ctx.closePath(); ctx.fill(); ctx.stroke();   // long thin wings
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-10, -3.5); ctx.lineTo(-10, 3.5); ctx.closePath(); ctx.fill();   // V-tail
    ctx.fillStyle = '#6f757c'; ctx.beginPath(); ctx.ellipse(7, 0, 2.4, 1.6, 0, 0, 7); ctx.fill();     // sensor dome
    ctx.restore();
    droneLights(x, y, dir, d);

    // how loud: hovering right over it, or zoomed in with it on screen (nearer the middle = louder)
    const sx = W / 2 + (x + cam.x) * cam.z, sy = H / 2 + (y + cam.y) * cam.z;
    d.sx = sx; d.sy = sy; d.x = x; d.y = y; d.gx = gx; d.gy = gy;
    if (ui.mouse) { const dm = Math.hypot(ui.mouse.x - sx, ui.mouse.y - sy); if (dm < 40 * Math.max(1, cam.z)) level = Math.max(level, 1 - dm / (60 * Math.max(1, cam.z))); }
    if (cam.z > 1.1 && sx > 0 && sy > 0 && sx < W && sy < H) level = Math.max(level, Math.min(1, (cam.z - 1.1) / 1.1) * (1 - Math.hypot(sx - W / 2, sy - H / 2) / Math.hypot(W / 2, H / 2)));
  }
  droneVolume(level); sim.droneLevel = level; sim.drones = drones;   // handy for checking from the console
}

// aircraft lights like the real thing: steady red on the left wingtip, green on the right, white on the tail,
// a white anti-collision strobe double-flashing on both wingtips and a slow red beacon on the belly.
// Drawn small by day; at night each also adds a glow so it shines through the dark overlay.
function droneLights(x, y, dir, d) {
  const c = Math.cos(dir), s = Math.sin(dir);
  const at = (u, v) => [x + u * c - v * 0.6 * s, y + u * s + v * 0.6 * c];   // same transform as the drone body
  const dot = (p, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill(); };
  const dark = night();
  const port = at(-3, -12), star = at(-3, 12), tail = at(-10, 0);
  dot(port, 0.9, '#ff3b30'); dot(star, 0.9, '#2fe36a'); dot(tail, 0.7, '#fffbe8');
  if (dark) { glow(port, 5, '255,59,48', 0.85); glow(star, 5, '47,227,106', 0.85); glow(tail, 4, '255,250,230', 0.7); }
  // strobe: two quick flashes every 1.2 s, each drone on its own rhythm
  const ph = (time + d.a * 3) % 1.2;
  if (ph < 0.05 || (ph > 0.15 && ph < 0.2)) {
    dot(port, 1.4, '#ffffff'); dot(star, 1.4, '#ffffff');
    if (dark) { glow(port, 11, '255,255,255', 1); glow(star, 11, '255,255,255', 1); }
  }
  // belly beacon: slow red pulse
  if (Math.sin(time * 6 + d.a * 10) > 0.6) { dot([x, y + 1], 1.1, '#ff4a3d'); if (dark) glow([x, y + 1], 7, '255,74,61', 0.9); }
}

// click on a drone: it bursts into flames, tumbles down onto the spot under it and explodes there.
// onImpact(tileX, tileY) is called when it hits the ground so the game can apply the blast.
const fallers = [];
export function shootDroneAt(mx, my, onImpact) {
  if (!mapInfo().drones) return false;
  const hit = drones.find((d) => !(d.down > time) && d.sx != null && Math.hypot(d.sx - mx, d.sy - my) < 18 * Math.max(1, cam.z));
  if (!hit) return false;
  hit.down = time + 10;
  playCannon();
  for (let i = 0; i < 16; i++) particles.push({ x: hit.x, y: hit.y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 3, life: 0.6, col: ['#fff2b0', '#ffd34d', '#ff9a3c'][i % 3], kind: 'dot', g: 0.1 });
  fallers.push({ x0: hit.x, y0: hit.y, gx: hit.gx, gy: hit.gy, t: 0, spin: (Math.random() < 0.5 ? -1 : 1), onImpact });
  return true;
}
function drawFallers() {
  for (let i = fallers.length - 1; i >= 0; i--) {
    const f = fallers[i]; f.t += frameDt;
    const u = Math.min(1, f.t / 0.9), e = u * u;                                   // accelerates as it drops
    const x = f.x0 + (f.gx - f.x0) * u, y = f.y0 + (f.gy - f.y0) * e;
    particles.push({ x, y, vx: (Math.random() - 0.5) * 0.4, vy: -0.3, life: 0.8, col: Math.random() < 0.5 ? '#ff9a3c' : '#4d4a47', kind: 'puff', g: -0.01, r: 3 + Math.random() * 3 });
    ctx.save(); ctx.translate(x, y); ctx.rotate(f.t * 9 * f.spin); ctx.fillStyle = '#55595e';
    ctx.fillRect(-8, -1.2, 16, 2.4); ctx.fillRect(-1.5, -9, 3, 18); ctx.restore();   // tumbling wreck
    if (u >= 1) {
      fallers.splice(i, 1);
      const sx = W / 2 + (f.gx + cam.x) * cam.z, sy = H / 2 + (f.gy + cam.y) * cam.z;
      const g = screenToGrid(sx, sy);
      f.onImpact(Math.max(0, Math.min(GRID - 1, Math.floor(g.gx))), Math.max(0, Math.min(GRID - 1, Math.floor(g.gy))));
    }
  }
}

// ---------- enemy outposts in the mountains + the gunship that bombs them ----------
// Purely scenery: a few small camps sit on the mountain ranges, far from the town. Every 2.5 minutes a
// four-engine gunship flies over, circles one camp and bombs it. The town and its buildings are never hit.
// A wrecked camp smokes for a while, then a new one is set up on another mountain.
const outposts = [];
const RUN_EVERY = 150;                    // seconds between bombing runs
let nextRun = 40, gunship = null;
function outpostSpots() {
  const list = mountainBlocks().filter((m) => m.k >= 2);
  return list.length ? list : mountainBlocks();
}
function newOutpost(exclude = []) {
  const spots = outpostSpots().filter((m) => !exclude.includes(m) && !outposts.some((o) => o.m === m));
  if (!spots.length) return null;
  const m = spots[Math.floor(Math.random() * spots.length)];
  return { m, seed: Math.floor(Math.random() * 1e6), state: 'up', t: 0 };
}
sim.bombNow = () => { nextRun = 0; };   // for testing from the console
sim.gunshipState = () => ({ flying: !!gunship, t: gunship ? +gunship.t.toFixed(1) : null, sound: !!gsAudio, camps: outposts.map((o) => o.state) });
function stepOutposts(dt) {
  if (!mapInfo().outposts) { outposts.length = 0; gunship = null; return; }
  if (outposts.length && outposts[0].map !== S.map) outposts.length = 0;
  while (outposts.length < mapInfo().outposts) { const o = newOutpost(); if (!o) break; o.map = S.map; outposts.push(o); }
  for (let i = outposts.length - 1; i >= 0; i--) {
    const o = outposts[i]; o.t += dt;
    if (o.state === 'ruin' && o.t > 50) { const n = newOutpost([o.m]); outposts.splice(i, 1); if (n) { n.map = S.map; outposts.push(n); } }
  }
  nextRun -= dt;
  if (nextRun <= 0 && !gunship) {
    nextRun = RUN_EVERY;
    const targets = outposts.filter((o) => o.state === 'up');
    if (targets.length) startRun(targets[Math.floor(Math.random() * targets.length)]);
  }
}
function outpostPos(o) {
  const m = o.m, p = toScreen(m.x + m.k / 2, m.y + m.k / 2);
  // mesas: on the flat top; everything else: on the lower front slope
  if (m.shape === 'mesa') { const H = (34 + (m.seed % 4) * 9) * m.k * m.hf * 0.55; return { x: p.x, y: p.y - H - HH * m.k * 0.05 }; }
  return { x: p.x + HW * m.k * 0.15, y: p.y + HH * m.k * 0.35 };
}
function drawOutpost(o) {
  const { x, y } = outpostPos(o), s = 0.9;
  if (o.state === 'ruin') {
    // scorched ground, broken poles and smoke
    // wide scorched blast area with a darker crater in the middle
    ctx.fillStyle = 'rgba(30,22,16,0.4)'; ctx.beginPath(); ctx.ellipse(x, y, 34 * s, 15 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(20,14,10,0.6)'; ctx.beginPath(); ctx.ellipse(x, y, 16 * s, 7 * s, 0, 0, 7); ctx.fill();
    // snapped poles, torn canvas and scattered sandbags all over it
    ctx.strokeStyle = '#3a3330'; ctx.lineWidth = 1.1;
    for (let k = 0; k < 9; k++) { const a = k * 0.7 + o.seed, r = 8 + (k % 3) * 7; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.45); ctx.lineTo(x + Math.cos(a) * r + 3, y + Math.sin(a) * r * 0.45 - 5); ctx.stroke(); }
    for (let k = 0; k < 7; k++) { const a = k * 1.1 + o.seed * 0.3, r = 12 + (k % 4) * 5; ctx.fillStyle = k % 2 ? '#8d7e60' : '#5a5040'; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.45, 2.2, 1.2, a, 0, 7); ctx.fill(); }
    // embers glowing in the crater for the first while
    if (o.t < 20) { ctx.fillStyle = Math.sin(time * 9 + o.seed) > 0 ? '#ff8a3c' : '#e8502a'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(k * 1.7) * 6, y + Math.sin(k * 1.7) * 2.5, 1, 0, 7); ctx.fill(); } }
    // a tall column of thick smoke that rises high, drifts with the wind and thins out over time
    if (o.smokeFor == null) o.smokeFor = 10 + Math.random() * 10;           // each wreck smokes for 10 to 20 seconds
    const fade = Math.max(0, 1 - o.t / o.smokeFor), wind = 0.25 + (weather.wind || 0) / 60;
    if (!ghost && fade > 0) for (let k = 0; k < 3; k++) if (Math.random() < 0.6 * fade) particles.push({ x: x + (Math.random() - 0.5) * 14, y: y - 4, vx: wind * (0.5 + Math.random()), vy: -1.4 - Math.random() * 0.8, life: 3.2, col: Math.random() < 0.5 ? '#3f3c39' : '#5e5853', kind: 'puff', g: -0.006, r: 6 + Math.random() * 6 });
    return;
  }
  // sandbag ring
  ctx.fillStyle = '#b8a27a'; ctx.strokeStyle = 'rgba(70,55,35,0.6)'; ctx.lineWidth = 0.4;
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, bx = x + Math.cos(a) * 15 * s, by = y + Math.sin(a) * 6.5 * s; ctx.beginPath(); ctx.ellipse(bx, by - 1, 2.4, 1.3, a, 0, 7); ctx.fill(); ctx.stroke(); }
  // two canvas tents
  for (const [dx, dy, col] of [[-6, -1, '#7d7356'], [4, 1.5, '#6b6248']]) {
    const tx = x + dx * s, ty = y + dy * s;
    poly([[tx - 5, ty], [tx, ty - 6], [tx + 1.5, ty + 1.5]], shade(col, 0.1), 'rgba(40,30,20,0.5)', 0.4);
    poly([[tx, ty - 6], [tx + 5, ty - 1], [tx + 1.5, ty + 1.5]], shade(col, -0.12), 'rgba(40,30,20,0.5)', 0.4);
    ctx.fillStyle = '#2b2620'; ctx.beginPath(); ctx.moveTo(tx - 0.2, ty - 2.5); ctx.lineTo(tx + 1.4, ty + 1.2); ctx.lineTo(tx - 1.2, ty + 0.4); ctx.closePath(); ctx.fill();
  }
  // wooden lookout tower
  const wx = x + 10 * s, wy = y - 2 * s;
  ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 0.7;
  for (const dx of [-2, 2]) { ctx.beginPath(); ctx.moveTo(wx + dx, wy); ctx.lineTo(wx + dx * 0.6, wy - 14); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(wx - 2, wy - 4); ctx.lineTo(wx + 1.6, wy - 9); ctx.moveTo(wx + 2, wy - 4); ctx.lineTo(wx - 1.6, wy - 9); ctx.stroke();
  ctx.fillStyle = '#7a5230'; ctx.fillRect(wx - 3, wy - 17, 6, 3); ctx.fillStyle = '#6b6248'; ctx.beginPath(); ctx.moveTo(wx - 3.6, wy - 17); ctx.lineTo(wx, wy - 20); ctx.lineTo(wx + 3.6, wy - 17); ctx.closePath(); ctx.fill();
  // plain dark pennant on a pole, crates, and a campfire with a thin smoke trail
  const fx = x - 12 * s, fy = y - 1;
  ctx.strokeStyle = '#3a3330'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 13); ctx.stroke();
  ctx.fillStyle = '#2b2b2a'; ctx.beginPath(); ctx.moveTo(fx, fy - 13); ctx.lineTo(fx + 5 + Math.sin(time * 4 + o.seed), fy - 11.5); ctx.lineTo(fx, fy - 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6b5a3a'; ctx.fillRect(x - 1, y + 2, 3, 2.4); ctx.fillRect(x + 2.2, y + 2.6, 2.4, 2);
  ctx.fillStyle = Math.sin(time * 12 + o.seed) > 0 ? '#ffb347' : '#ff7a2f'; ctx.beginPath(); ctx.arc(x - 1, y - 0.5, 1, 0, 7); ctx.fill();
  if (night()) glow([x - 1, y - 1], 12, LIGHT.warm, 0.6);
  if (!ghost && Math.random() < 0.08) particles.push({ x: x - 1, y: y - 2, vx: 0.1, vy: -0.4, life: 1.6, col: '#bdb6aa', kind: 'puff', g: -0.002, r: 2 });
}
// the gunship: comes in from the edge, circles the camp while it bombs, then leaves the other way
function startRun(o) {
  const c = outpostPos(o), side = Math.random() < 0.5 ? -1 : 1;
  gunship = { o, c, t: 0, side, R: 190, hits: 0, nextGun: 0, from: { x: c.x + side * 1500, y: c.y - 700 }, to: { x: c.x - side * 1500, y: c.y - 760 } };
  gunshipEngine(true);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('gunship', { detail: 'inbound' }));
}
// one static speech bubble after the gunship leaves: a single canvas draw, no animation, gone after a few seconds
let cheer = null;
function drawCheer() {
  if (!cheer) return;
  if (time > cheer.until) { cheer = null; return; }
  const { x, y } = cheer, w = 78, h = 24;
  ctx.fillStyle = '#fffdf4'; ctx.strokeStyle = '#2a2620'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h, w, h, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 4, y - 1); ctx.lineTo(x, y + 5); ctx.lineTo(x + 4, y - 1); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a2620'; ctx.font = '600 13px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Woo-hoo! 🎉', x, y - h / 2);
}
function drawGunship() {
  const g = gunship; if (!g) return;
  g.t += frameDt;
  const IN = 4, ORBIT = 7, OUT = 3.5, alt = 330, SC = 5;   // SC: drawn five times bigger than the original
  let x, y, ang, roll = 0;
  const orbitPos = (u) => { const a = u * Math.PI * 2 * g.side + Math.PI; return { x: g.c.x + Math.cos(a) * g.R, y: g.c.y - alt + Math.sin(a) * g.R * 0.45, a }; };
  if (g.t < IN) { const u = g.t / IN, e = orbitPos(0); x = g.from.x + (e.x - g.from.x) * u; y = g.from.y + (e.y - g.from.y) * u; ang = Math.atan2(e.y - g.from.y, e.x - g.from.x); }
  else if (g.t < IN + ORBIT) {
    const u = (g.t - IN) / ORBIT, q = orbitPos(u); x = q.x; y = q.y; ang = q.a + g.side * Math.PI / 2;
    // firing: tracer from the left side down to the camp, explosions on the ground
    if (Math.random() < 0.35) {
      const tx = g.c.x + (Math.random() - 0.5) * 24, ty = g.c.y + (Math.random() - 0.5) * 8;
      ctx.strokeStyle = 'rgba(255,220,120,0.85)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(tx, ty); ctx.stroke();
      lights.push({ glow: true, x: tx, y: ty, r: 24, col: '255,170,60', a: 0.7 });
      for (let k = 0; k < 6; k++) particles.push({ x: tx, y: ty - 3, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 3, life: 0.6, col: ['#fff2b0', '#ffd34d', '#ff9a3c'][k % 3], kind: 'dot', g: 0.2 });
      particles.push({ x: tx, y: ty - 6, vx: 0, vy: -0.6, life: 1.4, col: '#5d5a57', kind: 'puff', g: -0.004, r: 6 });
      if (time > g.nextGun) { g.nextGun = time + 0.5 + Math.random() * 0.7; gunshipGun(); shake.t = 0.35; shake.dur = 0.35; shake.amp = 4; }
      g.hits++;
    }
    if (g.o.state === 'up' && u > 0.6) { g.o.state = 'ruin'; g.o.t = 0; playBoom(1); shake.t = shake.dur = 0.8; shake.amp = 8;
      const F = ['#fff2b0', '#ffd34d', '#ff9a3c', '#e8502a'];
      for (let k = 0; k < 45; k++) particles.push({ x: g.c.x + (Math.random() - 0.5) * 60, y: g.c.y - Math.random() * 45, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2.5, life: 1.2, col: F[k % 4], kind: 'puff', g: -0.02, r: 10 + Math.random() * 14 });   // fireball
      for (let k = 0; k < 60; k++) particles.push({ x: g.c.x, y: g.c.y - 10, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 9 - 2, life: 1.5, col: k % 3 ? '#5a5040' : '#ff9a3c', kind: 'dot', g: 0.3 });                     // debris flying out
      for (let k = 0; k < 25; k++) particles.push({ x: g.c.x + (Math.random() - 0.5) * 40, y: g.c.y - 20 - Math.random() * 30, vx: (Math.random() - 0.5) * 1.2, vy: -2 - Math.random() * 2, life: 3.5, col: k % 2 ? '#3f3c39' : '#6e6862', kind: 'puff', g: -0.01, r: 12 + Math.random() * 12 });   // rising mushroom of smoke
      shake.amp = 14; }
  } else if (g.t < IN + ORBIT + OUT) {
    // leaving: two barrel rolls on the way out
    const u = (g.t - IN - ORBIT) / OUT, e = 1 - (1 - u) ** 3, s0 = orbitPos(1);   // e: ease-out, so it punches away from the camp at full speed and coasts out
    x = s0.x + (g.to.x - s0.x) * e; y = s0.y + (g.to.y - s0.y) * e; ang = Math.atan2(g.to.y - s0.y, g.to.x - s0.x);
    // one full 360° barrel roll, held back until the plane is well clear of the camp (first 35% of the exit is straight flight)
    // the roll runs quickly over 30% of the exit and eases in and out, so it turns like a pilot pulling it on purpose
    const ROLL_START = 0.25, ROLL_END = 0.6;
    const k = Math.min(1, Math.max(0, (u - ROLL_START) / (ROLL_END - ROLL_START)));
    roll = k * k * (3 - 2 * k) * Math.PI * 2;
  }
  else {
    // gone: the crew cheers, confetti rains over the camp
    gunship = null; gunshipEngine(false);
    const F = ['#fff2b0', '#ffd34d', '#ff4a3d', '#5b8def', '#3fb6a8'];
    for (let k = 0; k < 16; k++) particles.push({ x: g.c.x + (Math.random() - 0.5) * 80, y: g.c.y - 80 - Math.random() * 60, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.5, life: 2.6, col: F[k % F.length], kind: 'dot', g: 0.05 });
    cheer = { x: g.c.x, y: g.c.y - 110, until: time + 4 };   // one speech bubble over the camp, drawn on the canvas, no DOM popup
    return;
  }
  // the aircraft: long grey fuselage, high straight wing with four propellers, tail fin, blinking lights
  gunshipEngineLevel(x, y, g.t < IN ? 1.05 : g.t > IN + ORBIT ? 0.93 : 1);
  // its shadow sliding over the ground far below
  ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.beginPath(); ctx.ellipse(x, y + alt, 60, 20, 0, 0, 7); ctx.fill();
  // ---- airframe: a real 3D model. Body axes: X nose-ward, Y the left flank (toward the camera), Z up.
  // It rolls around X, is projected from a camera above the left flank, and faces are painted back to front.
  const E = 0.9, cE = Math.cos(E), sE = Math.sin(E), cr = Math.cos(roll), sr = Math.sin(roll);
  const rot = (p) => [p[0], p[1] * cr - p[2] * sr, p[1] * sr + p[2] * cr];
  const toScreen = (p) => [p[0], -(p[1] * sE + p[2] * cE)];   // X to the right, the body tilts up on screen
  const depth = (p) => -p[1] * cE + p[2] * sE;                  // larger = closer to the camera
  const LIGHT = (() => { const v = [0.3, -0.6, 0.75], m = Math.hypot(...v); return v.map((c) => c / m); })();
  const SAND = [181, 159, 110], OLIVE = [96, 104, 70], DARK = [40, 36, 30], STEEL = [150, 150, 146];
  const items = [];
  // one flat or curved patch with its outward normal in body space; two-sided patches are never culled
  const patch = (pts, nBody, base, two = false) => {
    const R = pts.map(rot), n = rot(nBody), facing = -n[1] * cE + n[2] * sE;
    if (!two && facing <= 0) return;                          // back-facing: the camera cannot see it
    const lam = Math.abs(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const b = 0.28 + 0.72 * (two ? lam : Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]));
    const fill = `rgb(${base.map((c) => Math.min(255, c * b) | 0).join(',')})`;
    items.push({ d: R.reduce((s, p) => s + depth(p), 0) / R.length, draw() {
      ctx.beginPath(); R.forEach((p, i) => { const [sx, sy] = toScreen(p); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = 'rgba(24,20,14,0.55)'; ctx.lineWidth = 0.3; ctx.stroke();
    } });
  };
  // a thin line in 3D (gun barrels, blades)
  const stick = (a, b, col, w) => {
    const A = rot(a), B = rot(b);
    items.push({ d: (depth(A) + depth(B)) / 2, draw() {
      const [ax, ay] = toScreen(A), [bx, by] = toScreen(B);
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    } });
  };
  // a tube along X, built from rings of points: used for the fuselage and the engine nacelles
  const tube = (xs, rs, cy, cz, sides, base) => {
    for (let i = 0; i < xs.length - 1; i++) for (let k = 0; k < sides; k++) {
      const t0 = (k / sides) * Math.PI * 2, t1 = ((k + 1) / sides) * Math.PI * 2, tm = (t0 + t1) / 2;
      const ring = (j, t) => [xs[j], cy + rs[j] * Math.cos(t), cz + rs[j] * Math.sin(t)];
      patch([ring(i, t0), ring(i, t1), ring(i + 1, t1), ring(i + 1, t0)], [0, Math.cos(tm), Math.sin(tm)], base);
    }
  };
  // fuselage: tapered nose, fat middle, tapered tail
  tube([-26, -18, -8, 4, 14, 22, 27], [2.2, 3.8, 4.6, 4.7, 4.4, 3.2, 1.2], 0, 0, 10, SAND);
  // belly: the olive lower half of the same body
  tube([-26, -8, 14, 27], [2.2, 4.6, 4.4, 1.2], 0, 0, 6, OLIVE);
  // high straight wing on both sides, and the tailplane
  for (const s of [-1, 1]) {
    patch([[6, s * 1.2, 4.6], [-1, s * 30, 4.6], [-7, s * 30, 4.6], [-5, s * 1.2, 4.6]], [0, 0, 1], [150, 130, 88], true);
    patch([[-18, s * 1.2, 2.2], [-24, s * 11, 2.2], [-28, s * 11, 2.2], [-26, s * 1.2, 2.2]], [0, 0, 1], [150, 130, 88], true);
  }
  // vertical tail fin
  patch([[-18, 0, 4.5], [-28, 0, 4.5], [-28, 0, 11], [-22, 0, 11]], [0, 1, 0], [120, 110, 80], true);
  // the left flank: gun ports with barrels that poke out toward the camera
  for (const gx of [-22, -15, -8]) {
    patch([[gx, -4.9, -0.9], [gx + 4, -4.9, -0.9], [gx + 4, -4.9, 0.9], [gx, -4.9, 0.9]], [0, -1, 0], DARK);
    stick([gx + 2, -4.9, 0], [gx + 2, -8.4, 0], '#4a4a46', 1.6);
  }
  // four turboprops on the wing: nacelles, props turning, a hot glow at the back
  const pulse = 0.55 + 0.45 * Math.sin(time * 9), spin = time * 40;
  for (const [vi, v] of [-21, -11, 11, 21].entries()) {
    tube([-1, 9], [2.6, 2.6], v, 3, 8, STEEL);
    const a = spin + vi * 0.7, ca = Math.cos(a), sa = Math.sin(a);
    stick([10, v - ca * 5, 3 - sa * 5], [10, v + ca * 5, 3 + sa * 5], 'rgba(235,235,225,0.8)', 0.7);
  }
  items.sort((p, q) => p.d - q.d);   // back to front
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(SC, SC);
  for (const it of items) it.draw();
  // engine glow, drawn over the nacelles
  for (const v of [-21, -11, 11, 21]) {
    const [gx, gy] = toScreen(rot([-1, v, 3]));
    const glow = ctx.createRadialGradient(gx, gy, 0.5, gx, gy, 7);
    glow.addColorStop(0, 'rgba(255,200,110,' + (0.8 * pulse).toFixed(2) + ')'); glow.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(gx, gy, 7, 0, 7); ctx.fill();
  }
  ctx.restore();
  // hot exhaust tints the air just behind the engines
  ctx.globalCompositeOperation = 'lighter';
  for (const v of [-21, -11, 11, 21]) { const hx = x + Math.cos(ang + Math.PI) * 6 * SC, hy = y + Math.sin(ang + Math.PI) * 6 * SC; ctx.fillStyle = 'rgba(255,140,60,' + (0.12 * pulse).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(hx, hy + v * 0.15, 4 + pulse * 2, 0, 7); ctx.fill(); }
  ctx.globalCompositeOperation = 'source-over';
  if (Math.sin(time * 5) > 0.5) { ctx.fillStyle = '#ff4a3d'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
  // heat haze and exhaust from the four engines
  if (Math.random() < 0.5) { const a = ang + Math.PI, off = (Math.random() < 0.5 ? -1 : 1) * (11 + Math.random() * 10) * SC; particles.push({ x: x + Math.cos(a) * 4 * SC - Math.sin(ang) * off, y: y + Math.sin(a) * 4 * SC + Math.cos(ang) * off, vx: Math.cos(a) * 0.6, vy: Math.sin(a) * 0.6, life: 0.8, col: 'rgba(90,90,95,0.35)', kind: 'puff', g: 0, r: 3 }); }
}

// gunship sound: four turboprops as detuned low saws through a filter, plus a whooshing prop wash.
// Loudness follows how close it is to the middle of the screen; pitch rises as it comes in and drops as it leaves.
let gsAudio = null;
function gunshipEngine(on) {
  unlockAudio(); if (!droneAudio) return;
  const ac = droneAudio.ac;
  if (on && !gsAudio) {
    const out = ac.createGain(); out.gain.value = 0; out.connect(droneAudio.master);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 1.2; lp.connect(out);
    const oscs = [[58, 0.32], [58.9, 0.3], [87.5, 0.18], [116.6, 0.12], [29.2, 0.4]].map(([f, g]) => {
      const o = ac.createOscillator(), gg = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = f; gg.gain.value = g; o.connect(gg); gg.connect(lp); o.start(); return o;
    });
    const n = ac.createBufferSource(), b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = b; n.loop = true; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 300; bp.Q.value = 0.6; const ng = ac.createGain(); ng.gain.value = 0.35;
    n.connect(bp); bp.connect(ng); ng.connect(out); n.start();
    // propeller beat: a fast throb on the whole engine sound
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 11; lg.gain.value = 0.25; lfo.connect(lg); lg.connect(out.gain); lfo.start();
    gsAudio = { out, oscs, n, lfo, base: oscs.map((o) => o.frequency.value) };
  } else if (!on && gsAudio) {
    const g = gsAudio; gsAudio = null;
    g.out.gain.setTargetAtTime(0, ac.currentTime, 0.6);
    setTimeout(() => { try { g.oscs.forEach((o) => o.stop()); g.n.stop(); g.lfo.stop(); g.out.disconnect(); } catch (e) {} }, 3000);
  }
}
function gunshipEngineLevel(x, y, pitch) {
  if (!gsAudio || !droneAudio) return;
  const ac = droneAudio.ac, sx = W / 2 + (x + cam.x) * cam.z, sy = H / 2 + (y + cam.y) * cam.z;
  const dist = Math.hypot(sx - W / 2, sy - H / 2) / Math.hypot(W, H);
  const v = Math.max(0.08, 1 - dist * 1.3) * 0.55;                 // really loud when it is over the middle
  gsAudio.out.gain.setTargetAtTime(v, ac.currentTime, 0.3);
  gsAudio.oscs.forEach((o, i) => o.frequency.setTargetAtTime(gsAudio.base[i] * pitch, ac.currentTime, 0.8));
}
// its guns: the big howitzer boom, the double thump of the 40 mm cannon, or the buzz of the 25 mm gatling
function gunshipGun() {
  const r = Math.random();
  if (r < 0.3) { playBoom(1.2); setTimeout(() => playBoom(0.5), 140); return; }
  if (r < 0.7) { playCannon(); setTimeout(playCannon, 260); setTimeout(() => playBoom(0.35), 420); return; }
  sfx((ac, out, t) => {
    out.gain.setValueAtTime(0.5, t);
    const n = noiseBurst(ac, 0.9), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.4;
    const am = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain(); lfo.type = 'square'; lfo.frequency.value = 34; lg.gain.value = 0.5; am.gain.value = 0.5;
    lfo.connect(lg); lg.connect(am.gain); n.connect(bp); bp.connect(am); am.connect(out); n.start(t); lfo.start(t); lfo.stop(t + 0.9);
  });
}

// ---------- dust storms (desert maps): every few minutes a wall of dust blows across the board ----------
const dust = { next: 75 + Math.random() * 60, t: 0, dur: 0, on: false, dir: 1, audio: null, streaks: [] };
sim.dustNow = () => { dust.next = 0; };   // for testing from the console
function dustLevel() {
  if (!dust.on) return 0;
  const u = dust.t / dust.dur;
  return Math.min(1, u / 0.18, (1 - u) / 0.22);                     // rolls in, holds, clears
}
function stepDust(dt) {
  if (!mapInfo().desert) { if (dust.on) endDust(); return; }
  if (!dust.on) {
    dust.next -= dt;
    if (dust.next <= 0) {
      dust.on = true; dust.t = 0; dust.dur = 35 + Math.random() * 25; dust.dir = Math.random() < 0.5 ? -1 : 1;
      dust.streaks = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), l: 30 + Math.random() * 90, s: 0.5 + Math.random() }));
      window.dispatchEvent(new CustomEvent('duststorm', { detail: 'start' }));
      dustSound(true);
    }
    return;
  }
  dust.t += dt;
  if (dust.t >= dust.dur) endDust();
  else if (dust.audio) dust.audio.out.gain.setTargetAtTime(0.22 * dustLevel(), droneAudio.ac.currentTime, 0.5);
}
function endDust() {
  dust.on = false; dust.next = 180 + Math.random() * 120;              // next one in 3 to 5 minutes
  dustSound(false);
  window.dispatchEvent(new CustomEvent('duststorm', { detail: 'end' }));
}
function dustSound(on) {
  unlockAudio(); if (!droneAudio) return;
  const ac = droneAudio.ac;
  if (on && !dust.audio) {
    const out = ac.createGain(); out.gain.value = 0; out.connect(droneAudio.master);
    const n = ac.createBufferSource(), b = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = b; n.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 450; bp.Q.value = 0.8;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.15; lg.gain.value = 250; lfo.connect(lg); lg.connect(bp.frequency); lfo.start();   // gusts
    n.connect(bp); bp.connect(out); n.start();
    dust.audio = { out, n, lfo };
  } else if (!on && dust.audio) {
    const a = dust.audio; dust.audio = null;
    a.out.gain.setTargetAtTime(0, ac.currentTime, 1);
    setTimeout(() => { try { a.n.stop(); a.lfo.stop(); a.out.disconnect(); } catch (e) {} }, 5000);
  }
}
function drawDust() {
  const k = dustLevel(); if (!k) return;
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // the haze: thick tan at the bottom, lighter higher up
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgba(196,160,104,${0.35 * k})`); g.addColorStop(1, `rgba(176,136,82,${0.62 * k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // rolling billows
  ctx.fillStyle = `rgba(214,184,132,${0.22 * k})`;
  for (let i = 0; i < 6; i++) { const x = ((time * 60 * dust.dir + i * 260) % (W + 400) + W + 400) % (W + 400) - 200, y = H * (0.2 + 0.13 * i); ctx.beginPath(); ctx.ellipse(x, y, 200, 60, 0, 0, 7); ctx.fill(); }
  // streaks of blown sand
  ctx.strokeStyle = `rgba(236,214,170,${0.5 * k})`; ctx.lineWidth = 1;
  for (const s2 of dust.streaks) {
    s2.x += dust.dir * s2.s * frameDt * 0.9; if (s2.x > 1.1) s2.x = -0.1; if (s2.x < -0.1) s2.x = 1.1;
    const x = s2.x * W, y = s2.y * H + Math.sin(time * 2 + s2.l) * 6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dust.dir * s2.l, y + 3); ctx.stroke();
  }
  ctx.restore();
}

// ---------- disasters ----------
const effects = [];                      // area effects that keep spawning particles for a while
const ufos = [];
export function disasterFx({ id, x, y, destroyed }) {
  const dz = DISASTERS[id], c = toScreen(x + 0.5, y + 0.5), R = dz.radius;
  const amp = { quake: 18, storm: 8, flood: 6, fire: 5, aliens: 9, drone: 12 }[id] || 8;
  shake.t = shake.dur = id === 'quake' ? 2.2 : 1.1; shake.amp = amp;
  effects.push({ id, c, R, t: 0, dur: id === 'aliens' ? 5 : id === 'quake' ? 2.2 : 3 });
  if (id === 'drone') {
    playBoom(1);
    const FIRE = ['#fff2b0', '#ffd34d', '#ff9a3c', '#e8502a'];
    for (let i = 0; i < 18; i++) particles.push({ x: c.x + (Math.random() - 0.5) * 30, y: c.y - 10 - Math.random() * 30, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, life: 0.7, col: FIRE[i % 4], kind: 'puff', g: -0.02, r: 8 + Math.random() * 10 });
    for (let i = 0; i < 40; i++) particles.push({ x: c.x, y: c.y - 15, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 7 - 1, life: 1, col: FIRE[i % 4], kind: 'dot', g: 0.25 });
    for (let i = 0; i < 14; i++) particles.push({ x: c.x + (Math.random() - 0.5) * 40, y: c.y - Math.random() * 40, vx: (Math.random() - 0.5) * 0.6, vy: -0.6 - Math.random(), life: 2, col: i % 2 ? '#4d4a47' : '#7b756e', kind: 'puff', g: -0.004, r: 7 + Math.random() * 7 });
  }
  if (id === 'aliens') {
    // three saucers swoop in, each takes a share of the targets and zaps them one by one
    const n = 3, groups = [[], [], []];
    destroyed.slice().sort((a, b) => a.d - b.d).forEach((d, j) => groups[j % n].push(d));
    for (let s = 0; s < n; s++) {
      const a = (s / n) * Math.PI * 2;
      const u = { home: { x: c.x + Math.cos(a) * R * HW * 0.8, y: c.y + Math.sin(a) * R * HH * 0.8 - 120 }, t: -s * 0.25, beams: [], seed: s };
      groups[s].forEach((d, j) => { const delay = 1.4 + s * 0.25 + j * 0.7; u.beams.push({ at: delay, x: d.x, y: d.y, k: d.t.size || 1 }); demolish(d.x, d.y, d.t, delay + 0.35, true); });
      u.dur = 2.2 + s * 0.25 + groups[s].length * 0.7 + 1.2;
      ufos.push(u);
    }
    return;
  }
  // everything else rolls outward from the centre: the closest buildings fall first
  for (const d of destroyed) demolish(d.x, d.y, d.t, 0.25 + d.d * (id === 'quake' ? 0.12 : 0.18) + Math.random() * 0.2);
}
function stepEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t += dt;
    if (e.t > e.dur) { effects.splice(i, 1); continue; }
    const f = 1 - e.t / e.dur, rx = e.R * HW * 1.41, ry = e.R * HH * 1.41;
    const rnd = () => { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()); return { x: e.c.x + Math.cos(a) * r * rx, y: e.c.y + Math.sin(a) * r * ry }; };
    if (e.id === 'fire') {
      for (let k = 0; k < 3; k++) { const p = rnd(); particles.push({ x: p.x, y: p.y - 10, vx: (Math.random() - 0.5) * 0.6, vy: -1 - Math.random(), life: 0.7, col: ['#ffd34d', '#ff9a3c', '#e8502a'][k], kind: 'puff', g: -0.02, r: 4 + Math.random() * 5 }); }
      if (Math.random() < 0.5) { const p = rnd(); particles.push({ x: p.x, y: p.y - 30, vx: 0.3, vy: -0.7, life: 1.5, col: '#5d5a57', kind: 'puff', g: -0.004, r: 7 }); }
    } else if (e.id === 'storm') {
      // a twister that wanders across the area, spinning debris around it
      const cx = e.c.x + Math.sin(e.t * 1.3) * rx * 0.5, cy = e.c.y + Math.cos(e.t * 0.9) * ry * 0.5;
      for (let k = 0; k < 5; k++) {
        const h = Math.random(), a = e.t * 9 + Math.random() * 6.28, r = 6 + h * 34;
        particles.push({ x: cx + Math.cos(a) * r, y: cy - h * 120 + Math.sin(a) * r * 0.3, vx: -Math.sin(a) * 1.5, vy: -0.3, life: 0.45, col: k % 2 ? '#8d939a' : '#b8bcc1', kind: 'puff', g: 0, r: 4 + h * 6 });
      }
      if (Math.random() < 0.4) particles.push({ x: cx, y: cy - 20, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 4, life: 0.8, col: '#8a7a66', kind: 'dot', g: 0.15 });
    } else if (e.id === 'flood') {
      ctx.save(); ctx.globalAlpha = 0.35 * Math.min(1, e.t * 2) * f; ctx.fillStyle = '#3c7fc0';
      ctx.beginPath(); ctx.ellipse(e.c.x, e.c.y, rx * Math.min(1, e.t / 0.8), ry * Math.min(1, e.t / 0.8), 0, 0, 7); ctx.fill(); ctx.restore();
      if (Math.random() < 0.8) { const p = rnd(); particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5), vy: -0.3, life: 0.6, col: '#9fd0f0', kind: 'puff', g: 0, r: 3 + Math.random() * 3 }); }
    } else if (e.id === 'quake') {
      for (let k = 0; k < 2; k++) { const p = rnd(); particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 2, vy: -Math.random(), life: 0.9, col: '#cbb89a', kind: 'puff', g: 0, r: 4 + Math.random() * 5 }); }
      // cracks in the ground spreading out from the epicentre
      ctx.save(); ctx.strokeStyle = 'rgba(40,30,25,' + (0.7 * f) + ')'; ctx.lineWidth = 2;
      for (let k = 0; k < 7; k++) {
        const a = k * 0.9 + 0.4; let px = e.c.x, py = e.c.y; ctx.beginPath(); ctx.moveTo(px, py);
        for (let s = 1; s <= 6; s++) { const r = (s / 6) * Math.min(1, e.t * 1.5); px = e.c.x + Math.cos(a + Math.sin(s * 3 + k) * 0.25) * rx * r; py = e.c.y + Math.sin(a + Math.sin(s * 3 + k) * 0.25) * ry * r; ctx.lineTo(px, py); }
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
function drawUfos() {
  for (let i = ufos.length - 1; i >= 0; i--) {
    const u = ufos[i]; u.t += frameDt;
    if (u.t > u.dur) { ufos.splice(i, 1); continue; }
    if (u.t < 0) continue;
    // swoop in from high above, hover with a wobble, then zoom off
    const tin = Math.min(1, u.t / 1.2), tout = Math.max(0, (u.t - (u.dur - 1)) / 1);
    const ease = (v) => v * v * (3 - 2 * v);
    let x = u.home.x + (1 - ease(tin)) * -260 + ease(tout) * 420, y = u.home.y - (1 - ease(tin)) * 300 - ease(tout) * 260;
    y += Math.sin(u.t * 3 + u.seed) * 4;
    // drift towards the current target
    const beam = u.beams.find((b) => u.t >= b.at && u.t < b.at + 0.65);
    if (beam) { const p = toScreen(beam.x + beam.k / 2, beam.y + beam.k / 2); x += (p.x - x) * 0.35; }
    if (beam) {
      const p = toScreen(beam.x + beam.k / 2, beam.y + beam.k / 2), a = Math.min(1, (u.t - beam.at) / 0.15);
      const g = ctx.createLinearGradient(x, y, p.x, p.y);
      g.addColorStop(0, `rgba(140,255,120,${0.85 * a})`); g.addColorStop(1, `rgba(140,255,120,${0.35 * a})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 5, y + 4); ctx.lineTo(x + 5, y + 4); ctx.lineTo(p.x + 18 * beam.k, p.y); ctx.lineTo(p.x - 18 * beam.k, p.y); ctx.closePath(); ctx.fill();
      if (Math.random() < 0.6) particles.push({ x: p.x + (Math.random() - 0.5) * 30, y: p.y - Math.random() * 40, vx: 0, vy: -1.2, life: 0.5, col: '#b6ff9c', kind: 'dot', g: -0.02 });
      lights.push({ glow: true, x: p.x, y: p.y - 10, r: 40, col: '140,255,120', a: 0.6 });
    }
    // the saucer: metal disc, glass dome with a little green pilot, blinking lights round the rim
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(0, 70, 18, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(170,230,255,0.85)'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, -5, 9, 8, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7ed957'; ctx.beginPath(); ctx.arc(0, -6, 3, 0, 7); ctx.fill();
    const disc = ctx.createLinearGradient(0, -6, 0, 6); disc.addColorStop(0, '#e9edf2'); disc.addColorStop(1, '#8e98a6');
    ctx.fillStyle = disc; ctx.beginPath(); ctx.ellipse(0, 0, 24, 7, 0, 0, 7); ctx.fill(); ctx.stroke();
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + u.t * 4; if (Math.sin(a) < 0) continue; ctx.fillStyle = (k + Math.floor(u.t * 6)) % 2 ? '#ffd34d' : '#ff5a5a'; ctx.beginPath(); ctx.arc(Math.cos(a) * 18, Math.sin(a) * 4 + 1, 1.8, 0, 7); ctx.fill(); }
    ctx.restore();
  }
}
// rubble on the streets: a heap of broken stones with a red-and-white barrier
function drawRubble(i) {
  const x = i % GRID, y = Math.floor(i / GRID), p = toScreen(x + 0.5, y + 0.5), s = hash(i);
  const COL = ['#8a7a66', '#a39580', '#6e6259', '#c2b49a', '#a0573f'];
  for (let k = 0; k < 7; k++) {
    const dx = ((s >> (k * 3)) % 9 - 4) * 2.4, dy = ((s >> (k * 2 + 1)) % 5 - 2) * 1.6, r = 2.5 + ((s >> k) % 3);
    poly([[p.x + dx - r, p.y + dy], [p.x + dx - r * 0.3, p.y + dy - r * 1.2], [p.x + dx + r, p.y + dy - r * 0.4], [p.x + dx + r * 0.6, p.y + dy + r * 0.5]], COL[(s >> k) % COL.length], INK, 0.5);
  }
  ctx.strokeStyle = '#e05a5a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - 12, p.y + 4); ctx.lineTo(p.x - 12, p.y - 6); ctx.moveTo(p.x + 12, p.y + 4); ctx.lineTo(p.x + 12, p.y - 6); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 13, p.y - 9, 26, 4);
  ctx.fillStyle = '#e05a5a'; for (let k = 0; k < 4; k++) ctx.fillRect(p.x - 13 + k * 7, p.y - 9, 3.5, 4);
}
function mover(x, y, ok, sp, col, lane = 0) { return { px: x, py: y, nx: x, ny: y, ox: -1, oy: -1, t: 1, sp, ok, col, lane, axis: 'x', dir: 1 }; }
function stepMover(m, dt) {
  m.t += m.sp * dt;
  if (m.t < 1) return;
  m.t = 0; m.ox = m.px; m.oy = m.py; m.px = m.nx; m.py = m.ny;
  const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [m.px + dx, m.py + dy]).filter(([x, y]) => m.ok(x, y));
  let fwd = opts.filter(([x, y]) => !(x === m.ox && y === m.oy));
  if (!fwd.length) fwd = opts;
  if (!fwd.length) return;
  const straight = fwd.find(([x, y]) => x - m.px === m.px - m.ox && y - m.py === m.py - m.oy);
  const [nx, ny] = straight && Math.random() < 0.65 ? straight : fwd[Math.floor(Math.random() * fwd.length)];
  m.nx = nx; m.ny = ny;
  m.axis = nx !== m.px ? 'x' : 'y'; m.dir = Math.sign((nx - m.px) || (ny - m.py));
}
// ---------- road traffic: vehicles queue instead of driving through each other ----------
// Every vehicle reserves "slots" in a shared map: a slot is a tile plus the direction it is driven in
// (so the two lanes of a straight street are separate), or the whole tile at a junction, bend or
// dead end, so only one vehicle is ever in a crossing or corner. A vehicle holds the slot it is in and the one it drives
// into, and tries to reserve the one after that once it is a third of the way along. If that slot is
// taken it brakes smoothly to a stop at the tile centre and waits. One map lookup per vehicle per
// frame: no pairwise checks. Deadlock: a vehicle that has waited a while picks another way out
// (a U-turn included); in the very rare case that nothing frees up for 20 s it squeezes through.
const slots = new Map();
const FOOT = { patrol: 1, goat: 1 };          // people and animals on the pavement only queue among themselves
const LONG = { bus: 1, truck: 1, fire: 1, tank: 1 };
sim.traffic = { forced: 0, reroutes: 0 };
// one vehicle at a time on any tile that is not a plain straight piece: crossings, T-junctions,
// bends (the two lanes cross there) and dead ends (where vehicles turn around)
function isJunction(x, y) {
  const e = isRoad(x + 1, y), w = isRoad(x - 1, y), s = isRoad(x, y + 1), n = isRoad(x, y - 1);
  return !((e && w && !s && !n) || (s && n && !e && !w));
}
function slotKey(m, fx, fy, tx, ty) {
  const base = (ty * GRID + tx) * 5 + (FOOT[m.kind] ? GRID * GRID * 5 : 0);
  if (isJunction(tx, ty)) return base + 4;
  const dx = tx - fx, dy = ty - fy;
  return base + (dx > 0 ? 0 : dx < 0 ? 1 : dy > 0 ? 2 : 3);
}
function claim(k, m) { const o = slots.get(k); if (o && o !== m) return false; slots.set(k, m); return true; }
function free(k, m) { if (k >= 0 && slots.get(k) === m) slots.delete(k); }
// pick the tile after n (coming from p): mostly straight on, never back unless it is a dead end;
// avoid = a tile to skip (the blocked choice when rerouting), uturn = allow going back
function nextTile(m, avoid, uturn) {
  const { px, py, nx, ny } = m;
  const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [nx + dx, ny + dy]).filter(([x, y]) => isRoad(x, y));
  let fwd = opts.filter(([x, y]) => !(x === px && y === py) && !(avoid && x === avoid[0] && y === avoid[1]));
  if (!fwd.length && uturn) fwd = opts.filter(([x, y]) => x === px && y === py);
  if (!fwd.length) fwd = avoid ? [] : opts;
  if (!fwd.length) return null;
  const straight = fwd.find(([x, y]) => x - nx === nx - px && y - ny === ny - py);
  return straight && !avoid && Math.random() < 0.65 ? straight : fwd[Math.floor(Math.random() * fwd.length)];
}
function stepTraffic(m, dt) {
  if (!dt) return;
  if (m.kn === undefined) { m.kn = slotKey(m, m.px, m.py, m.nx, m.ny); m.kp = m.kq = m.kt = -1; m.v = 0; m.wait = 0; claim(m.kn, m); }
  // plan and reserve the slot after the next one
  if (!m.q && m.t >= 0.35) { m.q = nextTile(m); m.kq = -1; }
  if (m.q && m.kq < 0) {
    const k = slotKey(m, m.nx, m.ny, m.q[0], m.q[1]);
    if (claim(k, m)) { m.kq = k; m.wait = 0; }
  }
  // speed: full when the way is reserved, otherwise brake to stand still at the tile centre
  const target = m.kq >= 0 || !m.q && m.t < 0.35 ? 1 : Math.max(0.05, (1 - m.t) / 0.4);
  m.v = target < m.v ? target : m.v + (target - m.v) * Math.min(1, dt * 2.5);
  m.t = Math.min(m.kq >= 0 ? 9 : 1, m.t + m.sp * m.v * dt);
  // let go of the tile behind once the vehicle is clear of it (long ones and trams hold on longer)
  if (m.kp >= 0 && m.kind !== 'tram' && m.t >= (LONG[m.kind] ? 0.8 : 0.55)) { free(m.kp, m); m.kp = -1; }
  if (m.kt >= 0 && m.t >= 0.4) { free(m.kt, m); m.kt = -1; }
  if (m.t >= 1 && m.kq < 0) {
    // standing still, waiting for the slot ahead
    m.wait += dt;
    if (m.q && m.wait > 2 + (m.seed || 0) % 1.5) {
      const alt = nextTile(m, m.q, m.wait > 5);
      if (alt) { m.q = alt; sim.traffic.reroutes++; }
      if (m.wait > 5) m.wait = 2;               // keep trying other ways every few seconds
      m.stuck = (m.stuck || 0) + dt;
    }
    if ((m.stuck || 0) > 20 && m.q) { const k = slotKey(m, m.nx, m.ny, m.q[0], m.q[1]); slots.set(k, m); m.kq = k; m.stuck = 0; sim.traffic.forced++; }
    if (!m.q) m.q = nextTile(m);
    return;
  }
  if (m.t < 1) return;
  // move on to the next tile
  m.t -= 1; m.stuck = 0;
  if (m.kind === 'tram') { free(m.kt, m); m.kt = m.kp; } else free(m.kp, m);
  m.kp = m.kn; m.kn = m.kq; m.kq = -1;
  m.ox = m.px; m.oy = m.py; m.px = m.nx; m.py = m.ny; [m.nx, m.ny] = m.q; m.q = null;
  m.axis = m.nx !== m.px ? 'x' : 'y'; m.dir = Math.sign((m.nx - m.px) || (m.ny - m.py));
}
// debug from the console: how many pairs of road vehicles overlap right now
sim.overlaps = () => {
  const pos = taxis.filter((t) => !FOOT[t.kind]).map((t) => moverPos(t, t.lane || 0.2));
  let n = 0;
  for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) if (Math.hypot(pos[i].gx - pos[j].gx, pos[i].gy - pos[j].gy) < 0.3) n++;
  return n;
};
function moverPos(m, laneW) {
  const dx = m.nx - m.px, dy = m.ny - m.py;
  return { gx: m.px + dx * m.t + 0.5 - dy * laneW, gy: m.py + dy * m.t + 0.5 + dx * laneW };
}

// ---------- setup ----------
export function initRender(canvas) {
  cv = canvas; ctx = cv.getContext('2d');
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
  };
  window.addEventListener('resize', () => { resize(); fitView(false); }); resize();
  fitView(false);
  initTraffic(); initFerry(); initLamps(); initMarina();
}

// ---------- camera: fit the whole board into the free space between the panels ----------
let camTarget = null;
export const cancelFit = () => { camTarget = null; };
export function fitView(animate = true) {
  const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
  const hud = r('.hud'), build = r('#build'), panel = r('#panel');
  let L = 0, R = W, T = hud ? hud.bottom : 0, B = H;
  if (W > 900) { if (build) L = build.right; if (panel) R = panel.left; }
  else { if (panel) T = Math.max(T, panel.bottom); if (build) B = build.top; }
  const pad = 14;
  const a = -M, b = GRID + M;
  const minX = toScreen(a, b).x, maxX = toScreen(b, a).x;
  const minY = toScreen(a, a).y - RIM - 60, maxY = toScreen(b, b).y - RIM + SLAB + 10;
  const z = Math.max(0.25, Math.min(2.4, Math.min((R - L - pad * 2) / (maxX - minX), (B - T - pad * 2) / (maxY - minY))));
  const t = { z, x: ((L + R) / 2 - W / 2) / z - (minX + maxX) / 2, y: ((T + B) / 2 - H / 2) / z - (minY + maxY) / 2 };
  if (animate) camTarget = t; else { Object.assign(cam, t); camTarget = null; }
}

// ---------- frame ----------
export function draw(dt) {
  time += dt;
  lod = cam.z * dpr < 1.25;
  if (camTarget) {
    const k = 1 - Math.pow(0.002, dt);
    cam.z += (camTarget.z - cam.z) * k; cam.x += (camTarget.x - cam.x) * k; cam.y += (camTarget.y - cam.y) * k;
    if (Math.abs(camTarget.z - cam.z) < 0.002 && Math.abs(camTarget.x - cam.x) < 0.5) { Object.assign(cam, camTarget); camTarget = null; }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // sky gradient depends on time of day
  const hr = S.hour + (S._frac || 0);
  const night = nightFactor(hr);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const gloom = weather.gloom || 0;
  g.addColorStop(0, mix(mix('#bfe6f5', '#9aa6b2', gloom), '#1d2547', night));
  g.addColorStop(1, mix(mix('#fdf3dc', '#d9d6cf', gloom), '#2c2f55', night));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  drawClouds(night);

  // screen shake after a demolition, fading out
  let sx = 0, sy = 0;
  if (shake.t > 0) {
    shake.t = Math.max(0, shake.t - dt);
    const a = shake.amp * (shake.t / shake.dur) ** 1.5;
    sx = (Math.random() - 0.5) * 2 * a; sy = (Math.random() - 0.5) * 2 * a;
  }
  // whole device pixels, so cached pictures can be copied without resampling
  SC = dpr * cam.z; TX = Math.round(dpr * (W / 2 + cam.x * cam.z + sx)); TY = Math.round(dpr * (H / 2 + cam.y * cam.z + sy));
  ctx.setTransform(SC, 0, 0, SC, TX, TY);
  lights.length = 0;
  stepWrecks(Math.min(0.05, dt));
  const G = groundLayers();
  if (G) {
    blitGround(G, 0);
    drawGround('waves');
    blitGround(G, 1);
    drawShadows(night * 1 + (1 - night) * (weather.sunBlock || 0));
    blitGround(G, 2);
  } else {
    drawTable();
    drawGround();
    drawLotDecor();
    drawParks();
    parkFence();
    drawShadows(night * 1 + (1 - night) * (weather.sunBlock || 0));
    drawFrame();
  }
  drawCoverage();
  frameDt = Math.min(0.05, dt);
  drawObjects();
  drawLinks();
  stepEffects(Math.min(0.05, dt));
  drawParticles(dt);
  drawUfos();
  drawDrones();
  drawGunship();
  drawCheer();
  drawFallers();
  drawHover();
  drawWeather(dt, night);
  stepDust(Math.min(0.1, dt)); drawDust();
  if (photo.on) postFX(night);

  if (night > 0.02) {
    // dim the world, then paint lights on top so they glow
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = `rgba(22,26,70,${0.5 * night})`; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.globalAlpha = Math.min(1, night * 1.4);
    if (lcv) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(lcv, 0, 0); ctx.restore(); }
    for (const pts of lights) {
      if (pts.glow) {
        ctx.drawImage(glowSprite(pts.col, pts.a), pts.x - pts.r, pts.y - pts.r, pts.r * 2, pts.r * 2);
      } else poly(pts, pts.fill || '#ffd97a', null);
    }
    ctx.globalAlpha = 1;
  }
  prevSC = SC;
}

export function nightFactor(hr) {
  if (hr >= 7 && hr < 18) return 0;
  if (hr >= 18 && hr < 21) return (hr - 18) / 3;
  if (hr >= 5 && hr < 7) return 1 - (hr - 5) / 2;
  return 1;
}
function mix(a, b, t) {
  const num = (s) => s[0] === '#' ? parseInt(s.slice(1), 16) : s.match(/\d+/g).reduce((n, v) => (n << 8) + +v, 0);
  const A = num(a), B = num(b);
  const c = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

const clouds = Array.from({ length: 6 }, (_, i) => ({ x: Math.random(), y: 0.05 + Math.random() * 0.3, s: 0.6 + Math.random() * 0.8, v: 0.004 + Math.random() * 0.006 }));
function drawClouds(night) {
  const gl = weather.gloom || 0, cv_ = Math.round(255 - gl * 95);
  ctx.fillStyle = `rgba(${cv_},${cv_ + 4},${cv_ + 10},${0.85 - night * 0.6 + gl * 0.1})`;
  for (const c of clouds) {
    c.x += c.v * 0.016 * (1 + (weather.wind || 0) / 10); if (c.x > 1.2) c.x = -0.2;
    const x = c.x * W, y = c.y * H, s = 30 * c.s;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, 7); ctx.arc(x + s, y + 6, s * 0.8, 0, 7); ctx.arc(x - s, y + 8, s * 0.7, 0, 7); ctx.arc(x + s * 0.3, y - s * 0.5, s * 0.7, 0, 7);
    ctx.fill();
  }
}

// ---------- board geometry ----------
// The board is a thick wooden slab. The city sits in a shallow tray (z = 0), the Monopoly
// frame of property spaces is raised RIM px above it, and the water is sunk WD px below the quays.
const M = 2.2;       // depth of the property-space frame, in tiles
const RIM = 7;       // frame height above street level (px)
const SLAB = 28;     // board thickness (px)
const WD = 6;        // water surface below street level (px)
const at = (gx, gy, z = 0) => { const p = toScreen(gx, gy); return [p.x, p.y - z]; };
// Draw in "board plane" coordinates (1 unit = 1 tile), lifted z px
function planeZ(z, fn) { ctx.save(); ctx.translate(0, -z); ctx.transform(HW, HH, -HW, HH, 0, 0); fn(); ctx.restore(); }
const plane = (fn) => planeZ(0, fn);
const wet = (x, y) => { const t = terrain[x + y * GRID]; return t === 2 || t === 4; };
const inGrid = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID;

// subtle speckle texture so grass, asphalt and paper don't look flat
let noisePat = null;
function noise() {
  if (noisePat) return noisePat;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${0.03 + Math.random() * 0.06})` : `rgba(255,255,255,${0.04 + Math.random() * 0.07})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  noisePat = ctx.createPattern(c, 'repeat');
  noisePat.setTransform(new DOMMatrix().scale(1 / 48));
  return noisePat;
}

// ---------- text that always fits its box ----------
const widthCache = new Map(), fitCache = new Map();
if (document.fonts) document.fonts.ready.then(() => { widthCache.clear(); fitCache.clear(); });
const LABEL_FONT = '700 100px Fredoka, Nunito, sans-serif';
function textW(t) {
  let w = widthCache.get(t);
  if (w == null) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.font = LABEL_FONT; w = ctx.measureText(t).width / 100; ctx.restore();
    widthCache.set(t, w);
  }
  return w; // width at font size 1
}
// Dutch street-name endings where a long compound word may be hyphenated
const SUFFIXES = ['NIEUWSTRAAT', 'STEENWEG', 'STRAAT', 'SPORTBAAN', 'PLEIN', 'MARKT', 'LAAN', 'BAAN', 'POORT', 'KAAI', 'BRUG', 'BERG', 'LEI', 'RUI', 'DAM', 'HOL', 'OEVER'];
function breaks(text) {
  const out = [];
  for (let i = 1; i < text.length; i++) {
    if (text[i] === ' ') out.push([text.slice(0, i), text.slice(i + 1)]);
    if (text[i - 1] === '-') out.push([text.slice(0, i), text.slice(i)]);
  }
  for (const s of SUFFIXES) {
    let k = text.lastIndexOf(s);
    if (k >= 3 && /[A-ZÀ-Ý]/.test(text[k - 1]) && text.length - k >= 3) out.push([text.slice(0, k) + '-', text.slice(k)]);
  }
  return out;
}
// returns { lines, size } so the text fills at most maxW x maxH (in current units)
function fitText(text, maxW, maxH, maxSize) {
  const key = `${text}|${maxW}|${maxH}|${maxSize}`;
  let f = fitCache.get(key);
  if (f) return f;
  const LH = 1.08;
  if (text.includes('\n')) {
    const lines = text.split('\n');
    f = { lines, size: Math.min(maxSize, maxW / Math.max(...lines.map(textW)), maxH / (lines.length * LH)) };
  } else {
    f = { lines: [text], size: Math.min(maxSize, maxW / textW(text), maxH / LH) };
    for (const [a, b] of breaks(text)) {
      const s = Math.min(maxSize, maxW / Math.max(textW(a), textW(b)), maxH / (2 * LH));
      if (s > f.size * 1.12) f = { lines: [a, b], size: s };
    }
  }
  fitCache.set(key, f);
  return f;
}
function drawText(text, cx, cy, maxW, maxH, maxSize, col = '#3b2f2a') {
  const f = fitText(text, maxW, maxH, maxSize);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(f.size / 100, f.size / 100);
  ctx.font = LABEL_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col;
  f.lines.forEach((t, i) => ctx.fillText(t, 0, (i - (f.lines.length - 1) / 2) * 108));
  ctx.restore();
}

// ---------- the wooden board ----------
function drawTable() {
  const a = -M, b = GRID + M;
  const N = at(a, a, RIM), E = at(b, a, RIM), S_ = at(b, b, RIM), Wc = at(a, b, RIM);
  const dn = (p, d) => [p[0], p[1] + d];
  // soft shadow on the table under the board
  ctx.save();
  ctx.shadowColor = 'rgba(40,30,20,0.38)'; ctx.shadowBlur = 46 * cam.z * dpr; ctx.shadowOffsetY = 22 * cam.z * dpr;
  poly([dn(N, SLAB), dn(E, SLAB), dn(S_, SLAB), dn(Wc, SLAB)], '#8a6a45', null);
  ctx.restore();
  // visible wooden sides with grain
  const side = (p, q, c1, c2) => {
    const g = ctx.createLinearGradient(0, Math.min(p[1], q[1]), 0, Math.max(p[1], q[1]) + SLAB);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    poly([p, q, dn(q, SLAB), dn(p, SLAB)], g, '#3b2f2a', 1.4);
    ctx.strokeStyle = 'rgba(70,40,15,0.18)'; ctx.lineWidth = 1;
    for (let k = 1; k < 5; k++) {
      const o = 5 + k * 5 + (k % 2) * 1.5;
      ctx.beginPath(); ctx.moveTo(p[0], p[1] + o); ctx.lineTo(q[0], q[1] + o + (k % 2 ? 1.5 : -1.5)); ctx.stroke();
    }
  };
  side(Wc, S_, '#b4834e', '#7d5530');
  side(S_, E, '#cc9a62', '#956636');
  // printed paper edge on top of the wood
  poly([Wc, S_, dn(S_, 3), dn(Wc, 3)], '#efe4c6', '#3b2f2a', 1);
  poly([S_, E, dn(E, 3), dn(S_, 3)], '#f7eed6', '#3b2f2a', 1);
}

// ---------- city ground ----------
// part: 'base' = water, 'waves' = the moving glints on it, 'rest' = quays, land and bridges; default all
function drawGround(part) {
  // 1 · water, sunk below the quays
  if (part !== 'rest') planeZ(-WD, () => {
    if (part !== 'waves') {
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      if (!wet(x, y)) continue;
      const h = hash(x * 13 + y * 7);
      ctx.fillStyle = ['#356f93', '#387398', '#336b8e'][h % 3]; ctx.fillRect(x, y, 1.02, 1.02);
    }
    // quay walls throw a shadow on the water
    ctx.fillStyle = 'rgba(10,40,70,0.22)';
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      if (!wet(x, y)) continue;
      if (y === 0 || !wet(x, y - 1)) ctx.fillRect(x, y, 1, 0.22);
      if (x === 0 || !wet(x - 1, y)) ctx.fillRect(x, y, 0.22, 1);
    }
    // bridge decks shade the water below them
    ctx.fillStyle = 'rgba(10,40,70,0.25)';
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (terrain[x + y * GRID] === 4) ctx.fillRect(x + 0.05, y + 0.2, 0.95, 0.9);
    // marina pontoons: one long jetty with short fingers
    if (marina) {
      const { x0, x1, ym } = marina;
      ctx.fillStyle = '#b7a27e'; ctx.fillRect(x0 + 0.1, ym - 0.08, x1 - x0 + 0.8, 0.16);
      ctx.fillStyle = 'rgba(60,45,30,0.35)'; ctx.fillRect(x0 + 0.1, ym + 0.08, x1 - x0 + 0.8, 0.04);
      ctx.fillStyle = '#b7a27e';
      for (const y of marina.yachts) if (y.finger) ctx.fillRect(y.gx - 0.5 - 0.03 + (y.side > 0 ? 0.2 : -0.2), Math.min(ym, y.gy - 0.5), 0.06, Math.abs(y.gy - 0.5 - ym));
    }
    }
    if (part === 'base') return;
    // little waves and glints
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.04;
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      if (terrain[x + y * GRID] !== 2) continue;
      const h = hash(x * 31 + y * 17);
      const ph = (time * 0.35 + (h % 100) / 100) % 1;
      const xx = x + 0.2 + (h % 5) / 10, yy = y + ph;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + 0.15, yy - 0.08, xx + 0.3, yy); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  if (part === 'base' || part === 'waves') return;
  // 2 · stone quay walls on the visible (north / west) banks
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (!wet(x, y)) continue;
    if (y > 0 && !wet(x, y - 1)) poly([at(x, y), at(x + 1, y), at(x + 1, y, -WD), at(x, y, -WD)], '#b3a383', '#6f6350', 0.6);
    if (x > 0 && !wet(x - 1, y)) poly([at(x, y), at(x, y + 1), at(x, y + 1, -WD), at(x, y, -WD)], '#c7b898', '#6f6350', 0.6);
  }
  // 3 · land: lots, parks, streets, bridges
  plane(() => {
    const land = new Path2D();
    // desert maps: sand and dusty brown instead of grass, palm groves a dry olive green, sandy asphalt
    const desert = mapInfo().desert;
    const LOT = desert ? ['#d9b77f', '#d2ad74', '#ddbd88', '#c9a066'] : ['#8fb46a', '#89ae64', '#94b970'];
    const PARK = desert ? ['#a8a45e', '#9d9a55'] : ['#7fb25a', '#7aad55'];
    const ROAD = desert ? '#8f8577' : '#7e818a';
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      const t = terrain[x + y * GRID], h = hash(x * 97 + y * 41);
      if (t === 0) {
        ctx.fillStyle = LOT[h % LOT.length]; ctx.fillRect(x, y, 1.01, 1.01);
        land.rect(x, y, 1, 1);
      } else if (t === 3) {
        ctx.fillStyle = PARK[h % 2]; ctx.fillRect(x, y, 1.01, 1.01);
        land.rect(x, y, 1, 1);
      } else if (t === 5) {
        ctx.fillStyle = ['#b98a5c', '#b3845a', '#c09163'][h % 3]; ctx.fillRect(x, y, 1.01, 1.01);   // rocky ground under the mountains
        land.rect(x, y, 1, 1);
      } else if (t === 1) {
        ctx.fillStyle = ROAD; ctx.fillRect(x, y, 1.01, 1.01);
        land.rect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = noise(); ctx.fill(land);
    // lot markers so players can see where they may build
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 0.03;
    ctx.beginPath();
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (terrain[x + y * GRID] === 0) ctx.rect(x + 0.06, y + 0.06, 0.88, 0.88);
    ctx.stroke();
    // sidewalks along every street edge that doesn't continue as street
    const SW = 0.13;
    const road = (x, y) => inGrid(x, y) && isRoad(x, y);
    ctx.fillStyle = '#d7d0c0';
    const curb = new Path2D();
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      if (terrain[x + y * GRID] !== 1) continue;
      const n = road(x, y - 1), s = road(x, y + 1), w = road(x - 1, y), e = road(x + 1, y);
      if (!n) { ctx.fillRect(x, y, 1, SW); curb.moveTo(x, y + SW); curb.lineTo(x + 1, y + SW); }
      if (!s) { ctx.fillRect(x, y + 1 - SW, 1, SW); curb.moveTo(x, y + 1 - SW); curb.lineTo(x + 1, y + 1 - SW); }
      if (!w) { ctx.fillRect(x, y, SW, 1); curb.moveTo(x + SW, y); curb.lineTo(x + SW, y + 1); }
      if (!e) { ctx.fillRect(x + 1 - SW, y, SW, 1); curb.moveTo(x + 1 - SW, y); curb.lineTo(x + 1 - SW, y + 1); }
      // inside corners of crossings
      if (n && w && !road(x - 1, y - 1)) ctx.fillRect(x, y, SW, SW);
      if (n && e && !road(x + 1, y - 1)) ctx.fillRect(x + 1 - SW, y, SW, SW);
      if (s && w && !road(x - 1, y + 1)) ctx.fillRect(x, y + 1 - SW, SW, SW);
      if (s && e && !road(x + 1, y + 1)) ctx.fillRect(x + 1 - SW, y + 1 - SW, SW, SW);
    }
    ctx.strokeStyle = '#8f897c'; ctx.lineWidth = 0.025; ctx.stroke(curb);
    // bridge decks: run edge to edge along the street, railings on the open sides
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      if (terrain[x + y * GRID] !== 4) continue;
      const x0 = road(x - 1, y) ? 0 : 0.1, x1 = road(x + 1, y) ? 1 : 0.9, y0 = road(x, y - 1) ? 0 : 0.1, y1 = road(x, y + 1) ? 1 : 0.9;
      ctx.fillStyle = '#9c8463'; ctx.fillRect(x + x0, y + y0, x1 - x0, y1 - y0);
      ctx.fillStyle = '#7e818a'; ctx.fillRect(x + x0 + (x0 ? 0.08 : 0), y + y0 + (y0 ? 0.08 : 0), x1 - x0 - (x0 ? 0.08 : 0) - (x1 < 1 ? 0.08 : 0), y1 - y0 - (y0 ? 0.08 : 0) - (y1 < 1 ? 0.08 : 0));
      ctx.strokeStyle = INK; ctx.lineWidth = 0.03; ctx.beginPath();
      if (x0) { ctx.moveTo(x + x0, y + y0); ctx.lineTo(x + x0, y + y1); }
      if (x1 < 1) { ctx.moveTo(x + x1, y + y0); ctx.lineTo(x + x1, y + y1); }
      if (y0) { ctx.moveTo(x + x0, y + y0); ctx.lineTo(x + x1, y + y0); }
      if (y1 < 1) { ctx.moveTo(x + x0, y + y1); ctx.lineTo(x + x1, y + y1); }
      ctx.stroke();
    }
    // lane markings: dashed line between connected road tiles
    ctx.strokeStyle = 'rgba(255,248,214,0.9)'; ctx.lineWidth = 0.045; ctx.setLineDash([0.18, 0.16]);
    ctx.beginPath();
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      if (!isRoad(x, y)) continue;
      if (road(x + 1, y)) { ctx.moveTo(x + 0.5, y + 0.5); ctx.lineTo(x + 1.5, y + 0.5); }
      if (road(x, y + 1)) { ctx.moveTo(x + 0.5, y + 0.5); ctx.lineTo(x + 0.5, y + 1.5); }
    }
    ctx.stroke(); ctx.setLineDash([]);
    // zebra crossings next to junctions
    const deg = (x, y) => road(x + 1, y) + road(x - 1, y) + road(x, y + 1) + road(x, y - 1);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      if (terrain[x + y * GRID] !== 1 || deg(x, y) !== 2) continue;
      const hz = road(x - 1, y) && road(x + 1, y), vt = road(x, y - 1) && road(x, y + 1);
      for (let k = 0; k < 5; k++) {
        const o = SW + 0.04 + k * 0.15;
        if (hz && deg(x + 1, y) >= 3) ctx.fillRect(x + 0.74, y + o, 0.18, 0.08);
        if (hz && deg(x - 1, y) >= 3) ctx.fillRect(x + 0.08, y + o, 0.18, 0.08);
        if (vt && deg(x, y + 1) >= 3) ctx.fillRect(x + o, y + 0.74, 0.08, 0.18);
        if (vt && deg(x, y - 1) >= 3) ctx.fillRect(x + o, y + 0.08, 0.08, 0.18);
      }
    }
  });
  // 4 · bridge deck edges seen from the front
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (terrain[x + y * GRID] !== 4) continue;
    const rd = (xx, yy) => inGrid(xx, yy) && isRoad(xx, yy);
    if (!rd(x, y + 1)) { const x0 = rd(x - 1, y) ? 0 : 0.1, x1 = rd(x + 1, y) ? 1 : 0.9; poly([at(x + x0, y + 0.9), at(x + x1, y + 0.9), at(x + x1, y + 0.9, -3), at(x + x0, y + 0.9, -3)], '#7c6649', '#3b2f2a', 0.6); }
    if (!rd(x + 1, y)) { const y0 = rd(x, y - 1) ? 0 : 0.1, y1 = rd(x, y + 1) ? 1 : 0.9; poly([at(x + 0.9, y + y0), at(x + 0.9, y + y1), at(x + 0.9, y + y1, -3), at(x + 0.9, y + y0, -3)], '#8d7556', '#3b2f2a', 0.6); }
  }
}

// ---------- empty lots are never bare: lawns with shrubs, gardens, footpaths, back lanes, little squares ----------
// (purely decorative: it disappears as soon as you build on the lot)
const FLOWERS = ['#e05a5a', '#f2c94c', '#f4b6c2', '#ffffff', '#c9b6e4', '#f29e4c'];
// ---------- city parks: lawns, gravel paths, a pond, flower beds, benches and some trees ----------
function parkKind(x, y) {
  const h = hash(x * 7 + y * 131) % 10;
  return h < 3 ? 'tree' : h < 4 ? 'pond' : h < 5 ? 'flowers' : h < 7 ? 'bench' : 'lawn';
}
function drawParks() {
  const park = (x, y) => inGrid(x, y) && isPark(x, y);
  const road = (x, y) => inGrid(x, y) && isRoad(x, y);
  plane(() => {
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      if (!park(x, y)) continue;
      // mown stripes
      ctx.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.03)';
      for (let k = 0; k < 4; k += 2) ctx.fillRect(x + k * 0.25, y, 0.25, 1);
      const kind = parkKind(x, y);
      if (kind === 'pond') {
        ctx.fillStyle = '#5aa0c8'; ctx.beginPath(); ctx.ellipse(x + 0.5, y + 0.55, 0.32, 0.24, 0.3, 0, 7); ctx.fill();
        ctx.strokeStyle = '#c9b996'; ctx.lineWidth = 0.05; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 0.4, y + 0.5, 0.15, 0.02);
      } else if (kind === 'flowers') {
        ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.ellipse(x + 0.5, y + 0.5, 0.26, 0.26, 0, 0, 7); ctx.fill();
        for (let k = 0; k < 12; k++) { const a = k * 0.52, r = 0.08 + (k % 3) * 0.06; ctx.fillStyle = FLOWERS[k % FLOWERS.length]; ctx.fillRect(x + 0.5 + Math.cos(a) * r - 0.03, y + 0.5 + Math.sin(a) * r - 0.03, 0.06, 0.06); }
      }
    }
    // gravel paths: through the middle of park tiles, connecting to neighbouring park tiles and to the streets
    ctx.fillStyle = '#e2d6b6';
    const W = 0.14;
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      if (!park(x, y) || parkKind(x, y) === 'pond') continue;
      const h = hash(x * 3 + y * 5);
      const links = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => road(x + dx, y + dy) || (park(x + dx, y + dy) && parkKind(x + dx, y + dy) !== 'pond' && (h + dx + dy * 2) % 3 !== 0));
      if (!links.length) continue;
      ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, W / 2 + 0.02, 0, 7); ctx.fill();
      for (const [dx, dy] of links) {
        if (dx) ctx.fillRect(dx > 0 ? x + 0.5 : x, y + 0.5 - W / 2, 0.5, W);
        else ctx.fillRect(x + 0.5 - W / 2, dy > 0 ? y + 0.5 : y, W, 0.5);
      }
    }
  });
}
// big park trees of different kinds: oak, plane, poplar, conifer, birch, willow
function parkTree(gx, gy, seed) {
  if (mapInfo().desert) { const q = toScreen(gx, gy); return palm(q.x, q.y, 0.85 + (hash(seed) % 30) / 100, seed); }
  const p = toScreen(gx, gy), kind = seed % 6, s = 1 + (hash(seed) % 30) / 100;
  const wind = (weather.wind || 0), sway = Math.sin(time * (1.2 + wind / 15) + seed) * (0.8 + wind / 12);
  const blob = (dx, dy, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x + dx + sway, p.y + dy, r, 0, 7); ctx.fill(); };
  const trunk = (h, w = 2.4, col = '#5e4128') => { ctx.fillStyle = col; ctx.fillRect(p.x - w / 2, p.y - h, w, h); };
  if (kind === 0 || kind === 1) {
    // oak / plane tree: wide crown made of several blobs
    trunk(14 * s, 3);
    const g = kind ? ['#3f7a34', '#4e8c3e', '#6aa64c'] : ['#466f2e', '#557f36', '#73a04a'];
    for (const [dx, dy, r] of [[-8, -20, 8], [8, -21, 8], [0, -27, 9], [-4, -32, 7], [5, -31, 6]]) blob(dx * s, dy * s, r * s, g[0]);
    for (const [dx, dy, r] of [[-5, -23, 6], [6, -24, 6], [0, -30, 6]]) blob(dx * s, dy * s, r * s, g[1]);
    blob(-3 * s, -30 * s, 3.5 * s, g[2]);
  } else if (kind === 2) {
    // Lombardy poplar: tall and narrow
    trunk(8 * s, 2);
    ctx.fillStyle = '#4a7f38'; ctx.beginPath(); ctx.ellipse(p.x + sway, p.y - 26 * s, 4.5 * s, 20 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#6aa04c'; ctx.beginPath(); ctx.ellipse(p.x - 1.5 + sway, p.y - 30 * s, 2 * s, 13 * s, 0, 0, 7); ctx.fill();
  } else if (kind === 3) {
    // conifer: layered cones
    trunk(5 * s, 2);
    for (let k = 0; k < 4; k++) {
      const yb = p.y - (5 + k * 7) * s, w = (11 - k * 2.3) * s;
      ctx.fillStyle = k % 2 ? '#2f5e3a' : '#36694a';
      ctx.beginPath(); ctx.moveTo(p.x - w + sway * 0.5, yb); ctx.lineTo(p.x + w + sway * 0.5, yb); ctx.lineTo(p.x + sway, yb - 11 * s); ctx.closePath(); ctx.fill();
    }
  } else if (kind === 4) {
    // weeping willow, near water: drooping curtain
    trunk(12 * s, 3);
    blob(0, -20 * s, 10 * s, '#4f7a32');
    ctx.strokeStyle = '#5d8a3c'; ctx.lineWidth = 1.2;
    for (let k = -4; k <= 4; k++) { const sx = p.x + k * 2.4 * s + sway; ctx.beginPath(); ctx.moveTo(sx, p.y - 22 * s); ctx.quadraticCurveTo(sx + k * 0.8, p.y - 12 * s, sx + k * 0.6 + sway, p.y - 4 * s); ctx.stroke(); }
  } else {
    // birch: white trunk, light airy crown
    trunk(16 * s, 2, '#ece8e0');
    ctx.fillStyle = '#2b2b2b'; for (let k = 0; k < 4; k++) ctx.fillRect(p.x - 1, p.y - (3 + k * 4) * s, 1.4, 0.8);
    for (const [dx, dy, r] of [[-4, -20, 5], [4, -22, 5], [0, -27, 6]]) blob(dx * s, dy * s, r * s, '#8cbf5a');
    blob(-2 * s, -26 * s, 3 * s, '#a8d06c');
  }
}
// a low black railing around every park, with an opening wherever a park path meets the street
function parkFence() {
  const park = (x, y) => inGrid(x, y) && isPark(x, y);
  const road = (x, y) => inGrid(x, y) && isRoad(x, y);
  const H = 3.2;
  ctx.strokeStyle = '#2b2d31'; ctx.lineWidth = 0.6;
  const run = (ax, ay, bx, by) => {
    const A = toScreen(ax, ay), B = toScreen(bx, by);
    ctx.beginPath(); ctx.moveTo(A.x, A.y - H); ctx.lineTo(B.x, B.y - H); ctx.moveTo(A.x, A.y - H * 0.45); ctx.lineTo(B.x, B.y - H * 0.45); ctx.stroke();
    const n = 4;
    for (let k = 0; k <= n; k++) { const px = A.x + (B.x - A.x) * k / n, py = A.y + (B.y - A.y) * k / n; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - H - 0.6); ctx.stroke(); }
  };
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (!park(x, y)) continue;
    const edges = [[0, -1, x, y, x + 1, y], [-1, 0, x, y, x, y + 1], [0, 1, x, y + 1, x + 1, y + 1], [1, 0, x + 1, y, x + 1, y + 1]];
    for (const [dx, dy, ax, ay, bx, by] of edges) {
      if (park(x + dx, y + dy)) continue;
      const gate = road(x + dx, y + dy) && parkKind(x, y) !== 'pond';
      if (!gate) { run(ax, ay, bx, by); continue; }
      // leave a gate in the middle for the path
      run(ax, ay, ax + (bx - ax) * 0.38, ay + (by - ay) * 0.38);
      run(ax + (bx - ax) * 0.62, ay + (by - ay) * 0.62, bx, by);
    }
  }
}
function parkBench(x, y) {
  const p = toScreen(x + 0.3, y + 0.62);
  ctx.fillStyle = '#7a5235'; ctx.fillRect(p.x - 4, p.y - 3, 8, 1.6); ctx.fillRect(p.x - 4, p.y - 6, 8, 1.2);
  ctx.fillStyle = '#3a3d42'; ctx.fillRect(p.x - 3.5, p.y - 1.4, 1, 1.6); ctx.fillRect(p.x + 2.5, p.y - 1.4, 1, 1.6);
  // a lamp post next to it
  const q = toScreen(x + 0.7, y + 0.3);
  ctx.strokeStyle = '#2f3237'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y - 13); ctx.stroke();
  ctx.fillStyle = night() ? '#fff1c8' : '#f4f2ec'; ctx.beginPath(); ctx.arc(q.x, q.y - 14, 1.6, 0, 7); ctx.fill();
  if (night()) lights.push({ glow: true, x: q.x, y: q.y - 14, r: 12, col: '255,220,150', a: 0.5 });
}
// what an empty lot shows: about half paved (squares, lanes, car parks, courtyards), half green
// 0/1 lawn, 2 footpath, 3 garden, 4 square, 5 brick lane, 6 meadow, 7 car park, 8 courtyard
const LOT_KINDS = [0, 3, 2, 4, 5, 7, 8, 4, 1, 6];
const lotKind = (h) => LOT_KINDS[h % LOT_KINDS.length];
// little squares only appear against buildings, never on their own in a field
function nextToBuilding(x, y) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (inGrid(xx, yy) && S.tiles[xx + yy * GRID]) return true; }
  return false;
}
function drawLotDecor() {
  const road = (x, y) => inGrid(x, y) && isRoad(x, y);
  const empty = [];
  const treeAt = new Set(S.trees);
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const i = x + y * GRID;
    if (terrain[i] === 0 && !S.tiles[i] && !treeAt.has(i)) empty.push([x, y, hash(x * 131 + y * 71)]);
  }
  // paths (footpaths and brick back lanes) must always lead somewhere: each path tile links to the
  // neighbouring streets and paths; a path tile with no link at all becomes a lawn instead.
  const pathKind = new Map();
  for (const [x, y, h] of empty) { const k = lotKind(h); if (k === 2 || k === 5) pathKind.set(x + y * GRID, k); }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const links = (x, y) => DIRS.filter(([dx, dy]) => road(x + dx, y + dy) || pathKind.has(x + dx + (y + dy) * GRID));
  // drop paths that are not connected (directly or through other paths) to a street
  const reach = new Set(), queue = [];
  for (const i of pathKind.keys()) { const x = i % GRID, y = (i / GRID) | 0; if (DIRS.some(([dx, dy]) => road(x + dx, y + dy))) { reach.add(i); queue.push(i); } }
  while (queue.length) { const i = queue.pop(), x = i % GRID, y = (i / GRID) | 0; for (const [dx, dy] of DIRS) { const j = x + dx + (y + dy) * GRID; if (pathKind.has(j) && !reach.has(j) && inGrid(x + dx, y + dy)) { reach.add(j); queue.push(j); } } }
  for (const i of [...pathKind.keys()]) if (!reach.has(i)) pathKind.delete(i);
  // flat parts in the board plane
  plane(() => {
    for (const [x, y, h] of empty) {
      let kind = lotKind(h);
      if ((kind === 2 || kind === 5) && !pathKind.has(x + y * GRID)) kind = 0;
      if ((kind === 4 || kind === 8) && !nextToBuilding(x, y)) kind = 1;
      if (kind === 2 || kind === 5) {
        // footpath (2) or brick back lane (5): a segment from the middle to every linked side (dead ends allowed)
        const w = kind === 5 ? 0.3 : 0.16, col = kind === 5 ? '#a8775a' : '#d9c7a0';
        ctx.fillStyle = col;
        ctx.fillRect(x + 0.5 - w / 2, y + 0.5 - w / 2, w, w);
        for (const [dx, dy] of links(x, y)) {
          if (dx) ctx.fillRect(dx > 0 ? x + 0.5 : x, y + 0.5 - w / 2, 0.5, w);
          else ctx.fillRect(x + 0.5 - w / 2, dy > 0 ? y + 0.5 : y, w, 0.5);
        }
      } else if (kind === 3) {
        // garden: low hedge around a flower bed
        ctx.strokeStyle = '#3f7a34'; ctx.lineWidth = 0.08; ctx.strokeRect(x + 0.12, y + 0.12, 0.76, 0.76);
        ctx.fillStyle = '#7a5a3a'; ctx.fillRect(x + 0.3, y + 0.3, 0.4, 0.4);
        if (!lod) for (let k = 0; k < 9; k++) { ctx.fillStyle = FLOWERS[(h + k) % FLOWERS.length]; ctx.fillRect(x + 0.33 + (k % 3) * 0.12, y + 0.33 + Math.floor(k / 3) * 0.12, 0.07, 0.07); }
      } else if (kind === 4) {
        // little square: paving with a lighter border
        ctx.fillStyle = '#cfc6b4'; ctx.fillRect(x + 0.1, y + 0.1, 0.8, 0.8);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.02; ctx.beginPath();
        for (let k = 1; k < 4; k++) { ctx.moveTo(x + 0.1 + k * 0.2, y + 0.1); ctx.lineTo(x + 0.1 + k * 0.2, y + 0.9); ctx.moveTo(x + 0.1, y + 0.1 + k * 0.2); ctx.lineTo(x + 0.9, y + 0.1 + k * 0.2); }
        ctx.stroke();
      } else if (kind === 7) {
        // small car park: asphalt with white bays and a couple of parked cars
        ctx.fillStyle = '#8a8d94'; ctx.fillRect(x + 0.06, y + 0.06, 0.88, 0.88);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (let k = 0; k <= 4; k++) { ctx.fillRect(x + 0.1 + k * 0.2, y + 0.1, 0.015, 0.3); ctx.fillRect(x + 0.1 + k * 0.2, y + 0.6, 0.015, 0.3); }
        for (let k = 0; k < 4; k++) if (hash(h + k) % 3) { ctx.fillStyle = CAR_PAINT[hash(h * 3 + k) % CAR_PAINT.length]; ctx.fillRect(x + 0.13 + k * 0.2, y + (k % 2 ? 0.62 : 0.13), 0.14, 0.24); }
      } else if (kind === 8) {
        // paved courtyard / forecourt with a planter
        ctx.fillStyle = '#c9c1b0'; ctx.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.02; ctx.beginPath();
        for (let k = 1; k < 6; k++) { ctx.moveTo(x + 0.04, y + 0.04 + k * 0.15); ctx.lineTo(x + 0.96, y + 0.04 + k * 0.15); }
        ctx.stroke();
        ctx.fillStyle = '#5a4a3a'; ctx.fillRect(x + 0.42, y + 0.42, 0.16, 0.16);
      } else if (kind === 6) {
        // meadow: taller, darker grass with wildflowers
        ctx.fillStyle = 'rgba(70,110,50,0.35)'; ctx.fillRect(x + 0.05, y + 0.05, 0.9, 0.9);
        if (!lod) for (let k = 0; k < 7; k++) { const q = hash(h + k * 17); ctx.fillStyle = FLOWERS[q % FLOWERS.length]; ctx.fillRect(x + 0.1 + (q % 80) / 100, y + 0.1 + ((q >> 7) % 80) / 100, 0.05, 0.05); }
      }
    }
  });
  // small upright things: shrubs, a bench and a young tree on the squares
  for (const [x, y, h] of empty) {
    let kind = lotKind(h);
    if ((kind === 2 || kind === 5) && !pathKind.has(x + y * GRID)) kind = 0;
    if ((kind === 4 || kind === 8) && !nextToBuilding(x, y)) kind = 1;
    if (kind === 0 || kind === 1 || kind === 2) {
      const n = 2 + (h >> 3) % 3;
      for (let k = 0; k < n; k++) {
        const q = hash(h + k * 29), gx = x + 0.18 + (q % 64) / 100, gy = y + 0.18 + ((q >> 6) % 64) / 100;
        if (kind === 2 && (Math.abs(gy - y - 0.5) < 0.18 || Math.abs(gx - x - 0.5) < 0.18)) continue;  // keep shrubs off the path
        shrub(gx, gy, 2.6 + (q % 3), q);
      }
    } else if (kind === 4) {
      const p = toScreen(x + 0.35, y + 0.6);
      ctx.fillStyle = '#7a5235'; ctx.fillRect(p.x - 4, p.y - 3, 8, 1.6); ctx.fillRect(p.x - 4, p.y - 6, 8, 1.2);
      ctx.fillRect(p.x - 3.5, p.y - 1.4, 1, 1.6); ctx.fillRect(p.x + 2.5, p.y - 1.4, 1, 1.6);
      shrub(x + 0.68, y + 0.35, 4.2, h, true);
    } else if (kind === 3 && !lod) {
      shrub(x + 0.2, y + 0.2, 2.2, h); shrub(x + 0.8, y + 0.8, 2.2, h + 1);
    }
  }
}
function shrub(gx, gy, r, seed, trunk = false) {
  const p = toScreen(gx, gy);
  if (trunk) { ctx.fillStyle = '#6b4a2b'; ctx.fillRect(p.x - 0.7, p.y - 7, 1.4, 7); }
  const y = trunk ? p.y - 9 : p.y - r * 0.6;
  ctx.fillStyle = 'rgba(20,40,20,0.2)'; ctx.beginPath(); ctx.ellipse(p.x + 1, p.y + 0.5, r, r * 0.45, 0, 0, 7); ctx.fill();
  ctx.fillStyle = ['#3f7a34', '#4a8a3c', '#567f36', '#3b6e3a'][seed % 4];
  ctx.beginPath(); ctx.arc(p.x, y, r, 0, 7); ctx.fill();
  if (!lod) { ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.arc(p.x - r * 0.3, y - r * 0.3, r * 0.45, 0, 7); ctx.fill(); }
}

// ---------- the raised Monopoly frame ----------
function drawFrame() {
  const a = -M, b = GRID + M;
  // inner walls of the tray, visible along the north and west edges
  for (let i = 0; i < GRID; i++) {
    const zn = wet(i, 0) ? -WD : 0, zw = wet(0, i) ? -WD : 0;
    poly([at(i, 0, RIM), at(i + 1, 0, RIM), at(i + 1, 0, zn), at(i, 0, zn)], wet(i, 0) ? '#b3a383' : '#d2c09a', null);
    poly([at(0, i, RIM), at(0, i + 1, RIM), at(0, i + 1, zw), at(0, i, zw)], wet(0, i) ? '#c7b898' : '#e0cfa9', null);
  }
  planeZ(RIM, () => {
    const frame = new Path2D(); frame.rect(a, a, b - a, b - a); frame.rect(0, 0, GRID, GRID);
    ctx.fillStyle = '#f5edd5'; ctx.fill(frame, 'evenodd');
    ctx.fillStyle = noise(); ctx.fill(frame, 'evenodd');
    ctx.lineWidth = 0.05; ctx.strokeStyle = INK; ctx.strokeRect(a, a, b - a, b - a); ctx.strokeRect(0, 0, GRID, GRID);
    // property spaces, going round the board from START like the real game
    const seg = GRID / 8, ST = mapInfo().streets;
    let n = 0;
    const space = (x, y, w, h, rot) => {
      const name = ST[n % ST.length].toUpperCase(), band = BANDS[Math.floor(n / 4) % BANDS.length];
      const price = Math.round((60 + n * 11) / 20) * 20; n++;
      ctx.strokeStyle = INK; ctx.lineWidth = 0.035; ctx.strokeRect(x, y, w, h);
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot);
      const L = Math.max(w, h), D = Math.min(w, h), BH = 0.46, pad = 0.16;
      // colour band on the inner side (towards the city), name in the middle, price at the outer edge
      ctx.fillStyle = band; ctx.fillRect(-L / 2, -D / 2, L, BH);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-L / 2, -D / 2, L, BH * 0.35);
      ctx.strokeRect(-L / 2, -D / 2, L, BH);
      const top = -D / 2 + BH + 0.08, bottom = D / 2 - 0.44;
      drawText(name, 0, (top + bottom) / 2, L - pad * 2, bottom - top, 0.44);
      drawText(`€${price}`, 0, D / 2 - 0.24, L - pad * 2, 0.26, 0.26, '#6b5a4c');
      ctx.restore();
    };
    for (let i = 0; i < 8; i++) space(GRID - (i + 1) * seg, GRID, seg, M, 0);           // south (from START, westwards)
    for (let i = 0; i < 8; i++) space(-M, GRID - (i + 1) * seg, M, seg, Math.PI / 2);   // west
    for (let i = 0; i < 8; i++) space(i * seg, -M, seg, M, Math.PI);                     // north
    for (let i = 0; i < 8; i++) space(GRID, i * seg, M, seg, -Math.PI / 2);             // east
    const corner = (x, y, label, col, rot) => {
      ctx.fillStyle = col; ctx.fillRect(x, y, M, M);
      ctx.fillStyle = noise(); ctx.fillRect(x, y, M, M);
      ctx.strokeStyle = INK; ctx.lineWidth = 0.035; ctx.strokeRect(x, y, M, M);
      ctx.save(); ctx.translate(x + M / 2, y + M / 2); ctx.rotate(rot);
      drawText(label.toUpperCase(), 0, 0, M * 1.12, M * 0.62, 0.5);
      ctx.restore();
    };
    const C = mapInfo().corners;
    corner(a, a, C[0], '#cfe8d0', Math.PI * 0.75);
    corner(GRID, a, C[1], '#f6d6d6', -Math.PI * 0.75);
    corner(GRID, GRID, C[2], '#f9e6a8', -Math.PI / 4);
    corner(a, GRID, C[3], '#cfe0f2', Math.PI / 4);
  });
  // crisp top edge of the tray walls
  ctx.strokeStyle = INK; ctx.lineWidth = 1;
  ctx.beginPath(); const p0 = at(GRID, 0, RIM), p1 = at(0, 0, RIM), p2 = at(0, GRID, RIM);
  ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
}

// ---------- sun shadows (direction follows the time of day) ----------
const SHADOW = {
  mountain: [0.98, 80], hospital: [0.6, 44], police: [0.62, 28], library: [0.66, 32], bank: [0.68, 44], prison: [0.9, 24], plaza: [0, 0], billboard: [0.3, 40], monument: [0.34, 32], crane: [0.42, 64], containers: [0.6, 18], kiosk: [0.34, 12], flag: [0.04, 46], handje: [0.3, 18], comic: [0.5, 46], bikerack: [0, 0], apt: [0.7, 44], office: [0.6, 90], villa: [0.5, 18], industry: [0.85, 18], flat: [0.72, 85], row: [0.6, 38], gable: [0.55, 42], brown: [0.62, 41], solar: [0.62, 14], lamp: [0.08, 50], factory: [0.72, 28], shop: [0.6, 22],
  workshop: [0.66, 26], wind: [0.06, 62], warehouse: [0.8, 36], sky: [0.68, 112], lofts: [0.66, 88], station: [0.86, 38],
  cathedral: [0.6, 80], plant: [0.76, 52], castle: [0.72, 36], guild: [0.75, 40], mas: [0.56, 90], atomium: [0.4, 70],
  statue: [0.4, 14], palace: [0.86, 28], tower: [0.35, 100], arch: [0.6, 40], berlaymont: [0.6, 56], park: [0, 0],
};
function hull(pts) {
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function sunVector() {
  const hr = S.hour + (S._frac || 0);
  const t = Math.max(0, Math.min(1, (hr - 6) / 14));
  return [-0.15 - t * 0.85, 0.3 - Math.sin(t * Math.PI) * 0.12];
}
function drawShadows(night) {
  const day = 1 - night;
  if (day < 0.05) return;
  const [vx, vy] = sunVector();
  const path = new Path2D();
  for (const b of buildingsList()) {
    const [f, h] = SHADOW[BUILDINGS[b.type].style] || [0.6, 30];
    if (!h) continue;
    const k = b.size || 1, p = toScreen(b.x + k / 2, b.y + k / 2), fx = HW * Math.max(f, 0.12) * k, fy = HH * Math.max(f, 0.12) * k, ox = vx * h * TALL * k, oy = vy * h * TALL * k;
    const d = [[p.x, p.y - fy], [p.x + fx, p.y], [p.x, p.y + fy], [p.x - fx, p.y]];
    const hl = hull(d.concat(d.map(([x, y]) => [x + ox, y + oy])));
    path.moveTo(hl[0][0], hl[0][1]); for (let i = 1; i < hl.length; i++) path.lineTo(hl[i][0], hl[i][1]); path.closePath();
  }
  ctx.fillStyle = `rgba(24,34,58,${0.24 * day})`; ctx.fill(path, 'nonzero');
  // trees
  const tp = new Path2D();
  const treeShadow = (gx, gy) => { const p = toScreen(gx, gy); tp.moveTo(p.x + vx * 16 + 8, p.y + vy * 16); tp.ellipse(p.x + vx * 16, p.y + vy * 16, 8, 4, 0, 0, Math.PI * 2); };
  for (const i of S.trees) if (!S.tiles[i]) treeShadow(i % GRID + 0.5, Math.floor(i / GRID) + 0.5);
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (isPark(x, y) && parkKind(x, y) === 'tree') { treeShadow(x + 0.3, y + 0.3); treeShadow(x + 0.35, y + 0.35); if (hash(x * 7 + y * 131) % 4 === 0) treeShadow(x + 0.75, y + 0.72); }
  ctx.fillStyle = `rgba(24,34,58,${0.2 * day})`; ctx.fill(tp);
}

function drawCoverage() {
  if (!ui.tool || !(ui.tool === 'lamp' || ui.showCoverage)) return;
  plane(() => {
    ctx.fillStyle = 'rgba(63,182,168,0.22)';
    D.covered.forEach((i) => ctx.fillRect(i % GRID, Math.floor(i / GRID), 1, 1));
  });
}

// ---------- render caches ----------
// Things that do not move are drawn once into offscreen canvases at the current zoom and copied
// every frame: the board in three ground layers, and every building in a texture atlas. The camera
// translation is snapped to whole device pixels so copies land exactly where the drawing would.
// Anything that reads the clock (tNow) or dice (Math.random) while being baked is animated and
// stays live; clocks that show the game hour (hourNow) are rebaked when the hour changes.
let TX = 0, TY = 0, SC = 1, prevSC = 0;  // current device transform: x' = SC * x + TX
let bakeT = null;                        // set while a picture is baked: records what makes it change
function tNow() { if (bakeT) bakeT.dyn = true; return time; }
function hourNow() { if (bakeT) bakeT.hour = true; return S.hour; }
let worldGen = 0;                        // bumped when the world is rebuilt or fonts arrive
export const invalidateCaches = () => { worldGen++; };
if (document.fonts) { document.fonts.ready.then(invalidateCaches); document.fonts.addEventListener?.('loadingdone', invalidateCaches); }

// draw a cached canvas region 1:1 onto device pixels
function blitAt(c, src, sx, sy, w, h, dx, dy) {
  const m = c.getTransform();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(src, sx, sy, w, h, dx, dy, w, h);
  c.setTransform(m);
}

// Bounds of everything drawn on a context, in device pixels (so baked pictures can be cropped tight).
// Unknown shapes (Path2D) make the bounds unusable, and that picture then stays live.
function boundsTracker(g) {
  const B = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, bad: false };
  let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
  let m = null;
  const T = () => (m = g.getTransform());
  const pt = (x, y) => {
    const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
    if (X < px0) px0 = X; if (X > px1) px1 = X; if (Y < py0) py0 = Y; if (Y > py1) py1 = Y;
  };
  const box = (x0, y0, x1, y1) => { pt(x0, y0); pt(x1, y0); pt(x1, y1); pt(x0, y1); };
  const commit = (pad) => {
    if (px0 > px1) return;
    B.x0 = Math.min(B.x0, px0 - pad); B.y0 = Math.min(B.y0, py0 - pad); B.x1 = Math.max(B.x1, px1 + pad); B.y1 = Math.max(B.y1, py1 + pad);
  };
  const scale = () => Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
  const strokePad = () => g.lineWidth * scale() * (g.lineJoin === 'miter' ? 5 : 0.5) + 1;
  const wrap = (name, fn) => { const orig = g[name]; g[name] = function (...a) { fn(...a); return orig.apply(g, a); }; };
  wrap('beginPath', () => { px0 = py0 = Infinity; px1 = py1 = -Infinity; });
  wrap('moveTo', (x, y) => { T(); pt(x, y); });
  wrap('lineTo', (x, y) => { T(); pt(x, y); });
  wrap('quadraticCurveTo', (a, b, x, y) => { T(); pt(a, b); pt(x, y); });
  wrap('bezierCurveTo', (a, b, c, d, x, y) => { T(); pt(a, b); pt(c, d); pt(x, y); });
  wrap('arcTo', (a, b, c, d) => { T(); pt(a, b); pt(c, d); });
  wrap('arc', (x, y, r) => { T(); box(x - r, y - r, x + r, y + r); });
  wrap('ellipse', (x, y, rx, ry) => { T(); const r = Math.max(rx, ry); box(x - r, y - r, x + r, y + r); });
  wrap('rect', (x, y, w, h) => { T(); box(x, y, x + w, y + h); });
  wrap('roundRect', (x, y, w, h) => { T(); box(x, y, x + w, y + h); });
  const paint = (stroke) => (p) => {
    if (p && typeof p === 'object') { B.bad = true; return; }   // Path2D
    T(); commit(stroke ? strokePad() : 1);
  };
  wrap('fill', paint(false));
  wrap('stroke', paint(true));
  const rectPaint = (stroke) => (x, y, w, h) => {
    const s0 = [px0, py0, px1, py1]; px0 = py0 = Infinity; px1 = py1 = -Infinity;
    T(); box(x, y, x + w, y + h); commit(stroke ? strokePad() : 1);
    [px0, py0, px1, py1] = s0;
  };
  wrap('fillRect', rectPaint(false));
  wrap('strokeRect', rectPaint(true));
  wrap('drawImage', (img, ...a) => {
    const [x, y, w, h] = a.length >= 8 ? a.slice(4) : a.length >= 4 ? a : [a[0], a[1], img.width, img.height];
    const c = a.length < 8 && img.crop;    // pictures that know which part of them is painted
    if (c) rectPaint(false)(x + c.x0 / img.width * w, y + c.y0 / img.height * h, (c.x1 - c.x0) / img.width * w, (c.y1 - c.y0) / img.height * h);
    else rectPaint(false)(x, y, w, h);
  });
  const text = (stroke) => (t, x, y) => {
    const tm = g.measureText(t);
    rectPaint(stroke)(x - tm.actualBoundingBoxLeft - 2, y - tm.actualBoundingBoxAscent - 2, tm.actualBoundingBoxLeft + tm.actualBoundingBoxRight + 4, tm.actualBoundingBoxAscent + tm.actualBoundingBoxDescent + 4);
  };
  wrap('fillText', text(false));
  wrap('strokeText', text(true));
  g.bounds = B;
  g.resetBounds = () => { B.x0 = B.y0 = Infinity; B.x1 = B.y1 = -Infinity; B.bad = false; px0 = py0 = Infinity; px1 = py1 = -Infinity; };
  return g;
}

// texture atlas: a few big canvases, filled shelf by shelf; cleared when the zoom changes or it runs full
const ATLAS = 2048, MAX_PAGES = 6, SCR_MAX = 2048;
const atlas = { pages: [], scale: 0, full: false };
const bakes = new Map();                 // item id -> baked record
function atlasReset(scale) {
  for (const p of atlas.pages) { p.g.setTransform(1, 0, 0, 1, 0, 0); p.g.clearRect(0, 0, ATLAS, ATLAS); p.x = p.y = p.rowH = 0; }
  atlas.scale = scale; atlas.full = false; bakes.clear();
}
function atlasAlloc(w, h) {
  if (w > ATLAS || h > ATLAS) return null;
  for (let i = 0; ; i++) {
    let p = atlas.pages[i];
    if (!p) {
      if (i >= MAX_PAGES) { atlas.full = true; return null; }
      const c = document.createElement('canvas'); c.width = c.height = ATLAS;
      p = { cv: c, g: c.getContext('2d'), x: 0, y: 0, rowH: 0 };
      atlas.pages.push(p);
    }
    if (p.x + w > ATLAS) { p.y += p.rowH + 1; p.x = 0; p.rowH = 0; }
    if (p.y + h > ATLAS) continue;
    const r = { p, x: p.x, y: p.y };
    p.x += w + 1; p.rowH = Math.max(p.rowH, h);
    return r;
  }
}
let scr = null;
function scratch(w, h) {
  if (!scr) scr = boundsTracker(document.createElement('canvas').getContext('2d'));
  const c = scr.canvas;
  if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
  scr.setTransform(1, 0, 0, 1, 0, 0); scr.globalCompositeOperation = 'source-over'; scr.globalAlpha = 1;
  scr.clearRect(0, 0, w, h); scr.resetBounds();
  return scr;
}
// draw fn into the scratch canvas (world coordinates, current zoom) and copy the result into the atlas
function bakeRun(fn, box, asGhost) {
  const [hw, up, dn, px, py] = box;
  const bw = Math.ceil(2 * hw * SC) + 4, bh = Math.ceil((up + dn) * SC) + 4;
  const OX = Math.round(-(px - hw) * SC) + 2, OY = Math.round(-(py - up) * SC) + 2;
  const g = scratch(bw, bh);
  g.setTransform(SC, 0, 0, SC, OX, OY);
  if (asGhost) g.globalCompositeOperation = 'destination-out';
  const main = ctx, n0 = lights.length, rnd = Math.random, wasGhost = ghost;
  const T = { dyn: false, hour: false };
  ctx = g; bakeT = T; ghost = asGhost;
  Math.random = function () { T.dyn = true; return rnd(); };
  particles.push = () => 0;               // a bake must not spawn smoke (animated buildings are drawn live anyway)
  try { fn(); } finally { ctx = main; bakeT = null; ghost = wasGhost; Math.random = rnd; delete particles.push; }
  const L = lights.splice(n0);
  const B = g.bounds;
  const rec = { dyn: T.dyn, hour: T.hour, lights: L, w: 0, h: 0 };
  if (T.dyn) return rec;
  if (B.bad || B.x0 < 0 || B.y0 < 0 || B.x1 > bw || B.y1 > bh) { rec.dyn = true; return rec; }   // can't crop it safely
  if (B.x0 >= B.x1) return rec;           // drew nothing
  const x0 = Math.floor(B.x0), y0 = Math.floor(B.y0), w = Math.ceil(B.x1) - x0, h = Math.ceil(B.y1) - y0;
  const a = atlasAlloc(w, h);
  if (!a) { rec.dyn = true; rec.full = true; return rec; }
  a.p.g.drawImage(g.canvas, x0, y0, w, h, a.x, a.y, w, h);
  Object.assign(rec, { page: a.p.cv, ax: a.x, ay: a.y, w, h, dx: x0 - OX, dy: y0 - OY });
  return rec;
}
// returns the baked record for an item (or null when it has to be drawn live this frame)
function baked(it, nightOn) {
  const bk = it.bake;
  if (SC !== prevSC) return null;         // zooming: don't bake pictures that are stale next frame
  if (atlas.scale !== SC) atlasReset(SC);
  let rec = bakes.get(bk.id);
  if (rec && rec.key === bk.key && (rec.hour == null || rec.hour === S.hour)) return rec.dyn ? null : rec;
  if (atlas.full) return null;
  const k = bk.k, box = [HW * k + 60, 260 * k + 80, HH * k + 40, bk.x, bk.y];
  if (2 * box[0] * SC > SCR_MAX || (box[1] + box[2]) * SC > SCR_MAX) { bakes.set(bk.id, { key: bk.key, dyn: true, hour: null }); return null; }
  rec = bakeRun(bk.body, box, false);
  rec.key = bk.key; rec.hour = rec.hour ? S.hour : null;
  if (!rec.dyn && nightOn && it.occ) {
    // the same picture drawn into the night light layer: erases what it hides and adds its own lit windows
    const n = lights.length; let pushed = false;
    const gh = bakeRun(() => { bk.body(); pushed = lights.length > n; }, box, true);
    if (gh.dyn) rec.dyn = true;
    else if (pushed && gh.w) rec.ghost = gh;
    if (gh.full) rec.full = true;
  }
  if (rec.full) { bakes.delete(bk.id); return null; }
  bakes.set(bk.id, rec);
  return rec.dyn ? null : rec;
}
// Copies happen in device space; the world transform is put back only when live drawing needs it.
const devOn = new Set();
function devSpace(c) { if (!devOn.has(c)) { c.setTransform(1, 0, 0, 1, 0, 0); devOn.add(c); } }
function worldSpace(c) { if (devOn.delete(c)) c.setTransform(SC, 0, 0, SC, TX, TY); }
const blitRec = (c, r) => { if (r.w) { devSpace(c); c.drawImage(r.page, r.ax, r.ay, r.w, r.h, TX + r.dx, TY + r.dy, r.w, r.h); } };

// fingerprint of everything the ground layers show (lots in use, trees, terrain)
function groundRev() {
  let h = 0;
  const T = S.tiles;
  for (let i = 0; i < T.length; i++) if (T[i]) h = Math.imul(h ^ (i + 1), 0x9e3779b1) >>> 0;
  for (const i of S.trees) h = Math.imul(h ^ (i + 7919), 0x85ebca6b) >>> 0;
  for (let i = 0; i < terrain.length; i++) h = (h * 31 + terrain[i]) >>> 0;
  return h;
}
// ground layers: 0 = table + water, 1 = quays, land, lot decor, parks, 2 = the raised frame
const ground = { key: '', ox0: 0, oy0: 0, w: 0, h: 0, cvs: [] };
const GROUND_PAD = 256;                  // extra device pixels around the view so small pans need no redraw
function groundLayers() {
  const a = -M, b = GRID + M, P = 120;
  const bx0 = Math.floor((toScreen(a, b).x - P) * SC), bx1 = Math.ceil((toScreen(b, a).x + P) * SC);
  const by0 = Math.floor((toScreen(a, a).y - RIM - P) * SC), by1 = Math.ceil((toScreen(b, b).y + SLAB + P) * SC);
  // visible part of the board, relative to the board origin (device pixels)
  const vx0 = Math.max(bx0, -TX), vy0 = Math.max(by0, -TY), vx1 = Math.min(bx1, cv.width - TX), vy1 = Math.min(by1, cv.height - TY);
  if (vx0 >= vx1 || vy0 >= vy1) return null;
  const key = `${SC}|${S.map}|${worldGen}|${groundRev()}`;
  const G = ground;
  if (G.key === key && vx0 >= G.ox0 && vy0 >= G.oy0 && vx1 <= G.ox0 + G.w && vy1 <= G.oy0 + G.h) return G;
  if (SC !== prevSC) return null;         // zooming: draw directly until the zoom settles
  const ox0 = Math.max(bx0, vx0 - GROUND_PAD), oy0 = Math.max(by0, vy0 - GROUND_PAD);
  const w = Math.min(bx1, vx1 + GROUND_PAD) - ox0, h = Math.min(by1, vy1 + GROUND_PAD) - oy0;
  const main = ctx, steps = [() => { drawTable(); drawGround('base'); }, () => { drawGround('rest'); drawLotDecor(); drawParks(); parkFence(); }, drawFrame];
  try {
    steps.forEach((fn, i) => {
      let c = G.cvs[i];
      if (!c) c = G.cvs[i] = document.createElement('canvas').getContext('2d');
      if (c.canvas.width !== w || c.canvas.height !== h) { c.canvas.width = w; c.canvas.height = h; } else { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); }
      c.setTransform(SC, 0, 0, SC, -ox0, -oy0);
      ctx = c; fn();
    });
  } finally { ctx = main; }
  Object.assign(G, { key, ox0, oy0, w, h });
  return G;
}
const blitGround = (G, i) => blitAt(ctx, G.cvs[i].canvas, 0, 0, G.w, G.h, TX + G.ox0, TY + G.oy0);

// ---------- objects (depth sorted) ----------
function drawObjects() {
  const items = [];
  const nfH = nightFactor(S.hour), nightOn = nightFactor(S.hour + (S._frac || 0)) > 0.02;
  const gkey = `${nfH}|${nightOn}|${S.map}|${worldGen}`;
  for (const b of buildingsList()) {
    const k = b.size || 1, it = { d: b.x + b.y + k, gx: b.x + k / 2, gy: b.y + k / 2, occ: true, fn: () => drawBuilding(b) };
    // a building that is still popping up is drawn live; afterwards its body comes from the atlas
    if (buildingAge(b) >= 0.5) {
      const p = toScreen(b.x + k / 2, b.y + k / 2);
      it.bake = { id: b.i, k, x: p.x, y: p.y, body: () => drawBuildingBody(b), live: () => drawBadges(b),
        key: `${gkey}|${b.type}|${b.id}|${k}|${efficiency(b) > 0}|${ui.selected === b.i}|${!!b.incident}|${!!b.damaged}|${b.v || 0}` };
    }
    items.push(it);
  }
  stepOutposts(frameDt);
  for (const o of outposts) items.push({ d: o.m.x + o.m.y + o.m.k + 0.01, gx: o.m.x + o.m.k / 2, gy: o.m.y + o.m.k / 2, fn: () => drawOutpost(o) });
  for (const m of mountainBlocks()) {
    const p = toScreen(m.x + m.k / 2, m.y + m.k / 2);
    items.push({ d: m.x + m.y + m.k, gx: m.x + m.k / 2, gy: m.y + m.k / 2, occ: m.hf > 0.5, fn: () => drawMountain(m),
      bake: { id: 'm' + (m.x + m.y * GRID), k: m.k, x: p.x, y: p.y, body: () => drawMountain(m), key: gkey } });
  }
  for (const w of wrecks) { const k = w.b.size || 1; items.push({ d: w.b.x + w.b.y + k, gx: w.b.x + k / 2, gy: w.b.y + k / 2, fn: () => drawWreck(w) }); }
  for (const i of S.rubble || []) { const x = i % GRID, y = Math.floor(i / GRID); items.push({ d: x + y + 0.7, gx: x + 0.5, gy: y + 0.5, fn: () => drawRubble(i) }); }
  for (const i of S.trees) { const x = i % GRID, y = Math.floor(i / GRID); if (!S.tiles[i]) items.push({ d: x + y + 1, gx: x + 0.5, gy: y + 0.5, fn: () => tree(x + 0.5, y + 0.5, i) }); }
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (!isPark(x, y)) continue;
    const h = hash(x * 7 + y * 131), pk = parkKind(x, y);
    if (pk === 'tree') items.push({ d: x + y + 0.6, gx: x + 0.3, gy: y + 0.3, occ: true, fn: () => parkTree(x + 0.3, y + 0.3, h) });
    if (pk === 'tree' && h % 4 === 0) items.push({ d: x + y + 1.47, gx: x + 0.75, gy: y + 0.72, occ: true, fn: () => parkTree(x + 0.75, y + 0.72, h >> 3) });
    if (pk === 'pond' && h % 2) items.push({ d: x + y + 1.05, gx: x + 0.85, gy: y + 0.2, fn: () => parkTree(x + 0.85, y + 0.2, 4) });
    if (pk === 'bench') items.push({ d: x + y + 1, gx: x + 0.5, gy: y + 0.5, fn: () => parkBench(x, y) });
  }
  // traffic and boats move with the game speed buttons (paused = everything stands still)
  const dt = frameDt * sim.speed;
  for (const t of taxis) {
    stepTraffic(t, dt);
    if (t.kind === 'tram') {
      // smooth arc through corners: two articulated sections, each following the curve
      const front = curvePose(t, t.t + 0.24, 0.2), rear = curvePose(t, t.t - 0.24, 0.2);
      const mid = curvePose(t, t.t, 0.2);
      items.push({ d: mid.gx + mid.gy, gx: mid.gx, gy: mid.gy, occ: true, fn: () => tramCurved(front, rear, t) });
      continue;
    }
    const { gx, gy } = moverPos(t, t.lane || 0.2);
    items.push({ d: gx + gy, gx, gy, occ: t.kind === 'bus' || t.kind === 'truck' || t.kind === 'fire' || t.kind === 'tank', fn: () => (VEHICLES[t.kind] || car)(gx, gy, t) });
  }
  for (const t of streetTrees) items.push({ d: t.gx + t.gy, gx: t.gx, gy: t.gy, fn: () => streetTree(t) });
  for (const L of streetLamps) items.push({ d: L.gx + L.gy, gx: L.gx, gy: L.gy, fn: () => streetLamp(L) });
  if (marina) for (const y of marina.yachts) items.push({ d: y.gx + y.gy, gx: y.gx, gy: y.gy, fn: () => yacht(y) });
  for (const f of ferries) {
    const fp = ferryPose(f, dt);
    items.push({ d: fp.gx + fp.gy, gx: fp.gx, gy: fp.gy, occ: true, fn: () => drawFerry(fp) });
  }
  for (const b of boats) {
    stepMover(b, dt);
    const pose = curvePose(b, b.t, 0);
    items.push({ d: pose.gx + pose.gy, gx: pose.gx, gy: pose.gy, fn: () => boat(pose, b) });
  }
  // skip whatever is off screen (generous margin for tall towers)
  const vis = (it) => {
    const p = toScreen(it.gx, it.gy), sx = W / 2 + (p.x + cam.x) * cam.z, sy = H / 2 + (p.y + cam.y) * cam.z;
    return sx > -120 && sx < W + 120 && sy > -60 && sy < H + 260 * cam.z;
  };
  for (let i = items.length - 1; i >= 0; i--) if (!vis(items[i])) items.splice(i, 1);
  items.sort((a, b) => a.d - b.d || (a.occ ? 1 : 0) - (b.occ ? 1 : 0));
  // baked items: copy the picture, replay its lights, draw the animated extras live
  const paint = (it) => {
    const r = it.bake && baked(it, nightOn);
    if (!r) { worldSpace(ctx); it.fn(); return null; }
    blitRec(ctx, r);
    for (const L of r.lights) lights.push(L);
    if (it.bake.live) { worldSpace(ctx); it.bake.live(); }
    return r;
  };
  if (!nightOn) { for (const it of items) paint(it); worldSpace(ctx); return; }
  // At night lit windows go on a separate layer that respects depth: every object first
  // erases what it hides from that layer, then adds its own lit windows on top.
  const lc = lightLayer();
  lc.setTransform(SC, 0, 0, SC, TX, TY); devOn.delete(lc);
  for (const it of items) {
    const n0 = lights.length;
    const r = paint(it);
    const mine = lights.splice(n0);
    if (!it.occ && !mine.length) continue;
    const main = ctx;
    ctx = lc;
    lc.globalCompositeOperation = 'destination-out'; ghost = true;
    try {
      if (it.occ && r) {
        // erase what the picture hides, then add its own lit windows
        blitRec(lc, r);
        if (r.ghost) { lc.globalCompositeOperation = 'source-over'; blitRec(lc, r.ghost); lc.globalCompositeOperation = 'destination-out'; }
        if (it.bake.live) { worldSpace(lc); it.bake.live(); }
      } else if (it.occ) { worldSpace(lc); it.fn(); }
      else worldSpace(lc);
    } catch (e) { console.error('ghost', e); } finally { ghost = false; lights.length = n0; }
    lc.globalCompositeOperation = 'source-over';
    // big things painted their lights during the pass above; small things (lamps, cars) add them now
    if (!it.occ) for (const L of mine) {
      if (!L.glow) { poly(L, L.fill || '#ffd97a', null); continue; }
      lc.drawImage(glowSprite(L.col, L.a), L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    ctx = main;
  }
  worldSpace(ctx); worldSpace(lc);
}
let lcv = null, ghost = false;
// pre-rendered soft light blobs, one per colour/strength (much cheaper than a gradient per light)
const sprites = new Map();
function glowSprite(col = '255,224,140', a = 0.55) {
  const key = col + a;
  let c = sprites.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    sprites.set(key, c);
  }
  return c;
}
function lightLayer() {
  if (!lcv) lcv = document.createElement('canvas');
  if (lcv.width !== cv.width || lcv.height !== cv.height) { lcv.width = cv.width; lcv.height = cv.height; }
  const c = lcv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, lcv.width, lcv.height);
  return c;
}

function tree(gx, gy, seed) {
  if (mapInfo().desert) { const q = toScreen(gx, gy); return palm(q.x, q.y, 0.75 + (hash(seed) % 30) / 100, seed); }
  const p = toScreen(gx, gy), s = 0.8 + (hash(seed) % 40) / 100;
  ctx.fillStyle = '#8b5a2b'; ctx.fillRect(p.x - 1.5, p.y - 10 * s, 3, 10 * s);
  const sway = Math.sin(time * (1.5 + (weather.wind || 0) / 12) + seed) * (1.2 + (weather.wind || 0) / 8);
  ctx.fillStyle = '#5fae55'; ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.arc(p.x + sway, p.y - 16 * s, 8 * s, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7cc46a'; ctx.beginPath(); ctx.arc(p.x + sway - 2, p.y - 18 * s, 4 * s, 0, 7); ctx.fill();
}

// three car models: 0 = saloon, 1 = hatchback, 2 = SUV
const CAR_MODEL = [
  { hl: 0.32, f: 0.16, body: 4.2, c0: -0.45, c1: 0.35, roof: 7.2 },
  { hl: 0.26, f: 0.16, body: 4.6, c0: -0.85, c1: 0.3, roof: 7.8 },
  { hl: 0.34, f: 0.18, body: 5.6, c0: -0.85, c1: 0.45, roof: 9.4 },
];
function car(gx, gy, t) {
  if (t.model == null) t.model = Math.floor(Math.random() * 3);
  const M = CAR_MODEL[t.model], fwd = t.dir > 0 ? 1 : -1;
  const pt = frameOf(gx, gy, t, M.hl, M.f);
  const p = toScreen(gx, gy);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 9.5, 4.2, 0, 0, 7); ctx.fill();
  // wheels: tyre, rim and hubcap, slightly tucked into wheel arches
  for (const u of [-0.62, 0.62]) {
    const w = pt(u, 1.02, 1.25);
    ctx.fillStyle = '#18191b'; ctx.beginPath(); ctx.ellipse(w[0], w[1], 1.75, 1.35, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#9ea3a8'; ctx.beginPath(); ctx.ellipse(w[0], w[1], 0.9, 0.7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#5d6168'; ctx.beginPath(); ctx.ellipse(w[0], w[1], 0.35, 0.28, 0, 0, 7); ctx.fill();
  }
  vbox(pt, -1, 1, 0.8, M.body, t.col);
  // bumpers, door seams, handles and a side skirt
  poly([pt(-1.02, -1, 0.8), pt(-1.02, 1, 0.8), pt(-1.02, 1, 1.9), pt(-1.02, -1, 1.9)], '#3a3d42', null);
  poly([pt(1.02, -1, 0.8), pt(1.02, 1, 0.8), pt(1.02, 1, 1.9), pt(1.02, -1, 1.9)], '#3a3d42', null);
  ctx.strokeStyle = shade(t.col, -0.35); ctx.lineWidth = 0.35;
  for (const u of [-0.1, 0.45 * -fwd]) { const a = pt(u, 1.01, 1.2), c = pt(u, 1.01, M.body - 0.2); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
  for (const u of [0.15, -0.35]) { const h = pt(u * -fwd, 1.02, M.body - 1.1); ctx.fillStyle = shade(t.col, -0.3); ctx.fillRect(h[0] - 0.5, h[1] - 0.2, 1, 0.4); }
  // cabin with tinted glass and dark pillars
  const c0 = fwd > 0 ? M.c0 : -M.c1, c1 = fwd > 0 ? M.c1 : -M.c0;
  vbox(pt, c0, c1, M.body, M.roof, '#7fa6bb');
  ctx.strokeStyle = shade(t.col, -0.2); ctx.lineWidth = 0.6;
  for (const u of [c0, (c0 + c1) / 2, c1]) { const a = pt(u, 1, M.body), c = pt(u, 1, M.roof); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
  poly([pt(c0, -0.8, M.roof), pt(c1, -0.8, M.roof), pt(c1, 0.8, M.roof), pt(c0, 0.8, M.roof)], t.col);
  // glare streak on the side window
  const g0 = pt(c0 + 0.12, 1.01, M.roof - 0.6), g1 = pt(c0 + 0.3, 1.01, M.body + 0.4);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.stroke();
  // wing mirror
  const mr = pt(fwd * (fwd > 0 ? c1 : -c0) * 0 + (fwd > 0 ? c1 : c0), 1.15, M.body + 0.5); ctx.fillStyle = shade(t.col, -0.2); ctx.fillRect(mr[0] - 0.6, mr[1] - 0.5, 1.2, 1);
  if (t.model === 2) { ctx.strokeStyle = '#3a3d42'; ctx.lineWidth = 0.6; for (const v of [-0.6, 0.6]) { const a = pt(c0 + 0.05, v, M.roof + 0.8), b2 = pt(c1 - 0.05, v, M.roof + 0.8); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke(); } }
  // head and tail lights on the corners
  for (const v of [-0.65, 0.65]) {
    const hl = pt(fwd * 1.01, v, M.body * 0.62), tl = pt(-fwd * 1.01, v, M.body * 0.62);
    ctx.fillStyle = '#fff6d8'; ctx.fillRect(hl[0] - 0.7, hl[1] - 0.45, 1.4, 0.9);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(tl[0] - 0.6, tl[1] - 0.4, 1.2, 0.8);
  }
  exhaust(pt, -fwd * 1.05, 0.6, 1.2, t, 0.06);
  const head = pt(fwd, 0, M.body * 0.6);
  if (night()) { glow(head, 13, LIGHT.head, 0.65); glow(pt(-fwd, 0, M.body * 0.6), 6, LIGHT.tail, 0.8); }
}

// elongated box aligned with the direction of travel: u = along, v = across (both -1..1)
// position on a quadratic curve from mid(o,p) via p to mid(p,n): straight on straights, a round arc in corners
function curvePose(m, u0, lane) {
  const u = Math.max(0, Math.min(1, u0)), ext = u0 - u; // beyond the segment: continue along the tangent
  const ox = m.ox < 0 ? 2 * m.px - m.nx : m.ox, oy = m.ox < 0 ? 2 * m.py - m.ny : m.oy;
  const a = [(ox + m.px) / 2, (oy + m.py) / 2], c = [m.px, m.py], b = [(m.px + m.nx) / 2, (m.py + m.ny) / 2];
  const v = 1 - u;
  const x = v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], y = v * v * a[1] + 2 * v * u * c[1] + u * u * b[1];
  let dx = 2 * v * (c[0] - a[0]) + 2 * u * (b[0] - c[0]), dy = 2 * v * (c[1] - a[1]) + 2 * u * (b[1] - c[1]);
  const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  return { gx: x + dx * ext + 0.5 - dy * lane, gy: y + dy * ext + 0.5 + dx * lane, dx, dy };
}
function frameAng(pose, hl, f, sink = 0) {
  const p = toScreen(pose.gx, pose.gy); p.y += sink;
  const g = (a, b) => [(a - b) * HW, (a + b) * HH];
  const ex = g(pose.dx * hl, pose.dy * hl), ey = g(-pose.dy * f, pose.dx * f);
  return (u, v, z) => [p.x + ex[0] * u + ey[0] * v, p.y + ex[1] * u + ey[1] * v - z];
}
function tramCurved(front, rear, t) {
  const stripe = '#f2c230';
  const sec = (pose, isFront) => {
    const pt = frameAng(pose, 0.46, 0.19);
    // draw the faces that look towards the viewer
    const sides = [[[-1, 1], [1, 1]], [[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]]];
    for (const [[u0, v0], [u1, v1]] of sides) {
      const A = pt(u0, v0, 0), B = pt(u1, v1, 0);
      const c = pt(0, 0, 0), mx = (A[0] + B[0]) / 2 - c[0], my = (A[1] + B[1]) / 2 - c[1];
      if (my < 0) continue; // faces pointing away from the viewer are hidden
      poly([pt(u0, v0, 1), pt(u1, v1, 1), pt(u1, v1, 12), pt(u0, v0, 12)], shade(t.col, mx > 0 ? -0.05 : -0.15));
      if (Math.abs(u0 - u1) > 1) {
        poly([pt(u0, v0 * 1.01, 3), pt(u1, v1 * 1.01, 3), pt(u1, v1 * 1.01, 5), pt(u0, v0 * 1.01, 5)], stripe, null);
        const W = [pt(u0 * 0.88, v0 * 1.01, 6.5), pt(u1 * 0.88, v1 * 1.01, 6.5), pt(u1 * 0.88, v1 * 1.01, 10.5), pt(u0 * 0.88, v0 * 1.01, 10.5)];
        poly(W, '#6f97b0', null);
        if (night()) { const L = W.map((q) => [...q]); L.fill = '#ffe2a8'; lights.push(L); }
        faceText(pt, -0.85, 0.85, v0 * 1.02, 1.2, 6.2, 'De Lijn', '#f2c230', '#1e1f22');
      }
    }
    poly([pt(-1, -1, 12), pt(1, -1, 12), pt(1, 1, 12), pt(-1, 1, 12)], shade(t.col, 0.1));
    if (isFront) {
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
      const a = pt(-0.4, 0, 12), b = pt(0, 0, 20), c = pt(0.4, 0, 12);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
      if (night()) glow(pt(1, 0, 10), 14, LIGHT.warm, 0.7);
    }
  };
  // indicator: which side is the tram turning to on this stretch? (0 = straight on)
  const ox = t.ox < 0 ? t.px : t.ox, oy = t.ox < 0 ? t.py : t.oy;
  const ax = t.px - ox, ay = t.py - oy, bx = t.nx - t.px, by = t.ny - t.py;
  const turn = t.ox < 0 ? 0 : Math.sign(ax * by - ay * bx);
  const blinkOn = turn && Math.sin(time * Math.PI * 3) > 0;
  const blink = (pose, u) => {
    if (!blinkOn) return;
    const pt = frameAng(pose, 0.46, 0.19), q = pt(u, turn * 1.02, 6);
    ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.arc(q[0], q[1], 1.8, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,176,32,0.35)'; ctx.beginPath(); ctx.arc(q[0], q[1], 4.5, 0, 7); ctx.fill();
    if (nightFactor(S.hour) > 0.2) lights.push({ glow: true, x: q[0], y: q[1], r: 12 });
  };
  const secB = (pose, isFront) => { sec(pose, isFront); blink(pose, isFront ? 0.92 : -0.92); };
  // draw the section further back on screen first
  const fs = toScreen(front.gx, front.gy).y, rs = toScreen(rear.gx, rear.gy).y;
  if (fs < rs) { secB(front, true); secB(rear, false); } else { secB(rear, false); secB(front, true); }
}
function frameOf(gx, gy, t, hl, f) {
  const p = toScreen(gx, gy), alongX = t.axis === 'x';
  const ex = alongX ? [HW * hl, HH * hl] : [-HW * hl, HH * hl];
  const ey = alongX ? [-HW * f, HH * f] : [HW * f, HH * f];
  return (u, v, z) => [p.x + ex[0] * u + ey[0] * v, p.y + ex[1] * u + ey[1] * v - z];
}
function vbox(pt, u0, u1, z0, z1, col) {
  poly([pt(u0, 1, z0), pt(u1, 1, z0), pt(u1, 1, z1), pt(u0, 1, z1)], shade(col, -0.15));
  poly([pt(u1, -1, z0), pt(u1, 1, z0), pt(u1, 1, z1), pt(u1, -1, z1)], shade(col, -0.05));
  poly([pt(u0, -1, z1), pt(u1, -1, z1), pt(u1, 1, z1), pt(u0, 1, z1)], shade(col, 0.1));
}
// small effects: a puff of exhaust from a vehicle's tail pipe, a bit of dust kicked up by feet and hooves
function exhaust(pt, u, v, z, t, chance = 0.08) {
  if (ghost || !sim.speed || Math.random() > chance) return;
  const e = pt(u, v, z), fwd = t.dir > 0 ? 1 : -1;
  particles.push({ x: e[0], y: e[1], vx: -fwd * 0.15 + (Math.random() - 0.5) * 0.1, vy: -0.18, life: 0.9, col: 'rgba(120,118,112,0.55)', kind: 'puff', g: -0.002, r: 1.2 + Math.random() });
}
function footDust(x, y, chance = 0.04) {
  if (ghost || !sim.speed || !mapInfo().desert || Math.random() > chance) return;
  particles.push({ x: x + (Math.random() - 0.5) * 2, y, vx: (Math.random() - 0.5) * 0.3, vy: -0.12, life: 0.6, col: 'rgba(214,190,145,0.6)', kind: 'puff', g: 0, r: 0.9 + Math.random() * 0.8 });
}
// each kind of vehicle has its own recognisable lights at night
const LIGHT = { head: '235,242,255', tail: '255,50,40', amber: '255,165,30', warm: '255,214,140', led: '255,140,0' };
const night = () => nightFactor(S.hour) > 0.2;
function glow(p, r, col, a) { lights.push({ glow: true, x: p[0], y: p[1], r, col, a }); }
function headlight(pt, t, z, kind) {
  if (!night()) return;
  const f = t.dir > 0 ? 1 : -1;
  if (kind === 'bus') {
    // two wide headlights + orange LED destination sign
    glow(pt(f, -0.6, z), 12, LIGHT.head, 0.7); glow(pt(f, 0.6, z), 12, LIGHT.head, 0.7);
    glow(pt(f, 0, 12), 6, LIGHT.led, 0.9);
  } else if (kind === 'tram') {
    glow(pt(f, 0, z + 6), 14, LIGHT.warm, 0.7);
  } else if (kind === 'truck') {
    // amber roof marker lights + headlights
    glow(pt(f, -0.7, 14), 5, LIGHT.amber, 0.95); glow(pt(f, 0.7, 14), 5, LIGHT.amber, 0.95);
    glow(pt(f, 0, z), 14, LIGHT.head, 0.6);
  }
  glow(pt(-f, 0, z), 7, LIGHT.tail, 0.7);
}
// lit passenger windows (warm interior) for buses and trams
function litBand(pt, u0, u1, z0, z1) {
  if (!night()) return;
  const g = (u, z) => { const q = pt(u, 1.01, 0); return [q[0], q[1] - z]; };
  const L = [g(u0, z0), g(u1, z0), g(u1, z1), g(u0, z1)]; L.fill = '#ffe2a8'; lights.push(L);
}
// text painted flat on a vehicle side: a band from u0 to u1 at side v, between heights z0 and z1
function faceText(pt, u0, u1, v, z0, z1, text, bg, fg) {
  if (lod) return;
  let A = pt(u0, v, z0), B = pt(u1, v, z0);
  if (B[0] < A[0]) [A, B] = [B, A];
  const dx = B[0] - A[0], dy = B[1] - A[1], h = z1 - z0;
  if (dx < 5) return;
  ctx.save(); ctx.transform(1, dy / dx, 0, 1, A[0], A[1]);
  if (text === 'De Lijn') {
    // simple De Lijn-style badge: yellow tag with a black chevron and a black wordmark
    const w = Math.min(dx, h * 5.2), x0 = (dx - w) / 2;
    ctx.fillStyle = '#ffd400'; ctx.fillRect(x0, -h, w, h);
    ctx.fillStyle = '#111'; ctx.beginPath();
    ctx.moveTo(x0 + h * 0.25, -h * 0.85); ctx.lineTo(x0 + h * 0.75, -h * 0.5); ctx.lineTo(x0 + h * 0.25, -h * 0.15); ctx.lineTo(x0 + h * 0.45, -h * 0.5); ctx.closePath(); ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${h * 0.7}px Nunito, sans-serif`; ctx.fillText('De Lijn', x0 + h * 0.9, -h / 2 + 0.3, w - h * 1.1);
    ctx.restore(); return;
  }
  ctx.fillStyle = bg; ctx.fillRect(0, -h, dx, h);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const size = Math.min(h * 0.85, dx / 4.2);
  ctx.font = `800 ${size}px Nunito, sans-serif`; ctx.fillText(text, dx / 2, -h / 2 + 0.3);
  ctx.restore();
}
// Official city symbols, borrowed from Wikimedia Commons (public domain, see assets/symbols/CREDITS.txt).
const SYMBOLS = {};
for (const c of ['antwerpen', 'gent', 'brussel']) { const im = new Image(); im.src = `assets/symbols/${c}.svg`; SYMBOLS[c] = im; }
// city symbols on the billboards: the real coat of arms / flag once loaded, a simple drawing until then.
// Layout on a W2 x H2 panel: variant 0 = emblem in a square on the left, two centred lines of text on the right;
// variant 1 = two centred lines over the whole panel.
function billboardArt(city, v, W2, H2) {
  const PAD = 2, ES = H2 - PAD * 2;                       // emblem square
  const EX = PAD + 1, EY = -H2 + PAD;                     // its top-left corner
  const TX0 = EX + ES + 2, TX1 = W2 - PAD;                // text column
  const line = (t, cx, cy, size, col, maxW, weight = 800) => {
    ctx.fillStyle = col; ctx.font = `${weight} ${size}px Fredoka, Nunito, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, cx, cy, maxW);
  };
  const twoLines = (a, b, x0, x1, ca, cb, sa, sb) => {
    const cx = (x0 + x1) / 2, w = x1 - x0, mid = -H2 / 2;
    line(a, cx, mid - sb * 0.55, sa, ca, w);
    line(b, cx, mid + sa * 0.55, sb, cb, w, 700);
  };
  // draw fn in a unit square (0..1) mapped onto the emblem area
  const emblem = (fn) => { ctx.save(); ctx.translate(EX, EY); ctx.scale(ES, ES); fn(); ctx.restore(); };
  const R = (x, y, w, h) => ctx.fillRect(x, y, w, h);
  const C = {
    antwerpen: { bg: '#c8202f', fg: '#f6f5f1', sub: '#ffd7d7', name: 'ANTWERPEN', tag: "'t Stad" },
    gent: { bg: '#16171a', fg: '#f2f2ee', sub: '#e2b23a', name: 'GENT', tag: 'Stad van de leeuw' },
    brussel: { bg: '#1f4fa0', fg: '#f2c230', sub: '#ffffff', name: 'BRUSSEL', tag: 'BRUXELLES' },
    oasis: { bg: '#c98a3e', fg: '#fff6e4', sub: '#2f5f5a', name: 'OASIS BAY', tag: 'Pearl of the dunes' },
  }[city] || { bg: '#1f4fa0', fg: '#f2c230', sub: '#fff', name: '', tag: '' };

  if (v === 1) {
    // welcome board: flag stripes top and bottom, centred text
    ctx.fillStyle = city === 'gent' ? '#f2f2ee' : city === 'brussel' ? '#f2c230' : '#f6f5f1'; R(0, -H2, W2, H2);
    ctx.fillStyle = C.bg; R(0, -H2, W2, 4); R(0, -4, W2, 4);
    twoLines('WELKOM IN', C.name, PAD, W2 - PAD, '#3b2f2a', C.bg, 3.8, 5.6);
    return;
  }
  ctx.fillStyle = C.bg; R(0, -H2, W2, H2);
  // thin divider between emblem and text
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; R(TX0 - 1.2, -H2 + PAD + 1, 0.4, H2 - PAD * 2 - 2);
  const sym = SYMBOLS[city];
  if (sym && sym.complete && sym.naturalWidth) {
    // fit the real symbol inside the emblem square, on a light card so the colours stay true
    ctx.fillStyle = '#f7f4ec'; R(EX - 0.5, EY - 0.5, ES + 1, ES + 1);
    const k = Math.min((ES - 2) / sym.naturalWidth, (ES - 2) / sym.naturalHeight);
    const w = sym.naturalWidth * k, h = sym.naturalHeight * k;
    ctx.drawImage(sym, EX + (ES - w) / 2, EY + (ES - h) / 2, w, h);
    twoLines(C.name, C.tag, TX0, TX1, C.fg, C.sub, 5.4, 3.4);
    return;
  }
  emblem(() => {
    ctx.fillStyle = C.fg;
    if (city === 'antwerpen') {
      // silver castle with three towers, gate in red, two hands above
      R(0.14, 0.52, 0.72, 0.36);                                           // wall
      R(0.12, 0.34, 0.2, 0.2); R(0.4, 0.24, 0.2, 0.3); R(0.68, 0.34, 0.2, 0.2);   // towers
      for (const [x, y] of [[0.12, 0.3], [0.22, 0.3], [0.4, 0.2], [0.5, 0.2], [0.68, 0.3], [0.78, 0.3]]) R(x, y, 0.06, 0.05);  // battlements
      ctx.fillStyle = C.bg; R(0.44, 0.68, 0.12, 0.2); ctx.beginPath(); ctx.arc(0.5, 0.68, 0.06, Math.PI, 0); ctx.fill();
      R(0.18, 0.4, 0.06, 0.08); R(0.74, 0.4, 0.06, 0.08); R(0.47, 0.32, 0.06, 0.1);   // windows
      ctx.fillStyle = C.fg;
      for (const hx of [0.24, 0.76]) { ctx.beginPath(); ctx.ellipse(hx, 0.13, 0.07, 0.08, 0, 0, 7); ctx.fill(); R(hx - 0.07, 0.03, 0.14, 0.05); }
    } else if (city === 'gent') {
      // the crowned Ghent lion, rampant
      ctx.beginPath(); ctx.ellipse(0.45, 0.6, 0.18, 0.24, 0.15, 0, 7); ctx.fill();         // body
      ctx.beginPath(); ctx.arc(0.6, 0.3, 0.13, 0, 7); ctx.fill();                           // head
      R(0.32, 0.76, 0.08, 0.2); R(0.5, 0.76, 0.08, 0.2);                                   // hind legs
      R(0.6, 0.44, 0.26, 0.07); R(0.62, 0.56, 0.24, 0.07);                                 // raised paws
      ctx.strokeStyle = C.fg; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(0.3, 0.72); ctx.quadraticCurveTo(0.05, 0.55, 0.18, 0.28); ctx.stroke();  // tail
      ctx.fillStyle = C.sub; R(0.52, 0.12, 0.17, 0.06); for (const x of [0.52, 0.59, 0.65]) R(x, 0.07, 0.04, 0.06);   // crown
    } else {
      // the iris of the Brussels-Capital Region
      ctx.beginPath(); ctx.ellipse(0.5, 0.3, 0.1, 0.22, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.3, 0.52, 0.09, 0.2, -0.9, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.7, 0.52, 0.09, 0.2, 0.9, 0, 7); ctx.fill();
      R(0.26, 0.62, 0.48, 0.07); R(0.47, 0.66, 0.06, 0.3);
    }
  });
  twoLines(C.name, C.tag, TX0, TX1, C.fg, C.sub, 5.4, 3.4);
}
function glassBand(pt, u0, u1, z0, z1) {
  const g = (u) => pt(u, 1.01, 0);
  poly([[g(u0)[0], g(u0)[1] - z0], [g(u1)[0], g(u1)[1] - z0], [g(u1)[0], g(u1)[1] - z1], [g(u0)[0], g(u0)[1] - z1]], '#6f97b0', null);
}
// blue/red flashing lights for emergency vehicles
function beacons(pt, z, cols) {
  const on = Math.floor(time * 6) % 2;
  cols.forEach((c, k) => { const q = pt(-0.1 + k * 0.2, k ? 0.4 : -0.4, z); ctx.fillStyle = (k === on) ? c : '#3a3d42'; ctx.fillRect(q[0] - 1.2, q[1] - 1.2, 2.4, 1.8); if (k === on) lights.push({ glow: true, x: q[0], y: q[1], r: 9, col: c === '#2f6fff' ? '80,130,255' : '255,60,50', a: 0.8 }); });
}
const VEHICLES = {
  // a desert-tan main battle tank: tracks with turning road wheels and side skirts, angular hull,
  // a turret that slowly scans left and right, long barrel with a muzzle brake, commander's hatch, aerials, dust behind it
  tank(gx, gy, t) {
    const fwd = t.dir > 0 ? 1 : -1, pt = frameOf(gx, gy, t, 0.48, 0.27), p = toScreen(gx, gy), col = t.col, dk = shade(col, -0.32);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1.5, 15, 6.5, 0, 0, 7); ctx.fill();
    // tracks on both sides (far side first), with road wheels that turn as it drives
    for (const v of [-1, 1]) {
      poly([pt(-1.05, v, 0.3), pt(1.05, v, 0.3), pt(1.12, v, 2.4), pt(-1.12, v, 2.4)], v > 0 ? '#2b2a27' : '#22211f', null);
      if (v > 0) for (let k = 0; k < 6; k++) {
        const w = pt(-0.85 + k * 0.34, 1.02, 1.3);
        ctx.fillStyle = '#4a4740'; ctx.beginPath(); ctx.ellipse(w[0], w[1], 1.15, 0.9, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#2b2a27'; ctx.lineWidth = 0.3; const a = time * 5 * fwd + k; ctx.beginPath(); ctx.moveTo(w[0] + Math.cos(a) * 0.9, w[1] + Math.sin(a) * 0.7); ctx.lineTo(w[0] - Math.cos(a) * 0.9, w[1] - Math.sin(a) * 0.7); ctx.stroke();
      }
    }
    // track links ticking past along the top run
    ctx.strokeStyle = '#3a3833'; ctx.lineWidth = 0.35;
    for (let k = 0; k < 9; k++) { const u = -1 + ((k / 9 + time * 0.6 * fwd) % 1 + 1) % 1 * 2, a = pt(u, 1.02, 2.2), b = pt(u, 1.02, 2.6); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    // hull with sloped glacis at the front and side skirts
    vbox(pt, -1, 1, 2.4, 4.6, col);
    poly([pt(fwd * 0.75, -0.95, 4.6), pt(fwd * 1.12, -0.95, 3.2), pt(fwd * 1.12, 0.95, 3.2), pt(fwd * 0.75, 0.95, 4.6)], shade(col, 0.14));
    poly([pt(-1, 1.04, 2.6), pt(1, 1.04, 2.6), pt(1, 1.04, 4), pt(-1, 1.04, 4)], shade(col, -0.12), 'rgba(40,35,25,0.5)', 0.3);
    ctx.strokeStyle = dk; ctx.lineWidth = 0.3; for (let k = 1; k < 5; k++) { const a = pt(-1 + k * 0.4, 1.05, 2.6), b = pt(-1 + k * 0.4, 1.05, 4); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    // engine deck grilles and stowage boxes at the back
    for (let k = 0; k < 3; k++) { const g = pt(-fwd * (0.6 + k * 0.12), 0, 4.65); ctx.fillStyle = dk; ctx.fillRect(g[0] - 2, g[1] - 0.25, 4, 0.5); }
    // turret: slowly scans, flat angular shape, barrel with a muzzle brake and a fume extractor
    const scan = Math.sin(time * 0.4 + t.seed) * 0.6, tc = pt(-fwd * 0.08, 0, 4.6), TW = 7.5, TD = 3.4;
    const dirx = Math.cos(scan) * fwd, diry = Math.sin(scan);
    const ax = pt(dirx, diry, 0), o0 = pt(0, 0, 0), ux = ax[0] - o0[0], uy = ax[1] - o0[1], ul = Math.hypot(ux, uy) || 1;
    const bx = ux / ul, by = uy / ul;
    ctx.fillStyle = shade(col, -0.08); ctx.strokeStyle = 'rgba(40,35,25,0.55)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.ellipse(tc[0], tc[1] + 0.6, TW, TD, Math.atan2(by, bx) * 0.25, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(col, 0.06); ctx.beginPath(); ctx.ellipse(tc[0], tc[1] - 1.4, TW * 0.85, TD * 0.8, Math.atan2(by, bx) * 0.25, 0, 7); ctx.fill(); ctx.stroke();
    const mz = [tc[0] + bx * 22, tc[1] - 1.4 + by * 22];
    ctx.strokeStyle = shade(col, -0.18); ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tc[0] + bx * 5, tc[1] - 1.4 + by * 5); ctx.lineTo(mz[0], mz[1]); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = dk; const fe = [tc[0] + bx * 12, tc[1] - 1.4 + by * 12]; ctx.beginPath(); ctx.ellipse(fe[0], fe[1], 1.3, 1.1, 0, 0, 7); ctx.fill();     // fume extractor
    ctx.fillRect(mz[0] - 1, mz[1] - 1, 2, 2);                                                                                                         // muzzle brake
    // commander's hatch with a soldier, sights and aerials
    const hx = tc[0] - bx * 2 + by * 2, hy = tc[1] - 2.6 - bx * 0.8;
    ctx.fillStyle = dk; ctx.beginPath(); ctx.ellipse(hx, hy, 1.8, 1, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#b39b6a'; ctx.fillRect(hx - 0.9, hy - 2.4, 1.8, 2); ctx.fillStyle = '#e0b48a'; ctx.beginPath(); ctx.arc(hx, hy - 3.2, 0.9, 0, 7); ctx.fill();
    ctx.fillStyle = '#8d7a52'; ctx.beginPath(); ctx.arc(hx, hy - 3.5, 1.05, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#2f3a3f'; ctx.fillRect(tc[0] + bx * 3 - by * 2 - 0.8, tc[1] - 3.2, 1.6, 1);                                                      // gunner's sight
    ctx.strokeStyle = '#2b2b2a'; ctx.lineWidth = 0.35;
    for (const s2 of [-1, 1]) { const a0 = [tc[0] - bx * 5 + s2 * by * 3, tc[1] - 2 - s2 * bx], sw = Math.sin(time * 3 + t.seed + s2) * 1.2; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.quadraticCurveTo(a0[0] + sw * 0.4, a0[1] - 8, a0[0] + sw, a0[1] - 15); ctx.stroke(); }
    exhaust(pt, -fwd * 0.9, -0.6, 4.8, t, 0.18);
    // dust kicked up behind the tracks
    if (!ghost && Math.random() < 0.3) { const d = pt(-fwd * 1.15, (Math.random() - 0.5) * 2, 0.5); particles.push({ x: d[0], y: d[1], vx: -fwd * 0.3, vy: -0.25, life: 1, col: '#d2b98c', kind: 'puff', g: -0.002, r: 3 + Math.random() * 3 }); }
    if (night()) { for (const v of [-0.75, 0.75]) glow(pt(fwd * 1.1, v, 3.4), 10, LIGHT.head, 0.5); }
  },
  // wide boxy sand-coloured Humvee: chunky tyres with turning tread, sloped bonnet with grille slots, armoured doors,
  // roof hatch, jerrycans and a spare wheel at the back, swaying aerials, caged headlights and a little exhaust smoke
  humvee(gx, gy, t) {
    const fwd = t.dir > 0 ? 1 : -1, pt = frameOf(gx, gy, t, 0.38, 0.23), p = toScreen(gx, gy), col = t.col, dk = shade(col, -0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 12, 5.2, 0, 0, 7); ctx.fill();
    for (const u of [-0.64, 0.64]) {
      const w = pt(u, 1.06, 1.9);
      ctx.fillStyle = '#1b1c1e'; ctx.beginPath(); ctx.ellipse(w[0], w[1], 2.4, 1.9, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#2d2e31'; ctx.lineWidth = 0.4;
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + time * 3 * fwd; ctx.beginPath(); ctx.moveTo(w[0] + Math.cos(a) * 1.5, w[1] + Math.sin(a) * 1.2); ctx.lineTo(w[0] + Math.cos(a) * 2.3, w[1] + Math.sin(a) * 1.8); ctx.stroke(); }
      ctx.fillStyle = shade(col, -0.15); ctx.beginPath(); ctx.ellipse(w[0], w[1], 1.1, 0.85, 0, 0, 7); ctx.fill();
    }
    vbox(pt, -1, 1, 1.2, 5, col);
    poly([pt(fwd * 0.45, -1, 5), pt(fwd * 1, -1, 4.4), pt(fwd * 1, 1, 4.4), pt(fwd * 0.45, 1, 5)], shade(col, 0.12));
    ctx.fillStyle = dk; for (let k = 0; k < 5; k++) { const g = pt(fwd * 1.01, -0.6 + k * 0.3, 3.2); ctx.fillRect(g[0] - 0.15, g[1] - 0.8, 0.3, 1.6); }
    const cA = fwd > 0 ? -0.72 : -0.42, cB = fwd > 0 ? 0.42 : 0.72;
    vbox(pt, cA, cB, 5, 9.6, shade(col, -0.06));
    for (const u of [cA + 0.08, (cA + cB) / 2 + 0.04]) poly([pt(u, 1.01, 6.6), pt(u + 0.42, 1.01, 6.6), pt(u + 0.42, 1.01, 8.8), pt(u, 1.01, 8.8)], '#5f7784', null);
    ctx.strokeStyle = dk; ctx.lineWidth = 0.35;
    for (const u of [cA, (cA + cB) / 2, cB]) { const a = pt(u, 1.01, 1.4), c = pt(u, 1.01, 9.4); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
    poly([pt(fwd * 0.44, -0.8, 6.2), pt(fwd * 0.44, 0.8, 6.2), pt(fwd * 0.44, 0.8, 9.2), pt(fwd * 0.44, -0.8, 9.2)], '#6f8b98', null);
    const ws = pt(fwd * 0.44, 0, 6.2), wt = pt(fwd * 0.44, 0, 9.2); ctx.strokeStyle = dk; ctx.beginPath(); ctx.moveTo(ws[0], ws[1]); ctx.lineTo(wt[0], wt[1]); ctx.stroke();
    const hc = pt((cA + cB) / 2, 0, 9.7); ctx.fillStyle = dk; ctx.beginPath(); ctx.ellipse(hc[0], hc[1], 2.2, 1.1, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#8a7a52'; ctx.beginPath(); ctx.ellipse(hc[0], hc[1] - 0.4, 1.6, 0.7, 0, 0, 7); ctx.fill();
    for (const v of [-0.5, 0.1]) { const j = pt(-fwd * 0.82, v, 5); ctx.fillStyle = '#5b6b3a'; ctx.fillRect(j[0] - 0.9, j[1] - 2.2, 1.8, 2.2); ctx.fillStyle = '#3e4a27'; ctx.fillRect(j[0] - 0.3, j[1] - 2.6, 0.6, 0.5); }
    const sp = pt(-fwd * 1.03, 0.2, 3.6); ctx.fillStyle = '#1b1c1e'; ctx.beginPath(); ctx.arc(sp[0], sp[1], 2.1, 0, 7); ctx.fill(); ctx.fillStyle = shade(col, -0.15); ctx.beginPath(); ctx.arc(sp[0], sp[1], 0.9, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2b2b2a'; ctx.lineWidth = 0.35;
    for (const v of [-0.85, 0.85]) { const a = pt(-fwd * 0.9, v, 5), sway = Math.sin(time * 4 + t.seed + v) * 1.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(a[0] + sway * 0.4, a[1] - 7, a[0] + sway, a[1] - 13); ctx.stroke(); }
    for (const v of [-0.7, 0.7]) { const h = pt(fwd * 1.02, v, 4); ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(h[0], h[1], 0.75, 0, 7); ctx.fill(); ctx.strokeStyle = '#2b2b2a'; ctx.lineWidth = 0.25; ctx.strokeRect(h[0] - 0.9, h[1] - 0.9, 1.8, 1.8); }
    exhaust(pt, -fwd * 1.05, 0.8, 3, t, 0.12);
    if (night()) { for (const v of [-0.7, 0.7]) glow(pt(fwd, v, 4), 11, LIGHT.head, 0.6); glow(pt(-fwd, 0, 3.5), 5, LIGHT.tail, 0.7); }
  },
  // a donkey pulling a two-wheeled wooden cart: turning spoked wheel, plank sides, oranges and melons,
  // a driver with a headscarf, and a donkey with saddle cloth, pale belly and muzzle, mane, ears and a swishing tail
  cart(gx, gy, t) {
    const fwd = t.dir > 0 ? 1 : -1, pt = frameOf(gx, gy, t, 0.4, 0.15), p = toScreen(gx, gy), step = Math.sin(time * 9 + t.seed);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 10, 3.8, 0, 0, 7); ctx.fill();
    const cu0 = fwd > 0 ? -1 : 0.02, cu1 = fwd > 0 ? -0.02 : 1;
    vbox(pt, cu0, cu1, 2.4, 3.2, '#7a5230');
    ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 0.4;
    for (let k = 1; k < 4; k++) { const u = cu0 + (cu1 - cu0) * k / 4, a = pt(u, 1.01, 3.2), c = pt(u, 1.01, 5.4); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
    poly([pt(cu0, 1, 3.2), pt(cu1, 1, 3.2), pt(cu1, 1, 5.4), pt(cu0, 1, 5.4)], 'rgba(139,90,43,0.55)', '#5a3a1e', 0.4);
    for (let k = 0; k < 5; k++) { const q = pt(cu0 + 0.15 + k * 0.17, -0.3 + (k % 2) * 0.5, 5.6 + (k % 3) * 0.6); ctx.fillStyle = k % 3 === 2 ? '#6aa84f' : '#f29e4c'; ctx.beginPath(); ctx.arc(q[0], q[1], k % 3 === 2 ? 1.5 : 1.1, 0, 7); ctx.fill(); }
    const w = pt((cu0 + cu1) / 2, 1.08, 2.4); ctx.strokeStyle = '#4a2f18'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(w[0], w[1], 2.4, 0, 7); ctx.stroke();
    ctx.lineWidth = 0.35; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + time * 4 * fwd; ctx.beginPath(); ctx.moveTo(w[0], w[1]); ctx.lineTo(w[0] + Math.cos(a) * 2.3, w[1] + Math.sin(a) * 2.3); ctx.stroke(); }
    const dr = pt(fwd * 0.05, 0, 6.5); ctx.fillStyle = '#e8e2d2'; ctx.fillRect(dr[0] - 1.1, dr[1] - 1, 2.2, 3);
    ctx.fillStyle = '#c68c5e'; ctx.beginPath(); ctx.arc(dr[0], dr[1] - 2.2, 1.1, 0, 7); ctx.fill();
    ctx.fillStyle = '#d64545'; ctx.beginPath(); ctx.arc(dr[0], dr[1] - 2.6, 1.25, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 0.5;
    for (const v of [-0.5, 0.5]) { const a = pt(fwd * 0.02, v, 3.4), c = pt(fwd * 0.5, v, 4.6); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
    footDust(p.x + fwd * 6, p.y, 0.05); footDust(w[0], w[1] + 2.4, 0.04);
    const body = pt(fwd * 0.6, 0, 4.6), neck = pt(fwd * 0.85, 0, 6.2), hd = pt(fwd * 0.98, 0, 6.6), grey = '#8f8a84';
    ctx.strokeStyle = '#6e6a66'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
    for (const [u, s2] of [[0.42, 1], [0.48, -1], [0.74, -1], [0.8, 1]]) { const a = pt(fwd * u, 0, 3.6), c = pt(fwd * (u + 0.06 * step * s2), 0, 0.2); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); ctx.fillStyle = '#3a3330'; ctx.fillRect(c[0] - 0.4, c[1] - 0.3, 0.8, 0.5); }
    ctx.fillStyle = grey; ctx.beginPath(); ctx.ellipse(body[0], body[1], 4.2, 2.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#d8d2c6'; ctx.beginPath(); ctx.ellipse(body[0], body[1] + 1, 2.8, 1, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2f6fb0'; ctx.fillRect(body[0] - 1.6, body[1] - 2.2, 3.2, 1.8); ctx.fillStyle = '#f2c94c'; ctx.fillRect(body[0] - 1.6, body[1] - 0.6, 3.2, 0.3);
    ctx.strokeStyle = grey; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(body[0] + fwd * 2.8, body[1] - 0.8); ctx.lineTo(neck[0], neck[1]); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = grey; ctx.beginPath(); ctx.ellipse(hd[0], hd[1], 2, 1.3, fwd * 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#d8d2c6'; ctx.beginPath(); ctx.ellipse(hd[0] + fwd * 1.3, hd[1] + 0.4, 0.9, 0.7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#1e1f22'; ctx.beginPath(); ctx.arc(hd[0] + fwd * 0.3, hd[1] - 0.4, 0.3, 0, 7); ctx.fill();
    const ear = Math.sin(time * 2 + t.seed) * 0.4; ctx.fillStyle = grey;
    for (const e of [-0.5, 0.4]) { ctx.beginPath(); ctx.ellipse(hd[0] - fwd * 0.5 + e, hd[1] - 2.6, 0.45, 1.7, fwd * (0.3 + ear) + e * 0.3, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#4a4440'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(neck[0] - fwd * 1.6, neck[1] - 0.2); ctx.lineTo(hd[0] - fwd * 0.8, hd[1] - 1.1); ctx.stroke();
    const tl = pt(fwd * 0.33, 0, 5); ctx.beginPath(); ctx.moveTo(tl[0], tl[1]); ctx.quadraticCurveTo(tl[0] - fwd * 1.2, tl[1] + 1.5 + Math.sin(time * 5 + t.seed), tl[0] - fwd * 0.8, tl[1] + 3.2); ctx.stroke();
  },
  // goats ambling along the pavement: coat with patches and a shaggy fringe, beard, curved horn, floppy ear,
  // hooves, a perky tail, and now and then a stop to nibble the ground
  goat(gx, gy, t) {
    const fwd = t.dir > 0 ? 1 : -1, pt = frameOf(gx, gy, t, 0.22, 0.1), step = Math.sin(time * 8 + t.seed);
    const kind = Math.floor(t.seed) % 4, col = ['#f1ece2', '#8a6a4a', '#3a3330', '#d9c3a0'][kind], patch = ['#c9b59a', '#5a4430', '#1e1a18', '#a8875e'][kind];
    const graze = Math.sin(time * 1.3 + t.seed) > 0.7, b = pt(0, 0, 2.8), neck = pt(fwd * 0.6, 0, graze ? 2.4 : 3.6), hd = pt(fwd * 0.92, 0, graze ? 0.9 : 4.4);
    const p = toScreen(gx, gy); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 0.5, 3.4, 1.3, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = shade(col, -0.25); ctx.lineWidth = 0.6;
    for (const [u, s2] of [[-0.55, 1], [-0.4, -1], [0.4, -1], [0.55, 1]]) { const a = pt(u, 0, 2.2), c = pt(u + 0.13 * step * s2 * (graze ? 0 : 1), 0, 0.15); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); ctx.fillStyle = '#2b2622'; ctx.fillRect(c[0] - 0.3, c[1] - 0.25, 0.6, 0.4); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(b[0], b[1], 2.9, 1.65, 0, 0, 7); ctx.fill();
    ctx.fillStyle = patch; ctx.beginPath(); ctx.ellipse(b[0] - fwd * 0.8, b[1] - 0.3, 1.1, 0.8, 0.3, 0, 7); ctx.fill();
    ctx.strokeStyle = shade(col, -0.15); ctx.lineWidth = 0.3; for (let k = 0; k < 4; k++) { const sx = b[0] - 2 + k * 1.3; ctx.beginPath(); ctx.moveTo(sx, b[1] + 1.2); ctx.lineTo(sx + 0.3, b[1] + 1.9); ctx.stroke(); }
    ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(b[0] + fwd * 2, b[1] - 0.4); ctx.lineTo(neck[0], neck[1]); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(hd[0], hd[1], 1.3, 0.95, fwd * (graze ? 0.9 : 0.25), 0, 7); ctx.fill();
    ctx.fillStyle = '#1e1f22'; ctx.beginPath(); ctx.arc(hd[0] + fwd * 0.2, hd[1] - 0.25, 0.22, 0, 7); ctx.fill();
    ctx.strokeStyle = shade(col, -0.35); ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(hd[0] + fwd * 0.7, hd[1] + 0.6); ctx.lineTo(hd[0] + fwd * 0.6, hd[1] + 1.6); ctx.stroke();
    ctx.strokeStyle = '#6b5a48'; ctx.lineWidth = 0.55; ctx.beginPath(); ctx.moveTo(hd[0] - fwd * 0.1, hd[1] - 0.8); ctx.quadraticCurveTo(hd[0] - fwd * 1, hd[1] - 2.6, hd[0] - fwd * 1.6, hd[1] - 1.6); ctx.stroke();
    ctx.fillStyle = shade(col, -0.1); ctx.beginPath(); ctx.ellipse(hd[0] - fwd * 0.6, hd[1] + 0.1, 0.9, 0.35, fwd * -0.6, 0, 7); ctx.fill();
    const tl = pt(-fwd * 1, 0, 3.6); ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(tl[0], tl[1]); ctx.lineTo(tl[0] - fwd * 0.5, tl[1] - 1.2 - Math.abs(step) * 0.4); ctx.stroke();
    if (!graze) footDust(p.x, p.y, 0.03);
    if (graze && Math.random() < 0.02) particles.push({ x: hd[0], y: hd[1], vx: (Math.random() - 0.5) * 0.4, vy: -0.2, life: 0.5, col: '#9db36a', kind: 'dot', g: 0.02 });
  },
  // a two-man foot patrol of the (made-up) Oasis Bay guard, drawn in detail:
  // boots, knee pads, camo trousers, plate carrier with pouches, gloves, slung rifle,
  // helmet with goggles and a radio antenna
  patrol(gx, gy, t) {
    const pt = frameOf(gx, gy, t, 0.22, 0.12), fwd = t.dir > 0 ? 1 : -1;
    const CAMO = ['#b9a173', '#a38a5c', '#c8b488'], DARK = '#5b5240', SKIN = ['#e0b48a', '#c68c5e', '#8d5a3b'];
    for (const [u, k] of [[-0.7, 0], [0.7, 1]]) {
      const ph = time * 7 + t.seed + k * 1.7, step = Math.sin(ph), bob = Math.abs(Math.cos(ph)) * 0.4;
      const foot = pt(u, 0, 0), hip = pt(u, 0, 6 + bob), sh = pt(u, 0, 10.6 + bob), head = pt(u, 0, 12.8 + bob);
      const skin = SKIN[(Math.floor(t.seed * 3) + k) % 3];
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.ellipse(foot[0], foot[1] + 0.4, 2.6, 1, 0, 0, 7); ctx.fill();
      footDust(foot[0], foot[1], 0.02);
      // legs: trousers, knee pads, boots (back leg first, darker)
      for (const [s2, shadeK] of [[-1, -0.18], [1, 0]]) {
        const fx = foot[0] + step * 1.6 * s2, kx = (hip[0] + fx) / 2 + 0.3 * s2, ky = (hip[1] + foot[1]) / 2;
        ctx.strokeStyle = shade(CAMO[1], shadeK); ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(kx, ky); ctx.lineTo(fx, foot[1] - 0.9); ctx.stroke();
        ctx.fillStyle = '#4b4636'; ctx.beginPath(); ctx.arc(kx, ky, 0.65, 0, 7); ctx.fill();                       // knee pad
        ctx.fillStyle = '#5a4630'; ctx.fillRect(fx - 0.9 + fwd * 0.3, foot[1] - 1.2, 1.9, 1.2);                   // boot
      }
      ctx.lineCap = 'butt';
      // torso: camo shirt, then the plate carrier with three magazine pouches and a belt
      ctx.fillStyle = CAMO[0]; ctx.fillRect(sh[0] - 1.8, sh[1], 3.6, hip[1] - sh[1]);
      ctx.fillStyle = CAMO[2]; ctx.fillRect(sh[0] - 1.8, sh[1] + 1.2, 1.2, 1.4); ctx.fillStyle = CAMO[1]; ctx.fillRect(sh[0] + 0.4, sh[1] + 2.6, 1.3, 1.2);   // camo blotches
      ctx.fillStyle = '#7a6d4e'; ctx.fillRect(sh[0] - 1.6, sh[1] + 0.5, 3.2, 3.3);                               // vest
      ctx.fillStyle = '#665a3f'; for (let m = 0; m < 3; m++) ctx.fillRect(sh[0] - 1.45 + m * 1.05, sh[1] + 2.4, 0.85, 1.3);   // pouches
      ctx.fillStyle = '#3e3829'; ctx.fillRect(sh[0] - 1.8, hip[1] - 0.6, 3.6, 0.6);                                // belt
      ctx.fillStyle = '#c9b06a'; ctx.fillRect(sh[0] + 0.5, sh[1] + 0.8, 0.8, 0.6);                                // shoulder patch
      // slung rifle across the chest, muzzle pointing down
      ctx.strokeStyle = '#2b2b2a'; ctx.lineWidth = 0.75; ctx.beginPath(); ctx.moveTo(sh[0] - 2.2, sh[1] + 0.6); ctx.lineTo(sh[0] + 1.6, hip[1] + 0.6); ctx.stroke();
      ctx.fillStyle = '#2b2b2a'; ctx.fillRect(sh[0] - 0.4, sh[1] + 2.2, 0.9, 1.4);
      // arms: both hands on the slung rifle (gloved), swaying a little with each step
      const sway = step * 0.25;
      ctx.strokeStyle = CAMO[0]; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sh[0] - 1.7, sh[1] + 0.6); ctx.lineTo(sh[0] - 1.2 + sway, sh[1] + 3.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sh[0] + 1.7, sh[1] + 0.6); ctx.lineTo(sh[0] + 0.9 + sway, sh[1] + 2.4); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#3e3829'; ctx.beginPath(); ctx.arc(sh[0] - 1.2 + sway, sh[1] + 3.3, 0.55, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(sh[0] + 0.9 + sway, sh[1] + 2.5, 0.55, 0, 7); ctx.fill();
      // head: face, helmet with cover, goggles on the brim and a radio antenna
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(head[0], head[1], 1.45, 0, 7); ctx.fill();
      ctx.fillStyle = CAMO[1]; ctx.beginPath(); ctx.arc(head[0], head[1] - 0.3, 1.75, Math.PI, 0); ctx.fill(); ctx.fillRect(head[0] - 1.9, head[1] - 0.45, 3.8, 0.5);
      ctx.fillStyle = '#2f3a3f'; ctx.fillRect(head[0] - 1.2, head[1] - 1.7, 2.4, 0.6);                             // goggles
      ctx.fillStyle = '#7fb3c8'; ctx.fillRect(head[0] - 1, head[1] - 1.6, 0.8, 0.4); ctx.fillRect(head[0] + 0.2, head[1] - 1.6, 0.8, 0.4);
      ctx.strokeStyle = '#2b2b2a'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(sh[0] - 1.4, sh[1] + 0.4); ctx.lineTo(sh[0] - 2.2, sh[1] - 4.5); ctx.stroke();   // antenna
    }
  },
  taxi(gx, gy, t) {
    car(gx, gy, t);
    const pt = frameOf(gx, gy, t, CAR_MODEL[0].hl, CAR_MODEL[0].f);
    const q = pt(0, 0, CAR_MODEL[0].roof + 2.5);
    ctx.fillStyle = '#f2c94c'; ctx.fillRect(q[0] - 3, q[1] - 1.5, 6, 2.6);
    ctx.fillStyle = '#1e1f22'; ctx.font = '800 2.2px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TAXI', q[0], q[1] - 0.2);
  },
  police(gx, gy, t) {
    car(gx, gy, t);
    const pt = frameOf(gx, gy, t, CAR_MODEL[0].hl, CAR_MODEL[0].f);
    poly([pt(-1, 1.01, 2), pt(1, 1.01, 2), pt(1, 1.01, 3.4), pt(-1, 1.01, 3.4)], '#2f4fa8', null);
    beacons(pt, CAR_MODEL[0].roof + 1, ['#2f6fff', '#2f6fff']);
  },
  ambulance(gx, gy, t) {
    const pt = frameOf(gx, gy, t, 0.4, 0.19);
    vbox(pt, -1, 1, 0.8, 11, t.col);
    poly([pt(-1, 1.01, 3), pt(1, 1.01, 3), pt(1, 1.01, 4.6), pt(-1, 1.01, 4.6)], '#2e8b4a', null);
    const c = pt(-0.2, 1.02, 7.5); ctx.fillStyle = '#2e8b4a'; ctx.fillRect(c[0] - 0.8, c[1] - 2.4, 1.6, 4.8); ctx.fillRect(c[0] - 2.4, c[1] - 0.8, 4.8, 1.6);
    beacons(pt, 11.5, ['#2f6fff', '#2f6fff']);
    headlight(pt, t, 4);
  },
  fire(gx, gy, t) {
    const pt = frameOf(gx, gy, t, 0.6, 0.2);
    const f = t.dir > 0 ? 1 : -1;
    vbox(pt, -1, 1, 1, 10, t.col);
    vbox(pt, f > 0 ? 0.5 : -1, f > 0 ? 1 : -0.5, 10, 14, t.col);
    // ladder on the roof
    ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 0.6;
    for (const v of [-0.4, 0.4]) { const a = pt(-0.9, v, 11), b = pt(0.45 * f, v, 11); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    for (let k = 0; k < 7; k++) { const u = -0.9 + k * 0.2; const a = pt(u, -0.4, 11), b = pt(u, 0.4, 11); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    poly([pt(-1, 1.01, 3), pt(1, 1.01, 3), pt(1, 1.01, 4.2), pt(-1, 1.01, 4.2)], '#f4f2ec', null);
    beacons(pt, 14.5, ['#2f6fff', '#2f6fff']);
    headlight(pt, t, 4, 'truck');
  },
  moto(gx, gy, t) {
    const raw = frameOf(gx, gy, t, 0.16, 0.03), fw = t.dir > 0 ? 1 : -1, pt = (u, v, z) => raw(u * fw, v, z);
    ctx.fillStyle = '#1e1f22';
    for (const u of [-1, 1]) { const w = pt(u, 0, 2.2); ctx.beginPath(); ctx.ellipse(w[0], w[1], 2.4, 2, 0, 0, 7); ctx.fill(); }
    const a = pt(-0.7, 0, 4), b = pt(0.7, 0, 5.5);
    ctx.strokeStyle = t.col; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    const hip = pt(-0.2, 0, 7), sh = pt(0.35, 0, 11);
    ctx.strokeStyle = '#2b2b30'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(sh[0], sh[1]); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = t.col; ctx.beginPath(); ctx.arc(sh[0] + 0.6, sh[1] - 2.4, 2.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#9fc3d6'; ctx.fillRect(sh[0] + (fw > 0 ? 0.8 : -1.8), sh[1] - 3, 1.2, 1);
    if (night()) glow(pt(1, 0, 5), 8, LIGHT.head, 0.7);
  },
  bus(gx, gy, t) {
    const pt = frameOf(gx, gy, t, 0.62, 0.2);
    vbox(pt, -1, 1, 1.5, 13, t.col);
    glassBand(pt, -0.92, 0.92, 7, 11.5); litBand(pt, -0.92, 0.92, 7, 11.5);
    poly([pt(0.97, -0.8, 7), pt(0.97, 0.8, 7), pt(0.97, 0.8, 11.5), pt(0.97, -0.8, 11.5)], '#6f97b0', null);
    faceText(pt, -0.8, 0.8, 1.02, 1.8, 7, 'De Lijn', '#f6f5f1', '#1e1f22');
    headlight(pt, t, 4, 'bus');
  },
  tram(gx, gy, t) {
    const pt = frameOf(gx, gy, t, 0.95, 0.19);
    // two articulated sections with a coloured stripe and a pantograph
    vbox(pt, -1, -0.03, 1, 12, t.col);
    vbox(pt, 0.03, 1, 1, 12, t.col);
    const stripe = '#f2c230';
    poly([pt(-1, 1.01, 3), pt(1, 1.01, 3), pt(1, 1.01, 5), pt(-1, 1.01, 5)], stripe, null);
    glassBand(pt, -0.94, -0.08, 6.5, 10.5); glassBand(pt, 0.08, 0.94, 6.5, 10.5); litBand(pt, -0.94, -0.08, 6.5, 10.5); litBand(pt, 0.08, 0.94, 6.5, 10.5);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
    const a = pt(-0.2, 0, 12), b = pt(0, 0, 20), c = pt(0.2, 0, 12);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
    faceText(pt, -0.92, -0.12, 1.02, 1.2, 6.2, 'De Lijn', '#f2c230', '#1e1f22');
    faceText(pt, 0.12, 0.92, 1.02, 1.2, 6.2, 'De Lijn', '#f2c230', '#1e1f22');
    headlight(pt, t, 4, 'tram');
  },
  truck(gx, gy, t) {
    const pt = frameOf(gx, gy, t, 0.5, 0.19);
    const front = t.dir > 0 ? 1 : -1;
    // cargo box + cab at the front
    if (front > 0) { vbox(pt, -1, 0.35, 1.5, 14, t.col); vbox(pt, 0.42, 1, 1.5, 10, '#d94f45'); }
    else { vbox(pt, -1, -0.42, 1.5, 10, '#d94f45'); vbox(pt, -0.35, 1, 1.5, 14, t.col); }
    const w0 = front > 0 ? 0.48 : -0.95, w1 = front > 0 ? 0.95 : -0.48;
    glassBand(pt, w0, w1, 5.5, 9);
    exhaust(pt, front * 0.38, -0.8, 12, t, 0.12);
    headlight(pt, t, 4, 'truck');
  },
  bike(gx, gy, t) {
    // u = +1 is always the front wheel, in the direction of travel
    const raw = frameOf(gx, gy, t, 0.12, 0.02), fw = t.dir > 0 ? 1 : -1;
    const pt = (u, v, z) => raw(u * fw, v, z);
    const pedal = Math.sin(time * 9 + t.seed);
    const r = pt(-1, 0, 2.5), f2 = pt(1, 0, 2.5);
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(r[0], r[1], 2.6, 2.2, 0, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(f2[0], f2[1], 2.6, 2.2, 0, 0, 7); ctx.stroke();
    const seat = pt(-0.2, 0, 6), bar = pt(t.variant === 2 ? 0.9 : 0.7, 0, t.variant === 2 ? 6.5 : 7.5);
    if (t.variant === 1) { ctx.lineWidth = 1.6; const bt = pt(-0.45, 0, 4.2); ctx.fillStyle = '#3a3d42'; ctx.fillRect(bt[0] - 1.6, bt[1] - 1, 3.2, 2); }   // e-bike battery
    ctx.beginPath(); ctx.moveTo(r[0], r[1]); ctx.lineTo(seat[0], seat[1]); ctx.lineTo(bar[0], bar[1]); ctx.lineTo(f2[0], f2[1]); ctx.stroke();
    // rider: legs pedalling, body, head
    const hip = pt(-0.15, 0, 7), knee = pt(0.25, 0, 5 + pedal * 1.5);
    ctx.strokeStyle = '#2e3a55'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(knee[0], knee[1]); ctx.stroke();
    const sh = t.variant === 2 ? pt(0.55, 0, 10.5) : pt(0.25, 0, 12);   // racing cyclists lean forward
    ctx.strokeStyle = t.col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(sh[0], sh[1]); ctx.stroke();
    ctx.fillStyle = '#e8c4a0'; ctx.beginPath(); ctx.arc(sh[0] + 0.5, sh[1] - 2.5, 2, 0, 7); ctx.fill();
    // helmet
    ctx.fillStyle = ['#e05a5a', '#2f6fb0', '#f2c94c', '#3fa77c', '#1e1f22'][Math.floor(t.seed * 10) % 5];
    ctx.beginPath(); ctx.arc(sh[0] + 0.5, sh[1] - 2.9, 2.3, Math.PI, 0); ctx.closePath(); ctx.fill();
    if (night()) { glow(pt(t.dir > 0 ? 1 : -1, 0, 4), 5, LIGHT.head, 0.8); glow(pt(t.dir > 0 ? -1 : 1, 0, 4), 3, LIGHT.tail, 0.9); }
  },
};

const BOAT_HULLS = ['#2f4f7a', '#8b1e22', '#1e1f22', '#3d6b4f', '#f1f1ee'];
function boat(pose, b) {
  const bob = Math.sin(time * 2 + b.lane * 3) * 1;
  const pt = frameAng(pose, 0.42, 0.17, WD - bob);
  const hull = BOAT_HULLS[b.lane % BOAT_HULLS.length];
  // wake trailing behind the stern
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.1;
  for (const v of [-1, 1]) { const A = pt(-1, v * 0.7, 0), B = pt(-2.2, v * 1.6, 0); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); }
  // pointed hull: bow at u = +1
  const deck = [[-1, -1], [0.45, -1], [1, 0], [0.45, 1], [-1, 1]];
  const mid = pt(0, 0, 0);
  for (let k = 0; k < deck.length; k++) {
    const [ua, va] = deck[k], [ub, vb] = deck[(k + 1) % deck.length];
    const A = pt(ua, va, 0), B = pt(ub, vb, 0);
    if ((A[1] + B[1]) / 2 - mid[1] < 0) continue;
    poly([pt(ua, va, 0), pt(ub, vb, 0), pt(ub, vb, 5), pt(ua, va, 5)], shade(hull, (A[0] + B[0]) / 2 > mid[0] ? -0.05 : -0.2));
  }
  poly(deck.map(([u, v]) => pt(u, v, 5)), '#d9cbb0');
  // wheelhouse towards the stern, with windows facing forward
  obox(pt, -0.75, -0.15, 5, 11, '#f4f2ec', 0.7);
  poly([pt(-0.16, -0.5, 7), pt(-0.16, 0.5, 7), pt(-0.16, 0.5, 10), pt(-0.16, -0.5, 10)], '#6f97b0', null);
  // mast with a little flag
  const m0 = pt(-0.45, 0, 11), m1 = pt(-0.45, 0, 19);
  ctx.strokeStyle = '#3a3d42'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.stroke();
  ctx.fillStyle = '#f2c94c'; ctx.fillRect(m1[0], m1[1], 3, 2);
  if (mapInfo().fishing) {
    // fishing gear: a boom off the mast with a net trailing behind and a few gulls following
    const tip = pt(-1.6, 0.9, 6), net0 = pt(-2.2, 0.9, 0), net1 = pt(-2.6, -0.4, 0);
    ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(m1[0], m1[1] + 3); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(70,60,50,0.55)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(net0[0], net0[1]); ctx.lineTo(net1[0], net1[1]); ctx.closePath(); ctx.stroke();
    for (let k = 0; k < 4; k++) { const a = pt(-1.6 - k * 0.25, 0.9 - k * 0.32, 6 - k * 1.5), c = pt(-2.2 - k * 0.1, 0.9 - k * 0.32, 0); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
    const g = pt(-2, 0, 22 + Math.sin(time * 3 + b.lane) * 3);
    ctx.strokeStyle = '#f4f2ec'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(g[0] - 2.5, g[1]); ctx.quadraticCurveTo(g[0] - 1, g[1] - 1.5, g[0], g[1]); ctx.quadraticCurveTo(g[0] + 1, g[1] - 1.5, g[0] + 2.5, g[1]); ctx.stroke();
  }
  if (night()) { glow(pt(1, 0, 6), 5, '235,242,255', 0.8); glow(m1, 4, '255,60,50', 0.9); }
}

// ---------- buildings ----------
// draw fn with every height multiplied by TALL (footprint unchanged); fixes up night lights too
function tall(p, fn, k = 1, T = TALL) {
  // k scales the whole building (footprint and height) for landmarks that span k x k tiles
  const n0 = lights.length;
  ctx.save();
  ctx.translate(p.x, p.y); ctx.scale(k, T * k); ctx.translate(-p.x, -p.y);
  HH = HH0 / T;
  try { fn(); } finally { HH = HH0; ctx.restore(); }
  const X = (x) => p.x + (x - p.x) * k, Y = (y) => p.y + (y - p.y) * T * k;
  for (let i = n0; i < lights.length; i++) {
    const L = lights[i];
    if (L.glow) { L.x = X(L.x); L.y = Y(L.y); L.r *= k; } else for (const q of L) { q[0] = X(q[0]); q[1] = Y(q[1]); }
  }
}
// style -> number of look-alike variants kept as sprites

// ---------- desert tone: on desert maps every building except the glass skyscrapers is painted in beige ----------
// While a building draws, colours set on the canvas are mapped to a sand/beige tone of the same brightness.
// Glass (clearly blue) and see-through shading are left alone.
const NO_BEIGE = new Set(['sky', 'office', 'flag', 'billboard', 'crane', 'containers', 'solar', 'wind', 'lamp', 'mountain']);
let beigeOn = false;
const beigeCache = new Map();
function toBeige(v) {
  let out = beigeCache.get(v); if (out) return out;
  out = v;
  let r, g, b, a = 1, m;
  if ((m = /^#([0-9a-f]{6})$/i.exec(v))) { const n = parseInt(m[1], 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
  else if ((m = /^#([0-9a-f]{3})$/i.exec(v))) { r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16); }
  else if ((m = /^rgba?\(([^)]+)\)$/i.exec(v))) { const q = m[1].split(',').map(Number); [r, g, b] = q; if (q.length > 3) a = q[3]; }
  if (r != null && a > 0.6 && !(b > r + 18 && b >= g)) {
    const L = (0.3 * r + 0.59 * g + 0.11 * b) / 255;                 // keep how light or dark it was
    const k = 0.35 + L * 0.75;
    const R = Math.min(255, Math.round(232 * k)), G = Math.min(255, Math.round(208 * k)), B = Math.min(255, Math.round(166 * k));
    out = a < 1 ? `rgba(${R},${G},${B},${a})` : `rgb(${R},${G},${B})`;
  }
  beigeCache.set(v, out);
  return out;
}
{
  const proto = CanvasRenderingContext2D.prototype, d = Object.getOwnPropertyDescriptor(proto, 'fillStyle');
  Object.defineProperty(proto, 'fillStyle', { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, beigeOn && typeof v === 'string' ? toBeige(v) : v); } });
  // walls are painted with gradients, so their colour stops get the same treatment
  const add = CanvasGradient.prototype.addColorStop;
  CanvasGradient.prototype.addColorStop = function (o, c) { return add.call(this, o, beigeOn && typeof c === 'string' ? toBeige(c) : c); };
}
const beigeFor = (def) => !!mapInfo().desert && !NO_BEIGE.has(def.style);
const SPRITE_STYLES = { row: 24, flat: 12, apt: 12, office: 10, villa: 10, industry: 8 };
const BG_TALL = 1.05;   // ordinary buildings: (almost) true height
const SPR_W = 90, SPR_H = 230, SPR_OX = 45, SPR_OY = 210, SPR_RES = 3;
const spriteCache = new Map();
function buildingSprite(def, variant) {
  const key = def.style + variant + (beigeFor(def) ? ':beige' : '');
  let sp = spriteCache.get(key);
  if (sp) return sp;
  const c = document.createElement('canvas'); c.width = SPR_W * SPR_RES; c.height = SPR_H * SPR_RES;
  const g = boundsTracker(c.getContext('2d'));
  const main = ctx, n0 = lights.length, wasLod = lod, wasGhost = ghost;
  ctx = g; lod = false; ghost = false;
  try {
    g.setTransform(SPR_RES, 0, 0, SPR_RES, SPR_OX * SPR_RES, SPR_OY * SPR_RES);
    const p = { x: 0, y: 0 };
    // draw with lit = true so the lit windows are recorded (relative to the base point); the picture itself shows them unlit
    beigeOn = beigeFor(def);
    tall(p, () => STYLES[def.style](0, 0, def, variant, true, { i: -1, id: variant }), 1, BG_TALL);
  } finally { ctx = main; lod = wasLod; ghost = wasGhost; beigeOn = false; }
  const rec = lights.splice(n0);
  // remember the painted part, so baked copies of this picture can be cropped tight
  const B = g.bounds;
  if (!B.bad && B.x0 < B.x1) c.crop = { x0: Math.max(0, B.x0 - 3), y0: Math.max(0, B.y0 - 3), x1: Math.min(c.width, B.x1 + 3), y1: Math.min(c.height, B.y1 + 3) };
  sp = { canvas: c, lights: rec };
  spriteCache.set(key, sp);
  return sp;
}
function drawBuilding(b) { drawBuildingBody(b); drawBadges(b); }
// seconds since the building was placed (it pops up during the first half second)
function buildingAge(b) {
  if (!b.born || b.born > performance.now()) b.born = performance.now() - 5000;
  return (performance.now() - b.born) / 1000;
}
// the building itself: everything that can be baked into a cached picture
function drawBuildingBody(b) {
  const def = BUILDINGS[b.type], k = b.size || 1;
  const p = toScreen(b.x + k / 2, b.y + k / 2);
  const age = buildingAge(b);
  const pop = age < 0.5 ? Math.sin(Math.min(1, age / 0.5) * Math.PI * 0.5) * (1 + 0.15 * Math.sin(age * 12) * (1 - age * 2)) : 1;
  const lit = nightFactor(S.hour) > 0.2 && efficiency(b) > 0;
  const seed = hash(b.id);
  ctx.save();
  ctx.translate(p.x, p.y); ctx.scale(1, pop); ctx.translate(-p.x, -p.y);
  // soft shadow + lot (drawn before the tall stretch)
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, HW * 0.55, HH * 0.55, 0, 0, 7); ctx.fill();
  if (ui.selected === b.i) poly([[p.x, p.y - HH * k], [p.x + HW * k, p.y], [p.x, p.y + HH * k], [p.x - HW * k, p.y]], 'rgba(255,255,255,0.5)', '#3b2f2a', 2);
  const S2 = STYLES[def.style] || STYLES.gable;
  const beige = beigeFor(def);
  if (SPRITE_STYLES[def.style] && k === 1 && pop === 1) {
    // static background buildings come from a pre-drawn picture (with their lit windows remembered)
    const sp = buildingSprite(def, seed % SPRITE_STYLES[def.style]);
    ctx.drawImage(sp.canvas, p.x - SPR_OX, p.y - SPR_OY, SPR_W, SPR_H);
    if (lit) for (const L of sp.lights) lights.push(L.glow ? { ...L, x: L.x + p.x, y: L.y + p.y } : Object.assign(L.map(([x, y]) => [x + p.x, y + p.y]), { fill: L.fill }));
  } else { beigeOn = beige; try { tall(p, () => { S2(p.x, p.y, def, seed, lit, b); if (k > 1 && DETAIL[def.style]) DETAIL[def.style](p.x, p.y, def, seed, lit, b); }, k); } finally { beigeOn = false; } }
  ctx.restore();
}
// status badges above a building (animated, always drawn live)
function drawBadges(b) {
  const def = BUILDINGS[b.type], k = b.size || 1;
  const p = toScreen(b.x + k / 2, b.y + k / 2);
  if (b.wreck) return;                    // collapsing buildings get no status badges
  if (b.damaged) {
    // scorched and smoking until somebody repairs it
    ctx.fillStyle = 'rgba(40,30,25,0.28)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, HW * 0.6 * k, HH * 0.6 * k, 0, 0, 7); ctx.fill();
    if (!ghost && Math.random() < 0.1) particles.push({ x: p.x + (Math.random() - 0.5) * 16 * k, y: p.y - 30 - Math.random() * 20, vx: 0.2, vy: -0.6, life: 1.4, col: '#6b6560', kind: 'puff', g: -0.004, r: 5 });
    const bounce = Math.abs(Math.sin(time * 3)) * 4;
    ctx.fillStyle = '#f2c94c'; ctx.strokeStyle = '#2a221c'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y - 70 * Math.min(1.5, k) - bounce, 11, 0, 7); ctx.fill(); ctx.stroke();
    ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔧', p.x, p.y - 70 * Math.min(1.5, k) - bounce);
    return;
  }
  if (b.incident) {
    const bounce = Math.abs(Math.sin(time * 4)) * 6;
    ctx.fillStyle = '#e05a5a'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y - 95 - bounce, 13, 0, 7); ctx.fill(); ctx.stroke();
    ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText('!', p.x, p.y - 95 - bounce);
    if (Math.random() < 0.2) (ghost ? [] : particles).push({ x: p.x + (Math.random() - 0.5) * 20, y: p.y - 30, vx: 0, vy: -0.6, life: 0.8, col: '#555', kind: 'puff', g: -0.005, r: 5 });
  } else if (D.unpowered.has(b.i)) {
    // switched off: a blinking "no power" badge
    ctx.font = '15px sans-serif'; ctx.textAlign = 'center';
    ctx.globalAlpha = 0.55 + Math.sin(time * 5) * 0.4; ctx.fillText('🔌', p.x + 18, p.y - 34); ctx.globalAlpha = 1;
  } else if (!D.covered.has(b.i) && def.kind !== 'net' && def.kind !== 'fun' && def.kind !== 'pow') {
    ctx.font = def.needsNet ? '15px sans-serif' : '13px sans-serif'; ctx.textAlign = 'center';
    ctx.globalAlpha = (def.needsNet ? 0.55 : 0.6) + Math.sin(time * (def.needsNet ? 5 : 3)) * (def.needsNet ? 0.4 : 0.3); ctx.fillText('📵', p.x + 18, p.y - 30); ctx.globalAlpha = 1;
  }
}

const STYLES = {
  // a big rocky desert mountain: drawn on one tile and scaled up by tall() to cover the whole k x k footprint
  mountain(x, y, def, seed) {
    const W = HW * 0.98, D = HH * 0.98, H = 70 + (seed % 3) * 12;
    const L = '#b0744a', R = '#8e5a37', T = '#c98e5e';
    // two peaks: the tall one at the back, a smaller shoulder in front
    const peak = (cx, h, w, col1, col2) => {
      poly([[cx - w, y], [cx - w * 0.3, y - h * 0.55], [cx, y - h], [cx, y + D * 0.2]], col1, 'rgba(60,35,20,0.45)', 0.8);
      poly([[cx, y - h], [cx + w * 0.35, y - h * 0.6], [cx + w, y], [cx, y + D * 0.2]], col2, 'rgba(60,35,20,0.45)', 0.8);
      // strata lines and a pale dusty cap
      ctx.strokeStyle = 'rgba(70,40,20,0.35)'; ctx.lineWidth = 0.6;
      for (let k = 1; k < 4; k++) { const z = y - h * k / 4; ctx.beginPath(); ctx.moveTo(cx - w * (1 - k / 4) * 0.9, z + 2); ctx.lineTo(cx + w * (1 - k / 4) * 0.9, z + 3); ctx.stroke(); }
      poly([[cx - w * 0.16, y - h * 0.82], [cx, y - h], [cx + w * 0.18, y - h * 0.8], [cx, y - h * 0.86]], '#ead2a8', null);
    };
    poly([[x - W, y], [x, y - D], [x + W, y], [x, y + D]], '#c49766', null);       // rocky foot
    peak(x + W * 0.2, H, W * 0.85, L, R);
    peak(x - W * 0.35, H * 0.55, W * 0.6, T, L);
    // boulders round the base
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + seed, bx = x + Math.cos(a) * W * 0.8, by = y + Math.sin(a) * D * 0.7; ctx.fillStyle = k % 2 ? R : L; ctx.beginPath(); ctx.ellipse(bx, by, 3, 2, 0, 0, 7); ctx.fill(); }
  },
  gable(x, y, def, seed, lit) {
    const col = PASTELS[seed % PASTELS.length], f = 0.55, h = 24 + (seed % 3) * 6;
    const B = box(x, y, f, 0, h, col);
    // stepped gable roof (Antwerp)
    const rh = 18;
    const mL = [(B.t[0] + B.l[0]) / 2, (B.t[1] + B.l[1]) / 2 - rh], mR = [(B.r[0] + B.b[0]) / 2, (B.r[1] + B.b[1]) / 2 - rh];
    // chimney on the back slope goes first
    box(x - 6, y - 5, 0.07, h, rh + 6, '#8e4a36');
    poly([B.t, B.r, mR, mL], '#a9483a');
    poly([B.l, B.b, mR, mL], '#c45a43');
    // roof tile courses
    ctx.strokeStyle = 'rgba(70,25,15,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath();
    for (let i = 1; i < 5; i++) { const k = i / 5, P = lerp(B.l, mL, k), Q = lerp(B.b, mR, k); ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); }
    ctx.stroke();
    stepped(B, rh, shade(col, -0.05));
    for (let r = 0; r < h / 12 - 0.5; r++) { winR(x, y, f, 0, 0.18, 0.22, 5 + r * 11, 7, lit && (seed >> r) & 1); winR(x, y, f, 0, 0.6, 0.22, 5 + r * 11, 7, lit && (seed >> (r + 3)) & 1); winL(x, y, f, 0, 0.35, 0.3, 5 + r * 11, 7, lit && (seed >> (r + 5)) & 1); }
    // front door
    const du = 0.42, dw = 0.16, bx = x + HW * f * du, by = y + HH * f - HH * f * du;
    poly([[bx, by], [bx + HW * f * dw, by - HH * f * dw], [bx + HW * f * dw, by - HH * f * dw - 10], [bx, by - 10]], '#5a3a28', 'rgba(250,246,236,0.9)', 0.8);
    ctx.fillStyle = '#e8c96a'; ctx.beginPath(); ctx.arc(bx + HW * f * dw * 0.75, by - HH * f * dw * 0.75 - 5, 0.8, 0, 7); ctx.fill();
  },
  brown(x, y, def, seed, lit) {
    const f = 0.62, h = 38;
    const col = ['#a8644a', '#9b5a42', '#b9765a'][seed % 3];
    box(x, y, f, 0, h, col);
    box(x, y, f + 0.04, h, 3, '#e9dcc0');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      winR(x, y, f, 0, 0.1 + c * 0.3, 0.18, 9 + r * 10, 6, lit && (seed >> (r * 3 + c)) & 1);
      winL(x, y, f, 0, 0.1 + c * 0.3, 0.18, 9 + r * 10, 6, lit && (seed >> (r * 3 + c + 4)) & 1);
    }
    // stoop
    const sx = x + HW * f * 0.45, sy = y + HH * f * 0.55;
    box(sx + 5, sy + 3, 0.12, 0, 4, '#c9b48a');
    box(sx + 3, sy + 1, 0.1, 4, 3, '#c9b48a');
  },
  solar(x, y, def, seed) {
    const B = box(x, y, 0.62, 0, 10, '#e9dcc0');
    const tilt = 10;
    poly([[B.l[0], B.l[1]], [B.t[0], B.t[1] - tilt], [B.r[0], B.r[1] - tilt], [B.b[0], B.b[1]]], '#4a6fd1');
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8;
    for (let i = 1; i < 4; i++) {
      const u = i / 4;
      ctx.beginPath(); ctx.moveTo(B.l[0] + (B.b[0] - B.l[0]) * u, B.l[1] + (B.b[1] - B.l[1]) * u);
      ctx.lineTo(B.t[0] + (B.r[0] - B.t[0]) * u, B.t[1] - tilt + (B.r[1] - B.t[1]) * u); ctx.stroke();
    }
    if (nightFactor(S.hour) < 0.3) { const sh = (tNow() * 0.6 + seed) % 3; if (sh < 0.4) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(x - 8 + sh * 40, y - 14, 3, 0, 7); ctx.fill(); } }
  },
  lamp(x, y, def, seed, lit, b) {
    ctx.fillStyle = '#2f3b3a'; ctx.fillRect(x - 2, y - 46, 4, 46);
    ctx.fillRect(x - 2, y - 46, 14, 3);
    poly([[x + 8, y - 44], [x + 16, y - 44], [x + 14, y - 38], [x + 10, y - 38]], '#3fb6a8');
    ctx.fillStyle = '#3fb6a8'; ctx.beginPath(); ctx.arc(x, y - 50, 4, 0, 7); ctx.fill(); ctx.stroke();
    if (!b.incident) {
      for (let k = 0; k < 3; k++) {
        const ph = ((tNow() * 0.8 + k / 3) % 1);
        ctx.strokeStyle = `rgba(63,182,168,${1 - ph})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y - 50, 6 + ph * 22, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke();
      }
    }
    if (nightFactor(S.hour) > 0.2) lights.push({ glow: true, x: x + 12, y: y - 36, r: 34 });
  },
  factory(x, y, def, seed, lit, b) {
    const f = 0.72, h = 18;
    const B = box(x, y, f, 0, h, '#d9cbb0');
    // saw-tooth roof
    for (let i = 0; i < 3; i++) {
      const u0 = i / 3, u1 = (i + 1) / 3;
      const a = lerp(B.l, B.t, u0), c = lerp(B.b, B.r, u0), a2 = lerp(B.l, B.t, u1), c2 = lerp(B.b, B.r, u1);
      poly([a, c, [c2[0], c2[1] - 10], [a2[0], a2[1] - 10]], def.color);
      poly([[a2[0], a2[1] - 10], [c2[0], c2[1] - 10], c2, a2], '#bfe3f2');
    }
    // chimney with smoke
    box(x - 14, y - 2, 0.12, h, 22, '#b5523b');
    if (b.i >= 0 && efficiency(b) > 0 && Math.random() < 0.12) (ghost ? [] : particles).push({ x: x - 14, y: y - 2 - h - 22, vx: 0.2, vy: -0.5, life: 1.6, col: '#e8e4dc', kind: 'puff', g: -0.002, r: 4 });
    for (let c = 0; c < 3; c++) winR(x, y, f, 0, 0.1 + c * 0.3, 0.2, 5, 6, lit);
  },
  shop(x, y, def, seed, lit) {
    const f = 0.6, h = 20;
    box(x, y, f, 0, h, def.color);
    winR(x, y, f, 0, 0.1, 0.8, 2, 10, lit);
    // striped awning on the right face
    const aw = def.awning;
    for (let i = 0; i < 6; i++) {
      const u0 = i / 6, u1 = (i + 1) / 6;
      const bx0 = x + HW * f * u0, by0 = y + HH * f - HH * f * u0 - 14;
      const bx1 = x + HW * f * u1, by1 = y + HH * f - HH * f * u1 - 14;
      poly([[bx0, by0], [bx1, by1], [bx1 + 4, by1 + 5], [bx0 + 4, by0 + 5]], i % 2 ? '#fff' : aw, '#3b2f2a', 0.7);
    }
    // sign
    ctx.font = 'bold 9px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#3b2f2a';
    ctx.font = '14px sans-serif'; ctx.fillText(def.name === 'Frituur' ? '🍟' : '🥯', x, y - h - 8);
  },
  workshop(x, y, def, seed, lit) {
    const f = 0.66, h = 22;
    box(x, y, f, 0, h, '#f2e3c2');
    box(x, y, f + 0.03, h, 3, def.color);
    winR(x, y, f, 0, 0.15, 0.7, 3, 12, lit);
    winL(x, y, f, 0, 0.25, 0.5, 6, 8, lit);
    // spinning gear when crafting
    const tq = tNow(), spin = S.queue.length ? tq * 2 : 0;
    gear(x, y - h - 14, 9, spin, '#f2c94c');
    gear(x + 12, y - h - 8, 6, -spin * 1.5, '#e8955a');
  },
  wind(x, y, def, seed) {
    ctx.fillStyle = '#f4f4f4'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    poly([[x - 3, y], [x + 3, y], [x + 1.5, y - 62], [x - 1.5, y - 62]], '#f4f4f4');
    const a = tNow() * 2.2 + seed;
    for (let k = 0; k < 3; k++) {
      const t = a + k * 2.094;
      poly([[x, y - 62], [x + Math.cos(t) * 30 - Math.sin(t) * 3, y - 62 + Math.sin(t) * 30 + Math.cos(t) * 3], [x + Math.cos(t) * 30, y - 62 + Math.sin(t) * 30]], '#ffffff', '#3b2f2a', 1);
    }
    ctx.fillStyle = '#e05a5a'; ctx.beginPath(); ctx.arc(x, y - 62, 3.5, 0, 7); ctx.fill(); ctx.stroke();
  },
  warehouse(x, y, def, seed, lit) {
    const f = 0.8, h = 26;
    const B = box(x, y, f, 0, h, '#c2493d');
    stepped(B, 14, '#b4433a');
    for (let c = 0; c < 4; c++) winR(x, y, f, 0, 0.08 + c * 0.23, 0.14, 8, 10, lit);
    for (let c = 0; c < 3; c++) winL(x, y, f, 0, 0.12 + c * 0.3, 0.16, 8, 10, lit);
    // blinking server LEDs
    for (let k = 0; k < 6; k++) {
      const on = Math.sin(tNow() * 6 + k * 1.7 + seed) > 0;
      ctx.fillStyle = on ? (k % 2 ? '#7CFC9A' : '#5bd1ff') : '#2f3b3a';
      ctx.fillRect(x - 20 + k * 3, y - 6 - k * 1.5, 2, 2);
    }
  },
  sky(x, y, def, seed, lit) {
    const tiers = [[0.68, 40], [0.54, 30], [0.42, 24], [0.28, 18]];
    let z = 0;
    for (const [f, h] of tiers) {
      box(x, y, f, z, h, '#e9dcc0');
      for (let r = 0; r < h / 9 - 1; r++) for (let c = 0; c < 3; c++) {
        winR(x, y, f, z, 0.12 + c * 0.3, 0.14, 5 + r * 9, 5, lit && ((seed >> ((r + c + z) % 20)) & 1));
        winL(x, y, f, z, 0.12 + c * 0.3, 0.14, 5 + r * 9, 5, lit && ((seed >> ((r * 2 + c + z) % 20)) & 1));
      }
      z += h;
    }
    poly([[x - 3, y - z], [x + 3, y - z], [x, y - z - 26]], '#cfd6de');
    if (Math.sin(tNow() * 3) > 0) { ctx.fillStyle = '#e05a5a'; ctx.beginPath(); ctx.arc(x, y - z - 27, 2.5, 0, 7); ctx.fill(); }
  },
  lofts(x, y, def, seed, lit) {
    const f = 0.66, h = 84;
    box(x, y, f, 0, h, '#9fb4d8');
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
      winR(x, y, f, 0, 0.06 + c * 0.24, 0.18, 6 + r * 10, 6, lit && ((seed >> ((r * 4 + c) % 24)) & 1));
      winL(x, y, f, 0, 0.06 + c * 0.24, 0.18, 6 + r * 10, 6, lit && ((seed >> ((r * 3 + c + 2) % 24)) & 1));
    }
    box(x, y, f * 0.9, h, 4, '#7cc46a');
    ctx.fillStyle = '#5fae55'; ctx.beginPath(); ctx.arc(x - 6, y - h - 10, 6, 0, 7); ctx.arc(x + 7, y - h - 8, 5, 0, 7); ctx.fill();
    // IoT blink
    for (let k = 0; k < 4; k++) { const on = Math.sin(tNow() * 4 + k * 2) > 0.6; if (on) { ctx.fillStyle = '#e87aa8'; ctx.beginPath(); ctx.arc(x - 10 + k * 7, y - 20 - k * 16, 2, 0, 7); ctx.fill(); } }
  },
  station(x, y, def, seed, lit) {
    if (def.centraal) return centraalStation(x, y, lit);
    if (def.plain) {
      const f = 0.84, h = 18;
      box(x, y, f, 0, h, '#cfc6b4');
      for (let c = 0; c < 6; c++) winR(x, y, f, 0, 0.05 + c * 0.16, 0.1, 3, 10, lit);
      ctx.fillStyle = 'rgba(191,227,242,0.9)'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - 24, y - h); ctx.quadraticCurveTo(x, y - h - 22, x + 24, y - h); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 14, y - h + 4, 4, 0, 7); ctx.fill(); ctx.stroke();
      return;
    }
    const f = 0.86, h = 24;
    const B = box(x, y, f, 0, h, '#d8c9a3');
    for (let c = 0; c < 5; c++) winR(x, y, f, 0, 0.06 + c * 0.19, 0.12, 4, 12, lit);
    for (let c = 0; c < 4; c++) winL(x, y, f, 0, 0.1 + c * 0.22, 0.12, 4, 12, lit);
    // big dome
    ctx.fillStyle = '#6f8f7a'; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(x, y - h, 22, 11, 0, Math.PI, 0); ctx.lineTo(x + 22, y - h); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 22, y - h); ctx.bezierCurveTo(x - 22, y - h - 34, x + 22, y - h - 34, x + 22, y - h); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.arc(x, y - h - 27, 3, 0, 7); ctx.fill(); ctx.stroke();
    // clock
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 14, y - h + 4, 5, 0, 7); ctx.fill(); ctx.stroke();
    const ang = (hourNow() / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(x + 14, y - h + 4); ctx.lineTo(x + 14 + Math.cos(ang) * 3.5, y - h + 4 + Math.sin(ang) * 3.5); ctx.stroke();
  },
  cathedral(x, y, def, seed, lit) {
    if (def.twin) {
      for (const [dx, dy] of [[-2, -6], [-14, 2]]) {
        const T = box(x + dx, y + dy, 0.22, 0, 54, '#e6dcc6');
        battlements(T, '#e6dcc6');
        winR(x + dx, y + dy, 0.22, 0, 0.3, 0.4, 30, 9, lit);
        winR(x + dx, y + dy, 0.22, 0, 0.3, 0.4, 14, 9, lit);
      }
      const B = box(x + 6, y + 3, 0.55, 0, 24, '#dcd3c0');
      for (let c = 0; c < 4; c++) winR(x + 6, y + 3, 0.55, 0, 0.12 + c * 0.22, 0.1, 6, 12, lit);
      return;
    }
    // tower + spire stand behind the nave, so they go first
    const T = box(x - 10, y - 4, 0.26, 0, 64, '#e6dcc6');
    for (let r = 0; r < 5; r++) { winR(x - 10, y - 4, 0.26, 0, 0.3, 0.4, 8 + r * 11, 7, lit); }
    poly([T.l, T.b, [x - 10, y - 4 - 64 - 36]], '#d0c6b0');
    poly([T.b, T.r, [x - 10, y - 4 - 64 - 36]], '#e6dcc6');
    ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.arc(x - 10, y - 4 - 100, 2.5, 0, 7); ctx.fill();
    const B = box(x + 6, y + 3, 0.55, 0, 24, '#dcd3c0');
    for (let c = 0; c < 4; c++) winR(x + 6, y + 3, 0.55, 0, 0.12 + c * 0.22, 0.1, 6, 12, lit);
    const rh = 14;
    poly([B.t, B.r, [(B.r[0] + B.b[0]) / 2, (B.r[1] + B.b[1]) / 2 - rh], [(B.t[0] + B.l[0]) / 2, (B.t[1] + B.l[1]) / 2 - rh]], '#7c8a9a');
    poly([B.l, B.b, [(B.r[0] + B.b[0]) / 2, (B.r[1] + B.b[1]) / 2 - rh], [(B.t[0] + B.l[0]) / 2, (B.t[1] + B.l[1]) / 2 - rh]], '#8e9cad');
    // rose window
    ctx.fillStyle = '#c96fa8'; ctx.beginPath(); ctx.arc(x + 14, y - 10, 4, 0, 7); ctx.fill(); ctx.stroke();
  },
  plant(x, y, def, seed, lit) {
    const f = 0.76, h = 22;
    box(x, y, f, 0, h, '#c2493d');
    for (let c = 0; c < 4; c++) winR(x, y, f, 0, 0.08 + c * 0.23, 0.14, 6, 9, lit);
    for (const [dx, dy] of [[-10, -4], [8, 2]]) {
      for (let k = 0; k < 4; k++) box(x + dx, y + dy, 0.12, h + k * 10, 10, k % 2 ? '#ffffff' : '#e05a5a');
      if (Math.random() < 0.15) (ghost ? [] : particles).push({ x: x + dx, y: y + dy - h - 40, vx: 0.25, vy: -0.5, life: 1.8, col: '#f0ece4', kind: 'puff', g: -0.002, r: 5 });
    }
  },
  castle(x, y, def, seed, lit) {
    const stone = '#b9b2a3';
    const B = box(x, y, 0.72, 0, 22, stone);
    battlements(B, stone);
    const T = box(x - 12, y - 2, 0.26, 22, 22, '#c8c1b2');
    battlements(T, '#c8c1b2');
    winR(x - 12, y - 2, 0.26, 22, 0.35, 0.3, 4, 7, lit);
    winR(x, y, 0.72, 0, 0.4, 0.18, 0, 10, false);
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 12, y - 52); ctx.lineTo(x - 12, y - 66); ctx.stroke();
    poly([[x - 12, y - 66], [x - 1 + Math.sin(tNow() * 3) * 1.5, y - 63], [x - 12, y - 60]], '#e05a5a', '#3b2f2a', 0.8);
  },
  crane(x, y, def, seed) {
    // port gantry crane: four legs, a tall frame and a long boom reaching over the water
    const col = S.map === 'gent' ? '#e05a2a' : '#2f6fb0';
    for (const [dx, dy] of [[-10, -3], [10, 3], [-2, -8], [2, 8]]) box(x + dx, y + dy, 0.05, 0, 34, col);
    box(x, y, 0.42, 34, 8, col);
    box(x - 2, y - 1, 0.18, 42, 22, col);
    const t = [x - 2, y - 1 - 64];
    ctx.strokeStyle = col; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(x + 26, y - 13 - 42); ctx.lineTo(x - 30, y + 15 - 42); ctx.stroke();      // boom
    ctx.lineWidth = 0.8; ctx.strokeStyle = '#3a3d42';
    ctx.beginPath(); ctx.moveTo(t[0], t[1]); ctx.lineTo(x - 30, y + 15 - 42); ctx.moveTo(t[0], t[1]); ctx.lineTo(x + 26, y - 13 - 42); ctx.stroke();
    box(x + 8, y - 4, 0.1, 30, 6, '#f2c94c');   // driver cabin
    const sway = Math.sin(tNow() * 0.8 + seed) * 6;
    ctx.beginPath(); ctx.moveTo(x - 18 + sway, y + 9 - 42); ctx.lineTo(x - 18 + sway, y + 9 - 22); ctx.stroke();
    box(x - 18 + sway, y + 9 - 16, 0.12, 0, 6, ['#c0392b', '#2e8b7a', '#d9b44a'][seed % 3]);
  },
  containers(x, y, def, seed) {
    const cols = ['#c0392b', '#2e6fa8', '#2e8b7a', '#d9b44a', '#7a5c3e', '#e67e22', '#5d6168'];
    // back to front, bottom to top
    const spots = [[-9, -5], [9, -5], [-9, 5], [9, 5]].sort((a, b) => a[1] - b[1]);
    for (const [dx, dy] of spots) {
      const n = 1 + hash(seed + dx * 3 + dy) % 3;
      for (let k = 0; k < n; k++) box(x + dx, y + dy, 0.26, k * 7, 7, cols[hash(seed + k * 17 + dx + dy * 5) % cols.length]);
    }
  },
  kiosk(x, y, def, seed, lit) {
    const brussels = S.map === 'brussel';
    box(x, y, 0.34, 0, 12, brussels ? '#f3e2b8' : '#f6f5f1');
    winR(x, y, 0.34, 0, 0.15, 0.7, 4, 5, lit);
    // striped awning over the counter
    for (let i = 0; i < 4; i++) {
      const u0 = i / 4, u1 = (i + 1) / 4, f = 0.34;
      const bx0 = x + HW * f * u0, by0 = y + HH * f - HH * f * u0 - 10, bx1 = x + HW * f * u1, by1 = y + HH * f - HH * f * u1 - 10;
      poly([[bx0, by0], [bx1, by1], [bx1 + 3, by1 + 3], [bx0 + 3, by0 + 3]], i % 2 ? '#fff' : (brussels ? '#c8323c' : '#e2b23a'), null);
    }
    // sign on the roof: a cone of fries or a waffle
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(brussels ? '🧇' : '🍟', x, y - 20);
  },
  flag(x, y, def, seed) {
    const eu = def.style === 'flag' && def.name === 'EU Flag';
    const top = y - 46;
    ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, top); ctx.stroke();
    // waving cloth, in the city's colours
    // Antwerp: the official city flag, red-white-red in 1:3:1 (Wikimedia Commons, "Flag of Antwerp (City).svg")
    const antw = !eu && S.map === 'antwerpen';
    const stripes = eu ? ['#2f4fa8'] : antw ? ['#da121a', '#ffffff', '#da121a'] : S.map === 'gent' ? ['#1e1f22', '#ffffff'] : S.map === 'oasis' ? ['#2f8f8a', '#f2e3c2', '#c98a3e'] : ['#f2c230', '#2f4fa8'];   // Oasis Bay: made-up sea-sand-dune flag
    const ratio = antw ? [1, 3, 1] : stripes.map(() => 1), tot = ratio.reduce((a, c) => a + c, 0);
    const W2 = 16, H2 = 10, wind = 1 + (weather.wind || 0) / 25, n = 8;
    for (let s2 = 0, acc = 0; s2 < stripes.length; acc += ratio[s2], s2++) {
      ctx.fillStyle = stripes[s2]; ctx.beginPath();
      const y0 = top + H2 * acc / tot, y1 = y0 + H2 * ratio[s2] / tot;
      for (let i = 0; i <= n; i++) { const u = i / n; ctx.lineTo(x + u * W2, y0 + Math.sin(tNow() * 4 * wind + u * 5 + seed) * u * 2); }
      for (let i = n; i >= 0; i--) { const u = i / n; ctx.lineTo(x + u * W2, y1 + Math.sin(tNow() * 4 * wind + u * 5 + seed) * u * 2); }
      ctx.closePath(); ctx.fill();
    }
    if (eu) { ctx.fillStyle = '#f2c94c'; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.fillRect(x + 8 + Math.cos(a) * 3, top + 5 + Math.sin(a) * 3, 1, 1); } }
  },
  billboard(x, y, def, seed, lit, b) {
    // two posts with a big panel facing the street, painted with the city's own symbols
    const v = (b && b.v) || 0, city = S.map;
    // undo the 'tall' stretch: billboards keep their real proportions
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 1 / TALL); ctx.translate(-x, -y);
    ctx.strokeStyle = '#4a4d52'; ctx.lineWidth = 1.6;
    // panel faces the viewer straight on, so it reads like a real roadside sign
    for (const dx of [-13, 13]) { ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.lineTo(x + dx, y - 16); ctx.stroke(); }
    const W2 = 44, H2 = 24;
    ctx.save(); ctx.translate(x - W2 / 2, y - 14);
    ctx.fillStyle = '#2b2d31'; ctx.fillRect(-1.5, -H2 - 1.5, W2 + 3, H2 + 3);   // frame
    ctx.beginPath(); ctx.rect(0, -H2, W2, H2); ctx.clip();
    billboardArt(city, v, W2, H2);
    ctx.restore();
    ctx.restore();
    if (night()) { const a = [x, y - (14 + H2 + 2) / TALL]; lights.push({ glow: true, x: a[0], y: a[1], r: 16, col: '255,236,190', a: 0.5 }); }
  },
  hospital(x, y, def, seed, lit) {
    // white hospital: main block, lower wing, emergency entrance with a red cross, helipad on the roof
    box(x + 10, y + 5, 0.4, 0, 18, '#e8ecee');
    for (let c = 0; c < 3; c++) winR(x + 10, y + 5, 0.4, 0, 0.12 + c * 0.3, 0.18, 5, 7, lit);
    const f = 0.55, h = 40;
    box(x - 4, y - 3, f, 0, h, '#f4f6f6');
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { winR(x - 4, y - 3, f, 0, 0.06 + c * 0.23, 0.17, 4 + r * 7, 4.5, lit && (seed + r + c) % 3 === 0); winL(x - 4, y - 3, f, 0, 0.06 + c * 0.23, 0.17, 4 + r * 7, 4.5, lit && (seed + r * 2 + c) % 3 === 0); }
    poly([[x - 4, y - 3 - h - HH * 0.3], [x - 4 + HW * 0.3, y - 3 - h], [x - 4, y - 3 - h + HH * 0.3], [x - 4 - HW * 0.3, y - 3 - h]], '#3a3d42', null);
    ctx.fillStyle = '#f4f6f6'; ctx.font = '800 6px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', x - 4, y - 3 - h);
    const e = onR(x + 10, y + 5, 0.4, 0.5);
    ctx.fillStyle = '#c8202f'; ctx.fillRect(e[0] - 1, e[1] - 16, 2, 6); ctx.fillRect(e[0] - 3, e[1] - 14, 6, 2);
    ctx.fillStyle = '#c8202f'; ctx.fillRect(e[0] - 4, e[1] - 6, 8, 1.4);
  },
  police(x, y, def, seed, lit) {
    // brick police station with a blue band, POLITIE sign and the blue lamp by the door
    const f = 0.62, h = 26;
    box(x, y, f, 0, h, '#8f6a55');
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { winR(x, y, f, 0, 0.12 + c * 0.3, 0.16, 6 + r * 10, 6, lit); winL(x, y, f, 0, 0.12 + c * 0.3, 0.16, 6 + r * 10, 6, lit); }
    const a = onR(x, y, f, 0.02), b = onR(x, y, f, 0.98);
    poly([[a[0], a[1] - h + 6], [b[0], b[1] - h + 6], [b[0], b[1] - h + 1], [a[0], a[1] - h + 1]], '#2f4fa8', null);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    ctx.save(); ctx.transform(1, dy / dx, 0, 1, a[0], a[1] - h + 3.5); ctx.fillStyle = '#fff'; ctx.font = '800 3.6px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('POLITIE', dx / 2, 0, dx - 3); ctx.restore();
    box(x, y, f + 0.02, h, 1.6, '#6e5242');
    const d = onR(x, y, f, 0.5);
    ctx.fillStyle = '#2f6fff'; ctx.beginPath(); ctx.arc(d[0] + 4, d[1] - 12, 1.4, 0, 7); ctx.fill();
    if (night()) lights.push({ glow: true, x: d[0] + 4, y: d[1] - 12, r: 7, col: '80,130,255', a: 0.9 });
  },
  library(x, y, def, seed, lit) {
    // modern library: glass ground floor, timber-clad upper floors, big BIBLIOTHEEK letters and stacked books sign
    const f = 0.66, h = 30;
    box(x, y, f, 0, 9, '#9fc3d6');
    box(x, y, f, 9, h - 9, ['#b08a5a', '#c9a77a', '#8f6f4a'][seed % 3]);
    ctx.strokeStyle = 'rgba(60,40,20,0.35)'; ctx.lineWidth = 0.6;
    for (let k = 1; k < 10; k++) for (const side of [onR, onL]) { const q = side(x, y, f, k / 10); ctx.beginPath(); ctx.moveTo(q[0], q[1] - 9); ctx.lineTo(q[0], q[1] - h); ctx.stroke(); }
    for (let c = 0; c < 3; c++) winL(x, y, f, 0, 0.12 + c * 0.3, 0.2, 13, 9, lit);
    const a = onR(x, y, f, 0.04), b = onR(x, y, f, 0.96), dx = b[0] - a[0], dy = b[1] - a[1];
    ctx.save(); ctx.transform(1, dy / dx, 0, 1, a[0], a[1] - 18); ctx.fillStyle = '#f6f2e6'; ctx.font = '800 3.4px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BIBLIOTHEEK', dx / 2, 0, dx - 3); ctx.restore();
    const cols = ['#c8202f', '#2f6fb0', '#e2b23a', '#3fa77c'];
    for (let k = 0; k < 4; k++) { ctx.fillStyle = cols[k]; ctx.fillRect(x - 5 + (k % 2), y - h - 2 - k * 2.2, 10, 2); }
  },
  bank(x, y, def, seed, lit) {
    // neoclassical bank: stone block, portico of columns, pediment and a nameplate
    const f = 0.68, h = 34, stone = ['#e6dcc6', '#d9cfb8', '#ece4d2'][seed % 3];
    box(x, y, f, 0, 4, '#bfb39a');
    box(x, y, f, 4, h - 4, stone);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) winL(x, y, f, 0, 0.12 + c * 0.3, 0.16, 9 + r * 12, 8, lit);
    for (let c = 0; c < 6; c++) {
      const q = onR(x, y, f, 0.1 + c * 0.16);
      box(q[0] + 0.6, q[1] + 0.3, 0.03, 4, h - 12, '#f4efe2');
      ctx.fillStyle = '#d8cdb5'; ctx.fillRect(q[0] - 0.8, q[1] - h + 7, 2.8, 1.2);
    }
    const a = onR(x, y, f, 0.02), b = onR(x, y, f, 0.98);
    poly([[a[0], a[1] - h], [b[0], b[1] - h], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - h - 9]], '#efe6d2');
    // nameplate along the frieze
    const dx = b[0] - a[0], dy = b[1] - a[1];
    ctx.save(); ctx.transform(1, dy / dx, 0, 1, a[0], a[1] - h + 1);
    ctx.fillStyle = '#3b3328'; ctx.font = '800 4px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(['BANK', 'BANQUE', 'NATIONALE BANK'][seed % 3], dx / 2, 0, dx - 4);
    ctx.restore();
    box(x, y, f + 0.03, h, 2, '#d0c5ad');
  },
  prison(x, y, def, seed, lit) {
    // high outer wall with watchtowers, a brick cell block inside, barred windows
    const f = 0.92, wh = 13, wall = '#9a958c';
    const T = [x, y - HH * f], Rr = [x + HW * f, y], B = [x, y + HH * f], L = [x - HW * f, y];
    poly([T, Rr, B, L], '#8a877f', null);                                       // yard
    const wallFace = (p, q, col) => poly([p, q, [q[0], q[1] - wh], [p[0], p[1] - wh]], col);
    wallFace(L, T, shade(wall, -0.1)); wallFace(T, Rr, shade(wall, 0));          // back walls (inner side)
    const tower = (c) => { box(c[0], c[1], 0.06, 0, 20, '#7d7a72'); box(c[0], c[1], 0.1, 20, 4, '#5d6168'); poly([[c[0] - 4, c[1] - 24], [c[0] + 4, c[1] - 24], [c[0], c[1] - 28]], '#3a3d42'); };
    tower(T);                                                                    // back tower before the cell block
    const C = box(x, y, 0.5, 0, 30, '#9c5440');                                 // cell block
    box(x, y, 0.52, 30, 2, '#7d4434');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      for (const side of [winR, winL]) side(x, y, 0.5, 0, 0.06 + c * 0.19, 0.08, 6 + r * 8, 4, lit && ((seed + r * 5 + c) % 4 === 0));
    }
    box(x - 10, y - 5, 0.08, 30, 6, '#7d7a72');                                 // small chimney / vent
    wallFace(L, B, shade(wall, -0.2)); wallFace(B, Rr, shade(wall, -0.05));      // front walls
    // razor wire along the top of the front walls
    ctx.strokeStyle = 'rgba(200,200,200,0.8)'; ctx.lineWidth = 0.5;
    for (const [p, q] of [[L, B], [B, Rr]]) { ctx.beginPath(); for (let k = 0; k <= 16; k++) { const u = k / 16; ctx.lineTo(p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u - wh - 1 - (k % 2) * 1.2); } ctx.stroke(); }
    // remaining watchtowers: sides, then the front one
    tower(L); tower(Rr); tower(B);
    if (night()) for (const c of [L, B, Rr]) lights.push({ glow: true, x: c[0], y: c[1] - 22, r: 10, col: '255,245,220', a: 0.7 });
  },
  plaza(x, y, def, seed, lit) {
    // paved square with a fountain in the middle, trees on the corners and a café terrace
    const f = 0.95;
    poly([[x, y - HH * f], [x + HW * f, y], [x, y + HH * f], [x - HW * f, y]], '#d6ccb8', null);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.5;
    for (let k = 1; k < 5; k++) { const u = k / 5; ctx.beginPath(); ctx.moveTo(x - HW * f * (1 - u), y - HH * f * u); ctx.lineTo(x + HW * f * u, y + HH * f * (1 - u)); ctx.stroke(); }
    // trees on the back corners first, then the fountain, then front corners
    const treeAt = (tx, ty) => { ctx.fillStyle = '#6b4a2b'; ctx.fillRect(tx - 0.8, ty - 9, 1.6, 9); ctx.fillStyle = '#4f8a3c'; ctx.beginPath(); ctx.arc(tx, ty - 12, 5, 0, 7); ctx.fill(); };
    treeAt(x, y - HH * 0.7);
    box(x, y, 0.3, 0, 2.5, '#cfc5ae');
    ctx.fillStyle = '#7fc4e6'; ctx.beginPath(); ctx.ellipse(x, y - 2.5, HW * 0.26, HH * 0.26, 0, 0, 7); ctx.fill();
    box(x, y, 0.05, 2.5, 7, '#cfc5ae');
    ctx.strokeStyle = 'rgba(200,235,250,0.9)'; ctx.lineWidth = 0.8;
    const ph = (tNow() * 2) % 1;
    for (const dx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.quadraticCurveTo(x + dx * 5, y - 13 + ph, x + dx * 7, y - 3); ctx.stroke(); }
    treeAt(x - HW * 0.7, y); treeAt(x + HW * 0.7, y);
    // café umbrellas with little tables at the front
    for (const [dx, col] of [[-6, '#c0392b'], [5, '#2e6fa8']]) {
      const ux = x + dx, uy = y + HH * 0.55 - Math.abs(dx) * 0.2;
      ctx.fillStyle = '#5a3a28'; ctx.fillRect(ux - 0.4, uy - 6, 0.8, 6);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(ux - 5, uy - 6); ctx.lineTo(ux, uy - 9); ctx.lineTo(ux + 5, uy - 6); ctx.closePath(); ctx.fill();
    }
  },
  monument(x, y, def, seed, lit, b) {
    // every statue is a specific, recognisable one, with its name on the plinth
    const v = (b && b.v) || 0, city = S.map;
    const BR = '#4f6a58', BRd = '#3e5547', STONE = '#d6cdbb';
    const plate = (name, z) => { ctx.save(); ctx.translate(x, y - z); ctx.fillStyle = '#2b2d31'; ctx.fillRect(-7, -2.4, 14, 3.4); ctx.fillStyle = '#e8c96a'; ctx.font = '700 2.4px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, 0, -0.7, 13); ctx.restore(); };
    const fig = (fx, fy, h, col = BR) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(fx - 2.4, fy); ctx.lineTo(fx + 2.4, fy); ctx.lineTo(fx + 1.6, fy - h * 0.75); ctx.lineTo(fx - 1.6, fy - h * 0.75); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(fx, fy - h * 0.86, h * 0.13, 0, 7); ctx.fill(); };
    const arm = (fx, fy, dx, dy, col = BR, w = 1.3) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + dx, fy + dy); ctx.stroke(); ctx.lineCap = 'butt'; };
    if (city === 'oasis') {
      if (v === 0) {
        // sandstone obelisk with carved bands and a golden tip
        ctx.fillStyle = '#c9a77a'; ctx.fillRect(x - 6, y - 3, 12, 3);
        ctx.fillStyle = '#d8b98a'; ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y - 3); ctx.lineTo(x + 2, y - 34); ctx.lineTo(x - 2, y - 34); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b8935f'; ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 3, y - 3); ctx.lineTo(x + 2, y - 34); ctx.lineTo(x, y - 34); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8c96a'; ctx.beginPath(); ctx.moveTo(x - 2, y - 34); ctx.lineTo(x + 2, y - 34); ctx.lineTo(x, y - 39); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#9b7a4c'; for (const z of [10, 18, 26]) ctx.fillRect(x - 2.6, y - z, 5.2, 0.8);
        plate('OBELISK', 1);
      } else {
        // bronze camel on a plinth: the caravans that founded the town
        ctx.fillStyle = STONE; ctx.fillRect(x - 8, y - 6, 16, 6);
        ctx.fillStyle = BR; ctx.beginPath(); ctx.ellipse(x, y - 13, 6, 3, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x - 1.5, y - 16, 2.4, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.arc(x + 2, y - 16, 2.2, Math.PI, 0); ctx.fill();
        arm(x + 5, y - 13, 3, -6, BR, 1.6); ctx.beginPath(); ctx.ellipse(x + 8.6, y - 19.5, 2, 1.2, 0, 0, 7); ctx.fill();
        for (const dx of [-4, -2, 2, 4]) arm(x + dx, y - 11, 0, 5, BRd, 1.1);
        plate('CARAVAN', 1);
      }
      return;
    }
    if (city === 'antwerpen' && v === 0) {
      // Brabo fountain: Silvius Brabo on a rocky mound, throwing the giant's hand; water spouting below
      ctx.fillStyle = '#7fc4e6'; ctx.beginPath(); ctx.ellipse(x, y, 17, 8.5, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = STONE; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = '#6b6a60';
      ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x - 6, y - 8); ctx.lineTo(x - 2, y - 12); ctx.lineTo(x + 3, y - 14); ctx.lineTo(x + 7, y - 9); ctx.lineTo(x + 9, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a594f'; ctx.beginPath(); ctx.moveTo(x - 4, y - 6); ctx.lineTo(x, y - 11); ctx.lineTo(x + 4, y - 6); ctx.closePath(); ctx.fill();
      fig(x + 1, y - 14, 13);
      arm(x + 2, y - 23, 5, -6);                                       // throwing arm
      ctx.fillStyle = '#d9b44a'; ctx.beginPath(); ctx.ellipse(x + 8, y - 30, 1.8, 1.2, 0.4, 0, 7); ctx.fill();   // the hand
      ctx.fillStyle = BR; ctx.beginPath(); ctx.ellipse(x - 5, y - 9, 3, 1.2, 0.3, 0, 7); ctx.fill();          // the giant at his feet
      ctx.strokeStyle = 'rgba(210,240,255,0.9)'; ctx.lineWidth = 0.8; const ph = (tNow() * 2) % 1;
      for (const dx of [-7, 0, 7]) { ctx.beginPath(); ctx.moveTo(x + dx, y - 5); ctx.quadraticCurveTo(x + dx * 1.4, y - 9 + ph * 2, x + dx * 1.8, y - 1); ctx.stroke(); }
      plate('BRABO', 1);
    } else if (city === 'antwerpen') {
      // Rubens on the Groenplaats: tall plinth, painter with hat and cape, palette in hand
      box(x, y, 0.34, 0, 4, STONE); box(x, y, 0.2, 4, 16, '#c4baa6'); box(x, y, 0.24, 20, 2, STONE);
      fig(x, y - 22, 15);
      ctx.fillStyle = BRd; ctx.beginPath(); ctx.moveTo(x - 3.5, y - 22); ctx.quadraticCurveTo(x - 5, y - 30, x - 1.5, y - 34); ctx.lineTo(x - 1.5, y - 22); ctx.fill();   // cape
      ctx.fillStyle = BRd; ctx.beginPath(); ctx.ellipse(x, y - 36.4, 3.6, 1, 0, 0, 7); ctx.fill(); ctx.fillRect(x - 1.6, y - 39, 3.2, 2.6);                      // broad hat
      arm(x + 1.5, y - 31, 4, 2); ctx.fillStyle = BR; ctx.beginPath(); ctx.ellipse(x + 6, y - 29, 2.2, 1.4, 0.3, 0, 7); ctx.fill();                                // palette
      plate('RUBENS', 12);
    } else if (city === 'brussel' && v === 0) {
      // Godfrey of Bouillon on the Koningsplein: rider on a rearing horse, raising a banner
      box(x, y, 0.36, 0, 4, STONE); box(x, y, 0.26, 4, 12, '#c4baa6');
      const t = y - 16;
      // horse in profile, walking: body, neck, head, four legs, tail
      ctx.fillStyle = BR; ctx.strokeStyle = BR; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(x, t - 7, 6.5, 2.8, 0, 0, 7); ctx.fill();
      ctx.lineWidth = 1.3;
      for (const [lx, dx] of [[-4.5, -0.6], [-3, 0.4], [3.5, 0.8], [5, -0.4]]) { ctx.beginPath(); ctx.moveTo(x + lx, t - 6); ctx.lineTo(x + lx + dx, t); ctx.stroke(); }
      ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x + 5, t - 8); ctx.lineTo(x + 8, t - 13); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + 9.5, t - 13, 2.6, 1.3, 0.35, 0, 7); ctx.fill();
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 6.3, t - 8); ctx.quadraticCurveTo(x - 9, t - 6, x - 8, t - 2.5); ctx.stroke();
      // rider with helmet, raising the banner
      ctx.fillRect(x - 1.6, t - 15, 3.2, 6); ctx.beginPath(); ctx.arc(x, t - 16.5, 1.6, 0, 7); ctx.fill();
      ctx.fillRect(x - 1.2, t - 9.5, 1, 3.5);
      ctx.lineWidth = 0.8; ctx.strokeStyle = BRd; ctx.beginPath(); ctx.moveTo(x + 1.5, t - 13); ctx.lineTo(x + 2.5, t - 30); ctx.stroke();
      ctx.fillStyle = BR; ctx.beginPath(); ctx.moveTo(x + 2.5, t - 30); ctx.lineTo(x + 9, t - 28); ctx.lineTo(x + 2.4, t - 25); ctx.closePath(); ctx.fill();
      ctx.lineCap = 'butt';
      plate('GODFRIED', 8);
    } else if (city === 'brussel') {
      // Congress Column: tall fluted column with King Leopold I on top and the eternal flame at its foot
      box(x, y, 0.4, 0, 5, STONE); box(x, y, 0.16, 5, 6, '#cfc5ae');
      ctx.fillStyle = '#e4dccb'; ctx.fillRect(x - 2.6, y - 50, 5.2, 39);
      ctx.strokeStyle = 'rgba(120,110,90,0.4)'; ctx.lineWidth = 0.4; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * 1.5, y - 11); ctx.lineTo(x + k * 1.5, y - 50); ctx.stroke(); }
      ctx.fillStyle = '#cfc5ae'; ctx.fillRect(x - 3.6, y - 52, 7.2, 2.4);
      fig(x, y - 52, 9);
      const fl = Math.sin(tNow() * 9) * 0.6;
      ctx.fillStyle = '#f29e4c'; ctx.beginPath(); ctx.moveTo(x + 6, y - 2); ctx.quadraticCurveTo(x + 7 + fl, y - 6, x + 7.5, y - 9); ctx.quadraticCurveTo(x + 8.5 - fl, y - 5, x + 9, y - 2); ctx.fill();
      if (night()) lights.push({ glow: true, x: x + 7.5, y: y - 5, r: 8, col: '255,170,60', a: 0.8 });
      plate('CONGRESKOLOM', 3);
    } else if (city === 'gent' && v === 0) {
      // Jacob van Artevelde on the Vrijdagmarkt: on a tall decorated plinth, arm stretched out pointing
      box(x, y, 0.38, 0, 4, STONE); box(x, y, 0.24, 4, 18, '#b9b0a0'); box(x, y, 0.28, 22, 2, STONE);
      for (const u of [0.25, 0.75]) { const q = onR(x, y, 0.24, u); ctx.fillStyle = BRd; ctx.fillRect(q[0] - 1.2, q[1] - 16, 2.4, 8); }   // bronze reliefs
      fig(x, y - 24, 15);
      ctx.fillStyle = BRd; ctx.beginPath(); ctx.moveTo(x - 2.6, y - 24); ctx.lineTo(x - 4, y - 32); ctx.lineTo(x - 1.4, y - 36); ctx.closePath(); ctx.fill();  // mantle
      ctx.fillStyle = BRd; ctx.fillRect(x - 1.8, y - 41, 3.6, 1.6);                                                     // cap
      arm(x + 1.5, y - 34, 8, -2, BR, 1.5);                                                                              // pointing arm
      plate('ARTEVELDE', 14);
    } else {
      // Van Eyck monument near Sint-Baafs: the two painter brothers seated side by side on one plinth
      box(x, y, 0.42, 0, 4, STONE); box(x, y, 0.32, 4, 9, '#c4baa6');
      for (const dx of [-4, 4]) {
        const fx = x + dx, fy = y - 13;
        ctx.fillStyle = BR; ctx.fillRect(fx - 2.4, fy - 4, 4.8, 4);                                   // lap
        ctx.beginPath(); ctx.moveTo(fx - 2, fy - 4); ctx.lineTo(fx + 2, fy - 4); ctx.lineTo(fx + 1.4, fy - 11); ctx.lineTo(fx - 1.4, fy - 11); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(fx, fy - 12.6, 1.8, 0, 7); ctx.fill();
        ctx.fillStyle = BRd; ctx.fillRect(fx - 1.9, fy - 15, 3.8, 1.3);                               // hood
      }
      ctx.fillStyle = '#e8dcc0'; ctx.fillRect(x - 1.5, y - 22, 3, 3.6);                                 // the panel they hold up
      plate('VAN EYCK', 8);
    }
  },
  handje(x, y, def, seed) {
    // the Antwerp hand: a polished bronze open hand, cut off at the wrist, on a stepped granite pedestal
    box(x, y, 0.4, 0, 3, '#b8b0a0');
    box(x, y, 0.3, 3, 3, '#cfc6b4');
    box(x, y, 0.2, 6, 12, '#a9a397');
    const gx = x, gy = y - 18;
    const gold = ctx.createLinearGradient(gx - 6, gy - 22, gx + 6, gy);
    gold.addColorStop(0, '#f3dc8a'); gold.addColorStop(0.5, '#c9962e'); gold.addColorStop(1, '#8a6418');
    // wrist with a clean cut
    ctx.fillStyle = '#7a5a1a'; ctx.beginPath(); ctx.ellipse(gx, gy - 1, 3.2, 1.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.moveTo(gx - 3.2, gy - 1); ctx.lineTo(gx - 3.6, gy - 6); ctx.lineTo(gx + 3.6, gy - 6); ctx.lineTo(gx + 3.2, gy - 1); ctx.closePath(); ctx.fill();
    // palm
    ctx.beginPath(); ctx.moveTo(gx - 4.6, gy - 6); ctx.quadraticCurveTo(gx - 5.4, gy - 11, gx - 4.4, gy - 14); ctx.lineTo(gx + 4.6, gy - 14); ctx.quadraticCurveTo(gx + 5.2, gy - 10, gx + 4, gy - 6); ctx.closePath(); ctx.fill();
    // four fingers, slightly spread, with rounded tips, and the thumb sticking out
    ctx.strokeStyle = gold; ctx.lineCap = 'round';
    const fingers = [[-3.4, 7.5, -0.12], [-1.1, 9.5, -0.04], [1.2, 9, 0.04], [3.4, 7, 0.14]];
    for (const [fx, len, a] of fingers) { ctx.lineWidth = 2.1; ctx.beginPath(); ctx.moveTo(gx + fx, gy - 13.5); ctx.lineTo(gx + fx + Math.sin(a) * len, gy - 13.5 - Math.cos(a) * len); ctx.stroke(); }
    ctx.lineWidth = 2.3; ctx.beginPath(); ctx.moveTo(gx - 4.4, gy - 8); ctx.quadraticCurveTo(gx - 8, gy - 10, gx - 8.6, gy - 14); ctx.stroke();
    ctx.lineCap = 'butt';
    // knuckle creases and a highlight
    ctx.strokeStyle = 'rgba(110,80,20,0.5)'; ctx.lineWidth = 0.4;
    for (const [fx, len, a] of fingers) { const k = len * 0.55; ctx.beginPath(); ctx.moveTo(gx + fx + Math.sin(a) * k - 0.8, gy - 13.5 - Math.cos(a) * k); ctx.lineTo(gx + fx + Math.sin(a) * k + 0.8, gy - 13.5 - Math.cos(a) * k); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,248,220,0.55)'; ctx.beginPath(); ctx.ellipse(gx - 1.5, gy - 10, 1.2, 2.4, -0.2, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(x, y - 10); ctx.fillStyle = '#2b2d31'; ctx.fillRect(-7, -2.4, 14, 3.4); ctx.fillStyle = '#e8c96a'; ctx.font = '700 2.4px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('HANDJE', 0, -0.7, 13); ctx.restore();
  },
  comic(x, y, def, seed, lit) {
    // a tall blank side wall painted with a bright comic strip
    const f = 0.5, h = 46;
    box(x, y, f, 0, h, '#e8dcc8');
    const pals = [['#f2c230', '#2f6fb0', '#e05a5a'], ['#3fa77c', '#f29e4c', '#2f4fa8']][seed % 2];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const u = 0.12 + c * 0.42, v = 6 + r * 13;
      const bx = x - HW * f + HW * f * u, by = y + HH * f * u - v;
      const w = HW * f * 0.36;
      poly([[bx, by], [bx + w, by + w / 2], [bx + w, by + w / 2 - 11], [bx, by - 11]], pals[(r + c) % 3], 'rgba(30,30,30,0.7)', 0.8);
    }
    for (let r = 0; r < 3; r++) winR(x, y, f, 0, 0.3, 0.4, 8 + r * 13, 7, lit);
  },
  bikerack(x, y, def, seed) {
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 0.8;
    for (let k = 0; k < 6; k++) {
      const bx = x - 14 + k * 5, by = y - 6 + k * 2.5;
      ctx.beginPath(); ctx.ellipse(bx, by, 2, 1.6, 0, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(bx + 2, by - 4, 2, 1.6, 0, 0, 7); ctx.stroke();
      ctx.strokeStyle = ['#c0392b', '#2f6fb0', '#2b2b2b', '#3fa77c'][hash(seed + k) % 4];
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 1, by - 4); ctx.lineTo(bx + 2, by - 4); ctx.stroke();
      ctx.strokeStyle = '#2b2b2b';
    }
  },
  apt(x, y, def, seed, lit) {
    // mid-rise flats: 4-6 floors, ribbon windows, balconies, flat roof with a parapet
    const f = 0.68, floors = 4 + (seed % 3), fh = 7, h = floors * fh + 3;
    const col = ['#d8cfbd', '#b9a48c', '#a8644a', '#cfd3d6', '#e2d6c0', '#9a8f84'][seed % 6];
    box(x, y, f, 0, h, col);
    for (let r = 0; r < floors; r++) for (let c = 0; c < 4; c++) {
      winR(x, y, f, 0, 0.07 + c * 0.23, 0.16, 4 + r * fh, 4, lit && (hash(seed + r * 9 + c) & 3) === 0);
      winL(x, y, f, 0, 0.07 + c * 0.23, 0.16, 4 + r * fh, 4, lit && (hash(seed + r * 5 + c + 40) & 3) === 0);
    }
    if (seed % 2) for (let r = 1; r < floors; r++) { const a = onR(x, y, f, 0.05), b = onR(x, y, f, 0.95); ctx.strokeStyle = 'rgba(60,55,50,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a[0], a[1] - r * fh - 0.5); ctx.lineTo(b[0], b[1] - r * fh - 0.5); ctx.stroke(); }
    box(x, y, f + 0.02, h, 1.5, '#8f8a80');
  },
  office(x, y, def, seed, lit) {
    // glass office tower: blue-grey curtain wall with mullions, a darker crown on top
    const f = 0.56 + (seed % 3) * 0.04, h = 60 + (seed % 5) * 12;
    const glass = ['#7f9fb8', '#6f8fa6', '#8aa6a0', '#9aa8b8'][seed % 4];
    box(x, y, f, 0, 5, '#5d6168');
    box(x, y, f, 5, h - 5, glass);
    ctx.strokeStyle = 'rgba(235,245,250,0.35)'; ctx.lineWidth = 0.5;
    for (let k = 1; k < 8; k++) for (const side of [onR, onL]) { const q = side(x, y, f, k / 8); ctx.beginPath(); ctx.moveTo(q[0], q[1] - 5); ctx.lineTo(q[0], q[1] - h); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(40,60,80,0.25)';
    for (let z = 10; z < h; z += 5) for (const side of [onR, onL]) { const a = side(x, y, f, 0), b = side(x, y, f, 1); ctx.beginPath(); ctx.moveTo(a[0], a[1] - z); ctx.lineTo(b[0], b[1] - z); ctx.stroke(); }
    if (lit) for (let z = 10; z < h - 5; z += 5) if (hash(seed + z) % 3 === 0) { const a = onR(x, y, f, 0.1), b = onR(x, y, f, 0.6); lights.push([[a[0], a[1] - z], [b[0], b[1] - z], [b[0], b[1] - z - 3.5], [a[0], a[1] - z - 3.5]]); }
    box(x, y, f * 0.7, h, 6, '#4f5560');
    if (seed % 2) { ctx.strokeStyle = '#3a3d42'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y - h - 6); ctx.lineTo(x, y - h - 18); ctx.stroke(); }
  },
  villa(x, y, def, seed, lit) {
    // detached house with a big pitched roof, hedge and a garden
    ctx.strokeStyle = '#3f7a34'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - HW * 0.9, y); ctx.lineTo(x, y + HH * 0.9); ctx.lineTo(x + HW * 0.9, y); ctx.stroke();
    const f = 0.42, h = 14, col = ['#efe7d8', '#e2d6c0', '#d9b99a', '#f4f2ec'][seed % 4];
    const B = box(x - 3, y - 2, f, 0, h, col);
    const rh = 12, mL = [(B.t[0] + B.l[0]) / 2, (B.t[1] + B.l[1]) / 2 - rh], mR = [(B.r[0] + B.b[0]) / 2, (B.r[1] + B.b[1]) / 2 - rh];
    const roof = ['#5d5f66', '#a9483a', '#3f4248'][seed % 3];
    poly([B.t, B.r, mR, mL], shade(roof, -0.1)); poly([B.l, B.b, mR, mL], roof);
    poly([B.r, B.b, mR], shade(col, -0.05));
    winR(x - 3, y - 2, f, 0, 0.2, 0.3, 3, 6, lit); winR(x - 3, y - 2, f, 0, 0.6, 0.25, 3, 6, lit && seed % 2);
    winL(x - 3, y - 2, f, 0, 0.3, 0.35, 4, 5, lit && seed % 3 === 0);
    for (const [dx, dy, r] of [[12, 3, 3.5], [16, 0, 2.8], [-14, 4, 3]]) { ctx.fillStyle = '#3f7a34'; ctx.beginPath(); ctx.arc(x + dx, y + dy - r * 0.6, r, 0, 7); ctx.fill(); }
  },
  industry(x, y, def, seed, lit) {
    // low workshop hall: corrugated walls, sawtooth roof lights, roller door and a vent stack
    const f = 0.84, h = 16, col = ['#9aa3ab', '#b7b0a2', '#8e9a8c', '#a9a6a0'][seed % 4];
    const B = box(x, y, f, 0, h, col);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.5;
    for (let k = 1; k < 16; k++) for (const side of [onR, onL]) { const q = side(x, y, f, k / 16); ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0], q[1] - h); ctx.stroke(); }
    for (let i = 0; i < 4; i++) {
      const u0 = i / 4, u1 = (i + 1) / 4;
      const a = lerp(B.l, B.t, u0), c = lerp(B.b, B.r, u0), a2 = lerp(B.l, B.t, u1), c2 = lerp(B.b, B.r, u1);
      poly([a, c, [c2[0], c2[1] - 6], [a2[0], a2[1] - 6]], shade(col, -0.1));
      poly([[a2[0], a2[1] - 6], [c2[0], c2[1] - 6], c2, a2], '#a9c6d6');
    }
    const d = onR(x, y, f, 0.5);
    poly([[d[0] - 6, d[1] + 3], [d[0] + 6, d[1] - 3], [d[0] + 6, d[1] - 13], [d[0] - 6, d[1] - 7]], '#6d7178', 'rgba(40,40,40,0.4)', 0.5);
    box(x - 14, y - 4, 0.06, h, 14, '#7d7a72');
    winL(x, y, f, 0, 0.2, 0.15, 7, 5, lit); winL(x, y, f, 0, 0.6, 0.15, 7, 5, lit);
  },
  flat(x, y, def, seed, lit) {
    // 1960s high-rise slab: concrete frame, ribbon windows and balconies, flat roof with lift housing
    const f = 0.72, floors = 9 + (seed % 4), fh = 7.5, h = floors * fh;
    const concrete = ['#d8d2c4', '#cfc9bb', '#e2ddd0'][seed % 3];
    box(x, y, f, 0, 5, '#8f8a80');
    box(x, y, f, 5, h - 5, concrete);
    for (let r = 0; r < floors - 1; r++) {
      const v = 7 + r * fh;
      for (let c = 0; c < 4; c++) {
        winR(x, y, f, 0, 0.06 + c * 0.235, 0.17, v, 4.2, lit && (hash(seed + r * 7 + c) & 3) === 0);
        winL(x, y, f, 0, 0.06 + c * 0.235, 0.17, v, 4.2, lit && (hash(seed + r * 11 + c + 50) & 3) === 0);
      }
      // balcony slab running along the front face
      const a = [x, y + HH * f - v + 0.5], b = [x + HW * f, y - v + 0.5];
      ctx.strokeStyle = 'rgba(70,64,56,0.55)'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    box(x - 4, y - 2, 0.16, h, 7, '#a9a397');
    box(x + 8, y + 1, 0.08, h, 4, '#a9a397');
  },
  row(x, y, def, seed, lit) {
    // two or three narrow terraced houses with mixed heights, brick and plaster, like a real Flemish street
    const bricks = ['#a85c45', '#9c5440', '#b86e52', '#c9b79c', '#e2d6c0', '#d7c4a3', '#8f6a55', '#efe7d8'];
    const n = 2 + (seed % 2);
    for (let k = 0; k < n; k++) {
      const s2 = hash(seed + k * 101), u = (k + 0.5) / n - 0.5;
      const cx = x - u * HW * 0.9 * 1, cy = y + u * HH * 0.9;
      const f = 0.62 / n + 0.12, h = 24 + (s2 % 4) * 7;
      const col = bricks[s2 % bricks.length];
      const B = box(cx, cy, f, 0, h, col);
      if (s2 % 3 === 0) stepped(B, 10, shade(col, -0.06));
      else if (s2 % 3 === 1) {
        const rh = 9, mL = [(B.t[0] + B.l[0]) / 2, (B.t[1] + B.l[1]) / 2 - rh], mR = [(B.r[0] + B.b[0]) / 2, (B.r[1] + B.b[1]) / 2 - rh];
        poly([B.t, B.r, mR, mL], '#5d5f66'); poly([B.l, B.b, mR, mL], '#6e7078');
      } else box(cx, cy, f + 0.02, h, 2, '#d8d2c4');
      for (let r = 0; r < h / 11 - 1; r++) {
        winR(cx, cy, f, 0, 0.2, 0.25, 6 + r * 11, 7, lit && (s2 >> r) & 1);
        winR(cx, cy, f, 0, 0.58, 0.25, 6 + r * 11, 7, lit && (s2 >> (r + 4)) & 1);
        winL(cx, cy, f, 0, 0.35, 0.3, 6 + r * 11, 7, lit && (s2 >> (r + 7)) & 1);
      }
    }
  },
  guild(x, y, def, seed, lit) {
    const cols = def.gold ? ['#e9d7a5', '#d9c08a', '#efe1b8'] : ['#f2a65a', '#e98b7b', '#f7c873', '#c9b6e4'];
    for (let k = -1; k <= 1; k++) {
      const cx = x - k * HW * 0.42, cy = y + k * HH * 0.42;
      const col = cols[(k + 1 + seed) % cols.length];
      const B = box(cx, cy, 0.3, 0, 30 + ((k + 2) * 7 % 3) * 6, col);
      stepped(B, 14, def.gold ? '#e8c14a' : shade(col, -0.08));
      for (let r = 0; r < 2; r++) winR(cx, cy, 0.3, 0, 0.3, 0.4, 6 + r * 11, 7, lit);
      if (def.gold) { ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.arc((B.b[0] + B.r[0]) / 2, (B.b[1] + B.r[1]) / 2 - 15, 2, 0, 7); ctx.fill(); }
    }
  },
  mas(x, y, def, seed, lit) {
    let z = 0;
    for (let k = 0; k < 5; k++) {
      box(x + (k % 2 ? 3 : -3), y + (k % 2 ? -1 : 1), 0.56, z, 14, '#b5523b'); z += 14;
      box(x, y, 0.5, z, 4, '#bfe3f2'); z += 4;
      if (lit) lights.push([[x - 14, y - z + 2], [x + 14, y - z + 2], [x + 14, y - z - 1], [x - 14, y - z - 1]]);
    }
  },
  atomium(x, y, def, seed) {
    const cx = x, cy = y - 58, R = 26;
    const pts = [[0, -R * 1.15], [0, R * 1.15], [0, 0]];
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; pts.push([Math.cos(a) * R, Math.sin(a) * R * 0.75 + (k % 2 ? 8 : -8)]); }
    ctx.strokeStyle = '#8e99a6'; ctx.lineWidth = 3;
    for (const [px, py] of [[-14, 24], [14, 24], [0, 30]]) { ctx.beginPath(); ctx.moveTo(cx + pts[1][0], cy + pts[1][1]); ctx.lineTo(x + px, y + py - 30 + 30); ctx.stroke(); }
    ctx.lineWidth = 2.5;
    for (let k = 3; k < 9; k++) {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + pts[k][0], cy + pts[k][1]); ctx.stroke();
      const n = k === 8 ? 3 : k + 1;
      ctx.beginPath(); ctx.moveTo(cx + pts[k][0], cy + pts[k][1]); ctx.lineTo(cx + pts[n][0], cy + pts[n][1]); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + pts[k][0], cy + pts[k][1]); ctx.lineTo(cx + pts[k % 2 ? 1 : 0][0], cy + pts[k % 2 ? 1 : 0][1]); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx, cy + pts[0][1]); ctx.lineTo(cx, cy + pts[1][1]); ctx.stroke();
    const order = pts.map((p, i) => [p, i]).sort((a, b) => a[0][1] - b[0][1]);
    for (const [[px, py]] of order) {
      const g = ctx.createRadialGradient(cx + px - 3, cy + py - 3, 1, cx + px, cy + py, 8);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#c9d3dd'); g.addColorStop(1, '#7d8a98');
      ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx + px, cy + py, 8, 0, 7); ctx.fill(); ctx.stroke();
    }
    if (nightFactor(S.hour) > 0.2) for (const [px, py] of pts) lights.push({ glow: true, x: cx + px, y: cy + py, r: 12 });
  },
  statue(x, y, def, seed) {
    // Manneken Pis: the small bronze boy on a stone fountain in a corner niche, behind a railing
    poly([[x, y - HH * 0.7], [x + HW * 0.7, y], [x, y + HH * 0.7], [x - HW * 0.7, y]], '#d8cdb8', null);
    box(x - 4, y - 2, 0.3, 0, 22, '#cfc5ae');                       // stone niche behind
    ctx.fillStyle = '#a99677'; ctx.beginPath(); ctx.moveTo(x - 9, y - 22); ctx.quadraticCurveTo(x - 4, y - 30, x + 1, y - 22); ctx.fill();
    ctx.fillStyle = '#7fc4e6'; ctx.beginPath(); ctx.ellipse(x + 1, y + 1, 9, 4.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#bfb39a'; ctx.lineWidth = 1.2; ctx.stroke();
    box(x, y, 0.1, 0, 8, '#bfb39a');                                 // pedestal
    // the little boy
    const BR = '#4f6a58';
    ctx.fillStyle = BR; ctx.fillRect(x - 1.2, y - 14, 2.4, 4.5); ctx.fillRect(x - 1.1, y - 9.5, 0.9, 2); ctx.fillRect(x + 0.2, y - 9.5, 0.9, 2);
    ctx.beginPath(); ctx.arc(x, y - 15.6, 1.4, 0, 7); ctx.fill();
    ctx.strokeStyle = BR; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x - 1, y - 13); ctx.lineTo(x - 2.2, y - 11.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(190,230,250,0.95)'; ctx.lineWidth = 0.7;
    const ph = (tNow() * 3) % 1;
    ctx.beginPath(); ctx.moveTo(x + 0.6, y - 11); ctx.quadraticCurveTo(x + 4, y - 12 + ph, x + 5, y - 1); ctx.stroke();
    // black railing in front
    ctx.strokeStyle = '#2b2d31'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x - 8, y + 4); ctx.lineTo(x + 9, y + 1); ctx.stroke();
    for (let k = 0; k <= 8; k++) { const px = x - 8 + k * 2.1, py = y + 4 - k * 0.37; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 4); ctx.stroke(); }
    ctx.save(); ctx.translate(x - 4, y - 5); ctx.fillStyle = '#2b2d31'; ctx.fillRect(-7, -2.4, 14, 3.4); ctx.fillStyle = '#e8c96a'; ctx.font = '700 2.4px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('MANNEKEN PIS', 0, -0.7, 13); ctx.restore();
  },
  palace(x, y, def, seed, lit) {
    const f = 0.86, h = def.long ? 20 : 24;
    const B = box(x, y, f, 0, h, '#e6dcc6');
    box(x, y, f + 0.03, h, 3, '#cfc3a6');
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    for (let c = 1; c < 8; c++) { const u = c / 8; const bx = x + HW * f * u, by = y + HH * f - HH * f * u; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - h + 2); ctx.stroke(); }
    for (let c = 0; c < 4; c++) winL(x, y, f, 0, 0.1 + c * 0.22, 0.12, 6, 10, lit);
    const m = [(B.b[0] + B.r[0]) / 2, (B.b[1] + B.r[1]) / 2];
    poly([[m[0] - 14, m[1] + 7], [m[0] + 14, m[1] - 7], [m[0] + 2, m[1] - 18]], '#efe6d2');
    if (def.dome) {
      box(x, y, 0.4, h + 3, 16, '#e6dcc6');
      ctx.fillStyle = '#7d8a7a'; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x - 18, y - h - 19); ctx.bezierCurveTo(x - 18, y - h - 52, x + 18, y - h - 52, x + 18, y - h - 19); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.arc(x, y - h - 46, 3, 0, 7); ctx.fill(); ctx.stroke();
    }
    if (def.long) { ctx.fillStyle = '#e05a5a'; ctx.fillRect(x - 1, y - h - 18, 1.5, 14); poly([[x, y - h - 18], [x + 9, y - h - 15], [x, y - h - 12]], '#2f2a3a', '#3b2f2a', 0.6); }
  },
  tower(x, y, def, seed, lit) {
    const H = def.church ? 54 : 70;
    const T = box(x - 4, y - 2, 0.3, 0, H, '#d8cfbb');
    for (let r = 0; r < 4; r++) winR(x - 4, y - 2, 0.3, 0, 0.3, 0.4, 10 + r * 14, 8, lit);
    const T2 = box(x - 4, y - 2, 0.22, H, 14, '#cbc1ab');
    const top = [x - 4, y - 2 - H - 14 - 26];
    poly([T2.l, T2.b, top], '#4f6b5e'); poly([T2.b, T2.r, top], '#5f7d6f');
    // the four corner turrets
    for (const p of [T.l, T.b, T.r]) poly([[p[0] - 2, p[1]], [p[0] + 2, p[1]], [p[0], p[1] - 10]], '#5f7d6f', '#3b2f2a', 0.8);
    if (def.church) {
      const N = box(x + 8, y + 4, 0.5, 0, 22, '#cfc6b4'); const rh = 12;
      for (let c = 0; c < 3; c++) winR(x + 8, y + 4, 0.5, 0, 0.15 + c * 0.28, 0.1, 5, 11, lit);
      poly([N.t, N.r, [(N.r[0] + N.b[0]) / 2, (N.r[1] + N.b[1]) / 2 - rh], [(N.t[0] + N.l[0]) / 2, (N.t[1] + N.l[1]) / 2 - rh]], '#6c7a8a');
      poly([N.l, N.b, [(N.r[0] + N.b[0]) / 2, (N.r[1] + N.b[1]) / 2 - rh], [(N.t[0] + N.l[0]) / 2, (N.t[1] + N.l[1]) / 2 - rh]], '#7c8a9a');
    }
    if (def.dragon) { ctx.fillStyle = '#f2c94c'; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(top[0], top[1] - 3, 5, 2.5, Math.sin(tNow()) * 0.3, 0, 7); ctx.fill(); ctx.stroke(); }
  },
  arch(x, y, def, seed) {
    box(x + 12, y - 4, 0.22, 0, 30, '#e6dcc6');
    box(x - 12, y + 2, 0.22, 0, 30, '#e6dcc6');
    box(x, y - 1, 0.62, 30, 10, '#d8cdb5');
    ctx.fillStyle = '#c9a227'; ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y - 48, 8, 4, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 4, y - 53, 2.5, 0, 7); ctx.fill(); ctx.stroke();
  },
  berlaymont(x, y, def, seed, lit) {
    box(x + 10, y - 5, 0.34, 0, 48, '#a9bcd6');
    const C = box(x, y, 0.42, 0, 52, '#c2d1e4');
    for (let r = 0; r < 9; r++) { winR(x, y, 0.42, 0, 0.1, 0.8, 4 + r * 5.5, 2, lit && r % 2); }
    box(x - 10, y + 5, 0.34, 0, 48, '#a9bcd6');
    for (let r = 0; r < 8; r++) winL(x - 10, y + 5, 0.34, 0, 0.1, 0.8, 4 + r * 5.5, 2, lit && r % 2);
    ctx.fillStyle = '#2f5fa8'; ctx.fillRect(x - 1, y - 74, 12, 8);
    ctx.fillStyle = '#f2c94c'; for (let k = 0; k < 6; k++) { const a = k * 1.047; ctx.fillRect(x + 5 + Math.cos(a) * 2.5, y - 70 + Math.sin(a) * 2.5, 1, 1); }
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(x - 1, y - 74); ctx.lineTo(x - 1, y - 52); ctx.stroke();
  },
  park(x, y, def, seed) {
    poly([[x, y - HH * 0.85], [x + HW * 0.85, y], [x, y + HH * 0.85], [x - HW * 0.85, y]], '#8fd07a', '#3b2f2a', 1);
    ctx.strokeStyle = '#e9dcc0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(x + 20, y); ctx.stroke();
    const t = (dx, dy, s) => { const sw = Math.sin(tNow() * 1.5 + dx) * 1; ctx.fillStyle = '#8b5a2b'; ctx.fillRect(x + dx - 1.5, y + dy - 9, 3, 9); ctx.fillStyle = '#5fae55'; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + dx + sw, y + dy - 14, s, 0, 7); ctx.fill(); ctx.stroke(); };
    t(-12, -4, 7); t(10, -6, 6); t(2, 6, 7);
    ctx.fillStyle = '#8b5a2b'; ctx.fillRect(x - 5, y - 2, 10, 2);
  },
};
// ---------- extra detail for the big (multi-tile) landmarks: the bigger, the richer ----------
// points on the two visible faces of a box centred at (cx, cy) with footprint f
const onR = (cx, cy, f, u) => [cx + HW * f * u, cy + HH * f - HH * f * u];
const onL = (cx, cy, f, u) => [cx - HW * f + HW * f * u, cy + HH * f * u];
function pinnacle(px, py, z, h, col) {
  poly([[px - 1.6, py - z], [px + 1.6, py - z], [px, py - z - h]], col, 'rgba(60,50,40,0.5)', 0.5);
}
function buttress(pt, z, h, col) {
  box(pt[0] + 0.8, pt[1] + 0.4, 0.045, 0, h, col);
  pinnacle(pt[0] + 0.8, pt[1] + 0.4, h, 7, col);
}
function rose(x, y, r) {
  ctx.fillStyle = '#7d5aa8'; ctx.strokeStyle = 'rgba(250,246,236,0.9)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r, -0.4, 0, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r); }
  ctx.stroke();
  ctx.fillStyle = '#e8c96a'; ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, 7); ctx.fill();
}
function clockFace(x, y, r) {
  ctx.fillStyle = '#f6f2e6'; ctx.strokeStyle = '#3a3d42'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r, -0.4, 0, 7); ctx.fill(); ctx.stroke();
  const a = (hourNow() / 12) * Math.PI * 2 - Math.PI / 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 0.8); ctx.stroke();
}
function statueFig(x, y, col = '#5f6f58') {
  ctx.fillStyle = col; ctx.fillRect(x - 0.7, y - 4, 1.4, 4); ctx.beginPath(); ctx.arc(x, y - 4.8, 0.9, 0, 7); ctx.fill();
}
// Antwerpen-Centraal: neo-baroque stone head building with the big ribbed dome and corner towers,
// and the iron-and-glass train shed behind it. Drawn in tile-local (u, v, z): u runs toward the
// right face, v toward the left face.
function centraalStation(x, y, lit) {
  const P = (u, v, z) => [x + (u - v) * HW, y + (u + v) * HH - z];
  const STONE = '#e4d6b4', BAND = '#c4a77a', SLATE = '#56606b', GOLD = '#d9b44a', IRON = '#46505a', CORN = '#f1e8d2';
  const blk = (u0, u1, v0, v1, z0, h, col) => {
    const z1 = z0 + h;
    poly([P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)], shade(col, -0.18));
    poly([P(u1, v1, z0), P(u1, v0, z0), P(u1, v0, z1), P(u1, v1, z1)], shade(col, -0.04));
    poly([P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], shade(col, 0.15));
  };
  // a visible face as (s, z) -> screen, s running left to right on screen
  const fR = (u) => (s, z) => P(u, -s, z);
  const fL = (v) => (s, z) => P(s, v, z);
  const band = (f, s0, s1, z, h, col) => poly([f(s0, z), f(s1, z), f(s1, z + h), f(s0, z + h)], col, null);
  const arch = (f, s0, s1, z0, z1, rise) => {
    const m = (s0 + s1) / 2, r = (s1 - s0) / 2, pts = [f(s0, z0), f(s1, z0)];
    for (let k = 0; k <= 8; k++) { const t = k / 8 * Math.PI; pts.push(f(m + r * Math.cos(t), z1 + rise * Math.sin(t))); }
    return pts;
  };
  const glass = (pts) => {
    if (lit) lights.push(pts);
    if (lod) { poly(pts, '#7fa6bd', null); return; }
    let t = Infinity, b = -Infinity; for (const p of pts) { t = Math.min(t, p[1]); b = Math.max(b, p[1]); }
    const g = ctx.createLinearGradient(0, t, 0, b); g.addColorStop(0, '#e4f3fa'); g.addColorStop(0.5, '#8fbdd6'); g.addColorStop(1, '#4f7d99');
    poly(pts, g, 'rgba(250,246,236,0.9)', 0.5);
  };
  const hgrad = (cx, rx, col) => {
    if (lod) return shade(col, 0);
    const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    g.addColorStop(0, shade(col, -0.25)); g.addColorStop(0.62, shade(col, 0.18)); g.addColorStop(1, shade(col, -0.05));
    return g;
  };
  const cyl = (u, v, z, r, h, col, wins) => {
    const [cx, cy] = P(u, v, z), rx = r * Math.SQRT2 * HW, ry = r * Math.SQRT2 * HH;
    ctx.beginPath(); ctx.moveTo(cx - rx, cy - h); ctx.lineTo(cx - rx, cy);
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(cx + rx, cy - h);
    ctx.ellipse(cx, cy - h, rx, ry, 0, 0, Math.PI); ctx.closePath();
    ctx.fillStyle = hgrad(cx, rx, col); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.fillStyle = shade(col, 0.15); ctx.beginPath(); ctx.ellipse(cx, cy - h, rx, ry, 0, 0, 7); ctx.fill(); ctx.stroke();
    if (wins && !lod) for (let k = 0; k < wins; k++) {
      // round-arched drum windows between pilasters, narrower toward the sides
      const b = (k + 0.5) / wins * Math.PI, wx = Math.sin(b) * rx * 0.22, px = cx + rx * Math.cos(b), py = cy + ry * Math.sin(b);
      const z0 = h * 0.2, z1 = h * 0.72;
      glass([[px - wx, py - z0], [px + wx, py - z0], [px + wx, py - z1], [px, py - z1 - wx], [px - wx, py - z1]]);
      const qb = k / wins * Math.PI, qx = cx + rx * Math.cos(qb), qy = cy + ry * Math.sin(qb);
      ctx.strokeStyle = CORN; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx, qy - h); ctx.stroke();
    }
  };
  const dome = (u, v, z, r, H, col, ribs, pw) => {
    const [cx, cy] = P(u, v, z), rx = r * Math.SQRT2 * HW, ry = r * Math.SQRT2 * HH, N = 12;
    const rho = (s) => Math.pow(Math.cos(s * Math.PI / 2), pw);
    ctx.beginPath(); ctx.moveTo(cx - rx, cy);
    for (let k = 1; k <= N; k++) ctx.lineTo(cx - rx * rho(k / N), cy - H * k / N);
    for (let k = N - 1; k >= 0; k--) ctx.lineTo(cx + rx * rho(k / N), cy - H * k / N);
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
    ctx.fillStyle = hgrad(cx, rx, col); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.5; ctx.stroke();
    if (ribs && !lod) {
      ctx.strokeStyle = GOLD; ctx.lineWidth = 0.3;
      for (let k = 0; k < ribs; k++) {
        const b = (k + 0.5) / ribs * Math.PI;
        ctx.beginPath();
        for (let j = 0; j <= N; j++) { const s = j / N, q = rho(s), px = cx + rx * q * Math.cos(b), py = cy + ry * q * Math.sin(b) - H * s; j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke();
      }
      // gilded garland ring a third of the way up
      const q = rho(0.3); ctx.beginPath(); ctx.ellipse(cx, cy - H * 0.3, rx * q, ry * q, 0, 0, Math.PI); ctx.stroke();
    }
    return [cx, cy - H];
  };
  const finial = (pt, h) => {
    ctx.strokeStyle = GOLD; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(pt[0], pt[1]); ctx.lineTo(pt[0], pt[1] - h); ctx.stroke();
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(pt[0], pt[1] - h * 0.55, 0.9, 0, 7); ctx.fill();
  };

  // --- train shed: stone side wall with arched windows under the iron-and-glass barrel vault
  const su0 = -0.48, su1 = 0.12, w = 0.3, NV = 10;
  blk(su0, su1, -w - 0.02, w + 0.02, 0, 9, '#cdb98f');
  for (let k = 0; k < 7; k++) { const s = su0 + 0.025 + k * 0.08; glass(arch(fL(w + 0.02), s, s + 0.05, 2, 5.5, 1.5)); }
  const zv = (v) => 9 + 15 * Math.sqrt(Math.max(0, 1 - (v / w) ** 2));
  for (let i = 0; i < NV; i++) {
    const v0 = -w + 2 * w * i / NV, v1 = v0 + 2 * w / NV, t = (v0 + v1) / 2 / w;
    poly([P(su0, v0, zv(v0)), P(su1, v0, zv(v0)), P(su1, v1, zv(v1)), P(su0, v1, zv(v1))], shade('#a3bfcc', 0.22 - 0.35 * t * t - 0.15 * Math.max(0, -t)), 'rgba(60,70,80,0.3)', 0.35);
  }
  if (!lod) {
    ctx.strokeStyle = IRON; ctx.lineWidth = 0.5;
    for (let u = su0; u <= su1 + 1e-6; u += 0.05) {
      ctx.beginPath();
      for (let i = 0; i <= NV; i++) { const v = -w + 2 * w * i / NV, p = P(u, v, zv(v)); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.stroke();
    }
  }
  blk(su0, su1, -0.035, 0.035, 23.6, 2, '#6b7680');   // smoke vent along the ridge

  // --- head building wings: banded stone, two storeys of arched windows, slate mansard with dormers
  const U0 = 0.1, U1 = 0.44, V = 0.46, H1 = 18, FR = fR(U1), FL = fL(V);
  blk(U0, U1, -V, V, 0, H1, STONE);
  for (const z of [6.5, 12.5]) { band(FR, -V, V, z, 0.9, BAND); band(FL, U0, U1, z, 0.9, BAND); }
  band(FR, -V, V, H1 - 1.4, 1.4, CORN); band(FL, U0, U1, H1 - 1.4, 1.4, CORN);
  const wingS = [-0.3, -0.24, 0.24, 0.3];
  for (const s of wingS) { glass(arch(FR, s - 0.022, s + 0.022, 1.8, 5, 1.2)); glass(arch(FR, s - 0.02, s + 0.02, 8.5, 11.5, 1)); }
  for (const s of [0.15, 0.21, 0.27]) { glass(arch(FL, s - 0.022, s + 0.022, 1.8, 5, 1.2)); glass(arch(FL, s - 0.02, s + 0.02, 8.5, 11.5, 1)); }
  const d = 0.05, zr = H1 + 6;
  poly([P(U0, V, H1), P(U1, V, H1), P(U1 - d, V - d, zr), P(U0 + d, V - d, zr)], shade(SLATE, -0.15));
  poly([P(U1, V, H1), P(U1, -V, H1), P(U1 - d, -V + d, zr), P(U1 - d, V - d, zr)], shade(SLATE, 0));
  poly([P(U0 + d, -V + d, zr), P(U1 - d, -V + d, zr), P(U1 - d, V - d, zr), P(U0 + d, V - d, zr)], shade(SLATE, 0.15));
  if (!lod) {
    for (const s of wingS) glass(arch(fR(U1 - 0.02), s - 0.014, s + 0.014, H1 + 1.2, H1 + 3.2, 0.8));
    for (const s of wingS) statueFig(...FR(s, H1), '#cfc3a6');
  }

  // --- corner towers with stone cupolas and gilded finials
  const tower = (vc) => {
    const a = 0.3, b = 0.47, v0 = vc - 0.075, v1 = vc + 0.075, uc = (a + b) / 2;
    blk(a, b, v0, v1, 0, 30, STONE);
    for (const z of [6.5, 12.5, 20]) { band(fR(b), -v1, -v0, z, 0.9, BAND); band(fL(v1), a, b, z, 0.9, BAND); }
    for (const z of [2, 8.5, 15, 22]) { glass(arch(fR(b), -v1 + 0.05, -v0 - 0.05, z, z + 3, 1)); glass(arch(fL(v1), a + 0.06, b - 0.06, z, z + 3, 1)); }
    blk(a - 0.012, b + 0.012, v0 - 0.012, v1 + 0.012, 30, 1.5, CORN);
    cyl(uc, vc, 31.5, 0.058, 4, STONE, 4);
    finial(dome(uc, vc, 35.5, 0.066, 5.5, '#5f7d6f', 6, 0.5), 3.5);
  };
  tower(-0.4);

  // --- central pavilion: entrance arches, the huge glazed arch, pilasters
  const PU0 = 0.04, PU1 = 0.5, PV = 0.2, H2 = 26, PF = fR(PU1);
  blk(PU0, PU1, -PV, PV, 0, H2, '#e8dbbd');
  for (const z of [6.5, 12.5, 20]) { band(PF, -PV, PV, z, 0.9, BAND); band(fL(PV), PU0, PU1, z, 0.9, BAND); }
  for (const s of [-0.175, 0.175]) poly([PF(s - 0.016, 0), PF(s + 0.016, 0), PF(s + 0.016, H2), PF(s - 0.016, H2)], '#f1e6cb', 'rgba(42,34,28,0.2)', 0.4);
  for (const s of [-0.1, 0, 0.1]) {
    const p = arch(PF, s - 0.034, s + 0.034, 0, 4.5, 2);
    poly(p, lit ? '#f4c66a' : '#3d3530', 'rgba(250,246,236,0.85)', 0.5);
    if (lit) lights.push(p);
  }
  glass(arch(PF, -0.13, 0.13, 8.5, 16.5, 6.5));
  if (!lod) {
    ctx.strokeStyle = 'rgba(70,80,90,0.75)'; ctx.lineWidth = 0.45; ctx.beginPath();
    for (let s = -0.09; s <= 0.091; s += 0.045) { const a = PF(s, 8.5), b = PF(s, 16.5 + 6.5 * Math.sqrt(1 - (s / 0.13) ** 2)); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    for (const z of [11.2, 14]) { const a = PF(-0.13, z), b = PF(0.13, z); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    // stone voussoir ring around the big arch
    ctx.strokeStyle = CORN; ctx.lineWidth = 1.3; ctx.beginPath();
    for (let k = 0; k <= 12; k++) { const t = k / 12 * Math.PI, p = PF(0.14 * Math.cos(t), 16.5 + 7.3 * Math.sin(t)); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.stroke();
  }
  blk(PU0 - 0.012, PU1 + 0.012, -PV - 0.012, PV + 0.012, H2, 1.5, CORN);

  // --- the great dome: windowed drum, ribbed dome with gilded ribs, lantern and spire
  const DU = 0.26;
  cyl(DU, 0, 27.5, 0.17, 6.5, STONE, 8);
  dome(DU, 0, 34, 0.18, 12.5, '#4d625e', 10, 0.55);
  cyl(DU, 0, 46.5, 0.042, 3, STONE, 4);
  finial(dome(DU, 0, 49.5, 0.048, 3, '#4d625e', 4, 0.5), 4);

  // --- clock gable on the front with the station clock, flanked by two cupola turrets
  const gp = [];
  for (let k = 0; k <= 12; k++) { const s = -0.14 + k * 0.28 / 12; gp.push(PF(s, H2 + 1.5 + 6.5 * Math.cos(s / 0.14 * Math.PI / 2))); }
  poly([PF(0.14, H2 + 1.5), PF(-0.14, H2 + 1.5), ...gp], '#ece0c3');
  clockFace(...PF(0, H2 + 4.6), 2.4);
  finial(PF(0, H2 + 8), 3);
  for (const vc of [-0.17, 0.17]) {
    blk(0.445, 0.505, vc - 0.03, vc + 0.03, H2 + 1.5, 6, STONE);
    finial(dome(0.475, vc, H2 + 7.5, 0.038, 4, '#5f7d6f', 4, 0.5), 2.5);
  }
  statueFig(...PF(-0.175, H2 + 1.5), GOLD); statueFig(...PF(0.175, H2 + 1.5), GOLD);

  tower(0.4);
}
const DETAIL = {
  cathedral(x, y, def, seed, lit) {
    const stone = '#d4cab4';
    if (def.twin) {
      // pinnacles on both west towers and a gable with a rose window between them
      for (const [dx, dy] of [[-2, -6], [-14, 2]]) {
        const tx = x + dx, ty = y + dy, f = 0.22;
        for (const c of [[tx - HW * f, ty], [tx, ty + HH * f], [tx + HW * f, ty]]) pinnacle(c[0], c[1], 54, 10, '#e6dcc6');
        clockFace(...onR(tx, ty, f, 0.5).map((v, i) => i ? v - 42 : v), 2.2);
      }
      poly([[x - 9, y - 26], [x - 1, y - 30], [x - 5, y - 42]], '#e6dcc6');
      rose(x - 5, y - 32, 3);
      for (const u of [0.15, 0.5, 0.85]) buttress(onR(x + 6, y + 3, 0.55, u), 0, 22, stone);
      return;
    }
    // flying buttresses with pinnacles along both visible sides of the nave
    for (const u of [0.12, 0.38, 0.64, 0.9]) buttress(onR(x + 6, y + 3, 0.55, u), 0, 22, stone);
    for (const u of [0.2, 0.5, 0.8]) { const q = onL(x + 6, y + 3, 0.55, u); box(q[0] - 0.8, q[1] + 0.4, 0.045, 0, 20, stone); pinnacle(q[0] - 0.8, q[1] + 0.4, 20, 6, stone); }
    // big rose window on the transept and a clock and gallery on the tower
    rose(x + 15, y - 12, 5);
    clockFace(x - 6.5, y - 4 - 52, 3);
    box(x - 10, y - 4, 0.3, 64, 2, '#cfc5ae');
    for (const c of [[-10 - HW * 0.3, -4], [-10, -4 + HH * 0.3], [-10 + HW * 0.3, -4]]) pinnacle(x + c[0], y + c[1], 66, 9, '#e6dcc6');
    // tower: stage ledges, tracery panels, belfry openings and corner pinnacles at every stage
    const tc = [x - 10, y - 4], tf = 0.26;
    for (const z of [22, 44]) {
      box(tc[0], tc[1], tf + 0.02, z, 1.6, '#cfc5ae');
      for (const c of [[-HW * tf, 0], [0, HH * tf], [HW * tf, 0]]) pinnacle(tc[0] + c[0], tc[1] + c[1], z + 1.6, 5, '#e6dcc6');
    }
    ctx.strokeStyle = 'rgba(120,105,80,0.45)'; ctx.lineWidth = 0.5;
    for (const u of [0.15, 0.85]) for (const side of [onR, onL]) { const q = side(tc[0], tc[1], tf, u); ctx.beginPath(); ctx.moveTo(q[0], q[1] - 3); ctx.lineTo(q[0], q[1] - 60); ctx.stroke(); }
    for (const side of [onR, onL]) {
      const q = side(tc[0], tc[1], tf, 0.5);
      ctx.fillStyle = '#3a3630'; ctx.beginPath(); ctx.moveTo(q[0] - 1.6, q[1] - 47); ctx.lineTo(q[0] - 1.6, q[1] - 56); ctx.quadraticCurveTo(q[0], q[1] - 59, q[0] + 1.6, q[1] - 56); ctx.lineTo(q[0] + 1.6, q[1] - 47); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(200,190,170,0.6)'; ctx.lineWidth = 0.4; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(q[0] - 1.6, q[1] - 48.5 - k * 2); ctx.lineTo(q[0] + 1.6, q[1] - 48.5 - k * 2); ctx.stroke(); }
    }
    // openwork bands on the spire
    ctx.strokeStyle = 'rgba(110,95,70,0.7)'; ctx.lineWidth = 0.6;
    for (const z of [74, 84, 92]) { const w = 8.3 * (1 - (z - 64) / 36); ctx.beginPath(); ctx.moveTo(tc[0] - w, tc[1] - z); ctx.lineTo(tc[0] + w, tc[1] - z); ctx.stroke(); }
    // nave: tracery parapet, extra lancet windows and the baroque crossing turret on the roof
    ctx.fillStyle = '#e6dcc6';
    for (let k = 0; k <= 12; k++) { const q = onR(x + 6, y + 3, 0.55, k / 12); ctx.fillRect(q[0] - 0.4, q[1] - 26.5, 0.8, 2.5); }
    for (let c = 0; c < 3; c++) winL(x + 6, y + 3, 0.55, 0, 0.2 + c * 0.25, 0.08, 6, 13, lit);
    const ridge = [x + 6, y + 3 - 24 - 14];
    box(ridge[0], ridge[1] + 14 + 24 - 24 - 14, 0.07, 38, 6, '#5f7d6f');
    ctx.fillStyle = '#4f6b5e'; ctx.beginPath(); ctx.ellipse(ridge[0], ridge[1] - 7, 3, 3.6, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ridge[0] - 1.2, ridge[1] - 9.5); ctx.lineTo(ridge[0], ridge[1] - 17); ctx.lineTo(ridge[0] + 1.2, ridge[1] - 9.5); ctx.fill();
    ctx.fillStyle = '#e2b23a'; ctx.beginPath(); ctx.arc(ridge[0], ridge[1] - 17.5, 0.9, 0, 7); ctx.fill();
    // crockets up the spire
    ctx.strokeStyle = 'rgba(120,105,80,0.8)'; ctx.lineWidth = 0.6;
    for (let k = 1; k < 7; k++) { const z = 64 + k * 5, w = 8.3 * (1 - k / 7.3); ctx.beginPath(); ctx.moveTo(x - 10 - w, y - 4 - z); ctx.lineTo(x - 10 - w - 1.2, y - 4 - z - 1); ctx.moveTo(x - 10 + w, y - 4 - z); ctx.lineTo(x - 10 + w + 1.2, y - 4 - z - 1); ctx.stroke(); }
  },
  station(x, y, def, seed, lit) {
    if (def.plain || def.centraal) return;
    // two corner towers with little domes, a huge arched train-shed window and statues on the roof
    for (const q of [onR(x, y, 0.86, 0.08), onR(x, y, 0.86, 0.92)]) {
      box(q[0], q[1] - 2, 0.12, 0, 40, '#d8c9a3');
      ctx.fillStyle = '#6f8f7a'; ctx.beginPath(); ctx.ellipse(q[0], q[1] - 2 - 40, 4, 2, 0, Math.PI, 0); ctx.bezierCurveTo(q[0] + 4, q[1] - 50, q[0] - 4, q[1] - 50, q[0] - 4, q[1] - 42); ctx.fill();
      pinnacle(q[0], q[1] - 2, 47, 5, '#f2c94c');
    }
    const m = onR(x, y, 0.86, 0.5);
    ctx.fillStyle = '#9cc2d6'; ctx.strokeStyle = 'rgba(250,246,236,0.9)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(m[0] - 8, m[1] + 4 - 4); ctx.lineTo(m[0] - 8, m[1] + 4 - 16); ctx.quadraticCurveTo(m[0], m[1] - 24, m[0] + 8, m[1] - 4 - 16); ctx.lineTo(m[0] + 8, m[1] - 4 - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(m[0] + k * 3, m[1] - k * 1.5 - 4); ctx.lineTo(m[0] + k * 3, m[1] - k * 1.5 - 18 + Math.abs(k) * 1.5); ctx.stroke(); }
    for (const u of [0.25, 0.4, 0.6, 0.75]) { const q = onR(x, y, 0.86, u); statueFig(q[0], q[1] - 24); }
  },
  palace(x, y, def, seed, lit) {
    const f = 0.86, h = def.long ? 20 : 24;
    // colonnade with capitals on the front, a balustrade with statues, and urns on the corners
    for (let c = 1; c < 12; c++) {
      const q = onR(x, y, f, c / 12);
      box(q[0] + 0.6, q[1] + 0.3, 0.025, 2, h - 6, '#efe6d2');
      ctx.fillStyle = '#d8cdb5'; ctx.fillRect(q[0] - 0.6, q[1] - h + 3.5, 2.4, 1.2);
    }
    ctx.fillStyle = '#efe6d2';
    for (let c = 0; c <= 16; c++) { const q = onR(x, y, f + 0.03, c / 16); ctx.fillRect(q[0] - 0.4, q[1] - h - 6, 0.8, 3); }
    for (const u of [0.1, 0.3, 0.7, 0.9]) { const q = onR(x, y, f, u); statueFig(q[0], q[1] - h - 6, '#cfc3a6'); }
    if (def.dome) {
      // drum with columns and a lantern on top of the dome
      ctx.strokeStyle = 'rgba(80,80,70,0.6)'; ctx.lineWidth = 0.6;
      for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(x + k * 3.6, y - h - 4); ctx.lineTo(x + k * 3.6, y - h - 18); ctx.stroke(); }
      box(x, y, 0.06, h + 3 + 16 + 24, 7, '#e6dcc6');
    }
  },
  castle(x, y, def, seed, lit) {
    // round corner turrets, arrow slits and a dark gate with a portcullis
    const B = { l: [x - HW * 0.72, y], b: [x, y + HH * 0.72], r: [x + HW * 0.72, y] };
    for (const c of [B.l, B.b, B.r]) {
      ctx.fillStyle = '#aaa294'; ctx.beginPath(); ctx.ellipse(c[0], c[1], 3.4, 1.8, 0, 0, Math.PI); ctx.lineTo(c[0] - 3.4, c[1] - 30); ctx.ellipse(c[0], c[1] - 30, 3.4, 1.8, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c4bcad'; ctx.beginPath(); ctx.ellipse(c[0], c[1] - 30, 3.4, 1.8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#9b9384'; for (let k = -1; k <= 1; k++) ctx.fillRect(c[0] + k * 2.2 - 0.6, c[1] - 33, 1.2, 3);
      ctx.fillStyle = '#3a3630'; ctx.fillRect(c[0] - 0.4, c[1] - 20, 0.8, 4);
    }
    const g = onR(x, y, 0.72, 0.5);
    ctx.fillStyle = '#2b2622'; ctx.beginPath(); ctx.moveTo(g[0] - 3, g[1] + 1.5); ctx.lineTo(g[0] - 3, g[1] - 7); ctx.quadraticCurveTo(g[0], g[1] - 11, g[0] + 3, g[1] - 10); ctx.lineTo(g[0] + 3, g[1] - 1.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6b6258'; ctx.lineWidth = 0.4; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(g[0] + k * 1.2, g[1] - k * 0.6 + 1); ctx.lineTo(g[0] + k * 1.2, g[1] - k * 0.6 - 8); ctx.stroke(); }
    for (const u of [0.15, 0.3, 0.7, 0.85]) { const q = onR(x, y, 0.72, u); ctx.fillStyle = '#3a3630'; ctx.fillRect(q[0] - 0.4, q[1] - 15, 0.8, 4); }
  },
  guild(x, y, def, seed, lit) {
    if (def.gold) return;
    // Grand-Place: the Gothic town hall tower with its golden Saint Michael rising in front
    const tx = x - 14, ty = y + 7;
    box(tx, ty, 0.16, 0, 46, '#d8cdb5');
    for (let r = 0; r < 4; r++) winR(tx, ty, 0.16, 0, 0.25, 0.5, 8 + r * 9, 6, lit);
    box(tx, ty, 0.12, 46, 12, '#cfc3a6');
    box(tx, ty, 0.08, 58, 10, '#cfc3a6');
    poly([[tx - 3, ty - 68], [tx + 3, ty - 68], [tx, ty - 84]], '#cfc3a6');
    ctx.fillStyle = '#e2b23a'; ctx.fillRect(tx - 0.7, ty - 90, 1.4, 6); ctx.beginPath(); ctx.arc(tx, ty - 91, 1, 0, 7); ctx.fill();
    for (const c of [[-3.6, 0], [3.6, 0], [0, 1.8]]) pinnacle(tx + c[0], ty + c[1], 46, 6, '#e6dcc6');
  },
  arch(x, y, def, seed) {
    // the bronze quadriga on top of the arcade
    ctx.fillStyle = '#4f6a58';
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(x - 6 + k * 3.5, y - 46 + k * 0.3, 1.6, 1, 0, 0, 7); ctx.fill(); ctx.fillRect(x - 6.5 + k * 3.5, y - 46, 0.6, 3); ctx.fillRect(x - 6 + k * 3.5 + 1, y - 48.5, 0.8, 2); }
    statueFig(x + 8, y - 44, '#4f6a58');
  },
  berlaymont(x, y, def, seed, lit) {
    // EU flags in front of the building
    for (const dx of [-6, -2, 2, 6]) { const fx = x + 18 + dx, fy = y + 10 - dx * 0.5; ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 18); ctx.stroke(); ctx.fillStyle = '#2f4fa8'; ctx.fillRect(fx, fy - 18, 5, 3); ctx.fillStyle = '#f2c94c'; ctx.fillRect(fx + 2, fy - 17, 1, 1); }
  },
};
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

function stepped(B, rh, col) {
  // stepped gable on the front-right end: edge from B.b to B.r
  const pts = [B.b];
  const steps = 3;
  const e = [B.r[0] - B.b[0], B.r[1] - B.b[1]];
  for (let i = 0; i < steps; i++) {
    const u0 = i / (steps * 2), u1 = (i + 1) / (steps * 2), z = rh * (i + 1) / steps;
    pts.push([B.b[0] + e[0] * u0, B.b[1] + e[1] * u0 - z]);
    pts.push([B.b[0] + e[0] * u1, B.b[1] + e[1] * u1 - z]);
  }
  for (let i = steps - 1; i >= 0; i--) {
    const u0 = 1 - (i + 1) / (steps * 2), u1 = 1 - i / (steps * 2), z = rh * (i + 1) / steps;
    pts.push([B.b[0] + e[0] * u0, B.b[1] + e[1] * u0 - z]);
    pts.push([B.b[0] + e[0] * u1, B.b[1] + e[1] * u1 - z]);
  }
  pts.push(B.r);
  poly(pts, col);
}

function battlements(B, col) {
  for (const p of [B.t, B.r, B.b, B.l]) box(p[0], p[1], 0.07, 0, 5, col);
}

function gear(x, y, r, a, col) {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const ang = a + (i / 16) * Math.PI * 2, rr = i % 2 ? r : r * 1.3;
    ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.6);
  }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#3b2f2a'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.35, r * 0.22, 0, 0, 7); ctx.fill();
}

// ---------- data links: each building pings its nearest lamppost ----------
function drawLinks() {
  const list = buildingsList();
  const lamps = list.filter((b) => BUILDINGS[b.type].kind === 'net' && !b.incident);
  if (!lamps.length) return;
  for (const b of list) {
    const def = BUILDINGS[b.type];
    if (def.kind === 'net' || def.kind === 'fun' || b.incident || !D.covered.has(b.i)) continue;
    let best = null, bd = 1e9;
    for (const l of lamps) { const d = (l.x - b.x) ** 2 + (l.y - b.y) ** 2; if (d < bd) { bd = d; best = l; } }
    if (!best) continue;
    const a = toScreen(b.x + 0.5, b.y + 0.5), c = toScreen(best.x + 0.5, best.y + 0.5);
    const ax = a.x, ay = a.y - 30, cx = c.x, cy = c.y - 50;
    const mx = (ax + cx) / 2, my = Math.min(ay, cy) - 30;
    ctx.strokeStyle = 'rgba(63,182,168,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, cx, cy); ctx.stroke(); ctx.setLineDash([]);
    // travelling packet (little heart / envelope dot)
    const t = (time * 0.5 + (b.id % 10) / 10) % 1;
    const qx = (1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t * t * cx, qy = (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t * t * cy;
    ctx.fillStyle = def.kind === 'dc' ? '#f2c94c' : '#ff8fb1'; ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(qx, qy, 3, 0, 7); ctx.fill(); ctx.stroke();
  }
}

function drawParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life -= dt * 0.8;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, p.life);
    if (p.kind === 'text') {
      ctx.font = 'bold 14px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = '#2f7a45'; ctx.fillText(p.text, p.x, p.y);
    } else if (p.kind === 'puff') {
      // puffs grow as they age; long-lived smoke starts small and billows out
      if (p.life0 == null) p.life0 = p.life;
      const grow = p.life0 > 1.6 ? 0.4 + (1 - p.life / p.life0) * 1.4 : 1.6 - p.life * 0.5;
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, p.r * grow), 0, 7); ctx.fill();
    } else { ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, 4, 4); }
  }
  ctx.globalAlpha = 1;
}

function drawHover() {
  const h = ui.hover; if (!h) return;
  const p = toScreen(h.x + 0.5, h.y + 0.5);
  const ok = h.ok;
  if (ui.tool?.startsWith('disaster:')) {
    // show the area the disaster will hit
    const dz = DISASTERS[ui.tool.slice(9)], r = dz.radius, pulse = 1 + Math.sin(time * 6) * 0.03;
    ctx.fillStyle = 'rgba(224,90,90,0.22)'; ctx.strokeStyle = 'rgba(200,40,40,0.95)'; ctx.lineWidth = 3.5; ctx.setLineDash([10, 7]);
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r * HW * 1.41 * pulse, r * HH * 1.41 * pulse, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(dz.icon, p.x, p.y - 30);
    return;
  }
  const col = ui.tool === 'bulldoze' ? 'rgba(224,90,90,0.45)' : ok ? 'rgba(255,255,255,0.5)' : 'rgba(224,90,90,0.35)';
  poly([[p.x, p.y - HH], [p.x + HW, p.y], [p.x, p.y + HH], [p.x - HW, p.y]], col, '#3b2f2a', 2);
  if (ui.tool && ui.tool !== 'bulldoze' && ok) {
    ctx.globalAlpha = 0.55;
    const def = BUILDINGS[ui.tool];
    tall(p, () => (STYLES[def.style] || STYLES.gable)(p.x, p.y, def, 7, false, { i: -1, id: 7 }));
    ctx.globalAlpha = 1;
    if (def.radius) {
      ctx.strokeStyle = 'rgba(63,182,168,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, def.radius * HW * 1.4, def.radius * HH * 1.4, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
  }
}

// ---------- weather effects (screen space, on top of the city) ----------
const drops = [];
let flash = 0, nextBolt = 4;
function drawWeather(dt, night) {
  const k = weather.kind, wind = Math.min(60, weather.wind || 0);
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // overcast tint over the whole scene
  if (weather.gloom) { ctx.fillStyle = `rgba(70,82,100,${weather.gloom * 0.22 * (1 - night * 0.5)})`; ctx.fillRect(0, 0, W, H); }
  // drifting cloud shadows over the board
  if (weather.sunBlock > 0.3 && night < 0.8) {
    ctx.fillStyle = `rgba(30,40,60,${0.08 * weather.sunBlock})`;
    for (let i = 0; i < 4; i++) {
      const x = ((time * (8 + wind * 0.6) + i * 360) % (W + 600)) - 300, y = H * (0.25 + 0.17 * i);
      ctx.beginPath(); ctx.ellipse(x, y, 220, 70, -0.25, 0, 7); ctx.fill();
    }
  }
  if (k === 'fog') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(235,238,240,0.15)'); g.addColorStop(0.6, 'rgba(235,238,240,0.42)'); g.addColorStop(1, 'rgba(235,238,240,0.6)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) {
      const x = ((time * 12 + i * 260) % (W + 500)) - 250;
      ctx.fillStyle = 'rgba(245,247,248,0.18)'; ctx.beginPath(); ctx.ellipse(x, H * (0.3 + i * 0.11), 300, 40, 0, 0, 7); ctx.fill();
    }
  }
  const want = k === 'snow' ? 260 : k === 'rain' ? 380 : k === 'storm' ? 520 : k === 'drizzle' ? 140 : 0;
  while (drops.length < want) drops.push({ x: Math.random() * W, y: Math.random() * H, s: 0.6 + Math.random() * 0.8, ph: Math.random() * 7 });
  if (drops.length > want) drops.length = want;
  const slant = (k === 'storm' ? 0.45 : 0.15) + wind / 120;
  if (k === 'snow') {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const d of drops) {
      d.y += (28 + 22 * d.s) * dt; d.x += (Math.sin(time + d.ph) * 14 + wind * 0.8) * dt;
      if (d.y > H) { d.y = -5; d.x = Math.random() * W; } if (d.x > W) d.x = 0;
      ctx.beginPath(); ctx.arc(d.x, d.y, 1.4 + d.s * 1.4, 0, 7); ctx.fill();
    }
  } else if (want) {
    ctx.strokeStyle = 'rgba(215,230,245,0.75)'; ctx.lineWidth = 1.3; ctx.beginPath();
    const sp = k === 'drizzle' ? 420 : 760;
    for (const d of drops) {
      d.y += sp * d.s * dt; d.x += sp * d.s * slant * dt;
      if (d.y > H) {
        // splash where the drop lands
        if (Math.random() < 0.25) splash.length < 160 && splash.push({ x: d.x, y: H * (0.3 + Math.random() * 0.65), t: 0 });
        d.y = -20; d.x = Math.random() * (W + 200) - 200;
      }
      const l = (k === 'drizzle' ? 7 : 13) * d.s;
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - l * slant, d.y - l);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,235,250,0.6)';
    for (let i = splash.length - 1; i >= 0; i--) {
      const s = splash[i]; s.t += dt * 3;
      if (s.t > 1) { splash.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - s.t; ctx.beginPath(); ctx.ellipse(s.x, s.y, 2 + s.t * 6, 1 + s.t * 3, 0, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (k === 'storm') {
    nextBolt -= dt;
    if (nextBolt < 0) { flash = 1; nextBolt = 3 + Math.random() * 6; bolt = { x: W * (0.3 + Math.random() * 0.5), seed: Math.random() * 1000 }; }
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.45})`; ctx.fillRect(0, 0, W, H);
      if (bolt && flash > 0.5) {
        ctx.strokeStyle = `rgba(255,250,210,${flash})`; ctx.lineWidth = 2.5; ctx.beginPath();
        let x = bolt.x, y = 0; ctx.moveTo(x, y);
        for (let i = 0; i < 9; i++) { x += (hash(bolt.seed + i) % 50) - 25; y += H * 0.06; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      flash -= dt * 2.2;
    }
  }
  ctx.restore();
}
const splash = [];
let bolt = null;


// ---------- photo mode: miniature (tilt-shift) lens, grain, colour grade, vignette ----------
export const photo = { on: true };
try { if (localStorage.getItem('uptime-city-photo') === '0') photo.on = false; } catch {}
export function togglePhoto() { photo.on = !photo.on; try { localStorage.setItem('uptime-city-photo', photo.on ? '1' : '0'); } catch {} return photo.on; }
let grainPat = null;
function grain() {
  if (grainPat) return grainPat;
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d'), d = g.createImageData(96, 96);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 18; }
  g.putImageData(d, 0, 0);
  return (grainPat = ctx.createPattern(c, 'repeat'));
}
function postFX(night) {
  const w = cv.width, h = cv.height;
  // vignette centres on the middle of the board
  const mid = toScreen(GRID / 2, GRID / 2).y;
  const fy = Math.max(0.2, Math.min(0.8, (H / 2 + (mid + cam.y) * cam.z) / H)) || 0.5;   // || 0.5: H is 0 while the page is still laying out
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  // warm, slightly contrasty grade (soft-light), like a sunny photo of a scale model
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = night > 0.5 ? 'rgba(90,110,190,0.25)' : 'rgba(255,196,130,0.22)'; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  // lens vignette
  const v = ctx.createRadialGradient(w / 2, h * fy, Math.min(w, h) * 0.35, w / 2, h * fy, Math.max(w, h) * 0.8);
  v.addColorStop(0, 'rgba(20,14,8,0)'); v.addColorStop(1, 'rgba(20,14,8,0.42)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
