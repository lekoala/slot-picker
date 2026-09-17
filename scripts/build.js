/** Build classic, minified and CSS artifacts. */
import { copyFileSync, mkdirSync } from "node:fs";

const { version } = await Bun.file("package.json").json();
const BANNER = `/*** @lekoala/slot-picker v${version} - https://github.com/lekoala/slot-picker ***/`;
mkdirSync("dist", { recursive: true });

async function bundle(entry, outfile, minify) {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: "dist",
    naming: outfile,
    target: "browser",
    format: "iife",
    minify,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  const file = Bun.file(`dist/${outfile}`);
  await Bun.write(`dist/${outfile}`, `${BANNER}\n${await file.text()}`);
}

await bundle("src/define.js", "slot-picker.js", false);
await bundle("src/define.js", "slot-picker.min.js", true);

copyFileSync("src/slot-picker.css", "dist/slot-picker.css");
const cssResult = await Bun.build({
  entrypoints: ["src/slot-picker.css"],
  outdir: "dist",
  naming: "slot-picker.min.css",
  minify: true,
});
if (!cssResult.success) {
  for (const log of cssResult.logs) console.error(log);
  process.exit(1);
}
