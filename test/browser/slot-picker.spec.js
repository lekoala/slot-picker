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
  await expect(columns.locator('.sp-day[data-date="2026-11-21"] .sp-day-empty')).toHaveText(
    /No availability/,
  );

  const day = page.locator("#picker-day");
  await day.locator('.sp-strip-day[data-date="2026-11-21"]').click();
  await expect(day.locator(".sp-panel .sp-day-empty")).toHaveText(/No availability/);
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
  // 360px host leaves ~264px to the projection: two comfortable columns.
  expect(result.count).toBe(2);
  expect(result.range).toEqual({ start: "2026-11-19", end: "2026-11-20", dayCount: 2 });
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

test("navigation is a symmetric prev/next rail with home kept outside it", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async (days) => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("home-date", "2026-11-17");
    picker.setAttribute("min", "2026-11-17");
    picker.setAttribute("max", "2026-12-15");
    picker.days = days;
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const prev = picker.querySelector(".sp-nav-prev").getBoundingClientRect();
    const next = picker.querySelector(".sp-nav-next").getBoundingClientRect();
    const grid = picker.querySelector(".sp-grid").getBoundingClientRect();
    // At the reference window the shortcut has nothing to do: it stays out.
    const shortcutAtHome = picker.querySelectorAll(".sp-home").length;

    picker.goTo("2026-12-08");
    await new Promise(requestAnimationFrame);
    const shortcutAway = picker.querySelectorAll(".sp-home").length;
    picker.querySelector(".sp-home").click();
    await new Promise(requestAnimationFrame);

    return {
      shortcutAtHome,
      shortcutAway,
      prevBeforeGrid: prev.right <= grid.left + 1,
      nextAfterGrid: next.left >= grid.right - 1,
      backHome: picker.range.start,
      focusMovedToSlot: picker.querySelector(".sp-slot:focus") !== null,
    };
  }, FIVE_DAYS);

  expect(result.shortcutAtHome).toBe(0);
  expect(result.shortcutAway).toBe(1);
  expect(result.prevBeforeGrid).toBe(true);
  expect(result.nextAfterGrid).toBe(true);
  expect(result.backHome).toBe("2026-11-17");
  // The disappearing shortcut must not swallow keyboard focus.
  expect(result.focusMovedToSlot).toBe(true);
});

test("day layout keeps the strip inside the symmetric nav rail", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async (days) => {
    const host = document.createElement("div");
    host.style.width = "360px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("layout", "day");
    picker.days = days;
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const strip = picker.querySelector(".sp-daystrip").getBoundingClientRect();
    const prev = picker.querySelector(".sp-nav-prev").getBoundingClientRect();
    const next = picker.querySelector(".sp-nav-next").getBoundingClientRect();
    return {
      prevBeforeStrip: prev.right <= strip.left + 1,
      nextAfterStrip: next.left >= strip.right - 1,
      columns: getComputedStyle(picker.querySelector(".sp-projection")).gridTemplateColumns.split(" ").length,
    };
  }, FIVE_DAYS);

  expect(result.prevBeforeStrip).toBe(true);
  expect(result.nextAfterStrip).toBe(true);
  expect(result.columns).toBe(3);
});

test("next availability is contextual, never permanent chrome", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("next-availability", "");
    picker.days = [
      { date: "2026-11-17", slots: [] },
      { date: "2026-11-18", slots: [] },
      { date: "2026-11-19", slots: [] },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    let requested = "";
    picker.addEventListener("nextrequest", (event) => {
      requested = event.detail.after;
    });
    const permanent = picker.querySelectorAll(".sp-nav-availability").length;
    const emptyAction = picker.querySelector(".sp-range-empty-availability");
    emptyAction.click();
    await new Promise(requestAnimationFrame);

    picker.days = [{ date: "2026-11-17", slots: [{ start: "09:00" }] }];
    await new Promise(requestAnimationFrame);
    return {
      permanent,
      emptyAction: Boolean(emptyAction),
      requested,
      populated: picker.querySelectorAll(".sp-nav-availability").length,
    };
  });

  expect(result.permanent).toBe(0);
  expect(result.emptyAction).toBe(true);
  expect(result.requested).toBe("2026-11-19");
  expect(result.populated).toBe(0);
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

test("notice-display defaults to action", async ({ page }) => {
  await page.goto("/demo/index.html");

  const result = await page.evaluate(() => {
    const picker = document.querySelector("#picker-columns");
    const day = picker.querySelector('.sp-day[data-date="2026-11-21"]');
    const control = day.querySelector(".sp-notice[data-day-index]");
    return {
      controlTag: control ? control.tagName : "",
      blocks: picker.querySelectorAll(".sp-day-notice").length,
    };
  });

  expect(result.controlTag).toBe("BUTTON");
  expect(result.blocks).toBe(0);
});

test("activating the notice control dispatches noticeactivate with its anchor", async ({ page }) => {
  await page.goto("/demo/index.html");

  const result = await page.evaluate(() => {
    const picker = document.querySelector("#picker-columns");
    let detail = null;
    picker.addEventListener("noticeactivate", (event) => {
      detail = event.detail;
    });
    const control = picker.querySelector('.sp-day[data-date="2026-11-21"] .sp-notice[data-day-index]');
    control.click();
    return {
      label: detail ? detail.notice.label : "",
      anchorIsControl: detail ? detail.anchor === control : false,
      value: picker.getAttribute("value"),
    };
  });

  expect(result.label).toBe("Exceptionally unavailable");
  expect(result.anchorIsControl).toBe(true);
  expect(result.value).toBe(null);
});

