// Three real Belgian cities, simplified onto a 24x24 board.
// Coordinates: x = west → east, y = north → south. Hand-traced from the real street plans:
// rivers, ring roads and landmarks sit where they are in reality (stylised, not to scale).
//
// ops are applied in order:
//   ['park', x0,y0,x1,y1]        green park area with trees (not buildable)
//   ['waterRect', x0,y0,x1,y1]   river / dock basin
//   ['water', [x,y], [x,y], ...] 1-tile wide waterway along a path
//   ['road', [x,y], [x,y], ...]  street along a path (over water it becomes a bridge)
// landmarks are pre-built, can't be demolished, and give happiness.

export const MAPS = {
  antwerpen: {
    name: 'Antwerpen',
    tagline: 'Scheldt, Leien & the port',
    color: '#e05a5a',
    streets: ['Meir', 'Groenplaats', 'Grote Markt', 'Suikerrui', 'Kammenstraat', 'Leysstraat', 'De Keyserlei', 'Italiëlei',
      'Frankrijklei', 'Amerikalei', 'Nationalestraat', 'Kloosterstraat', 'Oudaan', 'Mechelsesteenweg', 'Conscienceplein', 'Londenstraat'],
    corners: ['LINKER-\nOEVER', 'HAVEN', 'START\n➜', 'HET\nZUID'],
    center: [10, 11],  // historic centre: built up most densely
    ferry: [[4, 0.5], [4, 7], [3, 8.5], [3, 22.5]],  // boat along the Scheldt quays
    carFerry: [[4.2, 13], [1.8, 13]],                // car ferry across to Linkeroever
    marina: [13, 1, 16, 3],
    props: [['crane', 17, 3], ['crane', 20, 3], ['crane', 22, 1], ['containers', 18, 3], ['containers', 21, 3], ['containers', 19, 4],
      ['billboard', 15, 10, 0], ['billboard', 7, 16, 1], ['hospital', 7, 2], ['police', 13, 13], ['police', 18, 17], ['library', 17, 10], ['library', 11, 11], ['bank', 12, 10], ['bank', 16, 12], ['bank', 11, 12], ['prison', 12, 16], ['plaza', 9, 9], ['plaza', 13, 13], ['plaza', 16, 8], ['kiosk', 9, 12], ['monument', 8, 11, 0], ['monument', 9, 13, 1], ['flag', 8, 8], ['flag', 11, 8], ['flag', 9, 11], ['handje', 7, 12]],                          // Willemdok yacht harbour next to the MAS
    flats: [[0, 0], [0, 1], [0, 4], [0, 6], [0, 8], [0, 10], [0, 12], [0, 18], [0, 21], [0, 23]],
    houses: [[0, 2], [0, 5], [0, 9], [0, 19], [0, 22]],  // ordinary houses between the towers  // the Linkeroever apartment towers
    ops: [
      ['park', 19, 6, 21, 8],             // Park Spoor Noord
      ['park', 19, 13, 21, 15],           // Stadspark
      ['park', 0, 14, 1, 17],             // Sint-Annabos (Linkeroever)
      ['waterRect', 3, 0, 5, 7],          // Scheldt, bending east up north
      ['waterRect', 2, 8, 4, 23],         // Scheldt
      ['waterRect', 8, 1, 11, 3],         // Bonapartedok
      ['waterRect', 13, 1, 16, 3],        // Willemdok
      ['waterRect', 18, 0, 21, 2],        // Kattendijkdok
      ['road', [6, 0], [6, 8], [5, 9], [5, 23]],                       // Scheldekaaien (quays)
      ['road', [6, 4], [23, 4]],                                       // Eilandje dock road
      ['road', [6, 6], [16, 6], [18, 8], [18, 17], [16, 19], [5, 19]], // the Leien (semicircle boulevard)
      ['road', [6, 11], [23, 11]],                                     // Meir → De Keyserlei → Centraal
      ['road', [6, 9], [18, 9]],
      ['road', [6, 15], [18, 15]],                                     // Nationalestraat area
      ['road', [10, 4], [10, 19]],
      ['road', [14, 4], [14, 19]],
      ['road', [9, 19], [9, 22]],                                      // towards het Zuid
      ['road', [22, 0], [22, 23]],                                     // Ring R1
      ['road', [5, 22], [22, 22]],
      ['road', [0, 11], [1, 11]],                                      // Linkeroever
      ['road', [1, 0], [1, 23]],                                       // long road along the left bank
      ['road', [0, 13], [1, 13]],                                      // ferry landing, left bank
      ['road', [0, 3], [1, 3]], ['road', [0, 7], [1, 7]], ['road', [0, 20], [1, 20]],  // side streets between the towers
    ],
    landmarks: [
      { type: 'hetsteen', x: 7, y: 7 },
      { type: 'stadhuisA', x: 7, y: 10 },
      { type: 'cathedralA', x: 8, y: 10 },
      { type: 'mas', x: 12, y: 2 },
      { type: 'centraal', x: 20, y: 10 },
      { type: 'kmska', x: 11, y: 21 },
    ],
  },

  brussel: {
    name: 'Brussel',
    tagline: 'The pentagon & the Atomium',
    color: '#2f5fa8',
    streets: ['Grand-Place', 'Nieuwstraat', 'Anspachlaan', 'Koningsstraat', 'Louizalaan', 'Zavel', 'Wetstraat', 'Zuidlaan',
      'Kunstberg', 'Hoogstraat', 'Flageyplein', 'Tervurenlaan', 'Dansaertstraat', 'Adolphe Maxlaan', 'Koningsplein', 'Grasmarkt'],
    corners: ['LAKEN', 'NOORD', 'START\n➜', 'ZUID'],
    center: [13, 12],
    props: [['billboard', 10, 8, 0], ['billboard', 17, 16, 1], ['hospital', 11, 17], ['police', 13, 12], ['police', 19, 13], ['library', 15, 11], ['bank', 14, 9], ['bank', 15, 12], ['bank', 18, 11], ['prison', 11, 21], ['plaza', 12, 9], ['plaza', 14, 15], ['plaza', 10, 14], ['monument', 15, 9, 0], ['monument', 13, 10, 1], ['euflag', 19, 10], ['euflag', 20, 12], ['euflag', 22, 10], ['kiosk', 12, 10], ['kiosk', 14, 13], ['flag', 14, 11], ['flag', 12, 13], ['comic', 11, 9], ['comic', 15, 15]],
    ops: [
      ['park', 0, 0, 4, 4],               // Laeken park around the Atomium
      ['park', 17, 7, 18, 9],             // Warandepark (Parc de Bruxelles)
      ['park', 20, 13, 22, 15],           // Jubelpark (Cinquantenaire)
      ['water', [4, 23], [6, 17], [7, 9], [9, 0]],                     // the canal
      ['road', [9, 5], [16, 4], [20, 11], [15, 20], [8, 18], [9, 5]],  // the pentagon (Kleine Ring)
      ['road', [9, 17], [11, 12], [12, 5]],                            // Anspachlaan / central boulevards
      ['road', [16, 4], [16, 14]],                                     // Koningsstraat
      ['road', [16, 11], [23, 11]],                                    // Wetstraat → EU quarter
      ['road', [15, 20], [18, 23]],                                    // Louizalaan
      ['road', [12, 8], [15, 8]],                                      // Nieuwstraat
      ['road', [12, 11], [16, 11]],                                    // Kunstberg
      ['road', [0, 13], [8, 13]],                                      // canal bridge (Molenbeek)
      ['road', [0, 19], [8, 18]],                                      // canal bridge (Anderlecht)
      ['road', [9, 5], [9, 0]],                                        // towards Laeken
      ['road', [23, 0], [23, 23]],                                     // middle ring
    ],
    landmarks: [
      { type: 'atomium', x: 2, y: 2 },
      { type: 'grandplace', x: 13, y: 12 },
      { type: 'manneken', x: 12, y: 14 },
      { type: 'stmichel', x: 15, y: 7 },
      { type: 'royalpalace', x: 17, y: 10 },
      { type: 'justice', x: 13, y: 17 },
      { type: 'midi', x: 10, y: 19 },
      { type: 'nord', x: 13, y: 3 },
      { type: 'berlaymont', x: 21, y: 10 },
      { type: 'arcade', x: 21, y: 14 },
    ],
  },

  gent: {
    name: 'Gent',
    tagline: 'Leie, Graslei & three towers',
    color: '#3fa77c',
    streets: ['Graslei', 'Korenlei', 'Veldstraat', 'Kouter', 'Korenmarkt', 'Vrijdagmarkt', 'Sint-Baafsplein', 'Patershol',
      'Overpoort', 'Sint-Pietersnieuwstraat', 'Coupure', 'Brabantdam', 'Kortrijksesteenweg', 'Groentenmarkt', 'Zuid', 'Dampoort'],
    corners: ['WATER-\nSPORTBAAN', 'HAVEN', 'START\n➜', 'CITADEL'],
    center: [12, 11],
    props: [['billboard', 16, 13, 0], ['billboard', 8, 15, 1], ['hospital', 12, 21], ['police', 14, 14], ['police', 9, 9], ['library', 15, 14], ['bank', 13, 14], ['bank', 15, 13], ['bank', 11, 14], ['prison', 6, 8], ['plaza', 10, 11], ['plaza', 15, 9], ['plaza', 13, 17], ['monument', 13, 9, 0], ['monument', 15, 11, 1], ['crane', 19, 3], ['crane', 21, 4], ['containers', 20, 4], ['flag', 11, 12], ['flag', 15, 12], ['kiosk', 13, 13], ['bikerack', 12, 14], ['bikerack', 13, 16], ['bikerack', 14, 19], ['bikerack', 10, 13]],
    bikes: 16,  // Gent is a cycling city
    ferry: [[21, 23], [18, 15], [17, 10], [18, 4], [18, 0.5]],  // up the Scheldt towards the port
    ops: [
      ['park', 9, 16, 11, 18],            // Citadelpark
      ['waterRect', 0, 14, 4, 14],        // Watersportbaan
      ['water', [1, 23], [7, 17], [10, 14], [10, 9], [12, 7], [16, 8], [17, 10]],  // the Leie through the centre
      ['water', [21, 23], [18, 15], [17, 10]],                                     // the Scheldt
      ['water', [17, 10], [18, 4], [18, 0]],                                       // towards the port
      ['water', [10, 7], [0, 5]],                                                  // the Lieve canal
      ['waterRect', 19, 0, 21, 2],                                                 // port docks
      ['road', [5, 4], [18, 3], [21, 10], [19, 19], [9, 21], [3, 14], [5, 4]],    // ring R40
      ['road', [9, 12], [17, 12]],                                                 // Sint-Michielsbrug → Korenmarkt → Sint-Baafs
      ['road', [12, 13], [12, 21]],                                                // Veldstraat → Sint-Pieters
      ['road', [14, 3], [14, 11]],
      ['road', [17, 12], [21, 10]],                                                // towards Dampoort
      ['road', [9, 12], [4, 12]],                                                  // Coupure side
      ['road', [6, 4], [8, 9]],                                                    // Patershol
    ],
    landmarks: [
      { type: 'gravensteen', x: 9, y: 8 },
      { type: 'korenlei', x: 9, y: 10 },
      { type: 'graslei', x: 11, y: 10 },
      { type: 'stniklaas', x: 12, y: 11 },
      { type: 'belfort', x: 13, y: 11 },
      { type: 'stbaafs', x: 14, y: 11 },
      { type: 'stpieters', x: 13, y: 20 },
    ],
  },

  // A made-up desert town on the coast (not a real place): sand, palms, a fishing harbour and an oasis.
  oasis: {
    name: 'Oasis Bay',
    tagline: 'Dunes, palms & the old souk',
    color: '#c98a3e',
    fictional: true,
    desert: true,
    startCash: 4000,             // the outposts and infrastructure are broken: the town starts with money to get things running again
    weatherAt: [30.92, -6.89],   // borrows the live weather of a sunny desert spot
    streets: ['Souk Lane', 'Palm Walk', 'Harbour Road', 'Dune Street', 'Well Square', 'Caravan Way', 'Spice Alley', 'Old Gate',
      'Date Grove', 'Lantern Street', 'Fishermen Quay', 'Camel Track', 'Tea House Row', 'Sunset Road', 'Mosaic Lane', 'Citadel Hill'],
    corners: ['HARBOUR', 'DUNES', 'START\n➜', 'OASIS'],
    center: [11, 11],
    // what drives around here: taxis, donkey carts, Humvees and goats; soldiers walk patrols on the pavements
    // a soldier simulation: military vehicles and foot patrols make up most of the traffic, with a few locals still about
    fleet: [['patrol', 16, 0.3, null], ['humvee', 9, 0.75, '#c2a46e'], ['tank', 4, 0.4, '#b59f6e'], ['truck', 3, 0.6, '#8a7a52'],
      ['taxi', 2, 0.9, null], ['cart', 2, 0.35, null], ['goat', 10, 0.25, null], ['ambulance', 1, 1.0, '#f4f4f2']],
    fishing: true,
    outposts: 3,                 // enemy camps up in the mountains (bombed by a gunship every 2.5 min)
    drones: 3,                   // military drones circling high over the town
    marina: [1, 9, 3, 10],
    props: [['billboard', 9, 12, 0], ['billboard', 15, 18, 1], ['hospital', 8, 16], ['police', 12, 14], ['library', 13, 9], ['bank', 10, 13], ['plaza', 11, 11], ['plaza', 14, 15],
      ['kiosk', 10, 10], ['kiosk', 13, 12], ['kiosk', 12, 17], ['monument', 12, 11, 0], ['monument', 15, 14, 1], ['monument', 8, 12, 0], ['monument', 19, 17, 1], ['flag', 9, 9], ['flag', 15, 11], ['containers', 5, 6], ['crane', 5, 4]],
    ops: [
      // mountain ranges first, so roads cut passes through them afterwards (about a fifth of the board)
      ['mountain', 15, 0, 23, 3],        // the northern range behind the oasis
      ['mountain', 21, 4, 23, 12],       // eastern ridge along the desert
      ['mountain', 18, 20, 23, 23],      // southern massif
      ['mountain', 7, 21, 10, 23],       // lone hills south-west of town
      ['mountain', 19, 14, 21, 18],      // foothills
      ['mountain', 12, 0, 14, 2],        // north-western spur
      ['mountain', 17, 10, 20, 11],      // ridge north of the kasbah
      ['waterRect', 0, 0, 3, 23],        // the sea along the west coast
      ['waterRect', 4, 2, 5, 4],         // fishing harbour basin
      ['waterRect', 18, 5, 20, 7],       // the oasis pool
      ['park', 17, 4, 21, 4], ['park', 17, 8, 21, 9], ['park', 21, 5, 21, 7], ['park', 17, 5, 17, 7],   // date palms round the oasis
      ['park', 14, 20, 18, 22],          // palm grove in the south
      ['road', [6, 0], [6, 23]],                                   // coast road
      ['road', [6, 6], [22, 6]], ['road', [6, 13], [23, 13]], ['road', [6, 19], [20, 19]],
      ['road', [11, 0], [11, 23]], ['road', [16, 6], [16, 23]],
      ['road', [9, 9], [14, 9], [14, 16], [9, 16], [9, 9]],      // ring round the old souk
      ['road', [22, 0], [22, 23]],                                 // desert highway
      ['road', [4, 5], [6, 5]],                                    // harbour quay
    ],
    landmarks: [
      { type: 'qasr', x: 8, y: 3 },
      { type: 'souk', x: 11, y: 11 },
      { type: 'minaret', x: 13, y: 11 },
      { type: 'kasbah', x: 18, y: 15 },
      { type: 'caravan', x: 19, y: 20 },
      { type: 'lighthouse', x: 4, y: 7 },
    ],
  },
};
export const MAP_ORDER = ['antwerpen', 'brussel', 'gent', 'oasis'];

