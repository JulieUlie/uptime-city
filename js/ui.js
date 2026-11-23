// DOM UI: HUD, build list, side panel tabs, inspector, console, toasts.
import {
  BUILDINGS, BUILD_ORDER, RESOURCES, RECIPES, INTEGRATIONS, SYSTEMS, TRIGGERS, ACTIONS, INCIDENTS, CUR, RULE_COMPUTE, TAX, DISASTERS, CLEAN_COST,
} from './config.js';
import * as G from './game.js';
import { ui } from './render.js';

const $ = (s) => document.querySelector(s);
const fmt = (n) => (n < 0 ? '−' : '') + CUR + Math.abs(Math.round(n)).toLocaleString('en-US');
const ICONS = { hetsteen: '🏰', stadhuisA: '🏛️', cathedralA: '⛪', mas: '🟥', centraal: '🚉', kmska: '🖼️', atomium: '⚛️', grandplace: '✨', manneken: '⛲', stmichel: '⛪', royalpalace: '👑', justice: '⚖️', midi: '🚆', nord: '🚆', berlaymont: '🇪🇺', arcade: '🏛️', gravensteen: '🏰', korenlei: '🏘️', graslei: '🏘️', stniklaas: '⛪', belfort: '🔔', stbaafs: '⛪', stpieters: '🚉', qasr: '🏰', souk: '🧺', minaret: '🗼', kasbah: '🕌', caravan: '🚌', lighthouse: '🗼', mountA: '⛰️', mountB: '⛰️', mountC: '⛰️', gable: '🏠', brown: '🏘️', solar: '🔆', lamp: '📶', quarry: '💎', copper: '🟠', frituur: '🍟', deli: '🥯', polymer: '🧪', fab: '🛠️', wind: '🌬️', dc: '🗄️', sky: '🏙️', smart: '🏢', station: '🚉', cathedral: '⛪', plant: '🏭', park: '🌳' };
const seen = new Set();
let tab = 'finance';

export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

// ---------- build list ----------
export function renderBuildList() {
  const list = $('#build-list');
  list.innerHTML = '';
  for (const k of BUILD_ORDER) {
    const d = BUILDINGS[k];
    const locked = !G.S.unlocked.includes(k);
    const lim = G.buildLimit(k), have = G.D.counts[k] || 0, full = !locked && have >= lim;
    const err = locked ? null : full ? 'full' : G.canAfford(d);
    const btn = document.createElement('button');
    btn.dataset.b = k;
    btn.className = 'bcard' + (ui.tool === k ? ' on' : '') + (locked ? ' locked' : '') + (err ? ' cant' : '') + (!locked && d.unlock > 0 && !seen.has(k) ? ' new' : '');
    const needs = Object.entries(d.needs || {}).map(([r, n]) => `${n}${RESOURCES[r].icon}`).join(' ');
    btn.innerHTML = `<div class="band" style="background:${d.group}"></div><div class="ico">${ICONS[k]}</div>
      <div class="nm">${d.name}</div>
      <div class="pr">${locked ? `🔒 ${d.unlock} residents` : `${fmt(d.cost)} ${needs ? `<span>+ ${needs}</span>` : ''}`}</div>
      ${!locked && lim !== Infinity ? `<div class="pr cnt" title="built / allowed on this map">🏗 ${have}/${lim}</div>` : ''}`;
    btn.title = d.desc + (lim !== Infinity ? ` (this map has room for ${lim})` : '');
    btn.onclick = () => {
      if (locked) return toast(`Reach ${d.unlock} residents to unlock ${d.name}`);
      seen.add(k);
      setTool(ui.tool === k ? null : k);
    };
    list.appendChild(btn);
  }
}
export function setTool(t) {
  ui.tool = t;
  $('#tool-bulldoze').classList.toggle('on', t === 'bulldoze');
  $('#city').classList.toggle('placing', !!t);
  if (t && BUILDINGS[t]) showInspector(null, t);
  document.querySelectorAll('#tab-body [data-dz]').forEach((b) => b.classList.toggle('on', t === 'disaster:' + b.dataset.dz));
  renderBuildList();
}