test("noticeactivate bubbles from the control", async ({ page }) => {
  await page.goto("/demo/index.html");

  const bubbled = await page.evaluate(() => {
    let seen = false;
    document.body.addEventListener("noticeactivate", () => {
      seen = true;
    });
    const picker = document.querySelector("#picker-columns");
    picker.querySelector('.sp-day[data-date="2026-11-21"] .sp-notice[data-day-index]').click();
    return seen;
  });

  expect(bubbled).toBe(true);
});

test("inline columns renders readable text plus a single control", async ({ page }) => {
  await page.goto("/demo/index.html");

  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "360px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("notice-display", "inline");
    picker.days = [
      { date: "2026-11-17", slots: [{ start: "09:00" }] },
      { date: "2026-11-18", slots: [{ start: "09:00" }] },
      {
        date: "2026-11-19",
        slots: [],
        notice: { label: "Indisponibilité exceptionnelle", description: "Le praticien est absent." },
      },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const day = picker.querySelector('.sp-day[data-date="2026-11-19"]');
    const block = day.querySelector(".sp-day-notice");
    const description = block.querySelector(".sp-day-notice-description");
    const control = day.querySelector(".sp-notice[data-day-index]");
    return {
      blockTag: block.tagName,
      label: block.querySelector(".sp-day-notice-label").textContent.trim(),
      description: description.textContent.trim(),
      descriptionDisplay: getComputedStyle(description).display,
      controlTag: control.tagName,
      hasEmpty: Boolean(day.querySelector(".sp-day-empty")),
    };
  });

  expect(result.blockTag).toBe("DIV");
  expect(result.label).toBe("Indisponibilité exceptionnelle");
  // Description stays in the DOM for themes, but is not spread out in columns.
  expect(result.description).toBe("Le praticien est absent.");
  expect(result.descriptionDisplay).toBe("none");
  expect(result.controlTag).toBe("BUTTON");
  expect(result.hasEmpty).toBe(true);
});

test("inline day reveals the full notice without a control", async ({ page }) => {
  await page.goto("/demo/index.html");

  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("layout", "day");
    picker.setAttribute("active-date", "2026-11-18");
    picker.setAttribute("notice-display", "inline");
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

    const block = picker.querySelector(".sp-panel .sp-day-notice");
    const description = block.querySelector(".sp-day-notice-description");
    return {
      blockTag: block.tagName,
      label: block.querySelector(".sp-day-notice-label").textContent.trim(),
      description: description.textContent.trim(),
      display: getComputedStyle(description).display,
      panelControls: picker.querySelectorAll(".sp-panel-header .sp-notice").length,
      slots: picker.querySelectorAll(".sp-panel-slots .sp-slot").length,
    };
  });

  expect(result.blockTag).toBe("DIV");
  expect(result.label).toBe("Exceptionally unavailable");
  expect(result.description).toBe("The practitioner is away.");
  expect(result.display).toBe("block");
  // Displayed text is not a control.
  expect(result.panelControls).toBe(0);
  expect(result.slots).toBe(1);
});

test("inline notice never overflows a narrow column", async ({ page }) => {
  await page.goto("/demo/index.html");

  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "360px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("notice-display", "inline");
    picker.days = [
      { date: "2026-11-17", slots: [{ start: "09:00" }] },
      { date: "2026-11-18", slots: [{ start: "09:00" }] },
      {
        date: "2026-11-19",
        slots: [],
        notice: {
          label: "IndisponibilitéExceptionnelleSansEspacesTrèsLongue",
          description: "DescriptionSansEspacesTrèsLongueAussi",
        },
      },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const day = picker.querySelector('.sp-day[data-date="2026-11-19"]');
    const block = day.querySelector(".sp-day-notice");
    const label = block.querySelector(".sp-day-notice-label");
    const d = day.getBoundingClientRect();
    const b = block.getBoundingClientRect();
    const l = label.getBoundingClientRect();
    const within = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
    return {
      blockWithinDay: within(b, d),
      labelWithinDay: within(l, d),
      blockWidth: b.width,
      dayWidth: d.width,
    };
  });

  expect(result.blockWithinDay).toBe(true);
  expect(result.labelWithinDay).toBe(true);
  expect(result.blockWidth).toBeLessThanOrEqual(result.dayWidth + 1);
});

test("inline columns keeps a notice and its slots side by side", async ({ page }) => {
  await page.goto("/demo/index.html");

  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "900px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "2");
    picker.setAttribute("notice-display", "inline");
    picker.days = [
      {
        date: "2026-11-17",
        slots: [{ start: "09:00" }, { start: "10:00" }],
        notice: { label: "Late opening", description: "Doors open at 10:00." },
      },
      { date: "2026-11-18", slots: [{ start: "09:00" }] },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);
    const day = picker.querySelector('.sp-day[data-date="2026-11-17"]');
    return {
      notice: Boolean(day.querySelector(".sp-day-notice")),
      slots: day.querySelectorAll(".sp-slot").length,
    };
  });

  expect(result.notice).toBe(true);
  expect(result.slots).toBe(2);
});

