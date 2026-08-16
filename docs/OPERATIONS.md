# Foundation Release — operator guide

This document is enough to set up, deploy, inspect, and roll back the site
without undocumented knowledge.

## Architecture

```
developer laptop
  └─ git push deploy main|preview
       └─ VPS bare repo (post-receive)
            ├─ isolated checkout of the exact commit
            ├─ pinned Docker build → static dist/
            ├─ validate index + Foundation text
            ├─ copy into releases/<env>/<commit>/
            └─ ln -sfn → releases/<env>/current
                 └─ native Nginx serves that directory
```

Docker is a **build adapter only**. It never serves the website. Nginx on the
host OS serves the activated static files. That is why the host still matters:
users, permissions, rootless Docker, Nginx, Certbot, and the filesystem layout
all live on Ubuntu 24.04, not inside the build image.

## Layout on the VPS

Set `XP_WEBSITE_HOME` to the deploy user's home. A normal `/home/<user>`
path is fine; `/var/www/xp-website` is only an example.

Nginx runs as `www-data` and must be able to open
`releases/production/current` without belonging to the deploy user's
group. Make the home `711` so Nginx can traverse a known path but cannot
list it. Keep release directories world-readable (`755` / `644`). Deploy
runs `chmod -R a+rX` on each new release so `www-data` can read it. Do
not add `www-data` to the deploy group.

```
$XP_WEBSITE_HOME/
  bare.git/                 # authoritative deploy remote
  releases/
    production/
      <full-commit-sha>/
      current -> <sha>
    preview/
      <full-commit-sha>/
      current -> <sha>
  work/                     # temporary checkouts/artifacts
  logs/deploy.log
  lock/                     # deploy mutex (directory lock)
```

Install the hook:

```bash
cp scripts/deploy/post-receive.sh "$XP_WEBSITE_HOME/bare.git/hooks/post-receive"
chmod +x "$XP_WEBSITE_HOME/bare.git/hooks/post-receive"
```

The hook expects:

- `XP_WEBSITE_HOME` — layout root above
- `XP_WEBSITE_REPO_ROOT` — checkout of this repository on the VPS (or pack the
  `scripts/` tree beside the hook)
- `XP_WEBSITE_BUILD_CMD` — optional override; default is
  `scripts/docker-build.sh`

## Initial provisioning (human)

Provisioning is intentionally a guided wizard (issue #4), not a silent script
run by CI. On Ubuntu 24.04 it must leave you with:

1. A dedicated non-root deploy user (no unrestricted sudo)
2. Rootless Docker for that user (not the privileged `docker` group)
3. Native Nginx serving `releases/production/current`
4. A bare Git repo owned by the deploy user, reachable over SSH-key auth
5. Directory layout for production and preview as above

Until that wizard is run, local tests under `tests/deploy/` exercise the same
hooks against a temporary fixture.

### Add the `deploy` remote

```bash
git remote add deploy deploy@YOUR_VPS:/path/to/bare.git
git push deploy main
```

SSH must use key authentication. Password SSH is not part of this workflow.

## Branch behavior

| Ref update | Result |
|------------|--------|
| push `main` | build + activate **production** |
| push `preview` | build + activate **preview** |
| push any other branch | stored in bare repo; no activation |
| delete a branch ref | ignored; no deploy; no release removed |

Preview is verifiable on the VPS (read
`releases/preview/current` or serve it on loopback). It is **not** exposed on
the public internet in the Foundation Release.

## Deployment logs

Every deploy appends structured lines to `$XP_WEBSITE_HOME/logs/deploy.log`:

```text
2026-08-15T21:00:00Z stage=start env=production ref=refs/heads/main commit=<sha> ...
2026-08-15T21:00:01Z stage=build ...
2026-08-15T21:00:10Z stage=finish ... outcome=success
```

Fields include environment, full commit id, ref, stages, lock wait/acquire, and
outcome. Credentials must never appear in this log.

```bash
tail -f "$XP_WEBSITE_HOME/logs/deploy.log"
```

## Inspect releases

```bash
ls -l "$XP_WEBSITE_HOME/releases/production/"
readlink "$XP_WEBSITE_HOME/releases/production/current"
curl -fsS https://YOUR_PRODUCTION_HOST/
```

On failure, `current` is left unchanged and the log records `outcome=failure`.

## Rollback

Rollback repoints `current` to a retained release directory. It does **not**
rebuild.

```bash
XP_WEBSITE_HOME=/var/www/xp-website \
  bash scripts/deploy/rollback.sh production <full-commit-sha>
```

Each environment retains its five newest successful releases. The active
release is never deleted by cleanup.

## HTTPS and certificate renewal (human)

Issuing the production certificate is a guided wizard (issue #10): point DNS at
the VPS, run Certbot with Let’s Encrypt, and confirm Nginx serves HTTPS.

Verify renewal configuration anytime with:

```bash
sudo certbot renew --dry-run
```

## Build reproducibility

- Node image pinned by version **and** digest in `Dockerfile`
- npm lockfile committed; dependency versions exact in `package.json`
- Artifact validation requires `index.html` and the exact text
  `This is my personal website.`

```bash
bash scripts/docker-build.sh /tmp/out
# Optional second arg: build a specific source tree (deploy uses the pushed commit checkout)
bash scripts/docker-build.sh /tmp/out /path/to/checkout
bash scripts/validate-artifact.sh /tmp/out
```

## Tests operators can trust

```bash
npm run test:local-build     # Astro static output
npm run test:docker-build    # pinned container path
npm run test:deploy          # push→activate fixture matrix
```
