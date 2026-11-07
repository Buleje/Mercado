#!/usr/bin/env bash
# dr-drill-local.sh — DR drill de la regla 14 (CLAUDE.md §4: < 35 días) en ESTA PC, sin sudo ni Docker.
#
# Por qué (04-11): el último drill fue el 19-05 (169 días) y el pase a producción lo pide. El runbook
# (docs/runbooks/deploy-rama-a-produccion.md §8) ya decía «se puede hacer local con el servidor de PGDG
# extraído igual que el cliente»; esto lo deja en un comando.
#
# Qué hace (nunca toca la base de producción: solo lee el .dump):
#   1. baja el servidor PostgreSQL 17 oficial de PGDG a ~/.local/pg17 (sha256 verificado) si falta;
#   2. crea un servidor VACÍO y temporal en el scratch (puerto 54329, solo socket local);
#   3. restaura la última copia de ~/copias-base (schema public, sin dueños ni permisos de Supabase);
#   4. cuenta filas tabla por tabla y las compara con las que trae la copia (pg_restore --list + COPY);
#   5. corre scripts/dr-drill.mjs en modo real → reports/dr-drills/AAAA-MM-DD.json;
#   6. apaga y borra el servidor temporal.
#
# Uso: bash scripts/dr-drill-local.sh [archivo.dump]
set -euo pipefail

PG17="$HOME/.local/pg17"; RAIZ="$PG17/root"; BIN="$RAIZ/usr/lib/postgresql/17/bin"
export LD_LIBRARY_PATH="$RAIZ/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
DUMP="${1:-$(ls -t "$HOME"/copias-base/bsm-base-*.dump 2>/dev/null | head -1)}"
[ -f "$DUMP" ] || { echo "ERROR: no hay copia en ~/copias-base (correr scripts/copia-base.sh)"; exit 1; }
PUERTO=54329
TMP="$(mktemp -d "${TMPDIR:-/tmp}/dr-drill.XXXXXX")"
trap '"$BIN/pg_ctl" -D "$TMP/datos" -m immediate stop >/dev/null 2>&1 || true; rm -rf -- "$TMP"' EXIT

instalar_servidor() {
  local pgdg="https://apt.postgresql.org/pub/repos/apt" codename arch desc ver fn sha deb
  codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"; arch="$(dpkg --print-architecture)"
  desc="$PG17/descargas"; mkdir -p "$desc" "$RAIZ"
  [ -s "$desc/Packages.gz" ] || curl -fsSL -o "$desc/Packages.gz" "$pgdg/dists/${codename}-pgdg/main/binary-${arch}/Packages.gz"
  read -r ver fn sha < <(zcat "$desc/Packages.gz" | awk -v p="postgresql-17" '
    BEGIN { RS = ""; FS = "\n" }
    { pk = ve = fi = sh = ""
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^Package: /) pk = substr($i, 10); else if ($i ~ /^Version: /) ve = substr($i, 10)
        else if ($i ~ /^Filename: /) fi = substr($i, 11); else if ($i ~ /^SHA256: /) sh = substr($i, 9)
      }
      if (pk == p) print ve, fi, sh }' | sort -k1,1V | tail -1)
  [ -n "${fn:-}" ] || { echo "ERROR: no encontré postgresql-17 en PGDG"; exit 1; }
  deb="$desc/$(basename "$fn")"
  curl -fsSL -o "$deb" "$pgdg/$fn"
  echo "$sha  $deb" | sha256sum -c --quiet - || { echo "ERROR: sha256 distinto en $deb"; exit 1; }
  dpkg-deb -x "$deb" "$RAIZ"
  echo "servidor postgresql-17 $ver → $RAIZ (sha256 ok)"
}
[ -x "$BIN/postgres" ] || instalar_servidor

echo "copia: $DUMP"
t0=$(date +%s)
"$BIN/initdb" -D "$TMP/datos" -U postgres -A trust -E UTF8 --locale=C >/dev/null
"$BIN/pg_ctl" -D "$TMP/datos" -l "$TMP/servidor.log" -w \
  -o "-p $PUERTO -k $TMP -c listen_addresses='' -c jit=off -c fsync=off" start >/dev/null
URL="postgresql://postgres@/postgres?host=$TMP&port=$PUERTO"
"$BIN/psql" -q "$URL" -c "create database dr_drill" >/dev/null
URL_DR="postgresql://postgres@/dr_drill?host=$TMP&port=$PUERTO"

# Supabase trae roles y extensiones propias: sin dueños ni permisos solo queda lo de public.
"$BIN/pg_restore" --no-owner --no-privileges --schema=public -d "$URL_DR" "$DUMP" 2>"$TMP/restore.err" || true
errores=$(grep -c '^pg_restore: error' "$TMP/restore.err" || true)

# Filas esperadas = las que trae cada bloque COPY de la copia (no la base viva).
"$BIN/pg_restore" --data-only --schema=public -f - "$DUMP" | awk '
  /^COPY public\./ { t = $2; sub(/^public\./, "", t); gsub(/"/, "", t); n = 0; dentro = 1; next }
  dentro && /^\\\.$/ { print t "\t" n; dentro = 0; next }
  dentro { n++ }' | sort > "$TMP/esperadas.tsv"

: > "$TMP/restauradas.tsv"
while IFS=$'\t' read -r t _; do
  n=$("$BIN/psql" -At "$URL_DR" -c "select count(*) from public.\"$t\"" 2>/dev/null || echo "FALTA")
  printf '%s\t%s\n' "$t" "$n" >> "$TMP/restauradas.tsv"
done < "$TMP/esperadas.tsv"

tablas=$(wc -l < "$TMP/esperadas.tsv")
filas=$(awk -F'\t' '{s += $2} END {print s + 0}' "$TMP/esperadas.tsv")
distintas=$(join -t $'\t' "$TMP/esperadas.tsv" "$TMP/restauradas.tsv" | awk -F'\t' '$2 != $3' | wc -l)
seg=$(( $(date +%s) - t0 ))

echo "tablas: $tablas · filas en la copia: $filas · tablas con distinto conteo: $distintas · errores de restauración: $errores · $seg s"
if [ "$distintas" -gt 0 ]; then
  join -t $'\t' "$TMP/esperadas.tsv" "$TMP/restauradas.tsv" | awk -F'\t' '$2 != $3 { print "  DISTINTA " $1 ": copia " $2 " · restaurada " $3 }' | head -20
fi
[ "$errores" -gt 0 ] && { echo "primeros errores:"; grep '^pg_restore: error' "$TMP/restore.err" | cut -c1-160 | head -5; }

# Informe en el formato del drill del repo (modo real).
PATH="$BIN:$PATH" DR_SKIP_RESTORE=1 DR_BACKUP_PATH="$DUMP" DR_TEMP_DB_URL="$URL_DR" node scripts/dr-drill.mjs 2>&1 | grep -E "PASS|WARN|FAIL|RESULTADO|Duracion" || true

[ "$distintas" -eq 0 ] && echo "RESULTADO: OK — la copia se recupera completa ($filas filas en $tablas tablas)" \
  || { echo "RESULTADO: NO — $distintas tabla(s) no cuadran"; exit 1; }
