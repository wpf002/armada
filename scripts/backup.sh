#!/usr/bin/env bash
#
# Postgres backup for Armada. Writes a timestamped, gzipped pg_dump.
# Usage: DATABASE_URL=… ./scripts/backup.sh [output-dir]
#
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

# Timestamp without ':' so it's filename-safe across platforms.
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/armada-$STAMP.sql.gz"

echo "==> Dumping to $FILE"
pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip > "$FILE"
echo "==> Done ($(du -h "$FILE" | cut -f1))"

# Retention: keep the newest 30 dumps.
ls -1t "$OUT_DIR"/armada-*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm -f
