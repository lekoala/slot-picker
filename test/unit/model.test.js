import { describe, expect, test } from "bun:test";
import {
  boundedDayCount,
  clampStart,
  collapsedDays,
  ensureVisible,
  hasDayContent,
  hasSlots,
  isSlotValue,
  isValidRange,
  moveFocus,
  normalizeBreakpoints,
  normalizeDays,
  RESPONSIVE_BREAKPOINTS,
  resolveActiveDate,
  resolveVisibleDayCount,
  slotValue,
  visibleDays,
} from "../../src/model.js";

describe("slot model", () => {
  test("normalizes days and sorts slots", () => {
    const [day] = normalizeDays([{ date: "2026-11-17", slots: [{ start: "19:00" }, { start: "08:00" }] }]);
    expect(day.slots.map((slot) => slot.start)).toEqual(["08:00", "19:00"]);
  });

  test("rejects duplicate slot starts within a day", () => {
    expect(() =>
      normalizeDays([{ date: "2026-11-17", slots: [{ start: "10:00" }, { start: "10:00" }] }]),
    ).toThrow(/Duplicate slot: 2026-11-17T10:00/);
    // The same time on another day stays legitimate.
    expect(() =>
      normalizeDays([
        { date: "2026-11-17", slots: [{ start: "10:00" }] },
        { date: "2026-11-18", slots: [{ start: "10:00" }] },
      ]),
    ).not.toThrow();
  });

  test("fills empty visible days", () => {
    const days = visibleDays([{ date: "2026-11-18", slots: [] }], "2026-11-17", 3);
    expect(days.map((day) => day.date)).toEqual(["2026-11-17", "2026-11-18", "2026-11-19"]);
  });

  test("uses local datetime values", () => {
    expect(slotValue("2026-11-17", "13:35")).toBe("2026-11-17T13:35");
  });

  test("isSlotValue checks form and civil reality", () => {
    expect(isSlotValue("2026-11-17T13:35")).toBe(true);
    expect(isSlotValue("2026-02-28T00:00")).toBe(true);
    // Impossible civil date: the shape alone is not enough.
    expect(isSlotValue("2026-02-31T10:00")).toBe(false);
    expect(isSlotValue("2026-11-17T24:00")).toBe(false);
    expect(isSlotValue("2026-11-17T10:60")).toBe(false);
    expect(isSlotValue("2026-11-17")).toBe(false);
    expect(isSlotValue("")).toBe(false);
  });

  test("moves horizontally to nearest row in adjacent day", () => {
    const days = normalizeDays([
      { date: "2026-11-17", slots: [{ start: "08:00" }, { start: "09:00" }, { start: "10:00" }] },
      { date: "2026-11-18", slots: [{ start: "11:00" }] },
    ]);
    expect(moveFocus(days, { dayIndex: 0, slotIndex: 2 }, "right")).toEqual({ dayIndex: 1, slotIndex: 0 });
  });

  test("resolveActiveDate is civil-only", () => {
    expect(resolveActiveDate("2026-11-17", 5, "")).toBe("2026-11-17");
    expect(resolveActiveDate("2026-11-17", 5, "2026-11-19")).toBe("2026-11-19");
    expect(resolveActiveDate("2026-11-17", 5, "2026-11-10")).toBe("2026-11-17");
    expect(resolveActiveDate("2026-11-17", 5, "2026-12-01")).toBe("2026-11-21");
  });

  test("skips disabled slots", () => {
    const days = normalizeDays([
      { date: "2026-11-17", slots: [{ start: "08:00" }, { start: "09:00", disabled: true }] },
      { date: "2026-11-18", slots: [{ start: "11:00", disabled: true }] },
      { date: "2026-11-19", slots: [{ start: "12:00" }] },
    ]);
    expect(moveFocus(days, { dayIndex: 0, slotIndex: 0 }, "down")).toEqual({ dayIndex: 0, slotIndex: 0 });
    expect(moveFocus(days, { dayIndex: 0, slotIndex: 0 }, "right")).toEqual({ dayIndex: 2, slotIndex: 0 });
    expect(moveFocus(days, { dayIndex: 0, slotIndex: 0 }, "end")).toEqual({ dayIndex: 0, slotIndex: 0 });
  });

  test("collapses to the first visible rows without losing the model", () => {
    const days = normalizeDays([
      { date: "2026-11-17", slots: [{ start: "08:00" }, { start: "09:00" }, { start: "10:00" }] },
      { date: "2026-11-18", slots: [{ start: "11:00" }] },
    ]);

    const collapsed = collapsedDays(days, 2, false);
    expect(collapsed.rows).toBe(2);
    expect(collapsed.hasOverflow).toBe(true);
    expect(collapsed.days[0].slots.map((slot) => slot.start)).toEqual(["08:00", "09:00"]);

    const expanded = collapsedDays(days, 2, true);
    expect(expanded.rows).toBe(3);
    expect(expanded.hasOverflow).toBe(true);
    expect(expanded.days[0].slots).toHaveLength(3);

    expect(days[0].slots).toHaveLength(3);
  });

  test("focus movement stays inside collapsed rows", () => {
    const all = normalizeDays([
      { date: "2026-11-17", slots: [{ start: "08:00" }, { start: "09:00" }, { start: "10:00" }] },
    ]);
    const collapsed = collapsedDays(all, 2, false).days;

    // Row 3 exists in the model but is not rendered: focus must not leave the grid.
    expect(moveFocus(collapsed, { dayIndex: 0, slotIndex: 1 }, "down")).toEqual({
      dayIndex: 0,
      slotIndex: 1,
    });
    expect(moveFocus(all, { dayIndex: 0, slotIndex: 1 }, "down")).toEqual({ dayIndex: 0, slotIndex: 2 });
  });
});

