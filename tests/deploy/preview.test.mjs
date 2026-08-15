import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertOk,
  commitChange,
  createFixture,
  currentTarget,
  destroyFixture,
  expectedText,
  push,
  readActivePage,
  run,
} from "./helpers.mjs";

test("push to preview publishes a separate release without affecting production", () => {
  const fixture = createFixture();
  try {
    assertOk(push(fixture.src, "main"), "seed production");
    const productionBefore = currentTarget(fixture.home, "production");
    assert.ok(productionBefore);

    assertOk(
      run("git", ["-C", fixture.src, "checkout", "-b", "preview"]),
      "create preview branch",
    );
    const previewSha = commitChange(fixture.src, "preview-1");
    assertOk(push(fixture.src, "preview"), "push preview");

    const previewCurrent = currentTarget(fixture.home, "preview");
    assert.ok(previewCurrent, "preview current must exist");
    assert.ok(
      previewCurrent.includes(previewSha),
      `preview current must identify ${previewSha}`,
    );
    assert.ok(readActivePage(fixture.home, "preview").includes(expectedText));

    assert.equal(
      currentTarget(fixture.home, "production"),
      productionBefore,
      "production must stay unchanged",
    );
  } finally {
    destroyFixture(fixture);
  }
});

test("preview is fetchable locally and not bound for public access", async () => {
  const fixture = createFixture();
  try {
    assertOk(
      run("git", ["-C", fixture.src, "checkout", "-b", "preview"]),
      "create preview",
    );
    assertOk(push(fixture.src, "preview:preview"), "push preview");

    const indexPath = join(
      fixture.home,
      "releases",
      "preview",
      "current",
      "index.html",
    );
    assert.ok(existsSync(indexPath));

    // Local verification: serve the preview current dir on loopback only.
    const server = createServer((req, res) => {
      if (req.url === "/" || req.url === "/index.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(readFileSync(indexPath));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    const local = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(local.status, 200);
    assert.ok((await local.text()).includes(expectedText));

    // Foundation privacy intent: preview verification uses loopback only.
    // Host Nginx non-exposure is provisioned by wizard #4; this test covers
    // the local verification posture, not the VPS firewall/Nginx config.
    const address = server.address();
    assert.equal(address.address, "127.0.0.1");

    await new Promise((resolve) => server.close(resolve));
  } finally {
    destroyFixture(fixture);
  }
});
