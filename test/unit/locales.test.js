import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULT_MESSAGES } from "../../src/messages.js";

const localeDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/locales");
const localeFiles = readdirSync(localeDir)
  .filter((file) => file.endsWith(".js"))
  .sort();

const expectedKeys = Object.keys(DEFAULT_MESSAGES).sort();

for (const file of localeFiles) {
  const name = path.basename(file, ".js");
  const importLocale = async () => (await import(pathToFileURL(path.join(localeDir, file)).href)).default;

  test(`locale ${name} mirrors the default message keys`, async () => {
    const locale = await importLocale();
    expect(Object.keys(locale).sort()).toEqual(expectedKeys);
  });

  test(`locale ${name} has no empty strings`, async () => {
    const locale = await importLocale();
    for (const [key, value] of Object.entries(locale)) {
      expect(`${value}`.trim(), `${name}.${key}`).not.toBe("");
    }
  });

  test(`locale ${name} preserves message placeholders`, async () => {
    const locale = await importLocale();
    expect(locale.manySlots).toContain("{n}");
    expect(locale.rangeEmptyDescription).toContain("{start}");
    expect(locale.rangeEmptyDescription).toContain("{end}");
  });
}
