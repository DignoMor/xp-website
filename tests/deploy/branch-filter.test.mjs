import assert from "node:assert/strict";
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

test("pushing a non-deploy branch stores the ref but changes no environment", () => {
  const fixture = createFixture();
  try {
    assertOk(push(fixture.src, "main"), "seed production");
    const productionBefore = currentTarget(fixture.home, "production");
    const previewBefore = currentTarget(fixture.home, "preview");

    assertOk(
      run("git", ["-C", fixture.src, "checkout", "-b", "feature/x"]),
      "create feature branch",
    );
    const sha = commitChange(fixture.src, "feature");
    assertOk(push(fixture.src, "feature/x"), "push feature");

    assert.equal(currentTarget(fixture.home, "production"), productionBefore);
    assert.equal(currentTarget(fixture.home, "preview"), previewBefore);

    const stored = run("git", ["--git-dir", fixture.bare, "rev-parse", "refs/heads/feature/x"]);
    assertOk(stored, "feature ref stored in bare repo");
    assert.equal(stored.stdout.trim(), sha);
  } finally {
    destroyFixture(fixture);
  }
});

test("deleting a branch ref triggers no deployment and removes no release", () => {
  const fixture = createFixture();
  try {
    assertOk(push(fixture.src, "main"), "seed production");
    const productionBefore = currentTarget(fixture.home, "production");
    assert.ok(productionBefore);

    assertOk(
      run("git", ["-C", fixture.src, "checkout", "-b", "preview"]),
      "create preview",
    );
    assertOk(push(fixture.src, "preview"), "seed preview");
    const previewBefore = currentTarget(fixture.home, "preview");
    assert.ok(previewBefore);

    // Delete preview branch on the bare remote.
    const result = run("git", ["-C", fixture.src, "push", "deploy", ":preview"]);
    assertOk(result, "delete preview ref");

    assert.equal(currentTarget(fixture.home, "production"), productionBefore);
    assert.equal(currentTarget(fixture.home, "preview"), previewBefore);
  } finally {
    destroyFixture(fixture);
  }
});
