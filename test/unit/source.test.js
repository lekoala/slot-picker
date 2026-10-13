import { describe, expect, test } from "bun:test";
import { SlotSourceController } from "../../src/source.js";

describe("slot source controller", () => {
  test("returns null without a source", async () => {
    const controller = new SlotSourceController();
    expect(await controller.load({ start: "2026-11-17", end: "2026-11-21", dayCount: 5 })).toBeNull();
    expect(await controller.next({ after: "2026-11-21" })).toBeNull();
  });

  test("a superseded next() honoring the signal resolves to null", async () => {
    const controller = new SlotSourceController();
    let firstSignal;
    controller.source = {
      load: () => [],
      next: ({ signal }) => {
        firstSignal = signal;
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      },
    };

    const first = controller.next({ after: "2026-11-21" });
    expect(firstSignal.aborted).toBe(false);
    controller.source = { load: () => [], next: () => "2026-12-10" };
    // Replacing the source aborts the in-flight `next()`: the stale call
    // resolves to null instead of rejecting with AbortError.
    await expect(first).resolves.toBeNull();
    await expect(controller.next({ after: "2026-11-21" })).resolves.toBe("2026-12-10");
  });

  test("a superseding next() call aborts the previous one into null", async () => {
    const controller = new SlotSourceController();
    controller.source = {
      load: () => [],
      next: ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    };

    const first = controller.next({ after: "2026-11-21" });
    // A second call supersedes the first without replacing the source.
    const second = controller.next({ after: "2026-11-21" });
    await expect(first).resolves.toBeNull();
    // The second call is still pending: abort it to settle the test.
    controller.abort();
    await expect(second).resolves.toBeNull();
  });
});
