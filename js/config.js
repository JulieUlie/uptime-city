// Static game data. Theme: a cosy board-game city mixing Antwerp and New York.

export const GRID = 40;           // map is GRID x GRID tiles (maps are drawn on a 24 grid and scaled up)
export const TILE_W = 64;
export const TILE_H = 37;           // 32 = classic isometric; 37 looks a bit more from above
export const HOUR_MS = 2500;      // 1 in-game hour per 2.5 real seconds (at 1x)

export const CUR = '€';

export const RESOURCES = {
  silicon: { name: 'Silicon', icon: '💎', color: '#7cc6e8', base: 8 },
  copper:  { name: 'Copper',  icon: '🟠', color: '#e8955a', base: 10 },
  polymer: { name: 'Polymer', icon: '🧪', color: '#b48ce0', base: 12 },
  wire:    { name: 'Wire',    icon: '🧵', color: '#e8b46a', base: 26 },
  chip:    { name: 'Chip',    icon: '🔲', color: '#4fb3c8', base: 45 },
  sensor:  { name: 'Sensor',  icon: '📡', color: '#8cc85a', base: 70 },
  board:   { name: 'Circuit Board', icon: '🟩', color: '#3fa77c', base: 150 },
  iot:     { name: 'IoT Gadget', icon: '🤖', color: '#e87aa8', base: 260 },
  rack:    { name: 'Server Rack', icon: '🗄️', color: '#d9a92a', base: 520 },
};
export const RAW = ['silicon', 'copper', 'polymer'];

export const RECIPES = [
  { id: 'wire',   out: 'wire',   qty: 2, time: 3,  in: { copper: 2 } },
  { id: 'chip',   out: 'chip',   qty: 1, time: 4,  in: { silicon: 2, copper: 1 } },
  { id: 'sensor', out: 'sensor', qty: 1, time: 5,  in: { chip: 1, polymer: 1 } },
  { id: 'board',  out: 'board',  qty: 1, time: 8,  in: { chip: 2, wire: 1, polymer: 1 } },
  { id: 'iot',    out: 'iot',    qty: 1, time: 10, in: { board: 1, sensor: 1 } },
  { id: 'rack',   out: 'rack',   qty: 1, time: 16, in: { board: 3, wire: 2 } },
];

