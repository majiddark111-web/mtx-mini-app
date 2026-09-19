#!/bin/sh
set -eu
umask 077
password="$(cat /run/secrets/redis_password)"
case "$password" in *[!a-f0-9]*|'') echo "Invalid Redis password" >&2; exit 1;; esac
test "${#password}" -eq 64
mkdir -p /tmp/mtx-tls
cp /run/mtx-tls/server.crt /tmp/mtx-tls/server.crt
cp /run/mtx-tls/server.key /tmp/mtx-tls/server.key
cat > /tmp/mtx-redis.conf <<EOF
bind 0.0.0.0
port 0
tls-port 6379
tls-cert-file /tmp/mtx-tls/server.crt
tls-key-file /tmp/mtx-tls/server.key
tls-ca-cert-file /run/mtx-ca/ca.crt
tls-auth-clients no
protected-mode yes
requirepass $password
dir /data
appendonly yes
appendfsync always
maxmemory 256mb
maxmemory-policy noeviction
save 900 1
EOF
chown -R redis:redis /tmp/mtx-tls
chown redis:redis /tmp/mtx-redis.conf
exec /usr/local/bin/docker-entrypoint.sh redis-server /tmp/mtx-redis.conf
