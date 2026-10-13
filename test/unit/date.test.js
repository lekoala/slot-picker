import { describe, expect, test } from "bun:test";
import { addDays, daysBetween, isDateValue, rangeEnd } from "../../src/date.js";

describe("civil date helpers", () => {
  test("addDays crosses month boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  test("rangeEnd is inclusive", () => {
    expect(rangeEnd("2026-11-17", 5)).toBe("2026-11-21");
  });

  test("daysBetween is signed and timezone-free", () => {
    expect(daysBetween("2026-11-17", "2026-11-21")).toBe(4);
    expect(daysBetween("2026-11-21", "2026-11-17")).toBe(-4);
    expect(daysBetween("2026-03-01", "2026-02-28")).toBe(-1);
  });

  test("years 0-99 validate instead of mapping to 1900s", () => {
    expect(isDateValue("0099-01-01")).toBe(true);
    expect(isDateValue("0005-02-29")).toBe(false);
    expect(isDateValue("0004-02-29")).toBe(true);
  });

  test("addDays keeps exact years below 100 across boundaries", () => {
    expect(addDays("0005-01-01", -1)).toBe("0004-12-31");
    expect(addDays("0004-12-31", 1)).toBe("0005-01-01");
  });
});
