// Game state + simulation. No DOM or canvas code in here.
import { MAPS, buildTerrain, T_LOT, T_ROAD, T_WATER, T_PARK, T_BRIDGE, landmarksOf, flatsOf, propsOf } from './maps.js';
import {
  GRID, RESOURCES, RAW, RECIPES, BUILDINGS, INTEGRATIONS,
  TRIGGERS, ACTIONS, RULE_COMPUTE, BASE_COMPUTE, INCIDENTS, CUR, DISASTERS, REPAIR_COST, CLEAN_COST, TAX,
} from './config.js';

const SAVE_KEY = 'uptime-city-save-v1';
const listeners = new Set();
export const on = (fn) => listeners.add(fn);
const emit = (type, data) => listeners.forEach((fn) => fn(type, data));

export let S = null;

// ---------- map ----------
export let terrain = new Uint8Array(GRID * GRID);
const ter = (x, y) => (x < 0 || y < 0 || x >= GRID || y >= GRID ? -1 : terrain[x + y * GRID]);
export function isRoad(x, y) { const t = ter(x, y); return t === T_ROAD || t === T_BRIDGE; }
export function isWater(x, y) { const t = ter(x, y); return t === T_WATER || t === T_BRIDGE; }
export function isPark(x, y) { return ter(x, y) === T_PARK; }
export function isLot(x, y) { return ter(x, y) === T_LOT; }
export function mapInfo() { return MAPS[S.map]; }
// map size in buildable lots; building limits scale with it
let lotCount = 1000;
function countLots() { lotCount = 0; for (const t of terrain) if (t === T_LOT) lotCount++; }
export function buildLimit(type) {
  const def = BUILDINGS[type];
  if (def.max) return def.max;
  if (def.per1k) return Math.max(1, Math.round(def.per1k * lotCount / 1000));
  return Infinity;
}

