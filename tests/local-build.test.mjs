import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const expectedText = "This is my personal website.";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

test("local build produces a static index with the Foundation Release text", () => {
  run("npm", ["ci"]);
  run("npm", ["run", "check"]);
  run("npm", ["run", "build"]);

  const indexPath = join(root, "dist", "index.html");
  assert.ok(existsSync(indexPath), "dist/index.html must exist");

  const html = readFileSync(indexPath, "utf8");
  assert.match(html, /<html[\s>]/i, "index must be a valid HTML document");
  assert.match(html, /<title>[\s\S]*?<\/title>/i, "index must include a title");
  assert.ok(
    html.includes(expectedText),
    `index must contain exact text ${JSON.stringify(expectedText)}`,
  );

  // No client-side JS frameworks: Astro may emit empty/module stubs, but no
  // framework runtime bundles should appear in dist.
  const distFiles = collectFiles(join(root, "dist"));
  const jsFiles = distFiles.filter((f) => f.endsWith(".js"));
  for (const file of jsFiles) {
    const body = readFileSync(file, "utf8");
    assert.doesNotMatch(
      body,
      /\b(react|preact|vue|svelte|solid-js)\b/i,
      `${file} must not bundle a UI framework`,
    );
  }
});

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(path));
    else out.push(path);
  }
  return out;
}
