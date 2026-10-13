import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MESSAGES,
  getDefaultMessages,
  resolveLocale,
  resolveMessages,
  setDefaultMessages,
} from "../../src/messages.js";

describe("message resolution", () => {
  test("instance overrides win over defaults", () => {
    expect(resolveMessages(null).next).toBe(DEFAULT_MESSAGES.next);
    expect(resolveMessages({ next: "Suivant" }).next).toBe("Suivant");
  });

  test("setDefaultMessages updates the global defaults", () => {
    const previous = getDefaultMessages();
    try {
      setDefaultMessages({ next: "Suivant" });
      expect(getDefaultMessages().next).toBe("Suivant");
      expect(resolveMessages().next).toBe("Suivant");
      expect(resolveMessages({ next: "Encore" }).next).toBe("Encore");
    } finally {
      setDefaultMessages(previous);
    }
    expect(getDefaultMessages().next).toBe(DEFAULT_MESSAGES.next);
  });

  test("getDefaultMessages returns a copy", () => {
    const copy = getDefaultMessages();
    copy.next = "mutated";
    expect(getDefaultMessages().next).toBe(DEFAULT_MESSAGES.next);
  });

  test("non-string overrides never wipe out a default", () => {
    expect(resolveMessages({ previous: undefined }).previous).toBe(DEFAULT_MESSAGES.previous);
    expect(resolveMessages({ next: null }).next).toBe(DEFAULT_MESSAGES.next);
    expect(resolveMessages({ next: 42 }).next).toBe(DEFAULT_MESSAGES.next);
  });

  test("setDefaultMessages ignores non-string values", () => {
    const previous = getDefaultMessages();
    try {
      setDefaultMessages({ next: undefined });
      expect(getDefaultMessages().next).toBe(previous.next);
    } finally {
      setDefaultMessages(previous);
    }
  });
});

describe("locale resolution", () => {
  test("an invalid tag falls through to the next candidate", () => {
    expect(resolveLocale("en_US", "fr")).toBe("fr");
    expect(resolveLocale("en_US", "", "de")).toBe("de");
  });

  test("falls back to en when nothing is usable", () => {
    expect(resolveLocale("en_US", null, undefined, "")).toBe("en");
    expect(resolveLocale()).toBe("en");
  });

  test("canonicalizes a valid tag", () => {
    expect(resolveLocale("en-us")).toBe("en-US");
    expect(resolveLocale("fr")).toBe("fr");
  });
});
