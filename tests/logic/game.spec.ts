import { test as base, expect } from '@playwright/test';

/**
 * The simulation (js/game.js) has no DOM or canvas code, so it is loaded straight into an empty page
 * and driven like a library: place, demolish, trade, borrow, tick the clock, save and load.
 * Each test gets its own page, so its own module instance and its own localStorage.
 */
type Run = <T = any>(body: string) => Promise<T>;

const test = base.extend<{ game: Run }>({
  game: async ({ page }, use) => {
    await page.route('**/__blank.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }));
    await page.goto('/__blank.html');
    await page.evaluate(async () => {
      const G = await import('/js/game.js');
      const maps = await import('/js/maps.js');
      const cfg = await import('/js/config.js');
      const N = G.S_GRID;
      // helpers on window so each test body can stay short
      Object.assign(window, {
        G, maps, cfg, N,
        // first empty lot from the top left, optionally skipping some
        emptyLot: (skip = 0) => { for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; if (G.isLot(x, y) && !G.S.tiles[i] && skip-- <= 0) return [x, y]; } return null; },
        roadTile: () => { for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; if (G.isRoad(x, y)) return [x, y]; } return null; },
        parkTile: () => { for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; if (G.isPark(x, y)) return [x, y]; } return null; },
      });
      G.newGame('antwerpen');
    });
    await use((body) => page.evaluate(`(async () => { ${body} })()`));
  },
});

test.describe('A new city', () => {
  test('starts in Antwerpen with cash, a few raw materials and a full board', async ({ game }) => {
    const s = await game(`return { map: G.S.map, cash: G.S.cash, stock: G.S.stock, tiles: G.S.tiles.length, N, day: G.S.day, hour: G.S.hour };`);

    expect(s.map).toBe('antwerpen');
    expect(s.cash).toBeGreaterThan(0);
    expect(s.stock).toMatchObject({ copper: 6, silicon: 6, polymer: 2 });
    expect(s.tiles).toBe(s.N * s.N);
    expect(s.day).toBe(1);
  });

  for (const city of ['antwerpen', 'brussel', 'gent', 'oasis']) {
    test(`${city}: the board has lots to build on and streets`, async ({ game }) => {
      const info = await game(`G.newGame('${city}'); let lots = 0, roads = 0; for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; if (G.isLot(x, y)) lots++; if (G.isRoad(x, y)) roads++; } return { lots, roads, map: G.S.map };`);
      expect(info.map).toBe(city);
      expect(info.lots).toBeGreaterThan(50);
      expect(info.roads).toBeGreaterThan(20);
    });
  }

  test('the same city always gets the same street plan', async ({ game }) => {
    const sameTwice = await game(`const plan = () => { const t = []; for (let i = 0; i < N * N; i++) t.push(G.isRoad(i % N, (i / N) | 0) ? 1 : 0); return t.join(''); }; G.newGame('gent'); const a = plan(); G.newGame('gent'); return a === plan();`);
    expect(sameTwice).toBe(true);
  });
});

test.describe('Building', () => {
  test('a Gable House on an empty lot costs €120', async ({ game }) => {
    const r = await game(`const [x, y] = emptyLot(); const before = G.S.cash; const err = G.place('gable', x, y); return { err, paid: before - G.S.cash, type: G.S.tiles[x + y * N]?.type };`);

    expect(r).toEqual({ err: null, paid: 120, type: 'gable' });
  });

  const refused: [string, string, string][] = [
    ['on a street', `const [x, y] = roadTile();`, 'Build on an empty lot, not on streets or water'],
    ['in a park', `const [x, y] = parkTile();`, 'Parks are protected. Build on an empty lot'],
    ['on a lot that is taken', `const [x, y] = emptyLot(); G.place('gable', x, y);`, 'There is already a building here'],
    ['without enough money', `const [x, y] = emptyLot(); G.S.cash = 10;`, 'Need €120'],
  ];
  for (const [title, setup, message] of refused) {
    test(`is refused ${title}`, async ({ game }) => {
      const r = await game(`${setup} const cash = G.S.cash; const err = G.place('gable', x, y); return { err, cashKept: G.S.cash === cash };`);
      expect(r).toEqual({ err: message, cashKept: true });
    });
  }

  test('a building that is not unlocked yet is refused', async ({ game }) => {
    const r = await game(`const locked = cfg.BUILD_ORDER.find((k) => !G.S.unlocked.includes(k)); const [x, y] = emptyLot(); return { locked, err: G.place(locked, x, y) };`);
    expect(r.locked).toBeTruthy();
    expect(r.err).toBe('Not unlocked yet');
  });

  test('demolishing your own building refunds 40%', async ({ game }) => {
    const r = await game(`const [x, y] = emptyLot(); G.place('gable', x, y); const before = G.S.cash; const err = G.bulldoze(x, y); return { err, refund: G.S.cash - before, empty: !G.S.tiles[x + y * N] };`);
    expect(r).toEqual({ err: null, refund: 48, empty: true });
  });

  test('landmarks cannot be demolished, and empty lots have nothing to demolish', async ({ game }) => {
    const r = await game(`
      const lm = G.buildingsList().find((b) => cfg.BUILDINGS[b.type].landmark);
      const [x, y] = emptyLot();
      return { landmark: G.bulldoze(lm.x, lm.y), empty: G.bulldoze(x, y) };`);
    expect(r.landmark).toMatch(/is a protected landmark$/);
    expect(r.empty).toBe('Nothing to demolish');
  });

  test('a house is powered once a solar roof feeds the grid by day', async ({ game }) => {
    const r = await game(`
      G.S.cash = 5000; G.S.hour = 12;
      const [sx, sy] = emptyLot(); G.place('solar', sx, sy);
      const [x, y] = emptyLot(); const err = G.place('gable', x, y);
      return { err, power: G.D.power, unpowered: G.D.unpowered.has(x + y * N) };`);
    expect(r.err).toBeNull();
    expect(r.power).toBeGreaterThanOrEqual(0);
    expect(r.unpowered).toBe(false);
  });
});

