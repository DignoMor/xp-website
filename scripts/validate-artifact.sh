#!/usr/bin/env bash
# Validate a static Foundation Release artifact directory.
set -euo pipefail

ARTIFACT_DIR="${1:-}"
EXPECTED_TEXT="This is my personal website."

if [[ -z "${ARTIFACT_DIR}" ]]; then
  echo "usage: $0 <artifact-dir>" >&2
  exit 2
fi

INDEX="${ARTIFACT_DIR}/index.html"
if [[ ! -f "${INDEX}" ]]; then
  echo "validation failed: missing index.html in ${ARTIFACT_DIR}" >&2
  exit 1
fi

if ! grep -F -q "${EXPECTED_TEXT}" "${INDEX}"; then
  echo "validation failed: expected text not found in ${INDEX}" >&2
  exit 1
fi

echo "artifact ok: ${ARTIFACT_DIR}"
