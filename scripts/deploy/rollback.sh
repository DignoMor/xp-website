#!/usr/bin/env bash
# Atomically repoint an environment's current symlink to a retained release.
# Usage: rollback.sh <production|preview> <commit-sha>
set -euo pipefail

ROOT="${XP_WEBSITE_REPO_ROOT:-}"
if [[ -z "${ROOT}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

# shellcheck source=common.sh
source "${ROOT}/scripts/deploy/common.sh"

ENV_NAME="${1:?environment required}"
COMMIT="${2:?commit required}"

validate_env "${ENV_NAME}"
validate_commit "${COMMIT}"

RELEASE_DIR="${RELEASES_DIR}/${ENV_NAME}/${COMMIT}"
if [[ ! -d "${RELEASE_DIR}" ]]; then
  echo "release not found: ${RELEASE_DIR}" >&2
  exit 1
fi

if [[ ! -f "${RELEASE_DIR}/index.html" ]]; then
  echo "release is incomplete: ${RELEASE_DIR}" >&2
  exit 1
fi

log_line "rollback" "env=${ENV_NAME}" "commit=${COMMIT}" "action=start"
atomic_activate "${ENV_NAME}" "${RELEASE_DIR}"
log_line "rollback" "env=${ENV_NAME}" "commit=${COMMIT}" "outcome=success"
