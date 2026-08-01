import {expect, test} from "@playwright/test";

test("Settings credentials can be revealed and are hidden again on close", async ({page}) => {
  await page.setViewportSize({width: 402, height: 874});
  await page.goto("/");
  await page.evaluate(() => {
    toggleSettings(true);
    document.querySelectorAll("#settingsBox details.settings-group").forEach(group => {
      group.open = true;
    });
  });

  const toggles = page.locator("#settingsBox [data-secret-toggle]");
  await expect(toggles).toHaveCount(5);

  const input = page.locator("#apiKeyInput");
  const toggle = page.locator('[data-secret-toggle="apiKeyInput"]');
  await input.fill("rawg-test-secret");
  await expect(input).toHaveAttribute("type", "password");

  const target = await toggle.boundingBox();
  expect(target?.width).toBeGreaterThanOrEqual(44);
  expect(target?.height).toBeGreaterThanOrEqual(44);

  await toggle.click();
  await expect(input).toHaveAttribute("type", "text");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(input).toHaveValue("rawg-test-secret");

  await page.locator("#settingsCloseBtn").click();
  await expect(input).toHaveAttribute("type", "password");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
