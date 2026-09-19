#!/bin/sh
set -eu
umask 077
if [ -f /authority/complete ]; then
    for file in /ca/ca.crt /postgres/server.crt /redis/server.crt; do
        openssl x509 -checkend 604800 -noout -in "$file"
    done
    test -s /postgres/server.key
    test -s /redis/server.key
    echo MTX_PRIVATE_TLS_READY
    exit 0
fi
# An interrupted initialization is not silently replaced.
for directory in /authority /ca /postgres /redis; do
    if [ -n "$(ls -A "$directory")" ]; then
        echo "TLS directory is not empty; inspect the interrupted initialization." >&2
        exit 1
    fi
done
openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 -subj "/CN=MTX Private CA" -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" -keyout /authority/ca.key -out /ca/ca.crt
for service in postgres redis; do
    openssl req -new -newkey rsa:2048 -nodes -subj "/CN=$service" -keyout "/$service/server.key" -out "/authority/$service.csr"
    printf 'subjectAltName=DNS:%s\nextendedKeyUsage=serverAuth\n' "$service" > "/authority/$service.ext"
    openssl x509 -req -sha256 -days 1825 -in "/authority/$service.csr" -CA /ca/ca.crt -CAkey /authority/ca.key -CAcreateserial -CAserial /authority/ca.srl -extfile "/authority/$service.ext" -out "/$service/server.crt"
    chmod 644 "/$service/server.crt"
done
chmod 755 /ca
chmod 644 /ca/ca.crt
touch /authority/complete
echo MTX_PRIVATE_TLS_READY
