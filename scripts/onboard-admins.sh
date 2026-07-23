#!/usr/bin/env bash
#
# Onboard the Armada leadership team as the first admins (Phase 9).
# Each entry is "email|Full Name". Edit the list with real emails, then run.
# Re-running is safe: create:admin is idempotent (ensures the ADMIN role).
#
# A temporary password is generated per admin by create:admin's caller; here we
# pass one you provide so you can share it, then they reset on first login.
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

: "${DATABASE_URL:?set DATABASE_URL}"
: "${ADMIN_TEMP_PASSWORD:?set ADMIN_TEMP_PASSWORD (shared temp password; they reset on login)}"

ADMINS=(
  "kyle@armadadiscipleship.org|Kyle Sullivan"
  "zack@armadadiscipleship.org|Zack Plunkett"
  "dillon@armadadiscipleship.org|Dillon Everett"
  "chase@armadadiscipleship.org|Chase Clement"
)

for entry in "${ADMINS[@]}"; do
  email="${entry%%|*}"
  name="${entry##*|}"
  echo "==> $name <$email>"
  pnpm --filter @armada/api create:admin "$email" "$ADMIN_TEMP_PASSWORD" "$name"
done

echo "==> Done. Share the temp password out-of-band; each admin resets on first login."
