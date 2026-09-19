#!/bin/sh
set -eu
export REDISCLI_AUTH="$(cat /run/secrets/redis_password)"
test "$(redis-cli --tls --cacert /run/mtx-ca/ca.crt -h redis PING)" = PONG