test.describe('Market', () => {
  test('selling raw materials earns the sell price and lowers it a little', async ({ game }) => {
    const r = await game(`const p = G.sellPrice('copper'); const cash = G.S.cash; const earned = G.sell('copper', 3); return { p, earned, gained: G.S.cash - cash, left: G.S.stock.copper, after: G.S.prices.copper, before: p };`);
    expect(r.earned).toBe(r.p * 3);
    expect(r.gained).toBe(r.earned);
    expect(r.left).toBe(3);
    expect(r.after).toBeLessThan(r.before);
  });

  test('you cannot sell more than you have', async ({ game }) => {
    const r = await game(`G.sell('polymer', 50); return G.S.stock.polymer;`);
    expect(r).toBe(0);
  });

  test('buying costs 25% more than the market price, and needs the money', async ({ game }) => {
    const r = await game(`
      const price = G.S.prices.silicon; const cash = G.S.cash;
      const ok = G.buy('silicon', 2);
      const paid = cash - G.S.cash;
      G.S.cash = 0; const broke = G.buy('silicon', 1);
      return { ok, paid, expected: Math.round(price * 1.25) * 2, broke, stock: G.S.stock.silicon };`);
    expect(r.ok).toBe(true);
    expect(r.paid).toBe(r.expected);
    expect(r.broke).toBe(false);
    expect(r.stock).toBe(8);
  });
});

test.describe('Loans', () => {
  test('a loan adds cash, repaying is capped by the loan and by your cash', async ({ game }) => {
    const r = await game(`
      const cash = G.S.cash;
      G.takeLoan(1000);
      const afterLoan = { loan: G.S.loan, cash: G.S.cash - cash };
      G.repayLoan(5000);
      const afterRepay = { loan: G.S.loan };
      return { afterLoan, afterRepay, nothing: G.repayLoan(10) };`);
    expect(r.afterLoan).toEqual({ loan: 1000, cash: 1000 });
    expect(r.afterRepay.loan).toBe(0);
    expect(r.nothing).toBe('Nothing to repay');
  });
});

test.describe('Time, crafting and disasters', () => {
  test('every hour ticks the clock, and a new day saves the game', async ({ game }) => {
    const r = await game(`
      G.S.hour = 22; localStorage.clear();
      G.tickHour(); const at23 = { day: G.S.day, hour: G.S.hour, saved: G.hasSave() };
      G.tickHour(); const at0 = { day: G.S.day, hour: G.S.hour, saved: G.hasSave() };
      return { at23, at0 };`);
    expect(r.at23).toEqual({ day: 1, hour: 23, saved: false });
    expect(r.at0).toEqual({ day: 2, hour: 0, saved: true });
  });

  test('crafting needs a Maker Workshop first', async ({ game }) => {
    const r = await game(`return G.queueCraft(cfg.RECIPES[0].id);`);
    expect(r).toBe('Build a Maker Workshop first');
  });

  test('a disaster costs its price and is refused when you cannot pay', async ({ game }) => {
    const r = await game(`
      G.S.cash = 1000; const [x, y] = emptyLot();
      const err = G.castDisaster('fire', x, y); const paid = 1000 - G.S.cash;
      G.S.cash = 50; const broke = G.castDisaster('quake', x, y);
      return { err, paid, broke, unknown: G.castDisaster('meteor', x, y) };`);
    expect(r).toEqual({ err: null, paid: 200, broke: 'Need €800', unknown: 'Unknown disaster' });
  });

  test('a flood has to start at the waterfront', async ({ game }) => {
    const r = await game(`
      G.S.cash = 5000;
      for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; let wet = false;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (G.isWater(x + dx, y + dy)) wet = true;
        if (!wet && G.isLot(x, y)) return G.castDisaster('flood', x, y); }
      return 'no dry tile';`);
    expect(r).toBe('A flood has to start at the waterfront');
  });
});

test.describe('Saving', () => {
  test('save and load bring back the same city', async ({ game }) => {
    const r = await game(`
      const [x, y] = emptyLot(); G.place('gable', x, y); G.S.cash = 4321;
      G.save();
      G.newGame('gent');
      const loaded = G.load();
      return { loaded, map: G.S.map, cash: G.S.cash, house: G.S.tiles[x + y * N]?.type };`);
    expect(r).toEqual({ loaded: true, map: 'antwerpen', cash: 4321, house: 'gable' });
  });

  test('a save from another version is ignored', async ({ game }) => {
    const r = await game(`localStorage.setItem('uptime-city-save-v1', JSON.stringify({ v: 2 })); return G.load();`);
    expect(r).toBe(false);
  });

  test('a damaged save is ignored instead of crashing', async ({ game }) => {
    const r = await game(`localStorage.setItem('uptime-city-save-v1', '{not json'); return G.load();`);
    expect(r).toBe(false);
  });

  test('an old save with a tax rate below the new minimum is raised to 21%', async ({ game }) => {
    const r = await game(`G.S.tax = 10; G.save(); return G.load() && G.S.tax;`);
    expect(r).toBe(21);
  });
});
