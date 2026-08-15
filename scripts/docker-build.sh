#!/usr/bin/env bash
# Build the Foundation Release static artifact inside the pinned Node container
# and export only the validated dist/ contents to OUTPUT_DIR.
#
# Usage: docker-build.sh <output-dir> [source-dir]
#   source-dir defaults to the repository root that contains this script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-}"
SOURCE_DIR="${2:-${ROOT}}"

if [[ -z "${OUTPUT_DIR}" ]]; then
  echo "usage: $0 <output-dir> [source-dir]" >&2
  exit 2
fi

IMAGE_TAG="xp-website-build:local"
CONTAINER_ID=""

cleanup() {
  if [[ -n "${CONTAINER_ID}" ]]; then
    docker rm -f "${CONTAINER_ID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

mkdir -p "${OUTPUT_DIR}"
OUTPUT_DIR="$(cd "${OUTPUT_DIR}" && pwd)"
SOURCE_DIR="$(cd "${SOURCE_DIR}" && pwd)"

echo "==> Building pinned image from ${SOURCE_DIR}"
docker build --pull -t "${IMAGE_TAG}" "${SOURCE_DIR}"

echo "==> Creating container to export artifact"
CONTAINER_ID="$(docker create "${IMAGE_TAG}")"

TMP_EXPORT="$(mktemp -d "${TMPDIR:-/tmp}/xp-website-export.XXXXXX")"
cleanup_tmp() {
  rm -rf "${TMP_EXPORT}"
  cleanup
}
trap cleanup_tmp EXIT

docker cp "${CONTAINER_ID}:/app/dist/." "${TMP_EXPORT}/"

echo "==> Validating exported artifact"
bash "${ROOT}/scripts/validate-artifact.sh" "${TMP_EXPORT}"

# Refuse to export if build tooling leaked into the artifact.
if [[ -e "${TMP_EXPORT}/node_modules" || -e "${TMP_EXPORT}/package.json" ]]; then
  echo "validation failed: build tools present in artifact" >&2
  exit 1
fi

rm -rf "${OUTPUT_DIR:?}/"*
cp -a "${TMP_EXPORT}/." "${OUTPUT_DIR}/"

echo "==> Artifact exported to ${OUTPUT_DIR}"
