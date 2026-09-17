import { expect, test } from "@playwright/test";

test("selects a slot without navigation selecting implicitly", async ({ page }) => {
  await page.goto("/demo/index.html");

  const picker = page.locator("slot-picker");
  await expect(picker.locator(".sp-slot").first()).toBeVisible();

  const initial = await picker.getAttribute("value");
  await picker.locator(".sp-nav-next").click();
  expect(await picker.getAttribute("value")).toBe(initial);

  await picker.locator(".sp-nav-prev").click();
  await picker.locator(".sp-slot").first().click();
  await expect(picker).toHaveAttribute("value", "2026-11-17T13:35");
});

test("keyboard movement does not select", async ({ page }) => {
  await page.goto("/demo/index.html");

  const first = page.locator(".sp-slot").first();
  await first.focus();
  await page.keyboard.press("ArrowDown");

  await expect(page.locator("slot-picker")).not.toHaveAttribute("value", /.+/);
  await expect(page.locator(".sp-slot:focus")).toHaveText("19:00");
});
