import { test as base, expect, Page } from '@playwright/test';
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

    // the game asks to confirm (see the known issue below); answer yes like a player would
    page.once('dialog', (d) => d.accept());
    await page.locator('#cities .city', { hasText: 'Gent' }).click();

    await expect(menu(page)).toBeHidden();
    await expect(hud(page, 'city')).toHaveText('Gent');
  });

  // Known issue (17 Nov 2026): the "has the player started?" check counts the houses that every new
  // city starts with, so even a first-time visitor is warned "Your current city will be lost".
  test('a brand-new visitor is not warned about losing a city', async ({ page }) => {
    test.fail(true, 'the starting houses count as "already built"');
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
    // the menu button is named "☰" for screen readers (title="Menu" is only a tooltip), so use its id
    await page.locator('#btn-menu').click();
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
  // Known finding (17 Nov 2026): some light text in the menu and the HUD is under the 4.5:1 contrast
  // of WCAG AA. Kept visible as expected failures; remove test.fail once the colours are fixed.
  test('the menu has no detectable WCAG violations', async ({ page }) => {
    test.fail(true, 'text contrast under 4.5:1');
    await fakeWeather(page);
    await page.goto('/');
    await ready(page);
    await expect(menu(page)).toBeVisible();

    const results = await new AxeBuilder({ page }).include('#menu').withTags(['wcag2a', 'wcag2aa']).analyze();

    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}× ${v.help}`)).toEqual([]);
  });

  test('the HUD has no detectable WCAG violations', async ({ city: page }) => {
    test.fail(true, 'text contrast under 4.5:1');
    const results = await new AxeBuilder({ page }).include('.hud').withTags(['wcag2a', 'wcag2aa']).analyze();

    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}× ${v.help}`)).toEqual([]);
  });
});