// kind: res | pow | net | ind | fab | com | dc | fun
// style: how the renderer draws it (see render.js)
// group: board-game colour band shown on the property card
export const BUILDINGS = {
  flat:     { name: 'Apartment Tower',  kind: 'fun', style: 'flat',     cost: 0,    upkeep: 0,  power: 0,  happy: 0, color: '#d8d2c4', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'A 1960s apartment block on Linkeroever. Demolish it to free the lot.' },
  p_crane: { name: 'Port Crane', kind: 'fun', style: 'crane', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'A container crane in the port.' },
  p_containers: { name: 'Container Stack', kind: 'fun', style: 'containers', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'Shipping containers waiting on the quay.' },
  p_kiosk: { name: 'Street Kiosk', kind: 'fun', style: 'kiosk', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'A local snack kiosk.' },
  p_monument: { name: 'Statue', kind: 'fun', style: 'monument', cost: 0, upkeep: 0, power: 0, happy: 1, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'A bronze statue on a stone plinth.' },
  p_billboard: { name: 'Billboard', kind: 'fun', style: 'billboard', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'A billboard with the city symbol.' },
  p_bank: { name: 'Bank', kind: 'fun', style: 'bank', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'A stately bank building with columns.' },
  p_prison: { name: 'Prison', kind: 'fun', style: 'prison', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'The city prison behind high walls.', size: 2 },
  p_plaza: { name: 'Square', kind: 'fun', style: 'plaza', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'A paved square with a fountain, trees and terraces.' },
  p_hospital: { name: 'Hospital', kind: 'fun', style: 'hospital', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'The city hospital, with an emergency entrance and a helipad.', size: 2 },
  p_police: { name: 'Police Station', kind: 'fun', style: 'police', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'A local police station.' },
  p_library: { name: 'Library', kind: 'fun', style: 'library', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'The public library.' },
  p_flag: { name: 'City Flag', kind: 'fun', style: 'flag', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'The city flag on a pole.' },
  p_euflag: { name: 'EU Flag', kind: 'fun', style: 'flag', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'The European flag in the EU quarter.' },
  p_handje: { name: 'Antwerp Hand', kind: 'fun', style: 'handje', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'The hand from the legend of Brabo, the Antwerp city symbol.' },
  p_comic: { name: 'Comic Mural', kind: 'fun', style: 'comic', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'One of the comic-strip murals on the walls of Brussels.' },
  p_bikerack: { name: 'Bike Rack', kind: 'fun', style: 'bikerack', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'Rows of parked bikes: Gent is a cycling city.' },
  apt: { name: 'Apartment Block', kind: 'fun', style: 'apt', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'A mid-rise block of flats. Demolish it to free the lot.' },
  office: { name: 'Office Tower', kind: 'fun', style: 'office', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'Glass offices in the business district. Demolish it to free the lot.' },
  villa: { name: 'Villa', kind: 'fun', style: 'villa', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'A detached house with a garden. Demolish it to free the lot.' },
  industry: { name: 'Workshop Hall', kind: 'fun', style: 'industry', cost: 0, upkeep: 0, power: 0, happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'A low industrial hall. Demolish it to free the lot.' },
  rowhouse: { name: 'Old Town Houses',  kind: 'fun', style: 'row',      cost: 0,    upkeep: 0,  power: 0,  happy: 0, color: '#c9b79c', group: '#8b5a2b', unlock: 1e9, base: true, desc: 'Existing houses of the old town. Demolish them to free the lot.' },
  gable:    { name: 'Gable House',      kind: 'res', style: 'gable',     cost: 120,  upkeep: 1,  power: -1, pop: 12, color: '#f2a65a', group: '#8b5a2b', unlock: 0,   desc: 'An Antwerp stepped-gable home. 12 residents pay tax.' },
  brown:    { name: 'Brownstone',       kind: 'res', style: 'brown',     cost: 220,  upkeep: 2,  power: -1, pop: 24, color: '#b9765a', group: '#8b5a2b', unlock: 30,  desc: 'A New York brownstone with a stoop. 24 residents.' },
  solar:    { name: 'Solar Roof',       kind: 'pow', style: 'solar',     cost: 200,  upkeep: 2,  power: 8,  color: '#5b8def', group: '#f2c94c', unlock: 0,   desc: '+8 power by day, +2 at night.', solarPanel: true },
  lamp:     { name: '5G Lamppost',      kind: 'net', style: 'lamp',      cost: 160,  upkeep: 2,  power: -1, radius: 4, color: '#3fb6a8', group: '#3fb6a8', unlock: 0, desc: 'Smart streetlight with Wi-Fi (radius 4). Buildings without signal run at 50%.' },
  quarry:   { name: 'Silicon Quarry',   kind: 'ind', style: 'factory',   cost: 250,  upkeep: 4,  power: -2, jobs: 6, produce: { silicon: 1.2 }, color: '#7cc6e8', group: '#6b7280', unlock: 0, desc: 'Digs up shiny silicon.' },
  copper:   { name: 'Copper Works',     kind: 'ind', style: 'factory',   cost: 250,  upkeep: 4,  power: -2, jobs: 6, produce: { copper: 1.2 }, color: '#e8955a', group: '#6b7280', unlock: 0, desc: 'Smelts copper.' },
  frituur:  { name: 'Frituur',          kind: 'com', style: 'shop',      cost: 280,  upkeep: 2,  power: -1, jobs: 4, revenue: 6, color: '#f7d046', group: '#e05a5a', unlock: 40, desc: 'Belgian fries! Earns money from your residents.', awning: '#e05a5a' },
  deli:     { name: 'Corner Deli',      kind: 'com', style: 'shop',      cost: 320,  upkeep: 2,  power: -1, jobs: 4, revenue: 7, color: '#7fbf7f', group: '#e05a5a', unlock: 60, desc: 'Bagels and coffee, New York style.', awning: '#2f8f5b' },
  polymer:  { name: 'Polymer Plant',    kind: 'ind', style: 'factory',   cost: 400,  upkeep: 6,  power: -3, jobs: 8, produce: { polymer: 1 }, color: '#b48ce0', group: '#6b7280', unlock: 60, desc: 'Cooks up polymer.' },
  fab:      { name: 'Maker Workshop',   kind: 'fab', style: 'workshop',  cost: 500,  upkeep: 6,  power: -3, jobs: 8, color: '#3fa77c', group: '#3fa77c', unlock: 60, desc: 'Unlocks crafting. Each workshop adds +50% craft speed.' },
  wind:     { name: 'Wind Turbine',     kind: 'pow', style: 'wind',      cost: 450,  upkeep: 3,  power: 6,  color: '#ffffff', group: '#f2c94c', unlock: 120, desc: 'A steady +6 power, day and night.' },
  dc:       { name: 'Harbour Data Hub', kind: 'dc',  style: 'warehouse', cost: 1400, upkeep: 12, power: -6, jobs: 10, compute: 10, color: '#d64545', group: '#2f5fa8', unlock: 150, desc: 'A red-brick port warehouse full of servers. +10 compute.', needs: { rack: 1 } },
  sky:      { name: 'Deco Skyscraper',  kind: 'com', style: 'sky',       cost: 900,  upkeep: 6,  power: -3, jobs: 14, revenue: 22, color: '#e9dcc0', group: '#2f5fa8', unlock: 200, desc: 'An Art Deco tower. Lots of office rent.', needs: { board: 2 } },
  smart:    { name: 'Smart Lofts',      kind: 'res', style: 'lofts',     cost: 2400, upkeep: 10, power: -4, pop: 90, color: '#9aa7d8', group: '#7b4fa8', unlock: 400, desc: '90 residents, run entirely by IoT.', needs: { iot: 2 } },
  station:  { name: 'Central Station',  kind: 'fun', style: 'station',   cost: 3000, upkeep: 8,  power: -2, happy: 15, color: '#c9b48a', group: '#7b4fa8', unlock: 300, desc: 'A domed railway palace. +15 happiness across the city.', needs: { board: 2 } },
  cathedral:{ name: 'Cathedral',        kind: 'fun', style: 'cathedral', cost: 2600, upkeep: 6,  power: -1, happy: 12, color: '#dcd3c0', group: '#7b4fa8', unlock: 250, desc: 'A Gothic spire over the old town. +12 happiness.' },
  plant:    { name: 'Harbour Power',    kind: 'pow', style: 'plant',     cost: 4000, upkeep: 20, power: 40, color: '#d64545', group: '#f2c94c', unlock: 600, desc: '+40 power. The lights stay on all night.', needs: { rack: 2, iot: 1 } },
  park:     { name: 'Pocket Park',      kind: 'fun', style: 'park',      cost: 90,   upkeep: 1,  power: 0,  happy: 2, color: '#7cc46a', group: '#3fa77c', unlock: 0, desc: 'Trees and a bench. +2 happiness.' },
};
// Real landmarks, pre-placed on each city map (not buildable, not demolishable)
const LM = (name, style, happy, desc, extra = {}) => ({ name, kind: 'fun', style, cost: 0, upkeep: 0, power: 0, happy, color: '#e9dcc0', group: '#c9a227', unlock: 0, landmark: true, desc, ...extra });
Object.assign(BUILDINGS, {
  hetsteen:    LM('Het Steen', 'castle', 6, 'Medieval riverside castle on the Scheldt.'),
  stadhuisA:   LM('Stadhuis Antwerpen', 'guild', 5, 'Renaissance city hall on the Grote Markt.'),
  cathedralA:  LM('Onze-Lieve-Vrouwekathedraal', 'cathedral', 8, 'The 123 m Gothic spire that towers over Antwerp.'),
  mas:         LM('MAS', 'mas', 6, 'Museum aan de Stroom: a red sandstone tower between the docks.'),
  centraal:    LM('Antwerpen-Centraal', 'station', 8, 'The railway cathedral: domed station at the end of De Keyserlei.', { centraal: true }),
  kmska:       LM('KMSKA', 'palace', 5, 'The Royal Museum of Fine Arts at het Zuid.'),
  atomium:     LM('Atomium', 'atomium', 10, 'Nine shiny spheres from Expo 58 in Laeken.'),
  grandplace:  LM('Grand-Place', 'guild', 10, 'Gilded guild houses and the Gothic town hall.', { gold: true }),
  manneken:    LM('Manneken Pis', 'statue', 3, 'Small statue, big fame.'),
  stmichel:    LM('Sint-Michiels- en Sint-Goedelekathedraal', 'cathedral', 6, 'Twin-towered Gothic cathedral.', { twin: true }),
  royalpalace: LM('Koninklijk Paleis', 'palace', 6, 'The Royal Palace facing the Warandepark.', { long: true }),
  justice:     LM('Justitiepaleis', 'palace', 5, 'Massive domed Palace of Justice on the Poelaert square.', { dome: true }),
  midi:        LM('Brussel-Zuid', 'station', 4, 'Brussels-South: trains to Paris, London and Amsterdam.', { plain: true }),
  nord:        LM('Brussel-Noord', 'station', 3, 'Brussels-North station.', { plain: true }),
  berlaymont:  LM('Berlaymont', 'berlaymont', 4, 'Star-shaped HQ of the European Commission.'),
  arcade:      LM('Jubelpark Arcade', 'arch', 5, 'Triumphal arch in the Cinquantenaire park.'),
  gravensteen: LM('Gravensteen', 'castle', 8, 'The Castle of the Counts, with moat and battlements.'),
  korenlei:    LM('Korenlei', 'guild', 5, 'Guild houses mirrored in the Leie.'),
  graslei:     LM('Graslei', 'guild', 7, 'The postcard row of medieval guild houses.', { gold: true }),
  stniklaas:   LM('Sint-Niklaaskerk', 'tower', 5, 'First of the three towers, in Scheldt Gothic.', { church: true }),
  belfort:     LM('Belfort', 'tower', 6, 'The 91 m belfry with its golden dragon.', { dragon: true }),
  stbaafs:     LM('Sint-Baafskathedraal', 'cathedral', 8, 'Home of the Ghent Altarpiece.'),
  stpieters:   LM('Gent-Sint-Pieters', 'station', 4, "Ghent's main station by the Citadelpark."),
  // Oasis Bay (a made-up desert town)
  qasr:        LM('The Old Qasr', 'castle', 7, 'A sand-coloured fortress watching over the fishing harbour.', { desert: true }),
  souk:        LM('Grand Souk', 'guild', 8, 'Covered market streets full of spices, lanterns and carpets.', { gold: true, desert: true }),
  minaret:     LM('Lantern Tower', 'tower', 6, 'A slender white tower lit up every evening.', { desert: true }),
  kasbah:      LM('The Kasbah', 'palace', 6, 'Old walled palace with a cool courtyard garden.', { desert: true, long: true }),
  caravan:     LM('Caravan Station', 'station', 4, 'Buses and trucks leave here for the desert towns.', { plain: true, desert: true }),
  mountA:      LM('Red Mountain', 'mountain', 3, 'A huge sandstone mountain glowing red at sunset. Nothing can be built on it.', { desert: true }),
  mountB:      LM('Twin Peaks', 'mountain', 2, 'Rocky peaks where the goats go climbing.', { desert: true }),
  mountC:      LM('Dune Rock', 'mountain', 2, 'A lonely rock outcrop south of town.', { desert: true }),
  lighthouse:  LM('Harbour Light', 'tower', 3, 'A striped lighthouse guiding the fishing boats home.', { desert: true }),
});

