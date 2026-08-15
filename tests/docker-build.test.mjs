import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const expectedText = "This is my personal website.";
const outDir = mkdtempSync(join(tmpdir(), "xp-website-docker-build-"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

test("pinned container build exports a validated static artifact only", () => {
  try {
    run("bash", ["scripts/docker-build.sh", outDir]);

    const indexPath = join(outDir, "index.html");
    assert.ok(existsSync(indexPath), "exported artifact must include index.html");
    const html = readFileSync(indexPath, "utf8");
    assert.ok(html.includes(expectedText), "exported index must include Foundation text");

    // Build tools must not be present in the exported artifact.
    assert.equal(existsSync(join(outDir, "node_modules")), false);
    assert.equal(existsSync(join(outDir, "package.json")), false);
    assert.equal(existsSync(join(outDir, "package-lock.json")), false);

    // Dockerfile must pin the Node image by digest.
    const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
    assert.match(
      dockerfile,
      /^FROM\s+node:[^\s]+@sha256:[a-f0-9]{64}/m,
      "Dockerfile must pin node image by version and digest",
    );

    // Container is a build adapter only — no long-running serve instruction.
    assert.doesNotMatch(
      dockerfile,
      /^\s*(CMD|ENTRYPOINT)\b/m,
      "Dockerfile must not define a serve CMD/ENTRYPOINT",
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
