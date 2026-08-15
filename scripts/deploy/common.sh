#!/usr/bin/env bash
# Shared helpers for Foundation Release deployment.
set -euo pipefail

HOME_DIR="${XP_WEBSITE_HOME:?XP_WEBSITE_HOME must be set}"
LOCK_FILE="${HOME_DIR}/lock/deploy.lock"
LOG_DIR="${HOME_DIR}/logs"
RELEASES_DIR="${HOME_DIR}/releases"
WORK_DIR="${HOME_DIR}/work"

mkdir -p "${LOG_DIR}" "${RELEASES_DIR}/production" "${RELEASES_DIR}/preview" \
  "${WORK_DIR}" "$(dirname "${LOCK_FILE}")"

timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

log_line() {
  local stage="$1"
  shift
  printf '%s stage=%s %s\n' "$(timestamp)" "${stage}" "$*" | tee -a "${LOG_DIR}/deploy.log" >&2
}

# Reject path/command injection via untrusted git refs and object names.
validate_commit() {
  local commit="$1"
  if [[ ! "${commit}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "invalid commit id: ${commit}" >&2
    return 1
  fi
}

validate_ref() {
  local ref="$1"
  if [[ ! "${ref}" =~ ^refs/heads/[A-Za-z0-9._/-]+$ ]]; then
    echo "invalid ref: ${ref}" >&2
    return 1
  fi
}

validate_env() {
  local env="$1"
  case "${env}" in
    production|preview) ;;
    *)
      echo "invalid environment: ${env}" >&2
      return 1
      ;;
  esac
}

acquire_lock() {
  local waited=0
  while ! mkdir "${LOCK_FILE}" 2>/dev/null; do
    waited=$((waited + 1))
    if (( waited > 120 )); then
      log_line "lock" "outcome=rejected" "reason=timeout"
      return 1
    fi
    if (( waited == 1 )); then
      log_line "lock" "outcome=waiting" "reason=busy"
    fi
    sleep 1
  done
  log_line "lock" "outcome=acquired"
}

release_lock() {
  rmdir "${LOCK_FILE}" 2>/dev/null || true
  log_line "lock" "outcome=released"
}

atomic_activate() {
  local env="$1"
  local release_dir="$2"
  local current="${RELEASES_DIR}/${env}/current"

  # -n: do not follow an existing symlink-to-directory (critical on macOS/BSD).
  # -sfn: replace the symlink itself in one step.
  ln -sfn "${release_dir}" "${current}"
}
