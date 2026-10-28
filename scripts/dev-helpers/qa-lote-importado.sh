#!/usr/bin/env bash
# Lote de prueba EN CONSUMO en el tenant QA forestal, importado como si viniera
# del Excel del SNIFFS (ADR-520) con QA19-PL-01/02 (Shihuahuaco, guía
# QA19-GTF-A1). Sale del 27-10: se armó y deshizo a mano 3 veces.
#
#   scripts/dev-helpers/qa-lote-importado.sh crear QA-X-01     → lo importa (imprime la respuesta)
#   scripts/dev-helpers/qa-lote-importado.sh deshacer QA-X-01  → anula su corrida y devuelve las trozas al patio
#
# Sólo escribe en QA (nunca en Blas ni en main). Necesita el dev server en :3000.
set -euo pipefail
cd "$(dirname "$0")/../.."
SLUG=inversiones-agroforestales-blas-sociedad-op-qa-ui
TID=cmtqtncxz001vs8vze4o3y7j9
BASE=${BSM_BASE:-http://localhost:3000}
accion=${1:?uso: crear|deshacer <N° de lote>}
code=${2:?falta el N° de lote}
FLAGS=$(BSM_TENANT=$SLUG node scripts/dev-helpers/admin-auth.mjs --flags | tail -1)
cuerpo=$(mktemp)
trap 'rm -f "$cuerpo"' EXIT

fila() {
  printf '{"fila":%s,"contrato":"QA-ADR430-PERMISO-01","resolucion":null,"tipoDocumento":"GTF","gtf":"QA19-GTF-A1","codigoPlanta":"%s","codigoTroza":"%s","trozaPadre":null,"especie":"Shihuahuaco","lote":"%s","d1Cm":null,"d2Cm":null,"largoM":null,"volumenM3":null,"tipoProducto":null,"estado":"En consumo","fecha":"2026-10-19"}' "$1" "$2" "$3" "$code"
}

case "$accion" in
  crear)
    printf '{"modo":"importar","code":"%s","fecha":"2026-10-19","filas":[%s,%s]}' "$code" \
      "$(fila 1 QA19-PL-01 QA19-A-001)" "$(fila 2 QA19-PL-02 QA19-A-002)" > "$cuerpo"
    eval "curl -s -X POST $BASE/api/admin/forestal/lotes-aserrio/importar $FLAGS -H 'Content-Type: application/json' --data @$cuerpo"
    echo
    ;;
  deshacer)
    id=$(node scripts/sql-lectura.mjs 'select id from "ForestLoteAserrio" where "tenantId"=$1 and code=$2 and "deletedAt" is null' "$TID" "$code" \
      | grep -oE "'c[a-z0-9]{20,}'" | tr -d "'" | head -1)
    [ -n "$id" ] || { echo "No hay un lote vivo $code en QA"; exit 1; }
    printf '{"accion":"deshacer-forzado","loteId":"%s","motivo":"prueba QA del lote importado"}' "$id" > "$cuerpo"
    eval "curl -s -X PATCH $BASE/api/admin/forestal/lotes-aserrio $FLAGS -H 'Content-Type: application/json' --data @$cuerpo"
    echo
    ;;
  *) echo "uso: crear|deshacer <N° de lote>"; exit 1 ;;
esac
