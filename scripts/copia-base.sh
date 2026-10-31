#!/usr/bin/env bash
# copia-base.sh — copia COMPLETA de la base (Supabase Postgres 17) antes de un pase a producción.
#
# Por qué (24-10, Brandon): Supabase Free no da copias accesibles y `backup-offsite.yml`
# lleva 195/195 corridas fallidas. Antes de desplegar se saca esta copia a mano.
# Runbook: docs/runbooks/deploy-rama-a-produccion.md § «Copia antes del pase».
#
# SÓLO LECTURA contra la base: pg_dump abre UNA transacción REPEATABLE READ, READ ONLY,
# y el cruce final es `BEGIN READ ONLY; SELECT count(*) …; COMMIT`.
#   · Conexión: DIRECT_URL (db.<ref>.supabase.co:5432) si se alcanza. Si no (ese host es
#     sólo IPv6 y WSL no tiene IPv6), el pooler en modo SESIÓN: host de DATABASE_URL con
#     puerto 5432 (el mismo camino de scripts/prisma-session.mjs). NUNCA el 6543 (modo
#     transacción): los SET de pg_dump se pegarían en conexiones de producción (memoria
#     `pooler-set-session-se-pega`). Medido 24-10: el modo sesión reutiliza el mismo backend
#     pero RESETEA su estado entre clientes (una variable propia volvió vacía al reconectar).
#   · La URL y la clave nunca se imprimen ni van como argumento: viajan en PG* del entorno.
#   · NO trae los archivos de Supabase Storage (fotos, PDF del Archivo): sólo sus filas.
#
# Uso:
#   bash scripts/copia-base.sh --instalar-pg17   # una vez: baja pg_dump 17 a ~/.local/pg17
#                                                # (paquetes oficiales PGDG, sha256 verificado;
#                                                #  sin sudo, sin tocar apt ni el pg_dump 16)
#   bash scripts/copia-base.sh                   # copia + verificación + 2.ª copia en Windows
# Variables opcionales:
#   COPIA_DESTINO  carpeta de la copia (def. ~/copias-base, fuera del repo)
#   COPIA_WINDOWS  2.ª copia (def. /mnt/d/copias-base; "no" = sin 2.ª copia)
#   PG_BIN         carpeta con pg_dump/pg_restore/psql >= 17 (def. se busca sola)
set -euo pipefail
umask 077

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG17="$HOME/.local/pg17"
DESTINO="${COPIA_DESTINO:-$HOME/copias-base}"
WIN="${COPIA_WINDOWS:-/mnt/d/copias-base}"

fallar() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

