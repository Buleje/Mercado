#!/bin/bash
# Uso: CARRILES=<carpeta de carriles, ruta absoluta o desde la raíz del repo; adentro <carril>/files-<paquete>.txt y msg-<paquete>.txt> commit-carril.sh <carril> <paquete>
# Commit en fila (flock) con sólo los archivos del paquete; si el pre-commit cae SÓLO por tipos/tests de
# otro carril a medio construir (tsc-ajenos.mjs lo verifica), commitea saltando esos dos gates. Noche 17-10: 39 commits
# con 6-8 carriles en paralelo; antes, un carril rojo trababa a todos (10-10: 1,5 h).
cd "$(dirname "$0")/../.."
D=$(realpath "$CARRILES")/$1
P=$2; LOG=$D/commit-$P.log
# commitlint corta en 100 por línea (asunto y cuerpo): frenarlo acá ahorra un pre-commit de ~70 s (25-10).
LARGAS=$(awk '!/^(Co-Authored-By|Claude-Session):/ && length > 100 { print "línea "NR": "length" caracteres" }' "$D/msg-$P.txt")
[ -n "$LARGAS" ] && { echo "NO COMMITEA: líneas de más de 100 en msg-$P.txt"; echo "$LARGAS"; exit 1; }
# commitlint `subject-case`: «feat(x): Algo» cae; «feat(x): algo» pasa (25-10: dos commits caídos).
head -1 "$D/msg-$P.txt" | grep -qE '^[a-z]+(\([^)]*\))?!?: [[:upper:]ÁÉÍÓÚÑ]' && { echo "NO COMMITEA: el asunto de msg-$P.txt empieza con mayúscula"; exit 1; }
for intento in $(seq 1 10); do
  # Array + `printf %q` (17-10): `app/(store)/zona/[ciudad]/…` rompía el `bash -c` («syntax error near `('»)
  # y el commit del cargador reintentó 20 min sin decir por qué; los corchetes además son comodines sin comillas.
  mapfile -t ARR < <(grep -v '^\s*$' "$D/files-$P.txt" | grep -v '^\.claude/' | while read -r f; do [ -e "$f" ] || git cat-file -e "HEAD:$f" 2>/dev/null && echo "$f"; done)
  [ ${#ARR[@]} -eq 0 ] && { echo "$(date +%H:%M) $1/$P sin archivos"; exit 0; }
  if [ -z "$(git status --porcelain -- "${ARR[@]}")" ]; then echo "$(date +%H:%M) $1/$P ya commiteado"; exit 0; fi
  FILES=$(printf '%q ' "${ARR[@]}")
  # `git add -N` sólo con lo que existe: un borrado en la lista daba «pathspec did not match» (exit 128)
  # en CADA intento y el carril de inventario reintentó 40 min creyendo que era el index.lock (25-10).
  mapfile -t EXISTEN < <(for f in "${ARR[@]}"; do [ -e "$f" ] && echo "$f"; done)
  ADD=""; [ ${#EXISTEN[@]} -gt 0 ] && ADD="git add -N $(printf '%q ' "${EXISTEN[@]}") && "
  MSG=$(printf '%q' "$D/msg-$P.txt")
  for _ in $(seq 1 90); do [ -f .git/index.lock ] || break; sleep 2; done
  HUSKY_SKIP_POSTCOMMIT=1 flock /tmp/bsm-pesado.lock bash -c "${ADD}git commit -F $MSG -- $FILES" > $LOG 2>&1
  r=$?; echo "$(date +%H:%M) $1/$P intento $intento exit $r"
  [ $r -eq 0 ] && { git log --oneline -1; exit 0; }
  sed 's/\x1b\[[0-9;]*m//g' $LOG | grep -hE "error TS|×|FAIL|✗|✖|^fatal:|^error:" | head -5
  if [ $r -eq 128 ] && ! grep -q "index.lock" $LOG; then echo "NO REINTENTA: git fatal (ver $LOG)"; exit 1; fi
  if sed 's/\x1b\[[0-9;]*m//g' $LOG | grep -qE "commit-msg script failed|eslint --max-warnings [0-9]+ \[FAILED\]"; then echo "NO REINTENTA: lint/mensaje"; exit 1; fi
  # Sólo cayó el gate de tipos: ¿los errores son de otro carril a medio construir?
  # Sólo cayeron tipos y/o tests: ¿por archivos de otro carril a medio construir?
  OTROS=$(sed 's/\x1b\[[0-9;]*m//g' $LOG | grep '^❌' | grep -vcE 'TypeScript errors detected|Tests related to staged changes failed')
  if [ "$OTROS" = "0" ] && grep -qE "TypeScript errors detected|Tests related to staged changes failed" $LOG; then
    if flock /tmp/bsm-pesado.lock node scripts/dev-helpers/tsc-ajenos.mjs $D/files-$P.txt $LOG; then
      HUSKY_SKIP_POSTCOMMIT=1 SKIP_TSC_GATE=1 SKIP_VITEST_GATE=1 flock /tmp/bsm-pesado.lock bash -c "${ADD}git commit -F $MSG -- $FILES" > $LOG 2>&1 \
        && { echo "$(date +%H:%M) $1/$P commit con tipos/tests ajenos rojos"; git log --oneline -1; exit 0; }
    fi
  fi
  sleep 120
done
exit 1