test("notice-display=action keeps an accessible control with its anchor", async ({ page }) => {
  await page.goto("/demo/index.html");

  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "900px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("notice-display", "action");
    picker.days = [
      { date: "2026-11-17", slots: [{ start: "09:00" }] },
      { date: "2026-11-18", slots: [], notice: { label: "Exceptionally unavailable", description: "Away." } },
      { date: "2026-11-19", slots: [{ start: "09:00" }] },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    let bubbled = false;
    let anchor = null;
    host.addEventListener("noticeactivate", (event) => {
      bubbled = true;
      anchor = event.detail.anchor;
    });

    const button = picker.querySelector('.sp-day[data-date="2026-11-18"] .sp-notice[data-day-index]');
    const inlineBlocks = picker.querySelectorAll(".sp-day-notice").length;
    button.click();
    return {
      inlineBlocks,
      buttonTag: button.tagName,
      ariaLabel: button.getAttribute("aria-label"),
      title: button.getAttribute("title"),
      anchorIsButton: anchor === button,
      bubbled,
    };
  });

  expect(result.inlineBlocks).toBe(0);
  expect(result.buttonTag).toBe("BUTTON");
  expect(result.ariaLabel).toBe("Away.");
  expect(result.title).toBe("Exceptionally unavailable");
  expect(result.anchorIsButton).toBe(true);
  expect(result.bubbled).toBe(true);
});

test("notice-display=action places the control in the day panel header", async ({ page }) => {
  await page.goto("/demo/index.html");

  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("layout", "day");
    picker.setAttribute("active-date", "2026-11-18");
    picker.setAttribute("notice-display", "action");
    picker.days = [
      { date: "2026-11-17", slots: [{ start: "09:00" }] },
      { date: "2026-11-18", slots: [{ start: "09:00" }], notice: { label: "Late opening" } },
      { date: "2026-11-19", slots: [{ start: "09:00" }] },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const button = picker.querySelector(".sp-panel-header .sp-notice[data-day-index]");
    return {
      found: Boolean(button),
      inlineBlocks: picker.querySelectorAll(".sp-day-notice").length,
    };
  });

  expect(result.found).toBe(true);
  expect(result.inlineBlocks).toBe(0);
});

test("notice-display=none renders nothing for a notice day", async ({ page }) => {
  await page.goto("/demo/index.html");

  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "900px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "2");
    picker.setAttribute("notice-display", "none");
    picker.days = [
      { date: "2026-11-17", slots: [{ start: "09:00" }] },
      { date: "2026-11-18", slots: [], notice: { label: "Unavailable", description: "Away." } },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const day = picker.querySelector('.sp-day[data-date="2026-11-18"]');
    return {
      indicators: day.querySelectorAll(".sp-notice").length,
      blocks: day.querySelectorAll(".sp-day-notice").length,
      empty: Boolean(day.querySelector(".sp-day-empty")),
    };
  });

  expect(result.indicators).toBe(0);
  expect(result.blocks).toBe(0);
  expect(result.empty).toBe(true);
});

test("demo opens a basic popover anchored on noticeactivate", async ({ page }) => {
  await page.goto("/demo/index.html");

  const control = page.locator('#picker-columns .sp-day[data-date="2026-11-21"] .sp-notice[data-day-index]');
  await control.click();

  const popover = page.locator("#notice-popover");
  await expect(popover).toBeVisible();
  await expect(page.locator("#notice-popover-title")).toHaveText("Exceptionally unavailable");
  await expect(page.locator("#notice-popover-body")).toContainText("practitioner");

  const anchored = await page.evaluate(() => {
    const anchor = document
      .querySelector('#picker-columns .sp-day[data-date="2026-11-21"] .sp-notice[data-day-index]')
      .getBoundingClientRect();
    const rect = document.querySelector("#notice-popover").getBoundingClientRect();
    const below = Math.abs(rect.top - (anchor.bottom + 8)) <= 1;
    const above = Math.abs(rect.bottom - (anchor.top - 8)) <= 1;
    return below || above;
  });
  expect(anchored).toBe(true);

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
});

test("a source set before connection still loads once per connection", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    let loads = 0;
    picker.source = () => {
      loads++;
      return [];
    };
    host.append(picker);
    document.body.append(host);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const first = loads;
    picker.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    host.append(picker);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { first, second: loads };
  });

  expect(result.first).toBe(1);
  expect(result.second).toBe(2);
});

