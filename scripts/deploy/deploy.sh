#!/usr/bin/env bash
# Deploy one Foundation Release environment from an exact commit.
# Usage: deploy.sh <production|preview> <commit-sha> <ref>
set -euo pipefail

ROOT="${XP_WEBSITE_REPO_ROOT:-}"
if [[ -z "${ROOT}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

# shellcheck source=common.sh
source "${ROOT}/scripts/deploy/common.sh"

ENV_NAME="${1:?environment required}"
COMMIT="${2:?commit required}"
REF="${3:?ref required}"

validate_env "${ENV_NAME}"
validate_commit "${COMMIT}"
validate_ref "${REF}"

GIT_DIR="${GIT_DIR:-}"
if [[ -z "${GIT_DIR}" ]]; then
  # post-receive sets GIT_DIR to the bare repository.
  echo "GIT_DIR must point at the bare repository" >&2
  exit 1
fi

BUILD_CMD="${XP_WEBSITE_BUILD_CMD:-}"
if [[ -z "${BUILD_CMD}" ]]; then
  BUILD_CMD="${ROOT}/scripts/docker-build.sh"
fi

START="$(timestamp)"
WORKDIR=""
ARTIFACT_DIR=""
LOCKED=0

cleanup_work() {
  rm -rf "${WORKDIR:-}" "${ARTIFACT_DIR:-}"
}

on_error() {
  local exit_code=$?
  log_line "finish" "env=${ENV_NAME}" "ref=${REF}" "commit=${COMMIT}" "started=${START}" "outcome=failure" "exit=${exit_code}"
}

on_exit() {
  cleanup_work
  if [[ "${LOCKED}" -eq 1 ]]; then
    release_lock
  fi
}

trap 'on_error' ERR
trap 'on_exit' EXIT

log_line "start" "env=${ENV_NAME}" "ref=${REF}" "commit=${COMMIT}" "started=${START}"

acquire_lock
LOCKED=1

WORKDIR="$(mktemp -d "${WORK_DIR}/checkout.${COMMIT}.XXXXXX")"
ARTIFACT_DIR="$(mktemp -d "${WORK_DIR}/artifact.${COMMIT}.XXXXXX")"

log_line "checkout" "env=${ENV_NAME}" "commit=${COMMIT}"
# Export the exact commit into an isolated tree (no shared mutable checkout).
git --git-dir="${GIT_DIR}" archive "${COMMIT}" | tar -x -C "${WORKDIR}"

log_line "build" "env=${ENV_NAME}" "commit=${COMMIT}" "cmd=${BUILD_CMD}" "source=${WORKDIR}"
# Build from the isolated checkout so the pushed commit is the artifact source.
bash "${BUILD_CMD}" "${ARTIFACT_DIR}" "${WORKDIR}"

log_line "validate" "env=${ENV_NAME}" "commit=${COMMIT}"
bash "${ROOT}/scripts/validate-artifact.sh" "${ARTIFACT_DIR}"

RELEASE_DIR="${RELEASES_DIR}/${ENV_NAME}/${COMMIT}"
log_line "export" "env=${ENV_NAME}" "commit=${COMMIT}" "release=${RELEASE_DIR}"

# Stage into a sibling directory first so we never rm -rf an active release
# while `current` still points at it (same-SHA redeploy safe).
STAGE_DIR="${RELEASE_DIR}.staging.$$"
rm -rf "${STAGE_DIR}"
mkdir -p "${STAGE_DIR}"
cp -a "${ARTIFACT_DIR}/." "${STAGE_DIR}/"

SEQ_FILE="${HOME_DIR}/deploy.seq"
SEQ=$(( $(cat "${SEQ_FILE}" 2>/dev/null || echo 0) + 1 ))
echo "${SEQ}" > "${SEQ_FILE}"
printf '%020d %s\n' "${SEQ}" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "${STAGE_DIR}/.deployed_at"

OLD_DIR=""
if [[ -d "${RELEASE_DIR}" ]]; then
  OLD_DIR="${RELEASE_DIR}.old.$$"
  mv "${RELEASE_DIR}" "${OLD_DIR}"
fi
mv "${STAGE_DIR}" "${RELEASE_DIR}"

# Nginx (www-data) reads this tree without sharing the deploy group (ADR 0001).
chmod -R a+rX "${RELEASE_DIR}"

log_line "activate" "env=${ENV_NAME}" "commit=${COMMIT}" "release=${RELEASE_DIR}"
atomic_activate "${ENV_NAME}" "${RELEASE_DIR}"

if [[ -n "${OLD_DIR}" ]]; then
  rm -rf "${OLD_DIR}"
fi

# Retention runs after successful activation (#9). Keep active release safe.
bash "${ROOT}/scripts/deploy/retain.sh" "${ENV_NAME}" || true

FINISH="$(timestamp)"
log_line "finish" "env=${ENV_NAME}" "ref=${REF}" "commit=${COMMIT}" "started=${START}" "finished=${FINISH}" "outcome=success"
