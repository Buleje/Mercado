#!/usr/bin/env bash
# Borra de verdad los papeles que dejó sembrar.sh (ids.txt) y las carpetas «Clientes/Maderera El Bosque» del tenant main.
# Uso: ./borrar.sh <id carpeta Maderera El Bosque> <id carpeta Clientes>   (los da el SELECT de DocumentFolder)
set -u
. /tmp/bsm-auth.env
while read -r id; do [ -n "$id" ] && curl -s -o /dev/null -w "papel $id: %{http_code}\n" -H "Cookie: $BSM_COOKIE" -H "x-csrf-token: $BSM_CSRF" -X DELETE "$BSM_BASE/api/admin/documents/$id?purge=1"; done < ids.txt
for f in "$@"; do curl -s -w " ← carpeta $f\n" -H "Cookie: $BSM_COOKIE" -H "x-csrf-token: $BSM_CSRF" -X DELETE "$BSM_BASE/api/admin/documents/folders/$f" | tail -c 160; done
