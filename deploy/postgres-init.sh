#!/bin/bash
set -eu
password="$(cat /tmp/mtx-postgres-password)"
if [[ ! "$password" =~ ^[a-f0-9]{64}$ ]]; then
    echo "Invalid application database password" >&2
    exit 1
fi
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 --set=mtx_password="$password" <<'SQL'
SELECT format('CREATE ROLE mtx LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'mtx_password') \gexec
ALTER DATABASE mtx OWNER TO mtx;
ALTER SCHEMA public OWNER TO mtx;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
