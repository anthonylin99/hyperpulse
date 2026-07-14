#!/usr/bin/env bash
# Back up the self-hosted HyperPulse Postgres container to a compressed dump.
#
# Usage (run from the repo root on the droplet):
#   ./deploy/backup-postgres.sh
#
# Cron (daily at 03:15, keep 14 days), via `crontab -e`:
#   15 3 * * * cd /opt/hyperpulse && ./deploy/backup-postgres.sh >> /var/log/hp-backup.log 2>&1
#
# Restore a dump into a fresh DB:
#   gunzip -c backups/hyperpulse-YYYYmmdd-HHMMSS.sql.gz \
#     | docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
#         psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
#
# Optional off-box upload to DigitalOcean Spaces: set SPACES_BUCKET (e.g.
# s3://my-space/hyperpulse) and have `aws` configured with your Spaces keys +
# endpoint; the script will `aws s3 cp` each dump.

set -euo pipefail

cd "$(dirname "$0")/.."

# Load .env so POSTGRES_USER/DB are available here too.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-hyperpulse}"
POSTGRES_DB="${POSTGRES_DB:-hyperpulse}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

mkdir -p "$BACKUP_DIR"
timestamp="$(date +%Y%m%d-%H%M%S)"
outfile="$BACKUP_DIR/hyperpulse-$timestamp.sql.gz"

echo "[backup] dumping $POSTGRES_DB -> $outfile"
"${COMPOSE[@]}" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges \
  | gzip -9 > "$outfile"

size="$(du -h "$outfile" | cut -f1)"
echo "[backup] wrote $outfile ($size)"

# Prune old local dumps.
find "$BACKUP_DIR" -name 'hyperpulse-*.sql.gz' -type f -mtime "+$RETENTION_DAYS" -print -delete

# Optional off-box copy.
if [[ -n "${SPACES_BUCKET:-}" ]]; then
  echo "[backup] uploading to $SPACES_BUCKET"
  aws s3 cp "$outfile" "$SPACES_BUCKET/" ${AWS_ENDPOINT_URL:+--endpoint-url "$AWS_ENDPOINT_URL"}
fi

echo "[backup] done"