// smooth 2D value noise in 0..1 (seeded by the map), used to group buildings into districts
let zoneSeed = 1;
function lattice(ix, iy) { let h = (ix * 374761393 + iy * 668265263 + zoneSeed * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function zoneNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = lattice(ix, iy), b = lattice(ix + 1, iy), c = lattice(ix, iy + 1), d = lattice(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function newState(mapId) {
  zoneSeed = [...mapId].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const prices = {};
  for (const k in RESOURCES) prices[k] = RESOURCES[k].base;
  terrain = buildTerrain(mapId, GRID); countLots();
  const startCash = MAPS[mapId].startCash ?? 2500;   // maps with broken infrastructure start with more money to repair it
  const s = {
    v: 1, map: mapId,
    hour: 8, day: 1,
    cash: startCash,
    tax: TAX.start,
    loan: 0,
    tiles: Array.from({ length: GRID * GRID }, () => null), // {type, id, incident}
    trees: [],
    stock: Object.fromEntries(Object.keys(RESOURCES).map((k) => [k, 0])),
    prices, priceHist: Object.fromEntries(Object.keys(RESOURCES).map((k) => [k, [prices[k]]])),
    queue: [],             // crafting: {recipe, t}
    integrations: {},      // id -> true
    rules: [],             // {id, on, trig, targ, tres, act, ares, arec, last}
    cashHist: [startCash],
    ledger: { income: 0, expense: 0, lines: {} },
    lastDay: null,
    happy: 60,
    nextId: 1,
    peakPop: 0,
    unlocked: [],
    rubble: [],            // street tiles blocked by disaster debris
  };
  for (const l of landmarksOf(mapId, GRID)) {
    const o = l.x + l.y * GRID;
    s.tiles[o] = { type: l.type, id: s.nextId++, born: 0, incident: null, size: l.size };
    for (let j = 0; j < l.size; j++) for (let i = 0; i < l.size; i++) if (i || j) s.tiles[o + i + j * GRID] = { part: o };
  }
  for (const f of flatsOf(mapId, GRID, 'houses')) {
    const i = f.x + f.y * GRID;
    if (!s.tiles[i] && terrain[i] === 0) s.tiles[i] = { type: 'rowhouse', id: s.nextId++, born: 0, incident: null };
  }
  // Linkeroever's apartment blocks
  for (const f of flatsOf(mapId, GRID)) {
    const i = f.x + f.y * GRID;
    if (!s.tiles[i] && terrain[i] === 0) s.tiles[i] = { type: 'flat', id: s.nextId++, born: 0, incident: null };
  }
  // little things that make each city recognisable, on the nearest free lot
  const k24 = GRID / 24;
  for (const [type, px, py, v] of propsOf(mapId)) {
    const size = BUILDINGS['p_' + type]?.size || 1;
    const cx = Math.round((px + 0.5) * k24 - 0.5), cy = Math.round((py + 0.5) * k24 - 0.5);
    const fits = (x, y) => { for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const xx = x + i, yy = y + j; if (xx >= GRID || yy >= GRID || terrain[xx + yy * GRID] !== 0 || s.tiles[xx + yy * GRID]) return false; } return true; };
    let best = -1, bd = 1e9;
    for (let y = Math.max(0, cy - 5); y <= Math.min(GRID - 1, cy + 5); y++) for (let x = Math.max(0, cx - 5); x <= Math.min(GRID - 1, cx + 5); x++) {
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bd && fits(x, y)) { bd = d; best = x + y * GRID; }
    }
    if (best < 0) continue;
    s.tiles[best] = { type: 'p_' + type, id: s.nextId++, born: 0, incident: null, v: v || 0, size };
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) if (i || j) s.tiles[best + i + j * GRID] = { part: best };
  }
  // existing city: a handful of existing houses along the streets (deterministic per map)
  let seed = [...mapId].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lot = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID && terrain[x + y * GRID] === 0;
  const road = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID && (terrain[x + y * GRID] === 1 || terrain[x + y * GRID] === 4);
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const i = x + y * GRID;
    if (!lot(x, y) || s.tiles[i]) continue;
    const onStreet = road(x + 1, y) || road(x - 1, y) || road(x, y + 1) || road(x, y - 1);
    // the historic centre is packed, the outskirts are greener
    const c = MAPS[mapId].center || [12, 12], k = GRID / 24;
    // dense around the historic centre and across the middle of the board, greener only near the edges
    const nearC = Math.max(0, 1 - Math.hypot(x - (c[0] + 0.5) * k, y - (c[1] + 0.5) * k) / (13 * k));
    const nearM = Math.max(0, 1 - Math.hypot(x - GRID / 2, y - GRID / 2) / (GRID * 0.55));
    const near = Math.max(nearC, nearM);
    const chance = onStreet ? 0.25 + 0.5 * near : 0.06 + 0.45 * near * near;
    if (rnd() >= chance) continue;
    // districts: smooth noise decides what kind of neighbourhood this is, so similar buildings cluster
    const n = zoneNoise(x / (5 * k), y / (5 * k));
    let type = 'rowhouse';
    if (near > 0.65) type = n > 0.78 ? 'office' : 'rowhouse';                       // old town, a few offices
    else if (near > 0.3) type = n > 0.68 ? 'office' : n < 0.32 ? 'apt' : rnd() < 0.5 ? 'apt' : 'rowhouse';
    else type = n < 0.4 ? 'villa' : n > 0.66 ? 'industry' : 'apt';                 // outskirts
    s.tiles[i] = { type, id: s.nextId++, born: 0, incident: null };
  }
  // a square is always framed by buildings: give every plaza at least two neighbouring houses
  const isBld = (x, y) => { const t = x >= 0 && y >= 0 && x < GRID && y < GRID && s.tiles[x + y * GRID]; return !!t && t.type !== 'p_plaza'; };
  s.tiles.forEach((t, i) => {
    if (!t || t.type !== 'p_plaza') return;
    const x = i % GRID, y = (i / GRID) | 0, nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    let have = nb.filter(([dx, dy]) => isBld(x + dx, y + dy)).length;
    for (const [dx, dy] of nb) {
      if (have >= 2) break;
      const xx = x + dx, yy = y + dy, j = xx + yy * GRID;
      if (xx >= 0 && yy >= 0 && xx < GRID && yy < GRID && terrain[j] === 0 && !s.tiles[j]) { s.tiles[j] = { type: 'rowhouse', id: s.nextId++, born: 0, incident: null }; have++; }
    }
  });
  // scatter some starting trees on empty lots
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(Math.random() * GRID), y = Math.floor(Math.random() * GRID);
    if (isLot(x, y) && !s.tiles[x + y * GRID]) s.trees.push(x + y * GRID);
  }
  s.stock.copper = 6; s.stock.silicon = 6; s.stock.polymer = 2;
  return s;
}

