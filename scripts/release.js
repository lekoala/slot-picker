/**
 * Cut a release: bump, verify, rebuild, commit, tag, publish.
 *
 * Package-manager lifecycle hooks are not a reliable guard here: npm skips
 * every script when `ignore-scripts` is set (the right default against
 * dependency install scripts), `bun publish` does not run `prepublishOnly`,
 * and `bun pm version` runs hooks with a PATH that cannot find `git`. So the
 * whole release lives in one command instead of being spread across hooks
 * that may silently not fire.
 *
 * Usage:
 *   bun run release patch|minor|major|<version> [--no-publish] [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const BRANCH = "master";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const publish = !args.includes("--no-publish");
const bump = args.find((arg) => !arg.startsWith("--")) ?? "patch";

/** @param {string} message */
function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

/** @param {string} command @param {string[]} commandArgs */
function run(command, commandArgs) {
  return execFileSync(command, commandArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

/** @param {string} command @param {string[]} commandArgs */
function step(command, commandArgs) {
  console.log(`\n> ${command} ${commandArgs.join(" ")}`);
  if (dryRun) return;
  execFileSync(command, commandArgs, { stdio: "inherit" });
}

/** @param {string} current */
function nextVersion(current) {
  if (VERSION_RE.test(bump)) return bump;
  const match = VERSION_RE.exec(current);
  if (!match) fail(`cannot bump a non-semver version: ${current}`);
  const [major, minor, patch] = /** @type {RegExpExecArray} */ (match).slice(1).map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  return fail(`unknown bump "${bump}": use patch, minor, major or an exact version`);
}

// A release must describe a commit, so nothing may be left behind: the
// published tarball is built from the working tree, not from the tag.
if (run("git", ["status", "--porcelain"]).trim()) fail("working tree is not clean");
const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
if (branch !== BRANCH) fail(`on branch ${branch}, expected ${BRANCH}`);

const manifestPath = new URL("../package.json", import.meta.url);
const manifest = readFileSync(manifestPath, "utf8");
const current = JSON.parse(manifest).version;
const version = nextVersion(current);
if (run("git", ["tag", "--list", version]).trim()) fail(`tag ${version} already exists`);
console.log(`release: ${current} -> ${version}${dryRun ? " (dry run)" : ""}`);

step("bun", ["run", "check"]);

// Bump first, then rebuild: the bundle banner carries the version, so the
// committed artifact and the published one can never disagree again.
if (!dryRun) {
  const bumped = manifest.replace(/("version":\s*)"[^"]+"/, `$1"${version}"`);
  if (bumped === manifest) fail("could not rewrite the version field");
  writeFileSync(manifestPath, bumped);
}
step("bun", ["run", "build"]);

const artifacts = ["package.json", "dist/slot-picker.js", "dist/slot-picker.css"];
step("git", ["add", ...artifacts]);
step("git", ["commit", "-m", version]);
step("git", ["tag", version]);

if (publish) step("npm", ["publish", ...(dryRun ? ["--dry-run"] : [])]);

console.log(`\nrelease: ${version} tagged${publish && !dryRun ? " and published" : ""}.`);
console.log("Next: git push --follow-tags");
if (!publish) console.log(`Then:  npm publish   (from this commit, ${version})`);
