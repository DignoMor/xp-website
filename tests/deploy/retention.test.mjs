import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { test } from "node:test";
import {
  assertOk,
  commitChange,
  createFixture,
  currentTarget,
  destroyFixture,
  expectedText,
  headSha,
  push,
  readActivePage,
  run,
  repoRoot,
} from "./helpers.mjs";

function releaseNames(home, env) {
  const dir = join(home, "releases", env);
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^[0-9a-f]{40}$/.test(e.name))
    .map((e) => e.name);
}

test("rollback atomically repoints current to a retained release without rebuilding", () => {
  const fixture = createFixture();
  try {
    assertOk(push(fixture.src, "main"), "first release");
    const first = headSha(fixture.src);
    const firstPath = currentTarget(fixture.home, "production");

    commitChange(fixture.src, "second");
    assertOk(push(fixture.src, "main"), "second release");
    const second = headSha(fixture.src);
    assert.ok(currentTarget(fixture.home, "production").includes(second));

    const result = run(
      "bash",
      [join(repoRoot, "scripts/deploy/rollback.sh"), "production", first],
      { env: { XP_WEBSITE_HOME: fixture.home, XP_WEBSITE_REPO_ROOT: repoRoot } },
    );
    assertOk(result, "rollback");

    const after = currentTarget(fixture.home, "production");
    assert.ok(after.includes(first), `rolled back to ${first}, got ${after}`);
    assert.equal(after, firstPath);
    assert.ok(readActivePage(fixture.home, "production").includes(expectedText));
  } finally {
    destroyFixture(fixture);
  }
});

test("retention keeps five newest successful releases and never removes active", () => {
  const fixture = createFixture();
  try {
    const shas = [];
    assertOk(push(fixture.src, "main"), "release 1");
    shas.push(headSha(fixture.src));

    for (let i = 2; i <= 7; i += 1) {
      commitChange(fixture.src, `release-${i}`);
      assertOk(push(fixture.src, "main"), `release ${i}`);
      shas.push(headSha(fixture.src));
    }

    const kept = releaseNames(fixture.home, "production");
    assert.equal(kept.length, 5, `expected 5 retained releases, got ${kept.length}`);

    const activeSha = basename(currentTarget(fixture.home, "production"));
    assert.ok(kept.includes(activeSha), "active release must be retained");

    // Oldest inactive releases beyond five should be gone.
    assert.equal(existsSync(join(fixture.home, "releases", "production", shas[0])), false);
    assert.equal(existsSync(join(fixture.home, "releases", "production", shas[1])), false);
    assert.ok(existsSync(join(fixture.home, "releases", "production", shas[6])));
  } finally {
    destroyFixture(fixture);
  }
});

test("activation switches from one complete release to another", () => {
  const fixture = createFixture();
  try {
    assertOk(push(fixture.src, "main"), "first");
    const first = currentTarget(fixture.home, "production");
    assert.ok(existsSync(join(first, "index.html")));

    commitChange(fixture.src, "next");
    assertOk(push(fixture.src, "main"), "second");
    const second = currentTarget(fixture.home, "production");
    assert.notEqual(first, second);
    assert.ok(existsSync(join(second, "index.html")));
    assert.equal(existsSync(join(fixture.home, "releases", "production", "current.new")), false);
  } finally {
    destroyFixture(fixture);
  }
});
