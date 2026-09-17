import { describe, expect, test } from "bun:test";
import { noticeBlock, noticeIndicator, slotButton } from "../../src/views/shared.js";

describe("day notice rendering", () => {
  test("renders a non-interactive block with label and description", () => {
    const html = noticeBlock({ label: "Late opening", description: "Doors open at 10:00." });
    expect(html).toContain('class="sp-day-notice"');
    expect(html).toContain("sp-day-notice-label");
    expect(html).toContain("Late opening");
    expect(html).toContain("Doors open at 10:00.");
    // Displayed text never activates: no control, no day index.
    expect(html).not.toContain("<button");
    expect(html).not.toContain("data-day-index");
  });

  test("omits the description when absent", () => {
    const html = noticeBlock({ label: "Unavailable" });
    expect(html).toContain("sp-day-notice-label");
    expect(html).not.toContain("sp-day-notice-description");
  });

  test("escapes notice content", () => {
    const html = noticeBlock({ label: '<img src=x onerror="1">', description: "a & b" });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("a &amp; b");
  });

  test("the default indicator is a decorative span, never a control", () => {
    const html = noticeIndicator();
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("sp-notice-dot");
    expect(html).not.toContain("<button");
  });

  test("the interactive indicator is the only control and carries a title", () => {
    const html = noticeIndicator({
      interactive: true,
      dayIndex: 3,
      label: "Late opening",
      description: "Doors open at 10:00.",
    });
    expect(html).toContain("<button");
    expect(html).toContain('data-day-index="3"');
    expect(html).toContain('aria-label="Doors open at 10:00."');
    expect(html).toContain('title="Late opening"');
    // The control itself is exposed; only its inner dot is hidden.
    expect(html).not.toMatch(/<button[^>]*aria-hidden/);
  });

  test("the interactive indicator falls back to the label without a description", () => {
    const html = noticeIndicator({ interactive: true, dayIndex: 0, label: "Unavailable" });
    expect(html).toContain('aria-label="Unavailable"');
  });
});

describe("slot button semantics", () => {
  test("exposes option semantics backed by aria-selected", () => {
    const html = slotButton({
      date: "2026-11-17",
      slot: { start: "10:00" },
      dayIndex: 0,
      slotIndex: 1,
      selected: true,
      tabbed: true,
    });
    expect(html).toContain('role="option"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('data-value="2026-11-17T10:00"');
  });

  test("an unselected slot is not selected and takes no tab stop", () => {
    const html = slotButton({
      date: "2026-11-17",
      slot: { start: "10:00" },
      dayIndex: 0,
      slotIndex: 0,
      selected: false,
      tabbed: false,
    });
    expect(html).toContain('aria-selected="false"');
    expect(html).toContain('tabindex="-1"');
  });

  test("surfaces a neutral tone as data-tone", () => {
    const html = slotButton({
      date: "2026-11-17",
      slot: { start: "10:00", tone: "video" },
      dayIndex: 0,
      slotIndex: 0,
      selected: false,
      tabbed: false,
    });
    expect(html).toContain('data-tone="video"');
  });

  test("omits data-tone without a tone and escapes its value", () => {
    const plain = slotButton({
      date: "2026-11-17",
      slot: { start: "10:00" },
      dayIndex: 0,
      slotIndex: 0,
      selected: false,
      tabbed: false,
    });
    expect(plain).not.toContain("data-tone");

    const escaped = slotButton({
      date: "2026-11-17",
      slot: { start: "10:00", tone: 'a"b' },
      dayIndex: 0,
      slotIndex: 0,
      selected: false,
      tabbed: false,
    });
    expect(escaped).toContain('data-tone="a&quot;b"');
  });

  test("a disabled slot stays discoverable as a disabled option", () => {
    const html = slotButton({
      date: "2026-11-17",
      slot: { start: "10:00", disabled: true },
      dayIndex: 0,
      slotIndex: 0,
      selected: false,
      tabbed: false,
    });
    expect(html).toContain('role="option"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain(" disabled");
  });
});