// Realism rules for buildable types:
//   per1k     how many may stand per 1000 buildable lots (bigger map = more allowed); max = hard cap instead
//   maxIncome most money one building can bring in per hour (taxes or revenue), however good the city gets
//   needsNet  stops working completely without Wi-Fi (shops take card payments, offices and servers live online)
// Every building that uses power (power < 0) only works when the grid can actually supply it.
const RULES = {
  gable:    { per1k: 90, maxIncome: 3 },
  brown:    { per1k: 60, maxIncome: 6 },
  smart:    { per1k: 10, maxIncome: 20, needsNet: true },
  park:     { per1k: 30 },
  solar:    { per1k: 30 },
  wind:     { per1k: 10 },
  plant:    { per1k: 2 },
  lamp:     { per1k: 25 },
  quarry:   { per1k: 8 },
  copper:   { per1k: 8 },
  polymer:  { per1k: 6 },
  fab:      { per1k: 5, needsNet: true },
  frituur:  { per1k: 12, maxIncome: 8, needsNet: true },
  deli:     { per1k: 12, maxIncome: 9, needsNet: true },
  sky:      { per1k: 8, maxIncome: 30, needsNet: true },
  dc:       { per1k: 4, needsNet: true },
  cathedral:{ max: 1 },
  station:  { max: 1 },
};
for (const k in RULES) Object.assign(BUILDINGS[k], RULES[k]);