export function newGame(mapId = 'antwerpen') { S = newState(mapId); recompute(); emit('reset'); log('ok', `Welcome to ${MAPS[mapId].name}, Mayor! You start with ${CUR}${S.cash}.`); }

export function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); return true; } catch { return false; }
}
export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || !MAPS[s.map] || s.tiles?.length !== GRID * GRID) return false; // older, smaller board
    terrain = buildTerrain(s.map, GRID); countLots();
    s.rubble ||= [];
    s.tax = Math.min(TAX.max, Math.max(TAX.min, s.tax));   // older saves used 0-20%
    S = s; recompute(); emit('reset'); log('ok', 'Save loaded. Welcome back, Mayor.');
    return true;
  } catch { return false; }
}
export function wipe(mapId) { try { localStorage.removeItem(SAVE_KEY); } catch {} newGame(mapId); }
export function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }

// ---------- logging ----------
export const logs = [];
export function log(level, msg) {
  const t = S ? `D${S.day} ${String(S.hour).padStart(2, '0')}:00` : '';
  logs.unshift({ level, msg, t });
  if (logs.length > 80) logs.pop();
  emit('log', { level, msg, t });
}

// ---------- derived stats ----------
export const D = { pop: 0, jobs: 0, workers: 0, power: 0, powerUse: 0, powerGen: 0, compute: 0, computeUse: 0, covered: new Set(), unpowered: new Set(), counts: {}, happyBonus: 0, employment: 1 };

export function tile(x, y) { const t = S.tiles[x + y * GRID]; return t && t.part != null ? S.tiles[t.part] : t; }
// index of the main tile of whatever stands here (big landmarks span several tiles)
export function mainIndex(i) { const t = S.tiles[i]; return t && t.part != null ? t.part : i; }
export function buildingsList() {
  const out = [];
  S.tiles.forEach((t, i) => { if (t && !t.part) out.push({ ...t, x: i % GRID, y: Math.floor(i / GRID), i }); });
  return out;
}

const isDay = () => S.hour >= 7 && S.hour < 20;

export function recompute() {
  const list = buildingsList();
  const counts = {};
  let pop = 0, jobs = 0, gen = 0, use = 0, compute = BASE_COMPUTE, happyBonus = 0;
  const covered = new Set();
  const smart = S.integrations.smartMeter ? 0.8 : 1;
  const bal = S.integrations.gridBal;
  // 1) power: generation first, then hand it out. Streetlamps (the network) get first call,
  //    after that the oldest connections; whoever is left over sits in the dark.
  for (const b of list) {
    const def = BUILDINGS[b.type];
    if (def.power > 0 && !b.incident) {
      let p = def.power;
      if (def.solarPanel && !isDay()) p = bal ? 4 : 2;
      if (bal) p *= 1.1;
      gen += p;
    } else if (def.power < 0) use += -def.power * smart;
  }
  const unpowered = new Set();
  let left = gen;
  const consumers = list.filter((b) => BUILDINGS[b.type].power < 0 && !b.incident)
    .sort((a, b) => (BUILDINGS[b.type].kind === 'net') - (BUILDINGS[a.type].kind === 'net') || a.id - b.id);
  for (const b of consumers) {
    const need = -BUILDINGS[b.type].power * smart;
    if (left + 1e-9 >= need) left -= need; else unpowered.add(b.i);
  }
  // 2) Wi-Fi only comes from lampposts that are powered
  for (const b of list) {
    const def = BUILDINGS[b.type];
    counts[b.type] = (counts[b.type] || 0) + 1;
    if (def.radius && !b.incident && !unpowered.has(b.i)) {
      for (let dx = -def.radius; dx <= def.radius; dx++)
        for (let dy = -def.radius; dy <= def.radius; dy++) {
          const x = b.x + dx, y = b.y + dy;
          if (x >= 0 && y >= 0 && x < GRID && y < GRID && dx * dx + dy * dy <= def.radius * def.radius + 1) covered.add(x + y * GRID);
        }
    }
  }
  D.unpowered = unpowered; D.covered = covered;   // efficiency() below needs these already
  for (const b of list) {
    const def = BUILDINGS[b.type];
    if (def.pop) pop += def.pop;
    if (def.jobs) jobs += def.jobs;
    if (def.happy && !unpowered.has(b.i) && !b.damaged) happyBonus += def.happy;
    if (def.compute && efficiency(b) > 0) compute += def.compute;
  }
  let computeUse = 0;
  for (const id in S.integrations) computeUse += INTEGRATIONS.find((g) => g.id === id).compute;
  computeUse += S.rules.filter((r) => r.on).length * RULE_COMPUTE;
  Object.assign(D, {
    pop, jobs, workers: Math.min(pop, jobs), powerGen: gen, powerUse: use, power: gen - use,
    compute, computeUse, covered, unpowered, counts, happyBonus,
    employment: jobs ? Math.min(1, pop / jobs) : 1,
  });
  if (pop > S.peakPop) S.peakPop = pop;
  for (const k of Object.keys(BUILDINGS)) {
    if (BUILDINGS[k].landmark) continue;
    if (!S.unlocked.includes(k) && S.peakPop >= BUILDINGS[k].unlock) {
      S.unlocked.push(k);
      if (BUILDINGS[k].unlock > 0) { log('ok', `🎉 Unlocked: ${BUILDINGS[k].name}`); emit('unlock', k); }
    }
  }
}

