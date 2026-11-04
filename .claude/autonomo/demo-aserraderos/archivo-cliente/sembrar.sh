#!/usr/bin/env bash
# Sube los 5 papeles inventados a «Clientes/Maderera El Bosque» del tenant main y marca su estado.
set -u
. /tmp/bsm-auth.env
P="${PAPELES:-papeles}"; R="Clientes/Maderera El Bosque"; : > ids.txt
subir() { # archivo, nombre visible, estado
  local id
  id=$(curl -s -H "Cookie: $BSM_COOKIE" -H "x-csrf-token: $BSM_CSRF" -F "file=@$P/$1;type=application/pdf;filename=$2" -F "carpetaRuta=$R" "$BSM_BASE/api/admin/documents" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.id||j.document?.id||j.doc?.id||("ERR "+s.slice(0,200)))}catch{console.log("ERR "+s.slice(0,200))}})')
  echo "$2 → $id"; [[ "$id" == ERR* ]] && return
  echo "$id" >> ids.txt
  if [ -n "$3" ]; then curl -s -o /dev/null -w "  estado $3: %{http_code}\n" -H "Cookie: $BSM_COOKIE" -X PATCH -H "x-csrf-token: $BSM_CSRF" -H 'content-type: application/json' -d "{\"status\":\"$3\"}" "$BSM_BASE/api/admin/documents/$id"; fi
}
subir "Estado de cuenta - Carga 14 (version del 31-10).pdf" "Estado de cuenta - Carga 14 (versión del 31-10).pdf" archived
subir "Estado de cuenta - Carga 14.pdf" "Estado de cuenta - Carga 14.pdf" approved
subir "Cubicacion - Carga 14.pdf" "Cubicación - Carga 14.pdf" approved
subir "Cotizacion 0003 - Maderera El Bosque.pdf" "[EN REVISIÓN] Cotización 0003.pdf" review
subir "Guia de remision - Carga 14.pdf" "Guía de remisión - Carga 14.pdf" approved