test("a superseded request cannot clear the current loading state or raise a stale error", async ({
  page,
}) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    picker.setAttribute("min", "2026-11-01");
    picker.setAttribute("max", "2026-12-31");
    host.append(picker);
    document.body.append(host);
    await new Promise((resolve) => setTimeout(resolve, 10));

    /** @type {{resolve:(value:unknown)=>void,reject:(reason?:unknown)=>void}[]} */
    const requests = [];
    picker.source = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
    const errors = [];
    picker.addEventListener("loaderror", () => errors.push("loaderror"));
    await new Promise((resolve) => setTimeout(resolve, 10));

    picker.next();
    await new Promise((resolve) => setTimeout(resolve, 10));
    picker.next();
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Resolve the oldest superseded request while the latest is still pending.
    requests[0].resolve([{ date: "2026-11-17", slots: [{ start: "09:00" }] }]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const loadingWhilePending = Boolean(picker.querySelector(".sp-status"));

    // Resolve the current request, then reject an older one.
    requests[requests.length - 1].resolve([{ date: "2026-11-27", slots: [{ start: "09:00" }] }]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    requests[requests.length - 2].reject(new Error("stale boom"));
    await new Promise((resolve) => setTimeout(resolve, 10));

    return {
      loadingWhilePending,
      errorShown: Boolean(picker.querySelector(".sp-status-error")),
      errors,
      days: picker.days.map((day) => day.date),
      start: picker.range.start,
    };
  });

  expect(result.loadingWhilePending).toBe(true);
  expect(result.errorShown).toBe(false);
  expect(result.errors).toEqual([]);
  expect(result.days).toEqual(["2026-11-27"]);
  expect(result.start).toBe("2026-11-27");
});

test("configure({ start }) is not pulled back to the previous active day", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    picker.setAttribute("min", "2026-11-01");
    picker.setAttribute("max", "2026-12-31");
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const before = picker.start;
    picker.configure({ start: "2026-12-01" });
    await new Promise(requestAnimationFrame);
    return { before, after: picker.start, range: picker.range, active: picker.activeDate };
  });

  expect(result.before).toBe("2026-11-17");
  expect(result.after).toBe("2026-12-01");
  expect(result.range.start).toBe("2026-12-01");
  expect(result.active).toBe("2026-12-01");
});

test("min > max invalidates the in-flight load instead of repainting it", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    host.append(picker);
    document.body.append(host);
    await new Promise((resolve) => setTimeout(resolve, 10));

    /** @type {((value:unknown)=>void)|null} */
    let resolveLoad = null;
    picker.source = () => new Promise((resolve) => (resolveLoad = resolve));
    await new Promise((resolve) => setTimeout(resolve, 10));

    let loadend = 0;
    picker.addEventListener("loadend", () => loadend++);
    picker.configure({ min: "2026-12-01", max: "2026-11-01" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const invalid = picker.hasAttribute("data-invalid-range");
    const loading = Boolean(picker.querySelector(".sp-status"));

    resolveLoad?.([{ date: "2026-11-17", slots: [{ start: "09:00" }] }]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    return { invalid, loading, days: picker.days.length, loadend };
  });

  expect(result.invalid).toBe(true);
  expect(result.loading).toBe(false);
  expect(result.days).toBe(0);
  expect(result.loadend).toBe(0);
});

test("the selected slot is exposed as a selected option", async ({ page }) => {
  await page.goto("/demo/index.html");

  const picker = page.locator("#picker-columns");
  await expect(picker.locator(".sp-slot").first()).toBeVisible();
  await picker.locator(".sp-slot").first().click();

  await expect(picker.getByRole("option", { selected: true })).toHaveText("13:35");
  await expect(picker.getByRole("listbox").first()).toBeVisible();
  await expect(picker.locator('.sp-slot[role="option"]').first()).toBeVisible();
});

test("value rejects an impossible civil date and ignores a malformed attribute", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(() => {
    const picker = document.createElement("slot-picker");
    let threw = false;
    try {
      picker.value = "2026-02-31T10:00";
    } catch (error) {
      threw = error instanceof TypeError;
    }
    picker.value = "2026-02-28T10:00";

    // Markup is not guaranteed to be valid: a bad attribute reads as empty and
    // must never break the upgrade.
    const malformed = document.createElement("slot-picker");
    malformed.setAttribute("value", "2026-02-31T10:00");
    const readback = malformed.value;
    return { threw, accepted: picker.value, readback, attribute: malformed.getAttribute("value") };
  });

  expect(result.threw).toBe(true);
  expect(result.accepted).toBe("2026-02-28T10:00");
  expect(result.readback).toBe("");
  expect(result.attribute).toBe("2026-02-31T10:00");
});

test("removing the source returns to a neutral state", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    host.append(picker);
    document.body.append(host);
    await new Promise((resolve) => setTimeout(resolve, 10));

    picker.source = () => Promise.reject(new Error("backend down"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const errorShown = Boolean(picker.querySelector(".sp-status-error"));

    picker.source = null;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return {
      errorShown,
      afterRemoval: Boolean(picker.querySelector(".sp-status-error")),
      status: Boolean(picker.querySelector(".sp-status")),
    };
  });

  expect(result.errorShown).toBe(true);
  expect(result.afterRemoval).toBe(false);
  expect(result.status).toBe(false);
});

test("goToNextAvailability returns the destination actually reached", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    picker.setAttribute("min", "2026-11-17");
    picker.setAttribute("max", "2026-11-21");
    picker.days = [{ date: "2026-11-17", slots: [{ start: "09:00" }] }];
    // The source proposes a date beyond `max`: the component clamps it.
    picker.source = { load: () => [], next: () => "2026-12-08" };
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const returned = await picker.goToNextAvailability();
    return { returned, activeDate: picker.activeDate, range: picker.range };
  });

  expect(result.returned).toBe("2026-11-21");
  expect(result.activeDate).toBe("2026-11-21");
  expect(result.range.end).toBe("2026-11-21");
});