export function efficiency(b) {
  // 0..1 output factor for a placed building
  if (b.incident) return 0;
  const def = BUILDINGS[b.type];
  if (b.damaged) return 0;                                // waiting for repairs after a disaster
  if (D.unpowered.has(b.i)) return 0;                     // no power, no work
  if (!D.covered.has(b.i)) {
    if (def.needsNet) return 0;                           // shops, offices, servers: dead without internet
    if (def.kind !== 'net' && def.kind !== 'fun' && def.kind !== 'res' && def.kind !== 'pow') return 0.5;  // factories limp on
  }
  return 1;
}
// why a building is not working (null when it is fine), for the map icons and the property card
export function problem(b) {
  if (b.incident) return 'incident';
  if (b.damaged) return 'damaged';
  if (D.unpowered.has(b.i)) return 'power';
  if (!D.covered.has(b.i) && BUILDINGS[b.type].needsNet) return 'net';
  return null;
}

// ---------- building ----------
export function canAfford(def) {
  if (S.cash < def.cost) return `Need ${CUR}${def.cost}`;
  for (const k in def.needs || {}) if ((S.stock[k] || 0) < def.needs[k]) return `Need ${def.needs[k]}× ${RESOURCES[k].name}`;
  return null;
}
export function place(type, x, y) {
  const def = BUILDINGS[type];
  const i = x + y * GRID;
  if (!isLot(x, y)) return isPark(x, y) ? 'Parks are protected. Build on an empty lot' : 'Build on an empty lot, not on streets or water';
  if (S.tiles[i]) return 'There is already a building here';
  if (!S.unlocked.includes(type)) return 'Not unlocked yet';
  const lim = buildLimit(type);
  if ((D.counts[type] || 0) >= lim) return `This city has room for only ${lim}× ${def.name}`;
  const err = canAfford(def);
  if (err) return err;
  S.cash -= def.cost;
  for (const k in def.needs || {}) S.stock[k] -= def.needs[k];
  S.tiles[i] = { type, id: S.nextId++, born: performance.now(), incident: null };
  S.trees = S.trees.filter((t) => t !== i);
  recompute();
  emit('built', { x, y, type });
  log('ok', `Built ${def.name} for ${CUR}${def.cost}.`);
  return null;
}
export function bulldoze(x, y) {
  const i = mainIndex(x + y * GRID);
  const t = S.tiles[i];
  if (!t) return 'Nothing to demolish';
  const def = BUILDINGS[t.type];
  if (def.landmark) return `${def.name} is a protected landmark`;
  const refund = Math.round(def.cost * 0.4);
  S.cash += refund;
  const k = t.size || 1;
  for (let j = 0; j < k; j++) for (let q = 0; q < k; q++) S.tiles[i + q + j * GRID] = null;   // big buildings span several tiles
  recompute();
  emit('demolished', { x: i % GRID, y: Math.floor(i / GRID), t: { ...t } });
  log('warn', `Demolished ${def.name}. Refund: ${CUR}${refund}.`);
  return null;
}

