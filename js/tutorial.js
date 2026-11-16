// Guided tutorial: small goal card that advances when the player does the thing.
import * as G from './game.js';

const KEY = 'uptime-city-tutorial';
const c = (t) => G.D.counts[t] || 0;
const STEPS = [
  { title: 'Welcome, Mayor! 👋', text: 'You run a city where everything is connected: homes pay tax, factories make parts, and IT systems automate the boring stuff. Let\'s build your first neighbourhood.', manual: 'Let\'s go' },
  { title: '1 · Wi-Fi first 📶', text: 'Buildings without signal work at half speed. Pick <b>5G Lamppost</b> in the build list on the left, then click a green lot.', hl: '[data-b="lamp"]', done: () => c('lamp') >= 1 },
  { title: '2 · Homes 🏠', text: 'Build <b>2 Gable Houses</b> inside the teal Wi-Fi circle. Residents pay tax every hour.', hl: '[data-b="gable"]', done: () => c('gable') >= 2 },
  { title: '3 · Power ⚡', text: 'Every building uses power. Watch the ⚡ number at the top. Build a <b>Solar Roof</b> to keep it positive.', hl: '[data-b="solar"]', done: () => c('solar') >= 1 },
  { title: '4 · Raw materials ⛏️', text: 'Build a <b>Silicon Quarry</b> and a <b>Copper Works</b>. They fill your inventory every hour.', hl: '[data-b="quarry"]', done: () => c('quarry') >= 1 && c('copper') >= 1 },
  { title: '5 · Money 💶', text: 'The <b>Finance</b> tab shows income vs. costs. Tip: use ⏩ at the top to speed up time. Grow to <b>60 residents</b> with more homes to unlock new buildings.', hl: '[data-tab="finance"]', done: () => G.S.peakPop >= 60 },
  { title: '6 · Workshop 🛠️', text: 'Build a <b>Maker Workshop</b>. It turns raw materials into parts.', hl: '[data-b="fab"]', done: () => c('fab') >= 1 },
  { title: '7 · Craft 🔧', text: 'Open the <b>Craft</b> tab and craft a <b>Chip</b> (2 silicon + 1 copper). Parts unlock big buildings and integrations, or you can sell them.', hl: '[data-tab="craft"]', done: () => G.S.stock.chip >= 1 || G.S.queue.some((q) => q.recipe === 'chip') },
  { title: '8 · Automate ⚙️', text: 'Open <b>Automate</b> and add a rule, e.g. the "Auto-patch" template. Rules run every hour by themselves.', hl: '[data-tab="automate"]', done: () => G.S.rules.length >= 1 },
  { title: '9 · Integrations 🔗', text: 'In <b>Integrations</b> you connect city systems (Grid, Bank, ERP, SIEM…) for permanent bonuses. They need compute: build a <b>Harbour Data Hub</b> later for more.', hl: '[data-tab="integrations"]', manual: 'Got it' },
  { title: 'Watch out for incidents 🚨', text: 'A red <b>!</b> above a building means a hack or outage. Click the building to patch it, or let an automation rule do it. Have fun building your city!', manual: 'Finish' },
];

let step = 0, el = null;
const get = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const put = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

export function startTutorial() { step = 0; put(0); render(); }
export function initTutorial() {
  const v = get();
  if (v === 'done') return;
  step = typeof v === 'number' ? v : 0;
  render();
}
function clearHl() { document.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow')); }
function finish() { put('done'); clearHl(); el?.remove(); el = null; }
function render() {
  clearHl();
  if (step >= STEPS.length) return finish();
  const s = STEPS[step];
  if (!el) { el = document.createElement('div'); el.className = 'tutorial'; document.body.appendChild(el); }
  el.innerHTML = `<div class="tut-band">Tutorial · ${step + 1}/${STEPS.length}</div>
    <b>${s.title}</b><p>${s.text}</p>
    <div class="row">${s.manual ? `<button class="btn primary small" id="tut-next">${s.manual}</button>` : '<span class="tut-wait">⏳ waiting for you…</span>'}
    <button class="btn small" id="tut-skip">Skip tutorial</button></div>`;
  el.querySelector('#tut-skip').onclick = finish;
  const n = el.querySelector('#tut-next'); if (n) n.onclick = () => advance();
  highlight();
}
function highlight() {
  const s = STEPS[step];
  if (!s?.hl) return;
  const t = document.querySelector(s.hl);
  if (t && !t.classList.contains('tut-glow')) { t.classList.add('tut-glow'); if (t.closest('.build-list')) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
}
function advance() { step++; put(step); render(); }
// called a few times per second from the game loop
export function tickTutorial() {
  if (!el) return;
  const s = STEPS[step];
  if (s?.done && s.done()) { el.classList.remove('tut-pop'); void el.offsetWidth; el.classList.add('tut-pop'); advance(); return; }
  highlight(); // build list re-renders, so re-apply the glow
}