test("configure is atomic when an option is invalid", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    picker.setAttribute("min", "2026-11-17");
    picker.setAttribute("max", "2026-12-31");
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const before = { start: picker.start, min: picker.min, layout: picker.layout };
    let threw = false;
    try {
      // Valid options interleaved with an invalid one: nothing may be applied.
      picker.configure({ start: "2026-12-01", layout: "day", value: "2026-02-31T10:00" });
    } catch (error) {
      threw = error instanceof TypeError;
    }
    await new Promise(requestAnimationFrame);
    return { threw, before, after: { start: picker.start, min: picker.min, layout: picker.layout } };
  });

  expect(result.threw).toBe(true);
  expect(result.after).toEqual(result.before);
});

test("focus falls back to the roving slot when the targeted control disappears", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.days = [
      { date: "2026-11-17", slots: [{ start: "09:00" }] },
      { date: "2026-11-25", slots: [{ start: "10:00" }] },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const slot = picker.querySelector('.sp-slot[data-value="2026-11-17T09:00"]');
    slot.focus();
    // Shift the window so the focused slot no longer exists and no pending
    // focus target remains.
    picker.start = "2026-11-25";
    await new Promise(requestAnimationFrame);

    const active = document.activeElement;
    return {
      inside: picker.contains(active),
      isSlot: active instanceof HTMLElement ? active.classList.contains("sp-slot") : false,
      value: active instanceof HTMLElement ? active.getAttribute("data-value") : "",
    };
  });

  expect(result.inside).toBe(true);
  expect(result.isSlot).toBe(true);
  expect(result.value).toBe("2026-11-25T10:00");
});

test("a neutral tone drives the slot color surface without touching focus", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const style = document.createElement("style");
    style.textContent =
      'slot-picker .sp-slot[data-tone="video"] { --sp-slot-bg: rgb(1, 2, 3); --sp-slot-fg: rgb(4, 5, 6); }';
    document.head.append(style);

    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.days = [{ date: "2026-11-17", slots: [{ start: "09:00", tone: "video" }, { start: "10:00" }] }];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const toned = picker.querySelector('.sp-slot[data-tone="video"]');
    const plain = picker.querySelector('.sp-slot[data-value="2026-11-17T10:00"]');
    const tonedStyle = getComputedStyle(toned);
    return {
      tone: toned.getAttribute("data-tone"),
      tonedBg: tonedStyle.backgroundColor,
      tonedColor: tonedStyle.color,
      plainBg: getComputedStyle(plain).backgroundColor,
      accent: getComputedStyle(picker).getPropertyValue("--sp-accent").trim(),
      focusOnToned: tonedStyle.getPropertyValue("--sp-focus").trim(),
    };
  });

  expect(result.tone).toBe("video");
  expect(result.tonedBg).toBe("rgb(1, 2, 3)");
  expect(result.tonedColor).toBe("rgb(4, 5, 6)");
  expect(result.plainBg).not.toBe("rgb(1, 2, 3)");
  // The tone must not redefine the shared focus ring, which still follows accent.
  expect(result.focusOnToned).toBe(result.accent);
});

test("slotactivate bubbles to an ancestor", async ({ page }) => {
  await page.goto("/demo/index.html");
  const seen = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const picker = document.querySelector("#picker-columns");
        document.body.addEventListener(
          "slotactivate",
          (event) =>
            resolve({
              value: event.detail.value,
              bubbles: event.bubbles,
              targetIsHost: event.target === picker,
            }),
          { once: true },
        );
        picker.querySelector(".sp-slot").click();
      }),
  );

  expect(seen.value).toBe("2026-11-17T13:35");
  expect(seen.bubbles).toBe(true);
  expect(seen.targetIsHost).toBe(true);
});

test("the demo showcases toned slots", async ({ page }) => {
  await page.goto("/demo/index.html");

  const picker = page.locator("#picker-columns");
  await expect(picker.locator('.sp-slot[data-tone="video"]').first()).toBeVisible();

  const backgrounds = await page.evaluate(() => {
    const columns = document.querySelector("#picker-columns");
    const video = columns.querySelector('.sp-slot[data-tone="video"]');
    const urgent = columns.querySelector('.sp-slot[data-tone="urgent"]');
    const plain = columns.querySelector(".sp-slot:not([data-tone])");
    return {
      video: getComputedStyle(video).backgroundColor,
      urgent: getComputedStyle(urgent).backgroundColor,
      plain: getComputedStyle(plain).backgroundColor,
    };
  });

  expect(backgrounds.video).not.toBe(backgrounds.plain);
  expect(backgrounds.urgent).not.toBe(backgrounds.plain);
  expect(backgrounds.video).not.toBe(backgrounds.urgent);
});

test("the demo renders a theme-owned icon next to an instant slot", async ({ page }) => {
  await page.goto("/demo/index.html");

  const result = await page.evaluate(() => {
    const slot = document.querySelector('#picker-columns .sp-slot[data-tone="instant"]');
    if (!slot) return { found: false, icon: "", description: "" };
    return {
      found: true,
      icon: getComputedStyle(slot, "::after").content,
      description: slot.getAttribute("aria-description"),
    };
  });

  expect(result.found).toBe(true);
  expect(result.icon).toContain("⚡");
  // The glyph is decorative: the meaning stays in the accessible description.
  expect(result.description).toBe("Immediate booking available");
});