// ---------- disasters ----------
// Buy a disaster and drop it on (cx, cy). Buildings you built can be wiped out, the permanent city
// (landmarks and the houses that were already there) gets damaged and needs repairs, and streets
// fill up with rubble until you clean them.
export function castDisaster(id, cx, cy) {
  const dz = DISASTERS[id];
  if (!dz) return 'Unknown disaster';
  if (S.cash < dz.cost) return `Need ${CUR}${dz.cost}`;
  const nearWater = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isWater(x + dx, y + dy)) return true; return false; };
  if (dz.water && !nearWater(cx, cy)) return 'A flood has to start at the waterfront';
  S.cash -= dz.cost; addLedger('Disasters', -dz.cost);
  const R = dz.radius, hitChance = (d) => 1 - 0.5 * (d / R);           // full force in the middle, half at the edge
  const destroyed = [], damaged = [];
  let rubble = 0, abducted = 0;
  for (const b of buildingsList()) {
    const k = b.size || 1, d = Math.hypot(b.x + k / 2 - (cx + 0.5), b.y + k / 2 - (cy + 0.5));
    if (d > R || (dz.water && !nearWater(b.x, b.y))) continue;
    const def = BUILDINGS[b.type];
    if (def.style === 'mountain') continue;          // mountains shrug it off
    if (def.landmark || def.base) {
      if (!b.damaged && Math.random() < dz.damage * hitChance(d)) { S.tiles[b.i].damaged = true; damaged.push(b.i); }
    } else if (Math.random() < dz.destroy * hitChance(d)) {
      for (let j = 0; j < k; j++) for (let q = 0; q < k; q++) S.tiles[b.i + q + j * GRID] = null;
      destroyed.push({ x: b.x, y: b.y, t: { ...b }, d });
      abducted += def.pop || 0;
    }
  }
  const have = new Set(S.rubble);
  for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
    const d = Math.hypot(x - cx, y - cy), i = x + y * GRID;
    if (d > R || !isRoad(x, y) || have.has(i) || (dz.water && !nearWater(x, y))) continue;
    if (Math.random() < dz.rubble * hitChance(d)) { S.rubble.push(i); have.add(i); rubble++; }
  }
  recompute();
  emit('disaster', { id, x: cx, y: cy, destroyed, damaged });
  const bits = [destroyed.length && `${destroyed.length} destroyed`, damaged.length && `${damaged.length} damaged`, rubble && `${rubble} streets blocked`].filter(Boolean).join(', ');
  log('err', `${dz.icon} ${dz.name}! ${bits || 'Luckily nothing was hit.'}${id === 'aliens' && abducted ? ` ${abducted} residents were beamed up.` : ''}`);
  return null;
}
export const repairCost = (t) => BUILDINGS[t.type].landmark ? REPAIR_COST.landmark : REPAIR_COST.base;
export function repair(i) {
  const t = S.tiles[i];
  if (!t?.damaged) return 'Nothing to repair here';
  const c = repairCost(t);
  if (S.cash < c) return `Need ${CUR}${c}`;
  S.cash -= c; addLedger('Repairs', -c);
  t.damaged = false; recompute();
  emit('repaired', i);
  log('ok', `🔧 Repaired ${BUILDINGS[t.type].name} (${CUR}${c}).`);
  return null;
}
export function repairAll() {
  let n = 0;
  S.tiles.forEach((t, i) => { if (t?.damaged && !repair(i)) n++; });
  return n;
}
export const hasRubble = (i) => S.rubble.includes(i);
export function clean(i) {
  if (!hasRubble(i)) return 'No rubble here';
  if (S.cash < CLEAN_COST) return `Need ${CUR}${CLEAN_COST}`;
  S.cash -= CLEAN_COST; addLedger('Street cleaning', -CLEAN_COST);
  S.rubble = S.rubble.filter((r) => r !== i);
  emit('cleaned', i);
  return null;
}
export function cleanAll() {
  let n = 0;
  for (const i of [...S.rubble]) { if (clean(i)) break; n++; }
  if (n) log('ok', `🧹 Cleanup crew cleared ${n} street${n > 1 ? 's' : ''} (${CUR}${n * CLEAN_COST}).`);
  return n;
}