export const BUILD_ORDER =['gable','brown','park','solar','lamp','quarry','copper','frituur','deli','polymer','fab','wind','dc','sky','cathedral','station','smart','plant'];

// Integration map systems (positions in a 0..100 box)
export const SYSTEMS = {
  grid:   { name: 'Power Grid', x: 14, y: 20, color: '#f2c94c', icon: '⚡' },
  iotHub: { name: 'IoT Hub',    x: 50, y: 10, color: '#3fb6a8', icon: '📶' },
  erp:    { name: 'ERP',        x: 86, y: 20, color: '#3fa77c', icon: '🏭' },
  market: { name: 'Market',     x: 86, y: 74, color: '#e87aa8', icon: '📈' },
  bank:   { name: 'Bank',       x: 50, y: 90, color: '#7b4fa8', icon: '🏦' },
  siem:   { name: 'SIEM',       x: 14, y: 74, color: '#e05a5a', icon: '🛡️' },
  city:   { name: 'City Hall',  x: 50, y: 50, color: '#8b5a2b', icon: '🏛️' },
};

export const INTEGRATIONS = [
  { id: 'smartMeter', name: 'Smart Metering',     a: 'grid',   b: 'iotHub', compute: 2, cost: 600,  needs: { sensor: 3 }, desc: 'Power use −20%.' },
  { id: 'payGw',      name: 'Payment Gateway',    a: 'city',   b: 'bank',   compute: 2, cost: 800,  needs: { chip: 4 },   desc: 'Shop & office revenue +25%.' },
  { id: 'erpSync',    name: 'ERP ↔ Factory Sync', a: 'erp',    b: 'city',   compute: 3, cost: 900,  needs: { board: 2 },  desc: 'Industry output +30%.' },
  { id: 'erpMarket',  name: 'ERP → Market Feed',  a: 'erp',    b: 'market', compute: 2, cost: 700,  needs: { chip: 2 },   desc: 'Sell prices +15%.' },
  { id: 'siemCore',   name: 'SIEM Monitoring',    a: 'siem',   b: 'city',   compute: 3, cost: 1000, needs: { sensor: 4 }, desc: 'Incident chance −60%.' },
  { id: 'autoRemed',  name: 'Auto-Remediation',   a: 'siem',   b: 'iotHub', compute: 4, cost: 1500, needs: { iot: 1 },    desc: 'Incidents fix themselves after 3h at half price.' },
  { id: 'treasury',   name: 'Treasury API',       a: 'bank',   b: 'market', compute: 2, cost: 1200, needs: { board: 1 },  desc: 'Your treasury earns 0.5% interest a day.' },
  { id: 'gridBal',    name: 'Grid Load Balancer', a: 'grid',   b: 'city',   compute: 3, cost: 1100, needs: { iot: 1 },    desc: 'Double solar at night, +10% power.' },
];