instalar_pg17() {
  local pgdg="https://apt.postgresql.org/pub/repos/apt" codename arch desc raiz pkg ver fn sha deb
  codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  arch="$(dpkg --print-architecture)"
  desc="$PG17/descargas"; raiz="$PG17/root"
  mkdir -p "$desc" "$raiz"
  echo "Bajando el índice de PGDG ($codename/$arch)…"
  curl -fsSL -o "$desc/Packages.gz" "$pgdg/dists/${codename}-pgdg/main/binary-${arch}/Packages.gz"
  for pkg in postgresql-client-17 libpq5; do
    read -r ver fn sha < <(zcat "$desc/Packages.gz" | awk -v p="$pkg" '
      BEGIN { RS = ""; FS = "\n" }
      { pk = ve = fi = sh = ""
        for (i = 1; i <= NF; i++) {
          if ($i ~ /^Package: /) pk = substr($i, 10)
          else if ($i ~ /^Version: /) ve = substr($i, 10)
          else if ($i ~ /^Filename: /) fi = substr($i, 11)
          else if ($i ~ /^SHA256: /) sh = substr($i, 9)
        }
        if (pk == p) print ve, fi, sh }' | sort -k1,1V | tail -1)
    [ -n "${fn:-}" ] || fallar "no encontré $pkg en PGDG ($codename/$arch)"
    deb="$desc/$(basename "$fn")"
    curl -fsSL -o "$deb" "$pgdg/$fn"
    echo "$sha  $deb" | sha256sum -c --quiet - || fallar "sha256 distinto en $deb"
    dpkg-deb -x "$deb" "$raiz"
    echo "  $pkg $ver → $raiz (sha256 ok)"
  done
}

if [ "${1:-}" = "--instalar-pg17" ]; then instalar_pg17; fi

# ── pg_dump >= 17 ───────────────────────────────────────────────────────
BIN=""
for d in "${PG_BIN:-}" /usr/lib/postgresql/18/bin /usr/lib/postgresql/17/bin "$PG17/root/usr/lib/postgresql/17/bin"; do
  if [ -n "$d" ] && [ -x "$d/pg_dump" ]; then BIN="$d"; break; fi
done
[ -n "$BIN" ] || fallar "no hay pg_dump 17+. Correr: bash scripts/copia-base.sh --instalar-pg17"
case "$BIN" in
  "$PG17"/*)
    LIBPQ="$(dirname "$(find "$PG17/root/usr/lib" -name 'libpq.so.5' -print -quit)")"
    export LD_LIBRARY_PATH="$LIBPQ${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" ;;
esac
VER_DUMP="$("$BIN/pg_dump" --version | awk '{print $3}')"
[ "${VER_DUMP%%.*}" -ge 17 ] || fallar "pg_dump $VER_DUMP es viejo para un servidor 17"

# ── Conexión (sin imprimir URL ni clave) ────────────────────────────────
[ -f "$RAIZ/.env.local" ] || fallar "falta $RAIZ/.env.local"
unset PGSERVICE PGSERVICEFILE PGOPTIONS
eval "$(cd "$RAIZ" && node -e '
const net = require("net");
require("dotenv").config({ path: ".env.local", quiet: true });
const q = (v) => "\x27" + String(v).replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
const alcanza = (host, port) => new Promise((r) => {
  const s = net.connect({ host, port: Number(port), timeout: 5000 });
  s.once("connect", () => { s.destroy(); r(true); });
  s.once("timeout", () => { s.destroy(); r(false); });
  s.once("error", () => r(false));
});
(async () => {
  let u = null, modo = "";
  if (process.env.DIRECT_URL) {
    const d = new URL(process.env.DIRECT_URL);
    if (await alcanza(d.hostname, d.port || 5432)) { u = d; modo = "directa"; }
  }
  if (!u && process.env.DATABASE_URL) { u = new URL(process.env.DATABASE_URL); u.port = "5432"; modo = "pooler en modo sesión (DIRECT_URL no se alcanza: sólo IPv6)"; }
  if (!u) { console.log("fallar \"no hay DIRECT_URL ni DATABASE_URL en .env.local\""); return; }
  if ((u.port || "5432") === "6543") { console.log("fallar \"puerto 6543 (modo transacción) prohibido\""); return; }
  const env = {
    PGHOST: u.hostname, PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1) || "postgres"),
    PGSSLMODE: "require", PGAPPNAME: "copia-base", PGCONNECT_TIMEOUT: "15", COPIA_MODO: modo,
  };
  for (const [k, v] of Object.entries(env)) console.log(`export ${k}=${q(v)}`);
})();
' | grep -E '^(export|fallar) ')"
[ -n "${PGHOST:-}" ] || fallar "no se pudo armar la conexión desde .env.local"
[ "$PGPORT" != "6543" ] || fallar "puerto 6543 prohibido"

# ── Copia ───────────────────────────────────────────────────────────────
FECHA="$(TZ=America/Lima date +%Y-%m-%d_%H%M)"
NOMBRE="bsm-base-${FECHA}.dump"
mkdir -p "$DESTINO"
ARCH="$DESTINO/$NOMBRE"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; rm -f "$ARCH.parcial"' EXIT

PSQL=("$BIN/psql" -X -q -A -t -v ON_ERROR_STOP=1)
VER_SERV="$("${PSQL[@]}" -c 'select version()' | cut -c1-60)"
echo "Servidor: $VER_SERV"
echo "Conexión: $COPIA_MODO — $PGHOST:$PGPORT · pg_dump $VER_DUMP"
echo "Copiando a $ARCH …"
T0=$SECONDS
"$BIN/pg_dump" --format=custom --compress=6 --no-password --lock-wait-timeout=60s --file="$ARCH.parcial"
mv "$ARCH.parcial" "$ARCH"
SEG=$((SECONDS - T0))

# ── Verificación ────────────────────────────────────────────────────────
BYTES="$(stat -c %s "$ARCH")"
SHA="$(sha256sum "$ARCH" | awk '{print $1}')"
(cd "$DESTINO" && sha256sum "$NOMBRE" > "$NOMBRE.sha256")
"$BIN/pg_restore" --list "$ARCH" > "$TMP/lista.txt"
read -r N_TABLAS N_PUBLIC N_DATOS N_ESQUEMAS < <(awk '
  $4 == "TABLE" && $5 != "DATA" { t++; if ($5 == "public") p++ }
  $4 == "TABLE" && $5 == "DATA" { d++ }
  $4 == "SCHEMA" { s++ }
  END { print t+0, p+0, d+0, s+0 }' "$TMP/lista.txt")
# Filas por tabla, contadas DENTRO de la copia (cada línea de un bloque COPY = 1 fila).
"$BIN/pg_restore" --data-only --file=- "$ARCH" | awk '
  /^COPY / { t = $2; n = 0; dentro = 1; next }
  dentro && $0 == "\\." { print n "\t" t; dentro = 0; next }
  dentro { n++ }' | sort -t$'\t' -k1,1rn > "$TMP/filas.tsv"
TOTAL_FILAS="$(awk -F'\t' '{s += $1} END {print s+0}' "$TMP/filas.tsv")"
TABLAS_CON_FILAS="$(awk -F'\t' '$1 > 0' "$TMP/filas.tsv" | wc -l)"

# Cruce con la base viva: count(*) exacto de las 5 tablas de public más grandes (READ ONLY).
SEL=""
while IFS=$'\t' read -r n t; do
  SEL+="${SEL:+ union all }select '$t', count(*) from $t"
done < <(awk -F'\t' '$2 ~ /^public\./' "$TMP/filas.tsv" | head -5)
"${PSQL[@]}" -F $'\t' -c 'BEGIN READ ONLY' -c "$SEL" -c 'COMMIT' > "$TMP/vivo.tsv"

{
  echo "Copia: $NOMBRE"
  echo "Hecha: $(TZ=America/Lima date '+%Y-%m-%d %H:%M:%S') Lima, en ${SEG} s"
  echo "Servidor: $VER_SERV"
  echo "Conexión: $COPIA_MODO — $PGHOST:$PGPORT · pg_dump $VER_DUMP"
  echo "Tamaño: $BYTES bytes ($(numfmt --to=iec "$BYTES"))"
  echo "sha256: $SHA"
  echo "Índice (pg_restore --list): $N_TABLAS tablas ($N_PUBLIC en public), $N_DATOS bloques de datos, $N_ESQUEMAS esquemas"
  echo "Filas dentro de la copia: $TOTAL_FILAS en $TABLAS_CON_FILAS tablas con datos"
  echo "Las 10 más grandes (filas en la copia):"
  head -10 "$TMP/filas.tsv" | awk -F'\t' '{printf "  %8d  %s\n", $1, $2}'
  echo "Cruce con la base viva (count(*) READ ONLY, justo después; puede subir por ventas nuevas):"
  while IFS=$'\t' read -r t n; do
    c="$(awk -F'\t' -v t="$t" '$2 == t {print $1}' "$TMP/filas.tsv")"
    printf '  %-40s copia %8s · ahora %8s\n' "$t" "$c" "$n"
  done < "$TMP/vivo.tsv"
  echo "Ojo: no trae los archivos de Supabase Storage (fotos/PDF), sólo sus filas."
  echo "Restaurar SIEMPRE en una base vacía (nunca sobre la de producción); ver el runbook."
} | tee "$ARCH.txt"

# ── 2.ª copia en el disco de Windows ────────────────────────────────────
if [ "$WIN" != "no" ] && [ -d "$(dirname "$WIN")" ]; then
  mkdir -p "$WIN"
  cp "$ARCH" "$ARCH.sha256" "$ARCH.txt" "$WIN/"
  if (cd "$WIN" && sha256sum -c --quiet "$NOMBRE.sha256"); then
    echo "2.ª copia: $WIN/$NOMBRE (sha256 igual)"
  else
    fallar "la 2.ª copia en $WIN no coincide en sha256"
  fi
else
  echo "2.ª copia: omitida ($WIN no disponible)"
fi
echo "Lista: $ARCH"