// ---------- market ----------
export function sellPrice(k) { return Math.round(S.prices[k] * (S.integrations.erpMarket ? 1.15 : 1)); }
export function buyPrice(k) { return Math.round(S.prices[k] * 1.25); }
export function sell(k, n) {
  n = Math.min(n, Math.floor(S.stock[k]));
  if (n <= 0) return 0;
  const p = sellPrice(k) * n;
  S.stock[k] -= n; S.cash += p;
  addLedger('Market sales', p);
  S.prices[k] = Math.max(RESOURCES[k].base * 0.4, S.prices[k] * (1 - 0.004 * n));
  emit('sold', { k, n, p });
  return p;
}
export function buy(k, n) {
  const p = buyPrice(k) * n;
  if (S.cash < p) return false;
  S.cash -= p; S.stock[k] += n;
  addLedger('Market purchases', -p);
  S.prices[k] = S.prices[k] * (1 + 0.004 * n);
  return true;
}

// ---------- crafting ----------
// only workshops that have power and internet do any crafting
export function craftSpeed() { const n = buildingsList().filter((b) => b.type === 'fab' && efficiency(b) > 0).length; return n ? 1 + (n - 1) * 0.5 : 0; }
export function canCraft(r) {
  for (const k in r.in) if ((S.stock[k] || 0) < r.in[k]) return false;
  return true;
}
export function queueCraft(id) {
  const r = RECIPES.find((x) => x.id === id);
  if (!D.counts.fab) return 'Build a Maker Workshop first';
  if (S.queue.length >= 8) return 'The queue is full (8)';
  if (!canCraft(r)) return 'Not enough ingredients';
  for (const k in r.in) S.stock[k] -= r.in[k];
  S.queue.push({ recipe: id, t: 0 });
  emit('queue');
  return null;
}

// ---------- integrations ----------
export function deployIntegration(id) {
  const g = INTEGRATIONS.find((x) => x.id === id);
  if (S.integrations[id]) return 'Already deployed';
  if (D.compute - D.computeUse < g.compute) return `Needs ${g.compute} free compute`;
  if (S.cash < g.cost) return `Need ${CUR}${g.cost}`;
  for (const k in g.needs) if ((S.stock[k] || 0) < g.needs[k]) return `Need ${g.needs[k]}× ${RESOURCES[k].name}`;
  S.cash -= g.cost;
  for (const k in g.needs) S.stock[k] -= g.needs[k];
  S.integrations[id] = true;
  recompute();
  log('ok', `🔗 Integration live: ${g.name}. ${g.desc}`);
  emit('integration', id);
  return null;
}
export function removeIntegration(id) {
  delete S.integrations[id]; recompute();
  log('warn', `Integration disconnected: ${INTEGRATIONS.find((x) => x.id === id).name}`);
  emit('integration', id);
}

// ---------- automation rules ----------
export function addRule(r) {
  if (r.on && D.compute - D.computeUse < RULE_COMPUTE) return 'Not enough free compute';
  S.rules.push({ id: S.nextId++, on: true, last: -1, ...r });
  recompute(); emit('rules');
  return null;
}
export function toggleRule(id) {
  const r = S.rules.find((x) => x.id === id);
  if (!r.on && D.compute - D.computeUse < RULE_COMPUTE) return 'Not enough free compute';
  r.on = !r.on; recompute(); emit('rules'); return null;
}
export function deleteRule(id) { S.rules = S.rules.filter((x) => x.id !== id); recompute(); emit('rules'); }

export function ruleText(r) {
  const T = TRIGGERS[r.trig], A = ACTIONS[r.act];
  const tl = T.label.replace('{res}', RESOURCES[r.tres]?.name ?? '') + (T.arg ? ` ${r.targ}` : '');
  const al = A.label.replace('{res}', RESOURCES[r.ares]?.name ?? '').replace('{recipe}', RESOURCES[r.arec]?.name ?? '');
  return { when: tl, then: al };
}

