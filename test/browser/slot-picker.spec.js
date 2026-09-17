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

const FIVE_DAYS = [
  { date: "2026-11-17", slots: [{ start: "09:00" }] },
  { date: "2026-11-18", slots: [{ start: "09:00" }] },
  { date: "2026-11-19", slots: [{ start: "09:00" }] },
  { date: "2026-11-20", slots: [{ start: "09:00" }] },
  { date: "2026-11-21", slots: [{ start: "09:00" }] },
];

test("min/max bound the window and disable impossible navigation", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async (days) => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    picker.setAttribute("min", "2026-11-17");
    picker.setAttribute("max", "2026-11-21");
    picker.days = days;
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);
    const range = picker.range;
    const nextDisabled = picker.querySelector(".sp-nav-next").disabled;
    const prevDisabled = picker.querySelector(".sp-nav-prev").disabled;
    picker.next();
    await new Promise(requestAnimationFrame);
    return {
      range,
      nextDisabled,
      prevDisabled,
      afterNext: picker.range,
      rendered: picker.querySelectorAll(".sp-day").length,
    };
  }, FIVE_DAYS);

  expect(result.range).toEqual({ start: "2026-11-17", end: "2026-11-21", dayCount: 5 });
  expect(result.nextDisabled).toBe(true);
  expect(result.prevDisabled).toBe(true);
  expect(result.afterNext.start).toBe("2026-11-17");
  expect(result.rendered).toBe(5);
});

test("a shorter bounded interval reduces visibleDayCount instead of leaving the bounds", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async (days) => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    picker.setAttribute("min", "2026-11-17");
    picker.setAttribute("max", "2026-11-19");
    picker.days = days;
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);
    return {
      count: picker.visibleDayCount,
      range: picker.range,
      rendered: picker.querySelectorAll(".sp-day").length,
    };
  }, FIVE_DAYS);

  expect(result.count).toBe(3);
  expect(result.range).toEqual({ start: "2026-11-17", end: "2026-11-19", dayCount: 3 });
  expect(result.rendered).toBe(3);
});

test("responsive resize changes the range but preserves activeDate", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async (days) => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    picker.setAttribute("responsive", "");
    picker.days = days;
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const wide = { count: picker.visibleDayCount, range: picker.range };
    picker.activeDate = "2026-11-20";
    await new Promise(requestAnimationFrame);

    const value = picker.value;
    host.style.width = "360px";
    await new Promise((resolve) => setTimeout(resolve, 60));

    return { wide, count: picker.visibleDayCount, range: picker.range, activeDate: picker.activeDate, value };
  }, FIVE_DAYS);

  expect(result.wide.count).toBe(5);
  expect(result.count).toBe(3);
  expect(result.range).toEqual({ start: "2026-11-18", end: "2026-11-20", dayCount: 3 });
  expect(result.activeDate).toBe("2026-11-20");
  expect(result.value).toBe("");
});

test("an empty range replaces the projection and next() advances the window", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("layout", "day");
    picker.messages = { rangeEmptyNext: "See the next period" };
    picker.days = [
      { date: "2026-11-17", slots: [] },
      { date: "2026-11-18", slots: [] },
      { date: "2026-11-19", slots: [] },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const empty = Boolean(picker.querySelector(".sp-range-empty"));
    const projections = picker.querySelectorAll(".sp-grid, .sp-panel, .sp-daystrip").length;
    picker.querySelector(".sp-range-empty-next").click();
    await new Promise(requestAnimationFrame);
    return { empty, projections, start: picker.start };
  });

  expect(result.empty).toBe(true);
  expect(result.projections).toBe(0);
  expect(result.start).toBe("2026-11-20");
});

test("a notice without slots keeps the projection and the range empty state stays out", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.days = [
      { date: "2026-11-17", slots: [] },
      {
        date: "2026-11-18",
        slots: [],
        notice: { label: "Exceptionally unavailable" },
      },
      { date: "2026-11-19", slots: [] },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);
    return {
      rangeEmpty: Boolean(picker.querySelector(".sp-range-empty")),
      days: picker.querySelectorAll(".sp-day").length,
      notices: picker.querySelectorAll(".sp-notice").length,
    };
  });

  expect(result.rangeEmpty).toBe(false);
  expect(result.days).toBe(3);
  expect(result.notices).toBe(1);
});