// Terrain codes
export const T_LOT = 0, T_ROAD = 1, T_WATER = 2, T_PARK = 3, T_BRIDGE = 4, T_MOUNT = 5;

function path(pts, fn) {
  for (let k = 0; k < pts.length - 1; k++) {
    let [x, y] = pts[k];
    const [bx, by] = pts[k + 1];
    const DX = Math.abs(bx - x) || 1, DY = Math.abs(by - y) || 1;
    fn(x, y);
    // 4-connected staircase so roads and rivers never touch only at a corner
    while (x !== bx || y !== by) {
      if (y === by || (x !== bx && Math.abs(bx - x) / DX >= Math.abs(by - y) / DY)) x += Math.sign(bx - x);
      else y += Math.sign(by - y);
      fn(x, y);
    }
  }
}

// maps are authored on a 24x24 grid and scaled to the board size N
const BASE = 24;
const scaleTo = (N) => (v) => Math.round((v + 0.5) * N / BASE - 0.5);
const blockCache = {};
export function landmarksOf(id, N) {
  if (!blockCache[id + N]) buildTerrain(id, N);
  return blockCache[id + N];
}
// sizes: how many tiles a side each landmark covers, roughly to real-world scale
export const LANDMARK_SIZE = { cathedralA: 2, centraal: 2, kmska: 2, atomium: 2, grandplace: 2, stmichel: 2, royalpalace: 2, justice: 2, midi: 2, berlaymont: 2, gravensteen: 2, stbaafs: 2, stpieters: 2, arcade: 2, hetsteen: 1, qasr: 2, souk: 2, kasbah: 2, caravan: 2, mountA: 4, mountB: 3, mountC: 3 };
function placeBlocks(id, N, t) {
  const sc = scaleTo(N), used = new Set(), out = [];
  const free = (x, y) => x >= 0 && y >= 0 && x < N && y < N && !used.has(x + y * N) && (t[x + y * N] === T_LOT || t[x + y * N] === T_PARK);
  for (const l of MAPS[id].landmarks) {
    const x = sc(l.x), y = sc(l.y);
    let size = LANDMARK_SIZE[l.type] || 1, ox = x, oy = y, ok = false;
    for (; size > 1 && !ok; size--) {
      for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1], [1, 0], [0, 1]]) {
        let all = true;
        for (let j = 0; j < size && all; j++) for (let i = 0; i < size && all; i++) all = free(x + dx + i, y + dy + j);
        if (all) { ox = x + dx; oy = y + dy; ok = true; break; }
      }
      if (ok) break;
    }
    if (!ok) { size = 1; ox = x; oy = y; }
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) used.add(ox + i + (oy + j) * N);
    out.push({ ...l, x: ox, y: oy, size });
  }
  return out;
}
export function flatsOf(id, N, key = 'flats') {
  const k = N / BASE, f = MAPS[id][key] || [], out = [];
  // each tower spot covers the whole scaled area of the left-bank strip west of the road
  for (const [x, y] of f) for (let yy = Math.floor(y * k); yy < Math.floor((y + 1) * k); yy++) for (let xx = Math.floor(x * k); xx < Math.floor((x + 1) * k); xx++) out.push({ x: xx, y: yy });
  return out;
}
export function propsOf(id) { return MAPS[id].props || []; }
export function marinaOf(id, N) {
  const m = MAPS[id].marina;
  if (!m) return null;
  const k = N / BASE;
  return { x0: Math.floor(m[0] * k), y0: Math.floor(m[1] * k), x1: Math.ceil((m[2] + 1) * k) - 1, y1: Math.ceil((m[3] + 1) * k) - 1 };
}
export function ferryRoute(id, N, key = 'ferry') {
  const r = MAPS[id][key];
  return r ? r.map(([x, y]) => [(x + 0.5) * N / BASE - 0.5, (y + 0.5) * N / BASE - 0.5]) : null;
}
export function buildTerrain(id, N) {
  const m = MAPS[id], k = N / BASE, sc = scaleTo(N);
  const t = new Uint8Array(N * N);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < N && y < N) t[x + y * N] = v; };
  const get = (x, y) => t[x + y * N];
  for (const op of m.ops) {
    const [kind, ...a] = op;
    if (kind === 'park' || kind === 'waterRect' || kind === 'mountain') {
      const v = kind === 'park' ? T_PARK : kind === 'mountain' ? T_MOUNT : T_WATER;
      const x0 = Math.floor(a[0] * k), y0 = Math.floor(a[1] * k), x1 = Math.ceil((a[2] + 1) * k) - 1, y1 = Math.ceil((a[3] + 1) * k) - 1;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, v);
    } else if (kind === 'water') path(a.map(([x, y]) => [sc(x), sc(y)]), (x, y) => set(x, y, T_WATER));
    else if (kind === 'road') path(a.map(([x, y]) => [sc(x), sc(y)]), (x, y) => set(x, y, get(x, y) === T_WATER || get(x, y) === T_BRIDGE ? T_BRIDGE : T_ROAD));
  }
  const blocks = placeBlocks(id, N, t);
  blockCache[id + N] = blocks;
  for (const l of blocks) for (let j = 0; j < l.size; j++) for (let i = 0; i < l.size; i++) set(l.x + i, l.y + j, T_LOT);
  return t;
}