// ---------- HUD ----------
let lastCash = 0;
export function renderHud() {
  const S = G.S, D = G.D;
  $('#s-cash').textContent = fmt(S.cash);
  $('#s-cash').closest('.stat').classList.toggle('bad', S.cash < 0);
  if (Math.round(S.cash / 50) !== Math.round(lastCash / 50)) { const st = $('#s-cash').closest('.stat'); st.classList.remove('pulse'); void st.offsetWidth; st.classList.add('pulse'); }
  lastCash = S.cash;
  $('#s-pop').textContent = D.pop.toLocaleString('en-US');
  $('#s-happy').textContent = Math.round(S.happy) + '%';
  $('#s-mood').textContent = S.happy > 75 ? '😍' : S.happy > 55 ? '😊' : S.happy > 35 ? '😐' : '😠';
  $('#s-power').textContent = `${D.power >= 0 ? '+' : ''}${Math.round(D.power)}`;
  $('#s-power').closest('.stat').classList.toggle('bad', D.power < 0);
  $('#s-compute').textContent = `${D.computeUse}/${D.compute}`;
  $('#s-jobs').textContent = `${D.workers}/${D.jobs}`;
  $('#s-time').textContent = `Day ${S.day} · ${String(S.hour).padStart(2, '0')}:00`;
  $('#s-sun').textContent = S.hour >= 7 && S.hour < 20 ? '☀️' : '🌙';
}