test("goTo, goHome and configure drive the window without selecting", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async (days) => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    host.append(picker);
    document.body.append(host);
    picker.configure({
      start: "2026-11-17",
      dayCount: 5,
      min: "2026-11-17",
      max: "2026-12-15",
      homeDate: "2026-11-17",
    });
    picker.days = days;
    await new Promise(requestAnimationFrame);

    picker.goTo("2026-11-25");
    await new Promise(requestAnimationFrame);
    const moved = { range: picker.range, activeDate: picker.activeDate, value: picker.value };

    picker.goHome();
    await new Promise(requestAnimationFrame);
    return { moved, home: picker.range, homeActive: picker.activeDate };
  }, FIVE_DAYS);

  expect(result.moved.range.start).toBe("2026-11-21");
  expect(result.moved.range.end).toBe("2026-11-25");
  expect(result.moved.activeDate).toBe("2026-11-25");
  expect(result.moved.value).toBe("");
  expect(result.home).toEqual({ start: "2026-11-17", end: "2026-11-21", dayCount: 5 });
});

test("goTo emits rangechange before daychange", async ({ page }) => {
  await page.goto("/demo/index.html");
  const events = await page.evaluate(async (days) => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    picker.setAttribute("min", "2026-11-17");
    picker.setAttribute("max", "2026-12-15");
    picker.days = days;
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const order = [];
    picker.addEventListener("rangechange", () => order.push("rangechange"));
    picker.addEventListener("daychange", () => order.push("daychange"));
    picker.goTo("2026-11-25");
    return order;
  }, FIVE_DAYS);

  expect(events).toEqual(["rangechange", "daychange"]);
});

test("configure applies as one transaction", async ({ page }) => {
  await page.goto("/demo/index.html");
  const events = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    picker.source = () => [];
    host.append(picker);
    document.body.append(host);
    await new Promise((resolve) => setTimeout(resolve, 30));

    const seen = [];
    picker.addEventListener("rangechange", () => seen.push("rangechange"));
    picker.addEventListener("loadstart", () => seen.push("loadstart"));
    picker.configure({
      start: "2026-11-10",
      dayCount: 3,
      min: "2026-11-10",
      max: "2026-12-15",
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    return seen;
  });

  expect(events.filter((event) => event === "rangechange")).toHaveLength(1);
  expect(events.filter((event) => event === "loadstart")).toHaveLength(1);
});

test("goToNextAvailability uses the source next() when available", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async (days) => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    picker.setAttribute("min", "2026-11-17");
    picker.setAttribute("max", "2026-12-15");
    picker.days = days;
    picker.source = {
      load: () => ({ days }),
      next: ({ after }) => (after === "2026-11-21" ? "2026-12-08" : null),
    };
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const after = picker.range.end;
    const date = await picker.goToNextAvailability();
    await new Promise(requestAnimationFrame);
    return { date, after, activeDate: picker.activeDate, range: picker.range };
  }, FIVE_DAYS);

  expect(result.after).toBe("2026-11-21");
  expect(result.date).toBe("2026-12-08");
  expect(result.activeDate).toBe("2026-12-08");
  expect(result.range.start <= result.date && result.date <= result.range.end).toBe(true);
});

test("goToNextAvailability falls back to nextrequest and lets the consumer goTo", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async (days) => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    picker.setAttribute("min", "2026-11-17");
    picker.setAttribute("max", "2026-12-15");
    picker.days = days;
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    let requested = "";
    picker.addEventListener("nextrequest", (event) => {
      requested = event.detail.after;
      picker.goTo("2026-12-08");
    });
    const date = await picker.goToNextAvailability();
    await new Promise(requestAnimationFrame);
    return { date, requested, activeDate: picker.activeDate };
  }, FIVE_DAYS);

  expect(result.requested).toBe("2026-11-21");
  expect(result.date).toBe(null);
  expect(result.activeDate).toBe("2026-12-08");
});

test("min > max is a distinguishable invalid range that never touches the source", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    picker.setAttribute("min", "2026-12-01");
    picker.setAttribute("max", "2026-11-01");
    host.append(picker);
    document.body.append(host);

    let loads = 0;
    let nexts = 0;
    let requests = 0;
    picker.addEventListener("nextrequest", () => requests++);
    picker.source = {
      load: () => {
        loads++;
        return [];
      },
      next: () => {
        nexts++;
        return "2026-12-08";
      },
    };
    await new Promise((resolve) => setTimeout(resolve, 20));

    const date = await picker.goToNextAvailability();
    return {
      count: picker.visibleDayCount,
      range: picker.range,
      invalid: picker.hasAttribute("data-invalid-range"),
      loads,
      nexts,
      requests,
      date,
      prevDisabled: picker.querySelector(".sp-nav-prev").disabled,
    };
  });

  expect(result.count).toBe(0);
  expect(result.range).toEqual({ start: "", end: "", dayCount: 0 });
  expect(result.invalid).toBe(true);
  expect(result.loads).toBe(0);
  expect(result.nexts).toBe(0);
  expect(result.requests).toBe(0);
  expect(result.date).toBe(null);
  expect(result.prevDisabled).toBe(true);
});

