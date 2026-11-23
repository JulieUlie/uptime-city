import { test as base, expect, Page, Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The real weather is faked: 7.4 °C and rain (WMO code 61) in every city. */
async function fakeWeather(page: Page, { down = false } = {}) {
  await page.route('https://api.open-meteo.com/**', (r) =>
    down ? r.abort('internetdisconnected') : r.fulfill({ json: { current: { temperature_2m: 7.4, weather_code: 61, wind_speed_10m: 18, cloud_cover: 90 } } }));
}

const menu = (page: Page) => page.locator('#menu');
const hud = (page: Page, id: string) => page.locator(`#s-${id}`);
/** The game is ready once its build list is drawn (the last step of start-up). */
async function ready(page: Page) {
  await expect(page.locator('#build-list .bcard').first()).toBeVisible();
  await expect(page.locator('#cities .city')).toHaveCount(4);
}
const closeMenu = (page: Page) => page.locator('#menu').evaluate((m: HTMLElement) => { m.hidden = true; });

const test = base.extend<{ city: Page }>({
  // the game, loaded with the weather faked and the first-visit menu out of the way
  city: async ({ page }, use) => {
    await fakeWeather(page);
    await page.goto('/');
    await ready(page);
    await closeMenu(page);
    await use(page);
  },
});

test.describe('First visit', () => {
  test("opens the Mayor's office with the four cities to pick from @mobile", async ({ page }) => {
    await fakeWeather(page);
    await page.goto('/');
    await ready(page);

    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByRole('heading', { name: 'Uptime City' })).toBeVisible();
    await expect(page.locator('#cities .city')).toHaveCount(4);
    await expect(page.locator('#cities')).toContainText('Antwerpen');
    await expect(page.locator('#cities')).toContainText('Oasis Bay');
  });

  test('picking a city starts it there', async ({ page }) => {
    await fakeWeather(page);
    await page.goto('/');
    await ready(page);

    await page.locator('#cities .city', { hasText: 'Gent' }).click();

    await expect(menu(page)).toBeHidden();
    await expect(hud(page, 'city')).toHaveText('Gent');
  });

  // Regression test: until 17 Nov 2026 the starting houses counted as "already built", so even a
  // first-time visitor was warned "Your current city will be lost".
  test('a brand-new visitor is not warned about losing a city', async ({ page }) => {
    await fakeWeather(page);
    await page.goto('/');
    await ready(page);
    let warned = false;
    page.on('dialog', async (d) => { warned = true; await d.accept(); });

    await page.locator('#cities .city', { hasText: 'Gent' }).click();
    await expect(menu(page)).toBeHidden();

    expect(warned).toBe(false);
  });
});

test.describe('HUD', () => {
  test('shows money, residents, power and the clock @mobile', async ({ city: page }) => {
    await expect(hud(page, 'cash')).toHaveText(/^€[\d,.]+$/);
    await expect(hud(page, 'time')).toHaveText(/^Day \d+ · \d\d:00$/);
    await expect(hud(page, 'power')).toHaveText(/^[+-]?\d+$/);
    await expect(hud(page, 'compute')).toHaveText(/^\d+\/\d+$/);
  });

  test('shows the live weather from Open-Meteo for the city on the board', async ({ city: page }) => {
    const badge = page.locator('#weather');

    await expect(badge).toContainText('Live · Antwerpen');
    await expect(badge).toContainText('Rain · 7°C');
    await expect(badge).toHaveAttribute('title', /Real weather in Antwerpen right now \(wind 18 km\/h\)/);
  });

  test('says "Weather offline" when the weather service cannot be reached', async ({ page }) => {
    await fakeWeather(page, { down: true });
    await page.goto('/');

    await expect(page.locator('#weather')).toContainText('Weather offline');
    await expect(page.locator('#weather')).toHaveAttribute('title', 'Could not reach the weather service.');
  });

  test('time moves on while playing, and Space pauses it', async ({ city: page }) => {
    await page.locator('[data-speed="8"]').click(); // super fast
    const t0 = await hud(page, 'time').textContent();
    await expect(hud(page, 'time')).not.toHaveText(t0!, { timeout: 5000 });

    await page.keyboard.press('Space');
    await expect(page.locator('[data-speed="0"]')).toHaveClass(/\bon\b/);
    const paused = await hud(page, 'time').textContent();
    await page.waitForTimeout(1200);
    await expect(hud(page, 'time')).toHaveText(paused!);
  });
});