// ---------- console ----------
export function pushLog({ level, msg, t }) {
  const li = document.createElement('li');
  li.className = level;
  li.innerHTML = `<span class="tm">${t}</span><span class="lv">${{ ok: '✔', warn: '▲', err: '✖', auto: '⚙' }[level] || '•'}</span> ${escape(msg)}`;
  const ol = $('#log'); ol.prepend(li);
  while (ol.children.length > 60) ol.lastChild.remove();
}
const escape = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// ---------- inspector (property card) ----------
export function showInspector(i, type) {
  const el = $('#inspector');
  ui.selected = i;
  if (i == null && !type) { el.hidden = true; return; }
  const t = i != null ? G.S.tiles[i] : null;
  const k = t ? t.type : type;
  const d = BUILDINGS[k];
  const lines = [];
  if (d.pop) lines.push(['Residents', d.pop]);
  if (d.jobs) lines.push(['Jobs', d.jobs]);
  if (d.power) lines.push(['Power', (d.power > 0 ? '+' : '') + d.power]);
  if (d.needsNet) lines.push(['Needs Wi-Fi', 'yes']);
  if (d.maxIncome) lines.push(['Max income/h', fmt(d.maxIncome)]);
  if (!d.landmark && !d.base && G.buildLimit(k) !== Infinity) lines.push(['Built / allowed', `${G.D.counts[k] || 0} / ${G.buildLimit(k)}`]);
  if (d.radius) lines.push(['Wi-Fi radius', d.radius]);
  if (d.produce) for (const r in d.produce) lines.push([`${RESOURCES[r].icon} ${RESOURCES[r].name}/h`, d.produce[r]]);
  if (d.revenue) lines.push(['Base revenue/h', fmt(d.revenue)]);
  if (d.compute) lines.push(['Compute', '+' + d.compute]);
  if (d.happy) lines.push(['Happiness', '+' + d.happy]);
  lines.push(['Upkeep/h', fmt(d.upkeep)]);
  let extra = '';
  if (t && d.landmark) {
    extra = `<div class="hint">🏅 Protected landmark: it can't be demolished, and it makes the whole city happier.</div>`;
    if (t.damaged) extra += `<div class="alert">🏚️ Damaged by a disaster. It gives no happiness until it is repaired.</div><button class="btn warn" id="ins-repair">🔧 Repair for ${fmt(G.repairCost(t))}</button>`;
  } else if (t) {
    const b = { ...t, i };
    const e = G.efficiency(b);
    extra += `<div class="kv"><span>Efficiency</span><b>${Math.round(e * 100)}%</b></div><div class="bar"><i style="width:${e * 100}%;background:${e > 0.8 ? '#3fa77c' : e > 0.4 ? '#f2c94c' : '#e05a5a'}"></i></div>`;
    const why = G.problem(b);
    if (why === 'power') extra += `<div class="alert">🔌 No power: this building is switched off. Build more Solar Roofs or Wind Turbines.</div>`;
    else if (why === 'net') extra += `<div class="alert">📵 No internet: it can't work without Wi-Fi. Build a 5G Lamppost nearby.</div>`;
    else if (!G.D.covered.has(i) && d.kind !== 'net' && d.kind !== 'fun') extra += `<div class="hint">📵 No Wi-Fi signal. Build a 5G Lamppost nearby.</div>`;
    if (t.damaged) extra += `<div class="alert">🏚️ Damaged by a disaster. It does nothing until it is repaired.</div><button class="btn warn" id="ins-repair">🔧 Repair for ${fmt(G.repairCost(t))}</button> `;
    if (t.incident) {
      const inc = INCIDENTS.find((x) => x.id === t.incident.id);
      extra += `<div class="alert">${inc.icon} ${inc.name}! This building is offline.</div><button class="btn warn" id="ins-patch">🛠️ Patch for ${fmt(inc.fix)}</button> `;
    }
    extra += `<button class="btn small" id="ins-demo">🧹 Demolish (+${fmt(d.cost * 0.4)})</button>`;
  } else {
    const needs = Object.entries(d.needs || {}).map(([r, n]) => `<span class="tag ${G.S.stock[r] < n ? 'lack' : ''}">${n}× ${RESOURCES[r].icon} ${RESOURCES[r].name}</span>`).join('');
    extra = `<div class="kv"><span>Price</span><b>${fmt(d.cost)}</b></div>${needs ? `<div style="margin:4px 0">${needs}</div>` : ''}<div class="hint">Click a green lot to build. Press Esc to cancel.</div>`;
  }
  el.innerHTML = `<div class="card-band" style="background:${d.group}">${d.landmark ? 'Landmark' : t ? 'Title deed' : 'For sale'}</div>
    <button class="x" id="ins-x" aria-label="Close">✕</button>
    <div class="title">${ICONS[k] || ''} ${d.name}</div>
    <div class="body"><p class="muted" style="margin:0 0 6px">${d.desc}</p>
    ${lines.map(([a, v]) => `<div class="kv"><span>${a}</span><b>${v}</b></div>`).join('')}
    ${extra}</div>`;
  el.hidden = false;
  $('#ins-x').onclick = () => { showInspector(null); if (!t) setTool(null); };
  if (t && !d.landmark) {
    $('#ins-demo').onclick = () => { const x = i % G.S_GRID, y = Math.floor(i / G.S_GRID); G.bulldoze(x, y); showInspector(null); };
    const p = $('#ins-patch'); if (p) p.onclick = () => { const e = G.patch(i); if (e) toast(e, 'err'); else showInspector(i); };
  }
  if (t) {
    const rp = $('#ins-repair'); if (rp) rp.onclick = () => { const e = G.repair(i); if (e) toast(e, 'err'); else showInspector(i); };
  }
}

// ---------- side panel ----------
export function setPanelOpen(open) {
  $('#panel').classList.toggle('closed', !open);
  try { localStorage.setItem('uptime-city-panel', open ? '1' : '0'); } catch {}
  document.dispatchEvent(new Event('layout'));
}
export function initPanel() {
  let open = false;
  try { open = localStorage.getItem('uptime-city-panel') === '1'; } catch {}
  $('#panel').classList.toggle('closed', !open);
  $('#panel-close').onclick = () => setPanelOpen(false);
  document.querySelectorAll('#tabs button[data-tab]').forEach((b) => b.onclick = () => {
    const closed = $('#panel').classList.contains('closed');
    if (!closed && tab === b.dataset.tab) { setPanelOpen(false); return; }
    if (closed) setPanelOpen(true);
    tab = b.dataset.tab;
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
    renderPanel(true);
  });
}
export function renderPanel(full = false) {
  const body = $('#tab-body');
  // only rebuild the DOM when needed, so inputs keep focus
  if (full || body.dataset.tab !== tab) { body.dataset.tab = tab; body.innerHTML = PANELS[tab].html(); PANELS[tab].bind?.(body); }
  PANELS[tab].update?.(body);
}

