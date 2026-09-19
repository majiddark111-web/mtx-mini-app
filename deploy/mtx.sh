#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
mode="${MTX_INFRA:-self-hosted}"
compose() {
    if [ "$mode" = self-hosted ]; then
        docker compose --env-file .env -f compose.yaml -f compose.self-hosted.yaml "$@"
    elif [ "$mode" = external ]; then
        docker compose --env-file .env -f compose.yaml "$@"
    else
        echo "MTX_INFRA must be self-hosted or external" >&2
        exit 1
    fi
}
case "${1:-help}" in
    config) compose config --quiet ;;
    build) compose build --pull ;;
    data)
        test "$mode" = self-hosted
        compose up -d --wait postgres redis
        ;;
    check) compose run --rm --no-deps migrate node --experimental-strip-types server/deployment/start.mjs check ;;
    migrate) compose run --rm migrate ;;
    start) compose up -d --wait ;;
    stop) compose stop web api ;;
    status) compose ps ;;
    logs) compose logs --tail=100 api ;;
    backup)
        test "$mode" = self-hosted
        umask 077
        mkdir -p backups
        temporary="$(mktemp "backups/mtx-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.partial")"
        compose exec -T postgres pg_dump -U mtx -d mtx --format=custom > "$temporary"
        compose exec -T postgres pg_restore --list < "$temporary" > /dev/null
        compose exec -T postgres pg_restore --file=/dev/null < "$temporary"
        final="${temporary%.partial}.backup"
        test ! -e "$final"
        mv "$temporary" "$final"
        sha256sum "$final" > "$final.sha256"
        echo "Verified archive: $final (keep a separate encrypted off-server copy)"
        ;;
    restore)
        test "$mode" = self-hosted
        if [ "${MTX_RESTORE_CONFIRM:-}" != EMPTY_MTX_DATABASE ]; then
            echo "Restore requires MTX_RESTORE_CONFIRM=EMPTY_MTX_DATABASE; see the runbook." >&2
            exit 1
        fi
        archive="${2:?Supply the archive filename, relative to deploy or absolute}"
        test -f "$archive"
        if compose ps --status running --services | grep -Eq '^(api|web)$'; then
            echo "Stop API and web before restoring." >&2
            exit 1
        fi
        count="$(compose exec -T postgres psql -U mtx -d mtx -Atqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')")"
        test "$count" = 0 || { echo "Destination is not empty; nothing restored." >&2; exit 1; }
        compose exec -T postgres pg_restore --list < "$archive" > /dev/null
        compose exec -T postgres pg_restore --single-transaction --exit-on-error --no-owner --no-privileges -U mtx -d mtx < "$archive"
        echo "MTX restore completed. Compare source/target data before starting the application."
        ;;
    *) echo "Usage: sh deploy/mtx.sh config|build|data|check|migrate|start|stop|status|logs|backup|restore [archive]" ;;
esac
