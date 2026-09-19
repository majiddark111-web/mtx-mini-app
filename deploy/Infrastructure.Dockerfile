FROM alpine:3.22 AS tls
RUN apk add --no-cache openssl
COPY deploy/tls-init.sh /usr/local/bin/tls-init.sh
ENTRYPOINT ["sh", "/usr/local/bin/tls-init.sh"]

FROM postgres:18-bookworm AS postgres
COPY deploy/postgres-start.sh /usr/local/bin/mtx-postgres-start.sh
COPY deploy/postgres-init.sh /docker-entrypoint-initdb.d/10-mtx.sh
COPY deploy/pg_hba.conf /etc/mtx-pg_hba.conf
ENTRYPOINT ["bash", "/usr/local/bin/mtx-postgres-start.sh"]
CMD ["postgres", "-c", "ssl=on", "-c", "ssl_cert_file=/tmp/mtx-tls/server.crt", "-c", "ssl_key_file=/tmp/mtx-tls/server.key", "-c", "hba_file=/etc/mtx-pg_hba.conf"]

FROM redis:7.4 AS redis
COPY deploy/redis-start.sh /usr/local/bin/mtx-redis-start.sh
COPY deploy/redis-health.sh /usr/local/bin/mtx-redis-health.sh
ENTRYPOINT ["sh", "/usr/local/bin/mtx-redis-start.sh"]
