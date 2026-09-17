import { describe, expect, test } from "bun:test";
import { addDays, rangeEnd } from "../../src/date.js";

describe("civil date helpers", () => {
  test("addDays crosses month boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  test("rangeEnd is inclusive", () => {
    expect(rangeEnd("2026-11-17", 5)).toBe("2026-11-21");
  });
});