describe("bounded and responsive navigation", () => {
  test("isValidRange rejects min > max only", () => {
    expect(isValidRange("", "")).toBe(true);
    expect(isValidRange("2026-11-17", "2026-11-21")).toBe(true);
    expect(isValidRange("2026-11-21", "2026-11-17")).toBe(false);
  });

  test("boundedDayCount shrinks to the available interval", () => {
    expect(boundedDayCount(5, "2026-11-17", "2026-11-19")).toBe(3);
    expect(boundedDayCount(5, "2026-11-17", "2026-11-21")).toBe(5);
    expect(boundedDayCount(5, "", "")).toBe(5);
  });

  test("boundedDayCount is 0 for invalid bounds", () => {
    expect(boundedDayCount(5, "2026-11-21", "2026-11-17")).toBe(0);
  });

  test("resolveVisibleDayCount follows the ladder and caps at the request", () => {
    expect(resolveVisibleDayCount(7, 700)).toBe(5);
    expect(resolveVisibleDayCount(7, 500)).toBe(4);
    expect(resolveVisibleDayCount(7, 380)).toBe(3);
    expect(resolveVisibleDayCount(7, 280)).toBe(2);
    expect(resolveVisibleDayCount(7, 100)).toBe(1);
    expect(resolveVisibleDayCount(2, 700)).toBe(2);
    expect(resolveVisibleDayCount(0, 700)).toBe(0);
    // Measured thresholds: each step keeps a column around 110px wide.
    expect(RESPONSIVE_BREAKPOINTS[0].minWidth).toBe(600);
    expect(resolveVisibleDayCount(7, 600)).toBe(5);
    expect(resolveVisibleDayCount(7, 599)).toBe(4);
    expect(resolveVisibleDayCount(7, 260)).toBe(2);
    expect(resolveVisibleDayCount(7, 259)).toBe(1);
  });

  test("normalizeBreakpoints sorts descending and clamps counts", () => {
    const ladder = normalizeBreakpoints([
      { minWidth: 0, dayCount: 3 },
      { minWidth: 700, dayCount: 40 },
    ]);
    expect(ladder.map((entry) => entry.minWidth)).toEqual([700, 0]);
    expect(ladder[0].dayCount).toBe(14);
    expect(resolveVisibleDayCount(7, 900, ladder)).toBe(7);
    expect(resolveVisibleDayCount(7, 100, ladder)).toBe(3);
  });

  test("clampStart never leaves the bounds", () => {
    expect(clampStart("2026-11-01", "2026-11-17", "2026-11-21", 5)).toBe("2026-11-17");
    expect(clampStart("2026-12-01", "2026-11-17", "2026-11-21", 5)).toBe("2026-11-17");
    // Window wider than the interval: pin to min, never below it.
    expect(clampStart("2026-11-19", "2026-11-17", "2026-11-19", 5)).toBe("2026-11-17");
  });

  test("ensureVisible keeps start when the date is visible", () => {
    expect(ensureVisible("2026-11-17", 5, "2026-11-20", "", "")).toBe("2026-11-17");
  });

  test("ensureVisible shifts just enough to preserve activeDate on shrink", () => {
    // 17..21 with active = 20, shrinking to 3 days must yield 18..20.
    expect(ensureVisible("2026-11-17", 3, "2026-11-20", "", "")).toBe("2026-11-18");
    // Active at start: no shift.
    expect(ensureVisible("2026-11-17", 3, "2026-11-17", "", "")).toBe("2026-11-17");
  });

  test("ensureVisible respects bounds when aligning", () => {
    expect(ensureVisible("2026-11-21", 2, "2026-11-21", "2026-11-17", "2026-11-21")).toBe("2026-11-20");
    expect(ensureVisible("2026-11-17", 5, "2026-11-17", "2026-11-17", "2026-11-19")).toBe("2026-11-17");
  });

  test("hasSlots and hasDayContent differ on notice-only days", () => {
    const empty = normalizeDays([{ date: "2026-11-17", slots: [] }]);
    const notice = normalizeDays([
      { date: "2026-11-17", slots: [], notice: { label: "Exceptionally unavailable" } },
    ]);
    const bookable = normalizeDays([{ date: "2026-11-17", slots: [{ start: "09:00" }] }]);

    expect(hasSlots(empty)).toBe(false);
    expect(hasDayContent(empty)).toBe(false);
    expect(hasSlots(notice)).toBe(false);
    expect(hasDayContent(notice)).toBe(true);
    expect(hasSlots(bookable)).toBe(true);
  });
});