test("collapsed columns keep a stable footprint across sparse and empty ranges", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("max-visible-rows", "2");
    host.append(picker);
    document.body.append(host);

    const measure = async (days) => {
      picker.days = days;
      await new Promise(requestAnimationFrame);
      return picker.querySelector(".sp-content").getBoundingClientRect().height;
    };

    const populated = await measure([
      { date: "2026-11-17", slots: [{ start: "09:00" }, { start: "10:00" }] },
      { date: "2026-11-18", slots: [{ start: "09:00" }] },
      { date: "2026-11-19", slots: [] },
    ]);
    const sparse = await measure([{ date: "2026-11-17", slots: [{ start: "09:00" }] }]);
    const empty = await measure([]);
    return { populated, sparse, empty };
  });

  expect(Math.abs(result.populated - result.sparse)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.populated - result.empty)).toBeLessThanOrEqual(1);
});

test("expanded columns grow past the collapsed footprint", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("max-visible-rows", "2");
    picker.days = [
      {
        date: "2026-11-17",
        slots: [
          { start: "09:00" },
          { start: "10:00" },
          { start: "11:00" },
          { start: "12:00" },
          { start: "13:00" },
        ],
      },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const collapsed = picker.querySelector(".sp-content").getBoundingClientRect().height;
    picker.expanded = true;
    await new Promise(requestAnimationFrame);
    const expanded = picker.querySelector(".sp-content").getBoundingClientRect().height;
    return { collapsed, expanded };
  });

  expect(result.expanded).toBeGreaterThan(result.collapsed);
});

test("an empty day panel keeps a baseline height", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("layout", "day");
    picker.setAttribute("active-date", "2026-11-18");
    picker.days = [{ date: "2026-11-17", slots: [{ start: "09:00" }] }];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const panel = picker.querySelector(".sp-panel");
    const empty = picker.querySelector(".sp-panel .sp-day-empty");
    return {
      hasPanel: Boolean(panel),
      hasEmpty: Boolean(empty),
      height: empty ? empty.getBoundingClientRect().height : 0,
    };
  });

  expect(result.hasPanel).toBe(true);
  expect(result.hasEmpty).toBe(true);
  expect(result.height).toBeGreaterThanOrEqual(90);
});

test("loading is announced with aria-busy and no visible status line", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    host.append(picker);
    document.body.append(host);

    /** @type {((value:unknown)=>void)|null} */
    let resolveLoad = null;
    picker.source = () => new Promise((resolve) => (resolveLoad = resolve));
    await new Promise(requestAnimationFrame);

    const busy = picker.getAttribute("aria-busy");
    const hidden = Boolean(picker.querySelector(".sp-status.sp-visually-hidden"));
    const visible = Boolean(picker.querySelector(".sp-status:not(.sp-visually-hidden)"));

    resolveLoad?.([]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { busy, hidden, visible, afterBusy: picker.getAttribute("aria-busy") };
  });

  expect(result.busy).toBe("true");
  expect(result.hidden).toBe(true);
  expect(result.visible).toBe(false);
  expect(result.afterBusy).toBeNull();
});

test("the home shortcut reserves its space when configured", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("min", "2026-11-17");
    picker.setAttribute("max", "2026-12-15");
    picker.setAttribute("home-date", "2026-11-17");
    picker.days = [{ date: "2026-11-17", slots: [{ start: "09:00" }] }];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const atHome = {
      height: picker.getBoundingClientRect().height,
      wrapper: Boolean(picker.querySelector(".sp-shortcuts")),
      buttons: picker.querySelectorAll(".sp-home").length,
    };
    picker.goTo("2026-11-25");
    await new Promise(requestAnimationFrame);
    const away = {
      height: picker.getBoundingClientRect().height,
      wrapper: Boolean(picker.querySelector(".sp-shortcuts")),
      buttons: picker.querySelectorAll(".sp-home").length,
    };
    return { atHome, away };
  });

  expect(result.atHome.wrapper).toBe(true);
  expect(result.atHome.buttons).toBe(0);
  expect(result.away.wrapper).toBe(true);
  expect(result.away.buttons).toBe(1);
  // The shortcut appearing must not move the content below.
  expect(Math.abs(result.atHome.height - result.away.height)).toBeLessThanOrEqual(1);
});

test("collapsed show more floats in the reserved footer band", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("max-visible-rows", "2");
    picker.days = [
      { date: "2026-11-17", slots: [{ start: "09:00" }, { start: "10:00" }, { start: "11:00" }] },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const content = picker.querySelector(".sp-content");
    const more = picker.querySelector(".sp-more");
    const grid = picker.querySelector(".sp-grid");
    const collapsed = {
      position: getComputedStyle(more).position,
      gradient: getComputedStyle(more, "::before").backgroundImage,
      moreTop: more.getBoundingClientRect().top,
      gridBottom: grid.getBoundingClientRect().bottom,
      contentBottom: content.getBoundingClientRect().bottom,
    };

    picker.expanded = true;
    await new Promise(requestAnimationFrame);
    const expanded = {
      position: getComputedStyle(picker.querySelector(".sp-more")).position,
      gradient: getComputedStyle(picker.querySelector(".sp-more"), "::before").content,
    };
    return { collapsed, expanded };
  });

  expect(result.collapsed.position).toBe("absolute");
  expect(result.collapsed.gradient).toContain("gradient");
  // The control sits in the reserved footer band, below the last slot row.
  expect(result.collapsed.moreTop).toBeGreaterThanOrEqual(result.collapsed.gridBottom - 1);
  expect(result.collapsed.moreTop).toBeLessThanOrEqual(result.collapsed.contentBottom);
  expect(result.expanded.position).toBe("static");
  expect(result.expanded.gradient).toBe("none");
});

