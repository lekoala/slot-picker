import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MESSAGES,
  getDefaultMessages,
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
});