test("an imported locale pack drives Intl formatting and RTL without reversing chronology", async ({
  page,
}) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async (days) => {
    const pack = (await import("/src/locales/ar.js")).default;
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("layout", "day");
    picker.setAttribute("dir", "rtl");
    picker.lang = "ar";
    picker.messages = pack;
    picker.days = days;
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const nav = {
      prev: picker.querySelector(".sp-nav-prev").getAttribute("aria-label"),
      next: picker.querySelector(".sp-nav-next").getAttribute("aria-label"),
    };
    const panelTitle = picker.querySelector(".sp-panel-title").textContent;
    const firstStrip = picker.querySelector(".sp-strip-day").getAttribute("data-date");
    const svgTransform = getComputedStyle(picker.querySelector(".sp-nav-prev svg")).transform;
    const before = picker.range;
    picker.next();
    await new Promise(requestAnimationFrame);
    return { nav, panelTitle, firstStrip, svgTransform, before, after: picker.range };
  }, FIVE_DAYS);

  expect(result.nav.prev).toBe("الأيام السابقة");
  expect(result.nav.next).toBe("الأيام التالية");
  expect(result.panelTitle).toMatch(/[\u0600-\u06ff]/);
  expect(result.firstStrip).toBe("2026-11-17");
  expect(result.svgTransform).not.toBe("none");
  // Chronology is unaffected by RTL: next still moves forward in time.
  expect(result.before).toEqual({ start: "2026-11-17", end: "2026-11-19", dayCount: 3 });
  expect(result.after.start).toBe("2026-11-20");
});

test("setDefaultMessages reaches an already-created instance", async ({ page }) => {
  // The ESM fixture shares one messages module between the element and the
  // public API; the demo bundle would be a separate module instance.
  await page.goto("/test/fixtures/locales.html");
  await page.waitForFunction(() => window.__ready);

  const labels = await page.evaluate(async (days) => {
    const { setDefaultMessages } = await import("/src/index.js");
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.days = days;
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const before = picker.querySelector(".sp-nav-next").getAttribute("aria-label");
    setDefaultMessages({ next: "Suivant" });
    // Global defaults are resolved lazily: the next render picks them up.
    picker.days = days;
    await new Promise(requestAnimationFrame);
    const after = picker.querySelector(".sp-nav-next").getAttribute("aria-label");
    return { before, after };
  }, FIVE_DAYS);

  expect(labels.before).toBe("Next days");
  expect(labels.after).toBe("Suivant");
});

test("hovering a day notice raises a visible affordance", async ({ page }) => {
  await page.goto("/demo/index.html");

  const notice = page.locator("#picker-columns .sp-notice").first();
  await notice.scrollIntoViewIfNeeded();
  const before = await notice.evaluate((element) => getComputedStyle(element).backgroundColor);

  await notice.hover();
  await page.waitForTimeout(200);
  const after = await notice.evaluate((element) => getComputedStyle(element).backgroundColor);

  expect(after).not.toBe(before);
  expect(after).not.toBe("rgba(0, 0, 0, 0)");
});

test("day projection anchors a notice dot inside the panel header", async ({ page }) => {
  await page.goto("/demo/index.html");

  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("layout", "day");
    picker.setAttribute("active-date", "2026-11-18");
    picker.days = [
      { date: "2026-11-17", slots: [{ start: "09:00" }] },
      {
        date: "2026-11-18",
        slots: [{ start: "09:00" }],
        notice: { label: "Exceptionally unavailable", description: "The practitioner is away." },
      },
      { date: "2026-11-19", slots: [{ start: "09:00" }] },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const notice = picker.querySelector(".sp-panel-header .sp-notice");
    const header = picker.querySelector(".sp-panel-header");
    if (!(notice instanceof HTMLElement) || !(header instanceof HTMLElement)) return { found: false };
    const n = notice.getBoundingClientRect();
    const h = header.getBoundingClientRect();
    return {
      found: true,
      anchored: Math.abs(n.top - h.top) <= 1 && Math.abs(n.right - h.right) <= 1,
      insidePicker: n.left >= picker.getBoundingClientRect().left,
    };
  });

  expect(result.found).toBe(true);
  expect(result.anchored).toBe(true);
  expect(result.insidePicker).toBe(true);
});