test("a closed day stays in the civil window and shows Closed", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "2");
    picker.days = [
      { date: "2026-11-17", slots: [], closed: true },
      { date: "2026-11-18", slots: [] },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const closed = picker.querySelector('.sp-day[data-date="2026-11-17"]');
    const open = picker.querySelector('.sp-day[data-date="2026-11-18"]');
    return {
      days: picker.querySelectorAll(".sp-day").length,
      closedFlag: closed.hasAttribute("data-closed"),
      closedText: closed.querySelector(".sp-day-empty").textContent.trim(),
      openFlag: open.hasAttribute("data-closed"),
      openText: open.querySelector(".sp-day-empty").textContent.trim(),
    };
  });

  expect(result.days).toBe(2);
  expect(result.closedFlag).toBe(true);
  expect(result.closedText).toBe("Closed");
  expect(result.openFlag).toBe(false);
  expect(result.openText).toBe("No availability");
});

test("a window made only of closed days keeps the projection", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.days = [
      { date: "2026-11-17", slots: [], closed: true },
      { date: "2026-11-18", slots: [], closed: true },
      { date: "2026-11-19", slots: [], closed: true },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);
    return {
      days: picker.querySelectorAll(".sp-day").length,
      rangeEmpty: Boolean(picker.querySelector(".sp-range-empty")),
      closed: picker.querySelectorAll(".sp-day[data-closed]").length,
    };
  });

  expect(result.days).toBe(3);
  expect(result.rangeEmpty).toBe(false);
  expect(result.closed).toBe(3);
});

test("day layout marks a closed strip day and panel", async ({ page }) => {
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
      { date: "2026-11-18", slots: [], closed: true },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const strip = picker.querySelector('.sp-strip-day[data-date="2026-11-18"]');
    return {
      strip: strip.hasAttribute("data-closed"),
      stripCount: strip.querySelector(".sp-strip-count").textContent.trim(),
      panel: picker.querySelector(".sp-panel").hasAttribute("data-closed"),
      panelText: picker.querySelector(".sp-panel .sp-day-empty").textContent.trim(),
    };
  });

  expect(result.strip).toBe(true);
  expect(result.stripCount).toBe("Closed");
  expect(result.panel).toBe(true);
  expect(result.panelText).toBe("Closed");
});

test("the demo showcases closed days on a bounded range from today", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(() => {
    const picker = document.querySelector("#picker-closed");
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const startDay = picker.querySelector(`.sp-day[data-date="${today}"]`);
    return {
      min: picker.getAttribute("min"),
      max: picker.getAttribute("max"),
      today,
      startClosed: startDay ? startDay.hasAttribute("data-closed") : false,
      startText: startDay ? startDay.querySelector(".sp-day-empty").textContent.trim() : "",
      closedCount: picker.querySelectorAll(".sp-day[data-closed]").length,
      openSlots: picker.querySelectorAll(".sp-slot").length,
      rangeStart: picker.range.start,
      rangeEnd: picker.range.end,
    };
  });

  // Bounded, starts today, and the starting day is closed by the source.
  expect(result.min).toBe(result.today);
  expect(result.rangeStart).toBe(result.today);
  expect(result.max >= result.rangeEnd).toBe(true);
  expect(result.startClosed).toBe(true);
  expect(result.startText).toBe("Closed");
  expect(result.closedCount).toBeGreaterThan(0);
  expect(result.openSlots).toBeGreaterThan(0);
});

test("navigating the closed-days demo moves between closed and open windows", async ({ page }) => {
  await page.goto("/demo/index.html");
  const picker = page.locator("#picker-closed");
  await expect(picker.locator(".sp-slot").first()).toBeVisible();

  const before = await picker.getAttribute("start");
  await picker.locator(".sp-nav-next").click();
  await expect.poll(async () => picker.getAttribute("start")).not.toBe(before);
  await expect(picker.locator(".sp-day").first()).toBeVisible();
});

test("closed-days=hide removes closed columns but keeps the civil range", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "5");
    picker.setAttribute("closed-days", "hide");
    picker.days = [
      { date: "2026-11-17", slots: [{ start: "09:00" }] },
      { date: "2026-11-18", slots: [], closed: true },
      { date: "2026-11-19", slots: [] },
      { date: "2026-11-20", slots: [], closed: true },
      { date: "2026-11-21", slots: [{ start: "10:00" }] },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);
    return {
      range: picker.range,
      days: picker.querySelectorAll(".sp-day").length,
      dayCountVar: picker.style.getPropertyValue("--_sp-day-count"),
      closedRendered: picker.querySelectorAll(".sp-day[data-closed]").length,
      openEmptyText: picker
        .querySelector('.sp-day[data-date="2026-11-19"] .sp-day-empty')
        ?.textContent.trim(),
    };
  });

  // The civil range is intact, only the projection shrank.
  expect(result.range).toEqual({ start: "2026-11-17", end: "2026-11-21", dayCount: 5 });
  expect(result.days).toBe(3);
  expect(result.dayCountVar).toBe("3");
  expect(result.closedRendered).toBe(0);
  expect(result.openEmptyText).toBe("No availability");
});

