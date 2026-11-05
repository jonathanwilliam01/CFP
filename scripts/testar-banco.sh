#!/usr/bin/env bash
# Sobe postgres descartável, aplica stubs, migrations, apoio e testes.
# Migrations passam por sed que comenta só create extension pg_net/pg_cron (stubs em cron/net).
set -euo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
nome="cfp-teste-$RANDOM$RANDOM"
trap 'docker rm -f "$nome" >/dev/null 2>&1 || true' EXIT

docker run -d --name "$nome" -e POSTGRES_PASSWORD=x postgres:17-alpine -c wal_level=logical >/dev/null
until docker exec "$nome" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; do sleep 0.5; done
sleep 1

psql_() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$nome" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null; }
aplicar() {
  local f="$1"
  if ! sed -E 's/^create extension if not exists (pg_net|pg_cron)\b.*$/-- &/' "$f" | psql_; then
    echo "✘ falhou: $f" >&2
    exit 1
  fi
}

aplicar "$raiz/supabase/teste/stubs.sql"
while IFS= read -r f; do aplicar "$f"; done < <(ls "$raiz"/supabase/migrations/*.sql | sort -V)
aplicar "$raiz/supabase/teste/apoio.sql"
for f in "$raiz"/supabase/teste/*.test.sql; do aplicar "$f"; done
echo "✔ banco ok"
