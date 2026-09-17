import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

test("selects a slot without navigation selecting implicitly", async ({ page }) => {
  await page.goto("/demo/index.html");

  const picker = page.locator("#picker-columns");
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

  const picker = page.locator("#picker-columns");
  const first = picker.locator(".sp-slot").first();
  await first.focus();
  await page.keyboard.press("ArrowDown");

  await expect(picker).not.toHaveAttribute("value", /.+/);
  await expect(picker.locator(".sp-slot:focus")).toHaveText("19:00");
});

test("day strip consults without selecting and slot syncs activeDate", async ({ page }) => {
  await page.goto("/demo/index.html");

  const picker = page.locator("#picker-day");
  await expect(picker.locator(".sp-strip-day").first()).toBeVisible();

  await picker.locator('.sp-strip-day[data-date="2026-11-19"]').click();
  await expect(picker).toHaveAttribute("active-date", "2026-11-19");
  await expect(picker).not.toHaveAttribute("value", /.+/);

  await picker.locator('.sp-panel-slots .sp-slot[data-value="2026-11-19T09:15"]').click();
  await expect(picker).toHaveAttribute("value", "2026-11-19T09:15");
  await expect(picker).toHaveAttribute("active-date", "2026-11-19");
});

test("strip keyboard changes consulted day without selecting", async ({ page }) => {
  await page.goto("/demo/index.html");

  const picker = page.locator("#picker-day");
  const active = picker.locator('.sp-strip-day[data-date="2026-11-17"]');
  await active.focus();
  await page.keyboard.press("ArrowRight");

  await expect(picker).toHaveAttribute("active-date", "2026-11-18");
  await expect(picker).not.toHaveAttribute("value", /.+/);
  await expect(picker.locator(".sp-strip-day:focus")).toHaveAttribute("data-date", "2026-11-18");
});

test("empty days render a real DOM empty state", async ({ page }) => {
  await page.goto("/demo/index.html");

  const columns = page.locator("#picker-columns");
  await expect(columns.locator('.sp-day[data-date="2026-11-21"] .sp-day-empty')).toHaveText(/Aucune/);

  const day = page.locator("#picker-day");
  await day.locator('.sp-strip-day[data-date="2026-11-21"]').click();
  await expect(day.locator(".sp-panel .sp-day-empty")).toHaveText(/Aucune/);
});

test("narrow containers render both projections", async ({ page }) => {
  await page.goto("/demo/index.html");

  const narrow = page.locator("#picker-columns-narrow");
  await expect(narrow.locator(".sp-day")).toHaveCount(3);
  await expect(narrow.locator(".sp-slot").first()).toBeVisible();

  const day = page.locator("#picker-day-narrow");
  await expect(day.locator(".sp-strip-day")).toHaveCount(3);
  await expect(day.locator(".sp-panel-slots .sp-slot").first()).toBeVisible();
});

test("keyboard focus stays inside collapsed rows", async ({ page }) => {
  await page.goto("/demo/index.html");

  const picker = page.locator("#picker-columns");
  // 2026-11-18 has 10 slots, collapsed to 5 visible rows.
  const first = picker.locator('.sp-day[data-date="2026-11-18"] .sp-slot').first();
  await first.focus();
  for (let index = 0; index < 6; index++) await page.keyboard.press("ArrowDown");

  await expect(picker.locator(".sp-slot:focus")).toHaveCount(1);
  await expect(picker).not.toHaveAttribute("value", /.+/);
});

test("demo works without a web server", async ({ page }) => {
  await page.goto(pathToFileURL(join(process.cwd(), "demo", "index.html")).href);

  await expect(page.locator("#build-warning")).toBeHidden();
  await expect(page.locator("#picker-columns .sp-slot").first()).toBeVisible();
  await expect(page.locator("#picker-day .sp-strip-day")).toHaveCount(5);
});
