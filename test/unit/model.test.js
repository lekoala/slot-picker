import { describe, expect, test } from "bun:test";
import { moveFocus, normalizeDays, slotValue, visibleDays } from "../../src/model.js";

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
      { date: "2026-11-18", slots: [{ start: "11:00" }] }
    ]);
    expect(moveFocus(days, { dayIndex: 0, slotIndex: 2 }, "right")).toEqual({ dayIndex: 1, slotIndex: 0 });
  });
});