test.describe('Building and panels', () => {
  test('the build list shows prices, and locked buildings say what unlocks them', async ({ city: page }) => {
    const gable = page.locator('#build-list [data-b="gable"]');
    await expect(gable).toContainText('Gable House');
    await expect(gable).toContainText('120');

    await expect(page.locator('#build-list .bcard.locked').first()).toContainText(/🔒 \d+ residents/);
  });

  test('picking a building selects it as the tool, Escape cancels', async ({ city: page }) => {
    await page.locator('#build-list [data-b="gable"]').click();
    await expect(page.locator('#build-list [data-b="gable"]')).toHaveClass(/\bon\b/);
    await expect(page.locator('#city')).toHaveClass(/placing/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#city')).not.toHaveClass(/placing/);
  });

  test('the side panel switches between its six tabs', async ({ city: page }) => {
    for (const tab of ['finance', 'craft', 'market', 'integrations', 'automate', 'disasters']) {
      await page.locator(`#tabs [data-tab="${tab}"]`).click();
      await expect(page.locator(`#tabs [data-tab="${tab}"]`)).toHaveClass(/\bon\b/);
      await expect(page.locator('#tab-body')).not.toBeEmpty();
    }
  });

  test('B toggles the demolish tool', async ({ city: page }) => {
    await page.keyboard.press('b');
    await expect(page.locator('#tool-bulldoze')).toHaveClass(/\bon\b/);
    await page.keyboard.press('b');
    await expect(page.locator('#tool-bulldoze')).not.toHaveClass(/\bon\b/);
  });
});

test.describe('Saving', () => {
  test('"Save" in the menu confirms, and the city comes back after a reload', async ({ city: page }) => {
    await page.getByRole('button', { name: 'Menu' }).click();
    page.once('dialog', (d) => d.accept());
    await page.locator('#cities .city', { hasText: 'Brussel' }).click();
    await expect(hud(page, 'city')).toHaveText('Brussel');

    await page.locator('#btn-menu').click();
    await page.locator('#m-save').click();
    await expect(page.locator('#toasts')).toContainText('Saved!');
    await page.reload();

    await expect(hud(page, 'city')).toHaveText('Brussel');
  });
});

test.describe('Accessibility', () => {
  // Regression tests: until 17 Nov 2026 the secondary text (#8a7b6c) and the green Continue button
  // were under the 4.5:1 contrast of WCAG AA.
  test('the menu has no detectable WCAG violations', async ({ page }) => {
    await fakeWeather(page);
    await page.goto('/');
    await ready(page);
    await expect(menu(page)).toBeVisible();

    const results = await new AxeBuilder({ page }).include('#menu').withTags(['wcag2a', 'wcag2aa']).analyze();

    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}× ${v.help}`)).toEqual([]);
  });

  test('the HUD has no detectable WCAG violations', async ({ city: page }) => {
    const results = await new AxeBuilder({ page }).include('.hud').withTags(['wcag2a', 'wcag2aa']).analyze();

    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}× ${v.help}`)).toEqual([]);
  });
});

// ---------- v11 (23 Nov 2026): regression tests for the refinements ----------

test.describe('The menu as a dialog', () => {
  test('opens as a named dialog with focus inside, and Escape gives focus back to the menu button', async ({ city: page }) => {
    const menuButton = page.getByRole('button', { name: 'Menu' });
    await menuButton.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Uptime City' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(menuButton).toBeFocused();
  });

  // Regression test: until v11 the menu was centred with place-items: center and could not scroll, so on
  // a short (landscape) screen its title and its buttons were cut off with no way to reach them.
  test('on a short screen the whole menu can be scrolled into reach', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 420 });
    await fakeWeather(page);
    await page.goto('/');
    await ready(page);

    const top = await page.locator('#menu-title').evaluate((h) => h.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(0);
    await page.locator('#m-close').scrollIntoViewIfNeeded();
    await page.locator('#m-close').click();

    await expect(menu(page)).toBeHidden();
  });

  test('game shortcuts do nothing while the menu is open', async ({ city: page }) => {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.keyboard.press('b');
    await expect(page.locator('#tool-bulldoze')).not.toHaveClass(/\bon\b/);
  });
});

