#!/usr/bin/env bash
# post-receive: map pushed refs to Foundation Release environments.
# Reads stdin lines: <oldrev> <newrev> <ref>
set -euo pipefail

ROOT="${XP_WEBSITE_REPO_ROOT:-}"
if [[ -z "${ROOT}" ]]; then
  # When installed on the VPS, this hook lives beside the deploy scripts via copy/symlink.
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

# shellcheck source=common.sh
source "${ROOT}/scripts/deploy/common.sh"

while read -r oldrev newrev ref; do
  [[ -n "${ref:-}" ]] || continue

  if [[ "${newrev}" =~ ^0+$ ]]; then
    log_line "ignore" "ref=${ref}" "event=delete" "outcome=ignored"
    continue
  fi

  case "${ref}" in
    refs/heads/main)
      bash "${ROOT}/scripts/deploy/deploy.sh" production "${newrev}" "${ref}"
      ;;
    refs/heads/preview)
      bash "${ROOT}/scripts/deploy/deploy.sh" preview "${newrev}" "${ref}"
      ;;
    *)
      log_line "ignore" "ref=${ref}" "commit=${newrev}" "outcome=stored-only"
      ;;
  esac
done