function trig(r, newDay) {
  const v = Number(r.targ);
  switch (r.trig) {
    case 'priceAbove': return sellPrice(r.tres) > v;
    case 'priceBelow': return sellPrice(r.tres) < v;
    case 'stockAbove': return S.stock[r.tres] > v;
    case 'stockBelow': return S.stock[r.tres] < v;
    case 'cashBelow': return S.cash < v;
    case 'cashAbove': return S.cash > v;
    case 'powerLow': return D.power < v;
    case 'incident': return buildingsList().some((b) => b.incident);
    case 'everyDay': return newDay;
  }
  return false;
}
function act(r) {
  switch (r.act) {
    case 'sellAll': { const p = sell(r.ares, S.stock[r.ares]); return p ? `sold ${RESOURCES[r.ares].name} for ${CUR}${p}` : null; }
    case 'sellHalf': { const p = sell(r.ares, Math.floor(S.stock[r.ares] / 2)); return p ? `sold half the ${RESOURCES[r.ares].name} for ${CUR}${p}` : null; }
    case 'buy': return buy(r.ares, 5) ? `bought 5 ${RESOURCES[r.ares].name}` : null;
    case 'craft': return queueCraft(r.arec) ? null : `queued ${RESOURCES[r.arec].name}`;
    case 'taxUp': if (S.tax < TAX.max) { S.tax++; return `tax → ${S.tax}%`; } return null;
    case 'taxDown': if (S.tax > TAX.min) { S.tax--; return `tax → ${S.tax}%`; } return null;
    case 'patch': { const n = patchAll(); return n ? `patched ${n} incident(s)` : null; }
  }
  return null;
}
function runRules(newDay) {
  for (const r of S.rules) {
    if (!r.on) continue;
    const stamp = S.day * 24 + S.hour;
    if (r.trig !== 'everyDay' && stamp - r.last < 2) continue; // 2h cooldown so rules don't spam
    if (trig(r, newDay)) {
      const res = act(r);
      if (res) { r.last = stamp; log('auto', `⚙️ Rule #${r.id}: ${res}`); emit('ruleFired', r.id); }
    }
  }
}

// ---------- incidents ----------
export function patch(i, auto = false) {
  const t = S.tiles[i];
  if (!t?.incident) return 'No incident here';
  const inc = INCIDENTS.find((x) => x.id === t.incident.id);
  const cost = auto ? Math.round(inc.fix / 2) : inc.fix;
  if (S.cash < cost) return `Need ${CUR}${cost}`;
  S.cash -= cost; addLedger('Incident fixes', -cost);
  t.incident = null; recompute();
  log('ok', `${auto ? '🤖 Auto-fixed' : '🛠️ Patched'} ${inc.name} at ${BUILDINGS[t.type].name} (${CUR}${cost}).`);
  emit('patched', i);
  return null;
}
export function patchAll() {
  let n = 0;
  S.tiles.forEach((t, i) => { if (t?.incident && !patch(i)) n++; });
  return n;
}
function maybeIncident() {
  const list = buildingsList().filter((b) => !b.incident && ['net', 'dc', 'com', 'ind', 'pow'].includes(BUILDINGS[b.type].kind));
  if (list.length < 4) return;
  let chance = 0.012 + list.length * 0.0006;
  if (S.integrations.siemCore) chance *= 0.4;
  if (Math.random() > chance) return;
  const b = list[Math.floor(Math.random() * list.length)];
  const inc = INCIDENTS[Math.floor(Math.random() * INCIDENTS.length)];
  S.tiles[b.i].incident = { id: inc.id, since: S.day * 24 + S.hour };
  recompute();
  log('err', `${inc.icon} ${inc.name} at ${BUILDINGS[b.type].name}! Click it to patch (${CUR}${inc.fix}).`);
  emit('incident', b.i);
}

// ---------- ledger ----------
function addLedger(line, amount) {
  const L = S.ledger;
  L.lines[line] = (L.lines[line] || 0) + amount;
  if (amount >= 0) L.income += amount; else L.expense += -amount;
}