function spark(canvas, data, color, fill = true) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w) return;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const c = canvas.getContext('2d'); c.scale(dpr, dpr);
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * (w - 8) + 4, h - 6 - ((v - min) / rng) * (h - 14)]);
  if (min < 0 && max > 0) { const zy = h - 6 - ((0 - min) / rng) * (h - 14); c.strokeStyle = '#e05a5a55'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(0, zy); c.lineTo(w, zy); c.stroke(); c.setLineDash([]); }
  if (fill) { c.fillStyle = color + '33'; c.beginPath(); c.moveTo(pts[0][0], h); pts.forEach((p) => c.lineTo(p[0], p[1])); c.lineTo(pts[pts.length - 1][0], h); c.fill(); }
  c.strokeStyle = color; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
}

const resOptions = (sel) => Object.keys(RESOURCES).map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${RESOURCES[k].icon} ${RESOURCES[k].name}</option>`).join('');

const PANELS = {
  finance: {
    html: () => `
      <h3>Treasury <span class="muted" style="font-size:12px">last 5 days</span></h3>
      <canvas class="chart" id="f-chart"></canvas>
      <h3>Tax rate <b id="f-taxv"></b></h3>
      <input type="range" min="${TAX.min}" max="${TAX.max}" class="slider" id="f-tax" aria-label="Tax rate">
      <div class="hint">Tax runs from ${TAX.min}% to ${TAX.max}%. Most of it goes to the region and social security, so the city only keeps a small slice. Higher tax makes residents grumpy; ${TAX.start}% is the sweet spot.</div>
      <h3>Today so far</h3><table class="ledger" id="f-today"></table>
      <h3>Yesterday</h3><table class="ledger" id="f-yday"></table>
      <h3>Loans</h3>
      <div class="kv"><span>Outstanding</span><b id="f-loan"></b></div>
      <div class="row"><button class="btn small" id="f-borrow">🏦 Borrow ${CUR}2,000</button><button class="btn small" id="f-repay">Repay ${CUR}1,000</button></div>`,
    bind(b) {
      b.querySelector('#f-tax').value = G.S.tax;
      b.querySelector('#f-tax').oninput = (e) => { G.S.tax = +e.target.value; renderPanel(); };
      b.querySelector('#f-borrow').onclick = () => G.takeLoan(2000);
      b.querySelector('#f-repay').onclick = () => { const e = G.repayLoan(1000); if (e) toast(e, 'err'); };
    },
    update(b) {
      b.querySelector('#f-taxv').textContent = G.S.tax + '%';
      spark(b.querySelector('#f-chart'), G.S.cashHist, '#2f5fa8');
      const tbl = (L) => {
        if (!L) return '<tr><td class="muted">No data yet</td><td></td></tr>';
        const rows = Object.entries(L.lines).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${k}</td><td class="${v >= 0 ? 'pos' : 'neg'}">${fmt(v)}</td></tr>`).join('');
        const net = L.income - L.expense;
        return rows + `<tr class="total"><td>Net</td><td class="${net >= 0 ? 'pos' : 'neg'}">${fmt(net)}</td></tr>`;
      };
      b.querySelector('#f-today').innerHTML = tbl(G.S.ledger);
      b.querySelector('#f-yday').innerHTML = tbl(G.S.lastDay);
      b.querySelector('#f-loan').textContent = fmt(G.S.loan);
    },
  },

  craft: {
    html: () => `
      <h3>Inventory</h3><div class="inv" id="c-inv"></div>
      <h3>Workshop queue <span class="muted" style="font-size:12px" id="c-speed"></span></h3>
      <div class="queue" id="c-queue"></div>
      <h3>Recipes</h3><div id="c-recipes"></div>`,
    bind(b) {
      b.querySelector('#c-recipes').innerHTML = RECIPES.map((r) => `<div class="recipe" data-r="${r.id}">
        <div><div class="out">${RESOURCES[r.out].icon} ${r.qty > 1 ? r.qty + '× ' : ''}${RESOURCES[r.out].name}</div>
        <div class="ins">${Object.entries(r.in).map(([k, n]) => `<span data-k="${k}" data-n="${n}">${n}× ${RESOURCES[k].icon} ${RESOURCES[k].name}</span>`).join('')}<span>⏱ ${r.time}h</span></div></div>
        <button class="btn small primary">Craft</button></div>`).join('');
      b.querySelectorAll('.recipe').forEach((el) => el.querySelector('button').onclick = () => {
        const e = G.queueCraft(el.dataset.r); if (e) toast(e, 'err'); else renderPanel();
      });
    },
    update(b) {
      b.querySelector('#c-inv').innerHTML = Object.keys(RESOURCES).map((k) => `<div title="${RESOURCES[k].name}">${RESOURCES[k].icon}<span>${RESOURCES[k].name.split(' ')[0]}</span><b>${Math.floor(G.S.stock[k])}</b></div>`).join('');
      const sp = G.craftSpeed();
      b.querySelector('#c-speed').textContent = sp ? `speed ×${sp}` : G.D.counts.fab ? 'workshops need power and Wi-Fi' : 'build a Maker Workshop first';
      b.querySelector('#c-queue').innerHTML = G.S.queue.length ? G.S.queue.map((q) => { const r = RECIPES.find((x) => x.id === q.recipe); return `<div class="qitem" title="${RESOURCES[r.out].name}">${RESOURCES[r.out].icon}<i style="width:${(q.t / r.time) * 100}%"></i></div>`; }).join('') : '<span class="muted" style="font-size:12px;align-self:center">Queue is empty. Pick a recipe below.</span>';
      b.querySelectorAll('.recipe').forEach((el) => {
        el.querySelectorAll('[data-k]').forEach((s) => s.classList.toggle('lack', G.S.stock[s.dataset.k] < +s.dataset.n));
        el.querySelector('button').disabled = !G.canCraft(RECIPES.find((r) => r.id === el.dataset.r)) || !sp;
      });
    },
  },

  market: {
    html: () => `<div class="hint">Prices move every hour. Sell when they're high, or let an automation rule do it for you.</div>
      <div id="m-rows">${Object.keys(RESOURCES).map((k) => `<div class="mrow" data-k="${k}"><span class="nm">${RESOURCES[k].icon} ${RESOURCES[k].name} <small class="muted st"></small></span><canvas aria-hidden="true"></canvas><span class="pr"></span>
      <span class="row" style="gap:3px;flex-wrap:nowrap"><button class="btn small sell" aria-label="Sell all ${RESOURCES[k].name}">Sell</button><button class="btn small buy" aria-label="Buy 5 ${RESOURCES[k].name}">Buy 5</button></span></div>`).join('')}</div>`,
    bind(b) {
      b.querySelectorAll('.mrow').forEach((el) => {
        const k = el.dataset.k;
        el.querySelector('.sell').onclick = () => { const p = G.sell(k, G.S.stock[k]); toast(p ? `Sold for ${fmt(p)}` : 'Nothing to sell', p ? 'ok' : 'err'); renderPanel(); };
        el.querySelector('.buy').onclick = () => { if (!G.buy(k, 5)) toast('Not enough money', 'err'); renderPanel(); };
      });
    },
    update(b) {
      b.querySelectorAll('.mrow').forEach((el) => {
        const k = el.dataset.k, h = G.S.priceHist[k];
        const up = h.length > 1 && h[h.length - 1] >= h[h.length - 2];
        el.querySelector('.st').textContent = `×${Math.floor(G.S.stock[k])}`;
        const pr = el.querySelector('.pr'); pr.textContent = `${fmt(G.sellPrice(k))} ${up ? '▲' : '▼'}`; pr.className = 'pr ' + (up ? 'up' : 'down');
        spark(el.querySelector('canvas'), h.slice(-36), up ? '#3fa77c' : '#e05a5a', false);
        el.querySelector('.sell').disabled = G.S.stock[k] < 1;
      });
    },
  },

  integrations: {
    html: () => `<canvas class="imap" id="i-map"></canvas>
      <div class="kv" style="margin-top:8px"><span>Free compute</span><b id="i-free"></b></div>
      <div class="hint">Integrations connect your city's IT systems. Each one costs compute (build a Harbour Data Hub for more) plus some crafted parts.</div>
      <div id="i-list"></div>`,
    bind(b) {
      b.querySelector('#i-list').innerHTML = INTEGRATIONS.map((g) => `<div class="integ" data-g="${g.id}">
        <div class="top"><span class="nm">${g.name}</span><button class="btn small"></button></div>
        <div class="path">${SYSTEMS[g.a].icon} ${SYSTEMS[g.a].name} ⇄ ${SYSTEMS[g.b].icon} ${SYSTEMS[g.b].name}</div>
        <p>${g.desc}</p>
        <div class="reqs"></div></div>`).join('');
      b.querySelectorAll('.integ').forEach((el) => el.querySelector('button').onclick = () => {
        const id = el.dataset.g;
        if (G.S.integrations[id]) G.removeIntegration(id);
        else { const e = G.deployIntegration(id); if (e) toast(e, 'err'); else toast('🔗 Integration deployed!', 'ok'); }
        renderPanel();
      });
    },
    update(b) {
      b.querySelector('#i-free').textContent = `${G.D.compute - G.D.computeUse} / ${G.D.compute}`;
      b.querySelectorAll('.integ').forEach((el) => {
        const g = INTEGRATIONS.find((x) => x.id === el.dataset.g), live = !!G.S.integrations[g.id];
        el.classList.toggle('live', live);
        const btn = el.querySelector('button'); btn.textContent = live ? 'Disconnect' : 'Deploy'; btn.className = 'btn small ' + (live ? '' : 'primary');
        el.querySelector('.reqs').innerHTML = live ? '<span class="tag">✅ live</span>' :
          `<span class="tag ${G.D.compute - G.D.computeUse < g.compute ? 'lack' : ''}">🧠 ${g.compute}</span><span class="tag ${G.S.cash < g.cost ? 'lack' : ''}">${fmt(g.cost)}</span>` +
          Object.entries(g.needs).map(([k, n]) => `<span class="tag ${G.S.stock[k] < n ? 'lack' : ''}">${n}× ${RESOURCES[k].icon}</span>`).join('');
      });
    },
    anim(b, t) { drawIntegrationMap(b.querySelector('#i-map'), t); },
  },

  disasters: {
    html: () => `
      <div class="hint">Buy a disaster, then click the map to drop it there. Buildings you built can be wiped out.
        Landmarks and the old city get <b>damaged</b> 🏚️ and stop working until repaired.
        Streets fill with <b>rubble</b>: click a rubble tile to clear it (${fmt(CLEAN_COST)}).</div>
      <div id="dz-list">${Object.entries(DISASTERS).filter(([, d]) => !d.hidden).map(([k, d]) => `<div class="recipe">
        <div><div class="out">${d.icon} ${d.name}</div><div class="ins"><span>${d.desc}</span></div></div>
        <button class="btn small warn" data-dz="${k}">Buy ${fmt(d.cost)}</button></div>`).join('')}</div>
      <h3>Clean-up</h3>
      <div class="kv"><span>Damaged buildings</span><b id="dz-dmg"></b></div>
      <div class="kv"><span>Streets with rubble</span><b id="dz-rub"></b></div>
      <div class="row"><button class="btn small" id="dz-repair">🔧 Repair all</button><button class="btn small" id="dz-clean">🧹 Clean all streets</button></div>`,
    bind(b) {
      b.querySelectorAll('[data-dz]').forEach((btn) => btn.onclick = () => {
        const k = btn.dataset.dz, d = DISASTERS[k];
        if (ui.tool === 'disaster:' + k) return setTool(null);
        if (G.S.cash < d.cost) return toast(`Need ${fmt(d.cost)} for a ${d.name}`, 'err');
        setTool('disaster:' + k); toast(`${d.icon} Click the map to unleash the ${d.name}. Esc cancels.`);
      });
      b.querySelector('#dz-repair').onclick = () => { const n = G.repairAll(); toast(n ? `🔧 Repaired ${n} building${n > 1 ? 's' : ''}` : 'Nothing repaired (no damage, or not enough money)', n ? 'ok' : 'err'); renderPanel(); };
      b.querySelector('#dz-clean').onclick = () => { const n = G.cleanAll(); if (!n) toast('No rubble to clean, or not enough money', 'err'); renderPanel(); };
    },
    update(b) {
      const dmg = G.S.tiles.filter((t) => t?.damaged);
      const cost = dmg.reduce((a, t) => a + G.repairCost(t), 0);
      b.querySelector('#dz-dmg').textContent = dmg.length ? `${dmg.length} (${fmt(cost)})` : '0';
      b.querySelector('#dz-rub').textContent = G.S.rubble.length ? `${G.S.rubble.length} (${fmt(G.S.rubble.length * CLEAN_COST)})` : '0';
      b.querySelectorAll('[data-dz]').forEach((btn) => btn.classList.toggle('on', ui.tool === 'disaster:' + btn.dataset.dz));
    },
  },

  automate: {
    html: () => `
      <div class="kv"><span>Free compute</span><b id="a-free"></b></div>
      <div class="hint">IF this, THEN that. Rules check every hour and use ${RULE_COMPUTE} compute each while they're on.</div>
      <h3>Quick templates</h3>
      <div class="templates">
        <button class="btn small" data-t="sellChip">Sell chips &gt; €55</button>
        <button class="btn small" data-t="dailyChip">Craft a chip daily</button>
        <button class="btn small" data-t="patch">Auto-patch</button>
        <button class="btn small" data-t="broke">Tax up when broke</button>
      </div>
      <h3>New rule</h3>
      <div class="builder">
        <label>WHEN</label>
        <div class="line"><select id="r-trig" aria-label="When (trigger)">${Object.entries(TRIGGERS).map(([k, t]) => `<option value="${k}">${t.label.replace('{res}', '…')}</option>`).join('')}</select>
          <select id="r-tres" aria-label="Trigger resource">${resOptions('chip')}</select><input id="r-targ" type="number" value="50" style="width:70px" aria-label="Trigger amount"></div>
        <label>THEN</label>
        <div class="line"><select id="r-act" aria-label="Then (action)">${Object.entries(ACTIONS).map(([k, a]) => `<option value="${k}">${a.label.replace('{res}', '…').replace('{recipe}', '…')}</option>`).join('')}</select>
          <select id="r-ares" aria-label="Action resource">${resOptions('chip')}</select>
          <select id="r-arec" aria-label="Recipe to craft">${RECIPES.map((r) => `<option value="${r.out}">${RESOURCES[r.out].icon} ${RESOURCES[r.out].name}</option>`).join('')}</select></div>
        <button class="btn primary" id="r-add">➕ Add rule</button>
      </div>
      <h3>Active rules</h3><div id="a-rules"></div>`,
    bind(b) {
      const sync = () => {
        const T = TRIGGERS[b.querySelector('#r-trig').value], A = ACTIONS[b.querySelector('#r-act').value];
        b.querySelector('#r-tres').hidden = !T.res; b.querySelector('#r-targ').hidden = !T.arg;
        b.querySelector('#r-ares').hidden = !A.res; b.querySelector('#r-arec').hidden = !A.recipe;
      };
      b.querySelector('#r-trig').onchange = sync; b.querySelector('#r-act').onchange = sync; sync();
      b.querySelector('#r-add').onclick = () => {
        const e = G.addRule({ trig: b.querySelector('#r-trig').value, tres: b.querySelector('#r-tres').value, targ: b.querySelector('#r-targ').value, act: b.querySelector('#r-act').value, ares: b.querySelector('#r-ares').value, arec: b.querySelector('#r-arec').value });
        if (e) toast(e, 'err'); else toast('⚙️ Rule added', 'ok');
      };
      const T = {
        sellChip: { trig: 'priceAbove', tres: 'chip', targ: 55, act: 'sellAll', ares: 'chip' },
        dailyChip: { trig: 'everyDay', act: 'craft', arec: 'chip' },
        patch: { trig: 'incident', act: 'patch' },
        broke: { trig: 'cashBelow', targ: 0, act: 'taxUp' },
      };
      b.querySelectorAll('[data-t]').forEach((x) => x.onclick = () => { const e = G.addRule({ ...T[x.dataset.t] }); if (e) toast(e, 'err'); else toast('⚙️ Rule added', 'ok'); });
    },
    update(b) {
      b.querySelector('#a-free').textContent = `${G.D.compute - G.D.computeUse} / ${G.D.compute}`;
      const box = b.querySelector('#a-rules');
      const key = G.S.rules.map((r) => r.id + ':' + r.on).join(',');
      if (box.dataset.key === key) return;
      box.dataset.key = key;
      box.innerHTML = G.S.rules.length ? G.S.rules.map((r) => { const t = G.ruleText(r); return `<div class="rule ${r.on ? '' : 'off'}" data-id="${r.id}">
        <div class="ctl"><button class="btn small tg">${r.on ? 'On' : 'Off'}</button><button class="btn small del" aria-label="Delete this rule" title="Delete this rule">✕</button></div>
        <div><span class="w">WHEN</span> ${t.when}</div><div><span class="t">THEN</span> ${t.then}</div></div>`; }).join('') : '<span class="muted" style="font-size:13px">No rules yet. Try a template!</span>';
      box.querySelectorAll('.rule').forEach((el) => {
        const id = +el.dataset.id;
        el.querySelector('.tg').onclick = () => { const e = G.toggleRule(id); if (e) toast(e, 'err'); };
        el.querySelector('.del').onclick = () => G.deleteRule(id);
      });
    },
  },
};

