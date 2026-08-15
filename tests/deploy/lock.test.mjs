import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertOk,
  commitChange,
  createFixture,
  currentTarget,
  destroyFixture,
  push,
  run,
} from "./helpers.mjs";

function pushAsync(src, refspec) {
  return new Promise((resolve) => {
    const child = spawn("git", ["-C", src, "push", "deploy", refspec], {
      encoding: "utf8",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("overlapping deployments are serialized by a single lock", async () => {
  const fixture = createFixture();
  try {
    assertOk(push(fixture.src, "main"), "seed production");

    writeFileSync(
      fixture.buildCmd,
      `#!/usr/bin/env bash
set -euo pipefail
out="\${1:?}"
sleep 2
rm -rf "\${out}"
mkdir -p "\${out}"
cp -a "${fixture.artifact}/." "\${out}/"
`,
    );
    chmodSync(fixture.buildCmd, 0o755);

    assertOk(
      run("git", ["-C", fixture.src, "checkout", "-b", "preview"]),
      "create preview",
    );
    commitChange(fixture.src, "preview-overlap");

    assertOk(run("git", ["-C", fixture.src, "checkout", "main"]), "checkout main");
    commitChange(fixture.src, "prod-overlap");

    const productionPush = pushAsync(fixture.src, "main");
    // Start preview while production deploy still holds the lock.
    await new Promise((r) => setTimeout(r, 200));
    const previewPush = pushAsync(fixture.src, "preview:preview");

    const [prodResult, previewResult] = await Promise.all([
      productionPush,
      previewPush,
    ]);
    assertOk(prodResult, "production push");
    assertOk(previewResult, "preview push");

    assert.ok(currentTarget(fixture.home, "production"));
    assert.ok(currentTarget(fixture.home, "preview"));

    const log = readFileSync(join(fixture.home, "logs", "deploy.log"), "utf8");
    assert.match(log, /stage=lock.*outcome=waiting|outcome=waiting/, "waiter must be logged");
    assert.match(log, /outcome=acquired/, "lock acquisition must be logged");
  } finally {
    destroyFixture(fixture);
  }
});
