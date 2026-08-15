# xp-website

Foundation Release for the personal website: one static Astro page, built in a
pinned rootless-friendly Docker image, deployed from a bare Git repository on
an Ubuntu 24.04 VPS.

> This is a delivery-system validation, not a finished portfolio.

## Quick commands

```bash
npm ci
npm run check
npm run build
npm test                 # local build + deploy fixture tests
npm run test:docker-build  # pinned container build (requires Docker)
```

Containerized production artifact:

```bash
bash scripts/docker-build.sh /tmp/xp-website-dist
```

Operator guide: [docs/OPERATIONS.md](docs/OPERATIONS.md)

## Branch → environment

| Git branch | Environment | Public? |
|------------|-------------|---------|
| `main`     | production  | yes (after HTTPS provisioning) |
| `preview`  | preview     | local/VPS only in Foundation Release |
| any other  | —           | stored in bare repo, not deployed |

Push destination is the VPS bare repository, added as the `deploy` remote.
