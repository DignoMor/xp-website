import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const expectedText = "This is my personal website.";

export function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    input: options.input,
    cwd: options.cwd,
  });
}

export function assertOk(result, label) {
  assert.equal(
    result.status,
    0,
    `${label} failed (${result.status}):\n${result.stdout}\n${result.stderr}`,
  );
}

export function createFixture(options = {}) {
  const scratch = join(repoRoot, ".tmp");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "xp-website-deploy-"));
  const bare = join(root, "bare.git");
  const home = join(root, "home");
  const src = join(root, "src");
  const artifact = join(root, "good-artifact");

  mkdirSync(home, { recursive: true });
  mkdirSync(artifact, { recursive: true });
  writeFileSync(
    join(artifact, "index.html"),
    `<!doctype html><html><head><title>Personal website</title></head><body><p>${expectedText}</p></body></html>\n`,
  );

  const buildCmd = join(root, "fake-build.sh");
  writeFileSync(
    buildCmd,
    `#!/usr/bin/env bash
set -euo pipefail
out="\${1:?}"
# Optional source dir (ignored by the fixture adapter; real docker-build uses it).
_source="\${2:-}"
rm -rf "\${out}"
mkdir -p "\${out}"
cp -a "${artifact}/." "\${out}/"
`,
  );
  chmodSync(buildCmd, 0o755);

  assertOk(run("git", ["init", "--bare", bare]), "git init --bare");
  mkdirSync(join(bare, "hooks"), { recursive: true });
  const hook = join(bare, "hooks", "post-receive");
  writeFileSync(
    hook,
    `#!/usr/bin/env bash
set -euo pipefail
export XP_WEBSITE_HOME="${home}"
export XP_WEBSITE_BUILD_CMD="${buildCmd}"
export XP_WEBSITE_REPO_ROOT="${repoRoot}"
exec bash "${repoRoot}/scripts/deploy/post-receive.sh"
`,
  );
  chmodSync(hook, 0o755);

  assertOk(run("git", ["init", src]), "git init src");
  assertOk(
    run("git", ["-C", src, "config", "user.email", "test@example.com"]),
    "git config email",
  );
  assertOk(
    run("git", ["-C", src, "config", "user.name", "Test"]),
    "git config name",
  );
  // Default to main for the first commit.
  assertOk(
    run("git", ["-C", src, "checkout", "-b", "main"]),
    "git checkout -b main",
  );
  writeFileSync(join(src, "README.md"), "foundation\n");
  assertOk(run("git", ["-C", src, "add", "README.md"]), "git add");
  assertOk(run("git", ["-C", src, "commit", "-m", "init"]), "git commit");
  assertOk(
    run("git", ["-C", src, "remote", "add", "deploy", bare]),
    "git remote add",
  );

  if (options.seedProduction) {
    assertOk(push(src, "main"), "seed production");
  }

  return { root, bare, home, src, buildCmd, artifact, expectedText };
}

export function push(src, refspec) {
  return run("git", ["-C", src, "push", "deploy", refspec]);
}

export function headSha(src, ref = "HEAD") {
  const result = run("git", ["-C", src, "rev-parse", ref]);
  assertOk(result, `rev-parse ${ref}`);
  return result.stdout.trim();
}

export function currentTarget(home, env) {
  const link = join(home, "releases", env, "current");
  if (!existsSync(link)) return null;
  return realpathSync(link);
}

export function readActivePage(home, env) {
  const index = join(home, "releases", env, "current", "index.html");
  assert.ok(existsSync(index), `${env} current index missing`);
  return readFileSync(index, "utf8");
}

export function destroyFixture(fixture) {
  rmSync(fixture.root, { recursive: true, force: true });
}

export function breakBuild(fixture) {
  writeFileSync(
    fixture.buildCmd,
    `#!/usr/bin/env bash
echo "boom" >&2
exit 1
`,
  );
  chmodSync(fixture.buildCmd, 0o755);
}

export function restoreBuild(fixture) {
  writeFileSync(
    fixture.buildCmd,
    `#!/usr/bin/env bash
set -euo pipefail
out="\${1:?}"
_source="\${2:-}"
rm -rf "\${out}"
mkdir -p "\${out}"
cp -a "${fixture.artifact}/." "\${out}/"
`,
  );
  chmodSync(fixture.buildCmd, 0o755);
}

export function commitChange(src, message) {
  writeFileSync(join(src, "README.md"), `${message}\n${Date.now()}\n`);
  assertOk(run("git", ["-C", src, "add", "README.md"]), "git add");
  assertOk(run("git", ["-C", src, "commit", "-m", message]), "git commit");
  return headSha(src);
}