test("closed-days=hide on a fully closed range shows the closed range empty state", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("closed-days", "hide");
    picker.days = [
      { date: "2026-11-17", slots: [], closed: true },
      { date: "2026-11-18", slots: [], closed: true },
      { date: "2026-11-19", slots: [], closed: true },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);
    return {
      rangeEmpty: Boolean(picker.querySelector(".sp-range-empty")),
      title: picker.querySelector(".sp-range-empty-title")?.textContent.trim(),
      days: picker.querySelectorAll(".sp-day").length,
    };
  });

  expect(result.rangeEmpty).toBe(true);
  expect(result.title).toBe("Closed during this period");
  expect(result.days).toBe(0);
});

test("toggling closed-days never reloads the source", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "2");
    host.append(picker);
    document.body.append(host);

    let loads = 0;
    picker.source = () => {
      loads++;
      return [
        { date: "2026-11-17", slots: [{ start: "09:00" }] },
        { date: "2026-11-18", slots: [], closed: true },
      ];
    };
    await new Promise((resolve) => setTimeout(resolve, 10));
    const before = loads;

    picker.closedDays = "hide";
    await new Promise(requestAnimationFrame);
    return { before, after: loads, columns: picker.querySelectorAll(".sp-day").length };
  });

  expect(result.after).toBe(result.before);
  expect(result.columns).toBe(1);
});

test("closed-days=hide keeps the consulted closed day in day layout", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "4");
    picker.setAttribute("layout", "day");
    picker.setAttribute("closed-days", "hide");
    picker.setAttribute("active-date", "2026-11-18");
    picker.days = [
      { date: "2026-11-17", slots: [{ start: "09:00" }] },
      { date: "2026-11-18", slots: [], closed: true },
      { date: "2026-11-19", slots: [], closed: true },
      { date: "2026-11-20", slots: [{ start: "10:00" }] },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const stripDates = () =>
      [...picker.querySelectorAll(".sp-strip-day")].map((button) => button.getAttribute("data-date"));
    const before = {
      stripDates: stripDates(),
      panelClosed: picker.querySelector(".sp-panel").hasAttribute("data-closed"),
      panelText: picker.querySelector(".sp-panel .sp-day-empty")?.textContent.trim(),
      activeDate: picker.activeDate,
    };

    picker.querySelector('.sp-strip-day[data-date="2026-11-20"]').click();
    await new Promise(requestAnimationFrame);
    return { before, after: { stripDates: stripDates(), activeDate: picker.activeDate } };
  });

  // The consulted closed day is kept; the other closed day is hidden.
  expect(result.before.stripDates).toEqual(["2026-11-17", "2026-11-18", "2026-11-20"]);
  expect(result.before.panelClosed).toBe(true);
  expect(result.before.panelText).toBe("Closed");
  expect(result.before.activeDate).toBe("2026-11-18");
  // Once another day is consulted, the previously active closed day disappears.
  expect(result.after.stripDates).toEqual(["2026-11-17", "2026-11-20"]);
  expect(result.after.activeDate).toBe("2026-11-20");
});

test("keyboard roving skips hidden closed days", async ({ page }) => {
  await page.goto("/demo/index.html");
  const result = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.style.width = "700px";
    const picker = document.createElement("slot-picker");
    picker.setAttribute("start", "2026-11-17");
    picker.setAttribute("day-count", "3");
    picker.setAttribute("closed-days", "hide");
    picker.days = [
      { date: "2026-11-17", slots: [{ start: "09:00" }] },
      { date: "2026-11-18", slots: [], closed: true },
      { date: "2026-11-19", slots: [{ start: "10:00" }] },
    ];
    host.append(picker);
    document.body.append(host);
    await new Promise(requestAnimationFrame);

    const first = picker.querySelector('.sp-slot[data-value="2026-11-17T09:00"]');
    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await new Promise(requestAnimationFrame);
    const focused = document.activeElement;
    return {
      value: focused instanceof HTMLElement ? focused.getAttribute("data-value") : "",
    };
  });

  expect(result.value).toBe("2026-11-19T10:00");
});

test("the demo toggles closed-days without changing the civil range", async ({ page }) => {
  await page.goto("/demo/index.html");
  const before = await page.evaluate(() => {
    const picker = document.querySelector("#picker-closed");
    return { range: picker.range, columns: picker.querySelectorAll(".sp-day").length };
  });

  await page.selectOption("#closed-days", "hide");
  const after = await page.evaluate(() => {
    const picker = document.querySelector("#picker-closed");
    return {
      range: picker.range,
      columns: picker.querySelectorAll(".sp-day").length,
      attr: picker.getAttribute("closed-days"),
    };
  });

  expect(after.attr).toBe("hide");
  expect(after.range).toEqual(before.range);
  expect(after.columns).toBeLessThan(before.columns);
});
