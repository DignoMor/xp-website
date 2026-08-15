import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertOk,
  breakBuild,
  commitChange,
  createFixture,
  currentTarget,
  destroyFixture,
  expectedText,
  headSha,
  push,
  readActivePage,
} from "./helpers.mjs";

test("push to main publishes production and serves the Foundation page", () => {
  const fixture = createFixture();
  try {
    const sha = headSha(fixture.src);
    assertOk(push(fixture.src, "main"), "git push main");

    const current = currentTarget(fixture.home, "production");
    assert.ok(current, "production current link must exist");
    assert.ok(
      current.includes(sha),
      `production current must identify commit ${sha}, got ${current}`,
    );
    assert.ok(readActivePage(fixture.home, "production").includes(expectedText));
    assert.ok(existsSync(join(fixture.home, "logs")), "logs directory must exist");
  } finally {
    destroyFixture(fixture);
  }
});

test("failed production build leaves the previous current release unchanged", () => {
  const fixture = createFixture();
  try {
    assertOk(push(fixture.src, "main"), "initial push");
    const before = currentTarget(fixture.home, "production");
    assert.ok(before);

    breakBuild(fixture);
    commitChange(fixture.src, "bad");

    // post-receive exit status is ignored by Git; observe deploy failure via
    // unchanged current + structured log outcome.
    push(fixture.src, "main");
    assert.equal(
      currentTarget(fixture.home, "production"),
      before,
      "current must remain on previous release",
    );
    assert.ok(readActivePage(fixture.home, "production").includes(expectedText));

    const log = readFileSync(join(fixture.home, "logs", "deploy.log"), "utf8");
    assert.match(log, /outcome=failure/, "deploy log must record failure");
  } finally {
    destroyFixture(fixture);
  }
});
