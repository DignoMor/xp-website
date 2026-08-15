#!/usr/bin/env bash
# Keep the five newest successful releases per environment.
# Never remove the active `current` release.
set -euo pipefail

ROOT="${XP_WEBSITE_REPO_ROOT:-}"
if [[ -z "${ROOT}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

# shellcheck source=common.sh
source "${ROOT}/scripts/deploy/common.sh"

ENV_NAME="${1:?environment required}"
validate_env "${ENV_NAME}"

ENV_DIR="${RELEASES_DIR}/${ENV_NAME}"
CURRENT="${ENV_DIR}/current"
KEEP=5

ACTIVE=""
if [[ -L "${CURRENT}" ]]; then
  ACTIVE="$(basename "$(readlink "${CURRENT}")")"
fi

RELEASE_LIST="$(mktemp)"
cleanup_list() { rm -f "${RELEASE_LIST}"; }
trap cleanup_list EXIT

# Newest first using the monotonic `.deployed_at` marker written at export time.
for dir in "${ENV_DIR}"/*; do
  [[ -d "${dir}" ]] || continue
  name="$(basename "${dir}")"
  [[ "${name}" =~ ^[0-9a-f]{40}$ ]] || continue
  marker="${dir}/.deployed_at"
  if [[ -f "${marker}" ]]; then
    key="$(tr -d '\n' < "${marker}")"
  else
    # Legacy fallback: modification time.
    key="$(stat -f '%m' "${dir}" 2>/dev/null || stat -c '%Y' "${dir}")"
  fi
  printf '%s\t%s\n' "${key}" "${name}"
done | sort -r | awk -F'\t' '{print $2}' > "${RELEASE_LIST}"

kept=0
while IFS= read -r name; do
  [[ -n "${name}" ]] || continue

  if (( kept < KEEP )); then
    kept=$((kept + 1))
    continue
  fi

  if [[ -n "${ACTIVE}" && "${name}" == "${ACTIVE}" ]]; then
    continue
  fi

  log_line "retain" "env=${ENV_NAME}" "action=remove" "release=${name}"
  rm -rf "${ENV_DIR}/${name}"
done < "${RELEASE_LIST}"

log_line "retain" "env=${ENV_NAME}" "action=done" "active=${ACTIVE:-none}" "kept=${kept}"
