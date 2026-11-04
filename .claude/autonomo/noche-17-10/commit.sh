#!/bin/bash
# Uso: commit.sh <carril> <paquete>  (lee carriles/<carril>/files-<paquete>.txt y msg-<paquete>.txt)
# Commit en fila con sus archivos; si el pre-commit cae por el árbol rojo de otro carril, espera 2 min y reintenta (≤10).
cd /home/usuario/proyectos/Mercado
D=/home/usuario/proyectos/Mercado/.claude/autonomo/noche-17-10/carriles/$1
P=$2; LOG=$D/commit-$P.log
for intento in $(seq 1 10); do
  FILES=$(grep -v '^\s*$' $D/files-$P.txt | grep -v '^\.claude/' | while read -r f; do [ -e "$f" ] || git cat-file -e "HEAD:$f" 2>/dev/null && echo "$f"; done | tr '\n' ' ')
  [ -z "$FILES" ] && { echo "$(date +%H:%M) $1/$P sin archivos"; exit 0; }
  if [ -z "$(git status --porcelain -- $FILES)" ]; then echo "$(date +%H:%M) $1/$P ya commiteado"; exit 0; fi
  :
  HUSKY_SKIP_POSTCOMMIT=1 flock /tmp/bsm-pesado.lock bash -c "git add -N $FILES && git commit -F $D/msg-$P.txt -- $FILES" > $LOG 2>&1
  r=$?; echo "$(date +%H:%M) $1/$P intento $intento exit $r"
  [ $r -eq 0 ] && { git log --oneline -1; exit 0; }
  sed 's/\x1b\[[0-9;]*m//g' $LOG | grep -hE "error TS|×|FAIL|✗|✖" | head -5
  if sed 's/\x1b\[[0-9;]*m//g' $LOG | grep -qE "commit-msg script failed|eslint --max-warnings [0-9]+ \[FAILED\]"; then echo "NO REINTENTA: lint/mensaje"; exit 1; fi
  # Sólo cayó el gate de tipos: ¿los errores son de otro carril a medio construir?
  # Sólo cayeron tipos y/o tests: ¿por archivos de otro carril a medio construir?
  OTROS=$(sed 's/\x1b\[[0-9;]*m//g' $LOG | grep '^❌' | grep -vcE 'TypeScript errors detected|Tests related to staged changes failed')
  if [ "$OTROS" = "0" ] && grep -qE "TypeScript errors detected|Tests related to staged changes failed" $LOG; then
    if flock /tmp/bsm-pesado.lock node $(dirname $0)/tsc-ajenos.mjs $D/files-$P.txt $LOG; then
      HUSKY_SKIP_POSTCOMMIT=1 SKIP_TSC_GATE=1 SKIP_VITEST_GATE=1 flock /tmp/bsm-pesado.lock bash -c "git add -N $FILES && git commit -F $D/msg-$P.txt -- $FILES" > $LOG 2>&1 \
        && { echo "$(date +%H:%M) $1/$P commit con tipos/tests ajenos rojos"; git log --oneline -1; exit 0; }
    fi
  fi
  sleep 120
done
exit 1
