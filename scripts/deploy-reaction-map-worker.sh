#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

compose_file="${COMPOSE_FILE:-docker-compose.reaction-map.yml}"
smoke_seconds="${REACTION_MAP_DEPLOY_SMOKE_SECONDS:-45}"
export COMPOSE_ANSI="${COMPOSE_ANSI:-never}"

has_env_key() {
  local key="$1"
  if [[ -n "${!key:-}" ]]; then
    return 0
  fi
  if [[ -f ".env" ]] && grep -Eq "^[[:space:]]*${key}[[:space:]]*=" ".env"; then
    return 0
  fi
  return 1
}

require_env_key() {
  local key="$1"
  if ! has_env_key "$key"; then
    echo "[deploy] missing ${key}; set it in the shell or in .env next to ${compose_file}" >&2
    exit 1
  fi
}

require_env_key "NEON_DATABASE_URL"
require_env_key "NEON_DATABASE_URL_POOLING"

if ! command -v docker >/dev/null 2>&1; then
  echo "[deploy] docker is required" >&2
  exit 1
fi

if [[ "${SKIP_GIT_PULL:-}" != "1" ]] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git fetch --prune
  git pull --ff-only
fi

services="$(docker compose -f "${compose_file}" config --services)"
if [[ "${services}" != "reaction-map" ]]; then
  echo "[deploy] ${compose_file} should only define reaction-map; got:" >&2
  echo "${services}" >&2
  exit 1
fi

docker compose -f "${compose_file}" up -d --no-deps --build reaction-map
docker compose -f "${compose_file}" ps reaction-map

echo "[deploy] waiting ${smoke_seconds}s for ingestion flush logs..."
sleep "${smoke_seconds}"

log_file="$(mktemp)"
docker compose -f "${compose_file}" logs --no-color --tail=160 reaction-map | tee "${log_file}"

if grep -Fq "[reaction-map] flushed" "${log_file}"; then
  rm -f "${log_file}"
  echo "[deploy] reaction-map is ingesting and flushing rows"
  exit 0
fi

rm -f "${log_file}"
echo "[deploy] reaction-map started, but no flush log was seen yet" >&2
echo "[deploy] check Neon schema/env if logs mention missing relations or connection errors" >&2
exit 2