test.describe('Keyboard and screen readers', () => {
  test('the icon-only buttons have names, and the speed buttons say which one is pressed', async ({ city: page }) => {
    for (const name of ['Menu', 'Pause', 'Normal speed', 'Fast', 'Super fast', 'Photo mode', 'Fit the board to the screen']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(1);
    }
    await expect(page.getByRole('button', { name: 'Normal speed' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Fast', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Fast', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Normal speed' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('the city log toggle says whether it shows or hides the log', async ({ city: page }) => {
    const toggle = page.locator('#console-toggle');
    await expect(toggle).toHaveAccessibleName('Show the city log');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();

    await expect(toggle).toHaveAccessibleName('Hide the city log');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  // Regression test: until v11 Ctrl+P (print) also switched photo mode on, and Ctrl+F (find) refitted the board.
  test('browser shortcuts with Ctrl do not trigger game shortcuts', async ({ city: page }) => {
    const photoButton = page.getByRole('button', { name: 'Photo mode' });
    await expect(photoButton).toHaveAttribute('aria-pressed', 'true'); // photo mode is on by default

    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true })));
    await expect(photoButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('body')).toHaveClass(/\bphoto\b/);

    await page.keyboard.press('p');
    await expect(photoButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('body')).not.toHaveClass(/\bphoto\b/);
  });

  // Regression test: until v11 the market prices, ledger amounts and the red buttons (buying a disaster,
  // Demolish while on) used the plain red and green of the board: 3:1 to 3.6:1 against their background.
  test('the six side panels and the build list have no detectable WCAG violations', async ({ city: page }) => {
    const build = await new AxeBuilder({ page }).include('#build').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(build.violations.map((v) => `build ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

    for (const tab of ['market', 'automate', 'craft', 'integrations', 'disasters', 'finance']) {
      await page.locator(`#tabs [data-tab="${tab}"]`).click();
      await expect(page.locator('#tab-body')).toHaveAttribute('data-tab', tab);
      await expect(page.locator('#panel')).not.toHaveClass(/\bclosed\b/);
      const results = await new AxeBuilder({ page }).include('#panel').withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations.map((v) => `${tab} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  });

  test('with reduced motion the live weather dot does not keep blinking', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeWeather(page);
    await page.goto('/');
    await ready(page);

    await expect(page.locator('#weather .live-dot')).toHaveCSS('animation-iteration-count', '1');
  });
});

test.describe('Market', () => {
  // Regression test: until v11 the resource names were squeezed next to the chart and cut to "Sili…", "Cop…".
  test('every resource name is shown in full @mobile', async ({ city: page }) => {
    await page.locator('#tabs [data-tab="market"]').click();
    const names = page.locator('.mrow .nm');
    await expect(names).toHaveCount(9);

    const cut = await names.evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
    expect(cut).toEqual([]);
  });
});

test.describe('Fixes', () => {
  // Regression test: until v11 "Save" in the menu wrote the save twice (once for the text, once for the colour).
  test('"Save" writes the city once', async ({ city: page }) => {
    await page.getByRole('button', { name: 'Pause' }).click(); // no autosave in between
    await page.evaluate(() => {
      const w = window as any; w.__saves = 0;
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) { if (k === 'uptime-city-save-v1') w.__saves++; return orig.call(this, k, v); };
    });
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.locator('#m-save').click();

    await expect(page.locator('#toasts')).toContainText('Saved!');
    expect(await page.evaluate(() => (window as any).__saves)).toBe(1);
  });

  // Regression test: until v11 a slow weather answer for the old city, arriving after the player had
  // switched cities, painted the old city's weather (and kept refreshing the old city every 10 minutes).
  test('a late weather answer for the previous city does not overwrite the new one', async ({ page }) => {
    // Antwerpen's answer is held back (the route is only answered later); Gent answers snow at once
    let antwerpen: Route | undefined;
    await page.route('https://api.open-meteo.com/**', (r) => {
      if (new URL(r.request().url()).searchParams.get('latitude') === '51.2194') { antwerpen = r; return; }
      return r.fulfill({ json: { current: { temperature_2m: -2, weather_code: 71, wind_speed_10m: 5, cloud_cover: 100 } } });
    });
    await page.goto('/');
    await ready(page);
    await expect.poll(() => !!antwerpen).toBe(true);

    await page.locator('#cities .city', { hasText: 'Gent' }).click();
    await expect(page.locator('#weather')).toContainText('Snow · -2°C');
    await antwerpen!.fulfill({ json: { current: { temperature_2m: 9, weather_code: 61, wind_speed_10m: 10, cloud_cover: 90 } } });
    await page.waitForTimeout(500);

    await expect(page.locator('#weather')).toContainText('Live · Gent');
    await expect(page.locator('#weather')).toContainText('Snow · -2°C');
  });

  // Regression test: until v11 the badge said "Weather offline" while the first answer was still on its way.
  test('while the weather is on its way the badge says Loading, not offline', async ({ page }) => {
    let pending: Route | undefined;
    await page.route('https://api.open-meteo.com/**', (r) => { pending = r; });
    await page.goto('/');
    await ready(page);

    await expect(page.locator('#weather')).toContainText('Loading…');
    await expect(page.locator('#weather')).not.toContainText('offline');

    await expect.poll(() => !!pending).toBe(true);
    await pending!.fulfill({ json: { current: { temperature_2m: 7.4, weather_code: 61, wind_speed_10m: 18, cloud_cover: 90 } } });
    await expect(page.locator('#weather')).toContainText('Rain · 7°C');
  });
});
