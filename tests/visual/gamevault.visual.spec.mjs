import {expect, test} from "@playwright/test";
import {plotFixture, vaultFixture, visualAssets} from "./fixtures.mjs";

async function prepare(page, {section, tab, theme = "dark"}) {
  await page.route("**/*", route => {
    const url = route.request().url();
    if (url.startsWith("http://127.0.0.1:4173") || url.startsWith("data:")) {
      return route.continue();
    }
    return route.abort();
  });
  await page.addInitScript(
    ({data, plots, selectedSection, selectedTab, selectedTheme}) => {
      localStorage.clear();
      const NativeDate = Date;
      const fixedTime = NativeDate.parse("2026-07-25T10:00:00+05:30");
      class VisualTestDate extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : [fixedTime]));
        }
        static now() {
          return fixedTime;
        }
      }
      globalThis.Date = VisualTestDate;
      localStorage.setItem("ps5-tracker-v1", JSON.stringify(data));
      localStorage.setItem("ps5-plots-v2", JSON.stringify(plots));
      localStorage.setItem("ps5-section", selectedSection);
      localStorage.setItem("ps5-theme", selectedTheme);
      localStorage.setItem("gamevault-game-view", "grid");
      localStorage.setItem("ps5-film-view", "grid");
      localStorage.setItem("ps5-series-view", "grid");
      localStorage.setItem("ps5-tmdb-key", "visual-test-key");
      if (selectedSection === "games") localStorage.setItem("ps5-tab", selectedTab);
      if (selectedSection === "films") localStorage.setItem("ps5-filmtab", selectedTab);
      if (selectedSection === "series") localStorage.setItem("ps5-seriestab", selectedTab);
    },
    {
      data: vaultFixture(),
      plots: plotFixture,
      selectedSection: section,
      selectedTab: tab,
      selectedTheme: theme
    }
  );

  const query = new URLSearchParams({section, tab}).toString();
  await page.goto(`/?${query}`, {waitUntil: "domcontentloaded"});
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `
  });
  await page.evaluate(backdrop => {
    const background = document.getElementById("bg");
    if (background) background.style.backgroundImage = `url("${backdrop}")`;
  }, visualAssets.backdrop);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await expect(page.locator("#content")).not.toBeEmpty();
  await page.waitForTimeout(150);
}

async function expectNoPageOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    page: document.documentElement.scrollWidth
  }));
  expect(dimensions.page, `page width ${dimensions.page}px exceeds ${dimensions.viewport}px viewport`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test.describe("desktop visual system", () => {
  test.use({viewport: {width: 1920, height: 1080}, screen: {width: 1920, height: 1080}});

  test("games rentals - dark @visual", async ({page}) => {
    await prepare(page, {section: "games", tab: "rentals"});
    await expect(page.locator(".game-tile")).toHaveCount(3);
    await expect(page.locator(".rail-group-label")).toHaveCount(3);
    await expect(page.locator('[data-section="home"]')).toHaveCount(0);
    await expect(page.locator(".stat").first()).toHaveCSS("flex-direction", "column");
    await expectNoPageOverflow(page);
    await expect(page).toHaveScreenshot("desktop-1080-games-rentals-dark.png", {fullPage: true});
  });

  test("movie detail - dark @visual", async ({page}) => {
    await prepare(page, {section: "films", tab: "watchlist"});
    await page.locator(".media-main").first().click();
    await expect(page.locator(".media-page")).toBeVisible();
    await expect(page.getByRole("button", {name: "Close details"})).toBeVisible();
    await expectNoPageOverflow(page);
    await expect(page).toHaveScreenshot("desktop-1080-movie-detail-dark.png", {fullPage: true});
  });

  test("series detail - dark @visual", async ({page}) => {
    await prepare(page, {section: "series", tab: "serieswatchlist"});
    await page.locator(".media-main").first().click();
    await expect(page.locator(".media-page")).toBeVisible();
    await expectNoPageOverflow(page);
    await expect(page).toHaveScreenshot("desktop-1080-series-detail-dark.png", {fullPage: true});
  });
});

test.describe("2K desktop visual system", () => {
  test.use({viewport: {width: 2560, height: 1440}, screen: {width: 2560, height: 1440}});

  test("movie watchlist - light @visual", async ({page}) => {
    await prepare(page, {section: "films", tab: "watchlist", theme: "light"});
    await expect(page.locator(".media-card")).toHaveCount(2);
    await expectNoPageOverflow(page);
    await expect(page).toHaveScreenshot("desktop-1440-movies-watchlist-light.png", {fullPage: true});
  });
});

test.describe("iPhone 17 Pro visual system", () => {
  test.use({
    viewport: {width: 402, height: 874},
    screen: {width: 402, height: 874},
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Version/19.0 Mobile/15E148 Safari/604.1"
  });

  test("rentals - dark @visual", async ({page}) => {
    await prepare(page, {section: "games", tab: "rentals"});
    await expect(page.locator(".game-tile")).toHaveCount(3);
    await expect(page.locator("#sectionSw button:visible")).toHaveCount(6);
    await expect(page.locator(".rail-group-label:visible")).toHaveCount(0);
    await expect(page.locator(".stat").first()).toHaveCSS("flex-direction", "column");
    await expectNoPageOverflow(page);
    await expect(page).toHaveScreenshot("iphone-17-pro-games-rentals-dark.png", {fullPage: true});
  });

  test("movie watchlist - light @visual", async ({page}) => {
    await prepare(page, {section: "films", tab: "watchlist", theme: "light"});
    await expect(page.locator(".media-card")).toHaveCount(2);
    await expectNoPageOverflow(page);
    await expect(page).toHaveScreenshot("iphone-17-pro-movies-watchlist-light.png", {fullPage: true});
  });

  test("movie detail - dark @visual", async ({page}) => {
    await prepare(page, {section: "films", tab: "watchlist"});
    await page.locator(".media-main").first().click();
    await expect(page.locator(".media-page")).toBeVisible();
    await expect(page.getByRole("button", {name: "Close details"})).toBeVisible();
    await expectNoPageOverflow(page);
    await expect(page).toHaveScreenshot("iphone-17-pro-movie-detail-dark.png", {fullPage: true});
  });
});