// ---------- the hourly tick ----------
export function tickHour() {
  S.hour++;
  let newDay = false;
  if (S.hour >= 24) { S.hour = 0; S.day++; newDay = true; }
  recompute();

  const list = buildingsList();
  const payGw = S.integrations.payGw ? 1.25 : 1;
  const erp = S.integrations.erpSync ? 1.3 : 1;
  // happiness drifts toward a target
  const target = Math.max(0, Math.min(100, 55 + D.happyBonus - (S.tax - TAX.start) * 3 - (D.power < 0 ? 15 : 0) - list.filter((b) => b.incident).length * 4 - list.filter((b) => b.damaged).length * 2 - Math.min(25, S.rubble.length * 0.5) + (D.jobs >= D.pop * 0.5 ? 5 : -5)));
  S.happy += (target - S.happy) * 0.08;
  const hMul = 0.6 + S.happy / 250;

  let taxes = 0, revenue = 0, upkeep = 0;
  for (const b of list) {
    const def = BUILDINGS[b.type];
    if (def.landmark) continue;
    const e = efficiency(b);
    const cap = def.maxIncome ?? Infinity;               // one building can only earn so much
    upkeep += def.upkeep;
    if (def.pop) taxes += Math.min(cap, (def.pop * S.tax / 100) * TAX.yield * hMul * e * (D.covered.has(b.i) ? 1 : 0.7));
    if (def.revenue) revenue += Math.min(cap, def.revenue * e * D.employment * payGw * (0.6 + Math.min(1.4, D.pop / 300)));
    if (def.produce) for (const k in def.produce) {
      const amt = def.produce[k] * e * D.employment * erp;
      S.stock[k] += amt;
      if (amt > 0 && Math.random() < 0.25) emit('produced', { i: b.i, k, amt });
    }
    if (def.pop && e > 0 && Math.random() < 0.06) emit('coins', { i: b.i, amt: Math.round(Math.min(cap, def.pop * S.tax / 100 * TAX.yield * hMul)) });
  }
  const interest = S.loan * 0.0008;
  S.cash += taxes + revenue - upkeep - interest;
  addLedger('Resident taxes', taxes);
  addLedger('Shop & office revenue', revenue);
  addLedger('Building upkeep', -upkeep);
  if (interest) addLedger('Loan interest', -interest);

  // crafting progress
  const speed = craftSpeed();
  if (speed && S.queue.length) {
    const q = S.queue[0];
    const r = RECIPES.find((x) => x.id === q.recipe);
    q.t += speed;   // unpowered workshops already count as 0 in craftSpeed()
    if (q.t >= r.time) {
      S.queue.shift();
      S.stock[r.out] += r.qty;
      log('ok', `🔧 Crafted ${r.qty}× ${RESOURCES[r.out].name}.`);
      emit('crafted', r.out);
    }
  }

  // market random walk, pulled back toward the base price
  for (const k in S.prices) {
    const base = RESOURCES[k].base;
    S.prices[k] += (base - S.prices[k]) * 0.04 + (Math.random() - 0.5) * base * 0.09;
    S.prices[k] = Math.max(base * 0.4, S.prices[k]);
    const h = S.priceHist[k]; h.push(S.prices[k]); if (h.length > 72) h.shift();
  }

  // incidents
  maybeIncident();
  if (S.integrations.autoRemed) {
    S.tiles.forEach((t, i) => { if (t?.incident && S.day * 24 + S.hour - t.incident.since >= 3) patch(i, true); });
  }

  if (newDay) {
    if (S.integrations.treasury && S.cash > 0) { const it = S.cash * 0.005; S.cash += it; addLedger('Treasury interest', it); }
    S.lastDay = { ...S.ledger, day: S.day - 1 };
    S.ledger = { income: 0, expense: 0, lines: {} };
    const net = S.lastDay.income - S.lastDay.expense;
    log(net >= 0 ? 'ok' : 'warn', `📒 Day ${S.day - 1} closed: ${net >= 0 ? '+' : ''}${CUR}${Math.round(net)}.`);
    save();
  }
  S.cashHist.push(S.cash); if (S.cashHist.length > 120) S.cashHist.shift();

  runRules(newDay);
  if (S.cash < -2000) log('err', '⚠️ The city is deep in debt! Take a loan or cut costs.');
  emit('tick', { newDay });
}

// ---------- loans ----------
export function takeLoan(n) { S.loan += n; S.cash += n; log('warn', `🏦 Borrowed ${CUR}${n}. Interest: 2% a day.`); emit('tick', {}); }
export function repayLoan(n) {
  n = Math.min(n, S.loan, Math.max(0, S.cash));
  if (n <= 0) return 'Nothing to repay';
  S.loan -= n; S.cash -= n; log('ok', `🏦 Repaid ${CUR}${n} of your loan.`); emit('tick', {});
  return null;
}

export { isDay, RAW };
export const S_GRID = GRID;
export { T_LOT, T_ROAD, T_WATER, T_PARK, T_BRIDGE };