export const TRIGGERS = {
  priceAbove: { label: 'price of {res} >', arg: true, res: true },
  priceBelow: { label: 'price of {res} <', arg: true, res: true },
  stockAbove: { label: 'stock of {res} >', arg: true, res: true },
  stockBelow: { label: 'stock of {res} <', arg: true, res: true },
  cashBelow:  { label: 'treasury <',       arg: true },
  cashAbove:  { label: 'treasury >',       arg: true },
  powerLow:   { label: 'power balance <',  arg: true },
  incident:   { label: 'an incident is active' },
  everyDay:   { label: 'a new day starts' },
};
export const ACTIONS = {
  sellAll:  { label: 'sell all {res}', res: true },
  sellHalf: { label: 'sell half the {res}', res: true },
  buy:      { label: 'buy 5 {res}', res: true },
  craft:    { label: 'queue a {recipe}', recipe: true },
  taxUp:    { label: 'raise tax by 1%' },
  taxDown:  { label: 'lower tax by 1%' },
  patch:    { label: 'patch all incidents' },
};
export const RULE_COMPUTE = 1;
export const BASE_COMPUTE = 3;

// Disasters the mayor can buy and unleash on a spot of the map (pick one, then click the map).
//   cost     price to cast it
//   radius  tiles around the click that get hit (closer = harder)
//   destroy  chance a building you built is wiped out
//   damage   chance a permanent building (landmark or the existing city) is damaged and needs repairs
//   rubble   chance a street tile gets blocked with debris until it is cleaned
//   water    floods only hit tiles near water
export const DISASTERS = {
  fire:   { name: 'Fire',           icon: '🔥', cost: 200,  radius: 2.5, destroy: 0.75, damage: 0.8,  rubble: 0.3,  desc: 'A blaze spreads from block to block.' },
  storm:  { name: 'Storm',          icon: '🌪️', cost: 350,  radius: 4.5, destroy: 0.35, damage: 0.5,  rubble: 0.45, desc: 'Gale-force winds rip through a neighbourhood.' },
  flood:  { name: 'Flood',          icon: '🌊', cost: 500,  radius: 6,   destroy: 0.3,  damage: 0.6,  rubble: 0.7,  water: true, desc: 'The river bursts its banks. Only hits the waterfront.' },
  quake:  { name: 'Earthquake',     icon: '🌍', cost: 800,  radius: 7,   destroy: 0.25, damage: 0.45, rubble: 0.6,  desc: 'The ground shakes over a wide area.' },
  drone:  { name: 'Drone crash',    icon: '💥', cost: 0,    radius: 3,   destroy: 0.6,  damage: 0.6,  rubble: 0.5,  hidden: true, desc: 'A drone you clicked falls out of the sky and explodes.' },
  aliens: { name: 'Alien Invasion', icon: '🛸', cost: 1500, radius: 5.5, destroy: 0.55, damage: 0.6,  rubble: 0.4,  desc: 'Flying saucers zap whole blocks with death rays and beam up a few residents.' },
};
export const REPAIR_COST = { landmark: 400, base: 60 };   // per damaged building
export const CLEAN_COST = 15;                             // per street tile of rubble

export const INCIDENTS = [
  { id: 'ddos',   name: 'DDoS attack',      icon: '🌩️', fix: 250 },
  { id: 'outage', name: 'Router outage',    icon: '🔌', fix: 180 },
  { id: 'ransom', name: 'Ransomware',       icon: '🔒', fix: 400 },
  { id: 'bug',    name: 'Firmware bug',     icon: '🐞', fix: 120 },
];

// Tax: Belgian-style rates of 21-30%, but each percent brings in less than a high rate suggests
// (a big share goes to the region and social security, the city keeps only its part).
// At the 25% default the city earns about what a 9% "city-only" tax used to bring in.
export const TAX = { min: 21, max: 30, start: 25, yield: 0.79 };
