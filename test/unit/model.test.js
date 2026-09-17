import { describe, expect, test } from "bun:test";
import {
  collapsedDays,
  moveFocus,
  normalizeDays,
  resolveActiveDate,
  slotValue,
  visibleDays,
} from "../../src/model.js";

describe("slot model", () => {
  test("normalizes days and sorts slots", () => {
    const [day] = normalizeDays([{ date: "2026-11-17", slots: [{ start: "19:00" }, { start: "08:00" }] }]);
    expect(day.slots.map((slot) => slot.start)).toEqual(["08:00", "19:00"]);
  });

  test("fills empty visible days", () => {
    const days = visibleDays([{ date: "2026-11-18", slots: [] }], "2026-11-17", 3);
    expect(days.map((day) => day.date)).toEqual(["2026-11-17", "2026-11-18", "2026-11-19"]);
  });

  test("uses local datetime values", () => {
    expect(slotValue("2026-11-17", "13:35")).toBe("2026-11-17T13:35");
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
