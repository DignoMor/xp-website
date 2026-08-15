import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertOk,
  createFixture,
  destroyFixture,
  headSha,
  push,
} from "./helpers.mjs";

test("deploy log records env, ref, full commit, stages, and outcome without secrets", () => {
  const fixture = createFixture();
  try {
    const sha = headSha(fixture.src);
    assertOk(push(fixture.src, "main"), "push main");

    const log = readFileSync(join(fixture.home, "logs", "deploy.log"), "utf8");
    assert.match(log, /stage=start/);
    assert.match(log, /env=production/);
    assert.match(log, /ref=refs\/heads\/main/);
    assert.match(log, new RegExp(`commit=${sha}`));
    assert.match(log, /stage=checkout/);
    assert.match(log, /stage=build/);
    assert.match(log, /stage=validate/);
    assert.match(log, /stage=activate/);
    assert.match(log, /outcome=success/);
    assert.doesNotMatch(log, /password|secret|BEGIN (RSA |OPENSSH )?PRIVATE KEY/i);
  } finally {
    destroyFixture(fixture);
  }
});