export function flashRule(id) {
  const el = document.querySelector(`.rule[data-id="${id}"]`);
  if (el) { el.classList.remove('fired'); void el.offsetWidth; el.classList.add('fired'); }
}
export function animPanel(t) { PANELS[tab].anim?.($('#tab-body'), t); }

// ---------- integration map ----------
function drawIntegrationMap(cv, t) {
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  // dotted grid paper
  c.fillStyle = '#e8dcc0';
  for (let x = 8; x < w; x += 14) for (let y = 8; y < h; y += 14) c.fillRect(x, y, 1.5, 1.5);
  const P = (k) => [SYSTEMS[k].x / 100 * (w - 60) + 30, SYSTEMS[k].y / 100 * (h - 50) + 25];
  for (const g of INTEGRATIONS) {
    const a = P(g.a), b = P(g.b), live = G.S.integrations[g.id];
    c.strokeStyle = live ? '#3fa77c' : '#d8c9a3'; c.lineWidth = live ? 3 : 1.5; c.setLineDash(live ? [] : [4, 4]);
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.setLineDash([]);
    if (live) for (let k = 0; k < 2; k++) {
      const u = ((t * 0.4 + k * 0.5 + g.id.length * 0.13) % 1);
      const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
      c.fillStyle = k ? '#f2c94c' : '#e87aa8'; c.strokeStyle = '#3b2f2a'; c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); c.stroke();
    }
  }
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const k in SYSTEMS) {
    const [x, y] = P(k), s = SYSTEMS[k];
    const active = INTEGRATIONS.some((g) => G.S.integrations[g.id] && (g.a === k || g.b === k));
    c.fillStyle = '#3b2f2a'; roundRect(c, x - 26, y - 17, 54, 38, 9); c.fill();
    c.fillStyle = active ? s.color : '#fff'; roundRect(c, x - 28, y - 20, 54, 38, 9); c.fill();
    c.strokeStyle = '#3b2f2a'; c.lineWidth = 2; c.stroke();
    c.font = '16px sans-serif'; c.fillText(s.icon, x - 1, y - 7);
    c.font = '600 10px Fredoka, sans-serif'; c.fillStyle = '#3b2f2a'; c.fillText(s.name, x - 1, y + 9);
  }
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
