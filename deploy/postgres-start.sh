#!/bin/bash
set -eu
mkdir -p /tmp/mtx-tls
cp /run/mtx-tls/server.crt /tmp/mtx-tls/server.crt
cp /run/mtx-tls/server.key /tmp/mtx-tls/server.key
chown -R postgres:postgres /tmp/mtx-tls
chmod 700 /tmp/mtx-tls
chmod 600 /tmp/mtx-tls/server.key
cp /run/secrets/postgres_password /tmp/mtx-postgres-password
chown postgres:postgres /tmp/mtx-postgres-password
chmod 600 /tmp/mtx-postgres-password
exec /usr/local/bin/docker-entrypoint.sh "$@"
