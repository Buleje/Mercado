#!/bin/bash
cd /home/usuario/proyectos/Mercado
S=/home/usuario/proyectos/Mercado/.claude/autonomo/pendiente-commit-t5
PFX=$1; JSONF=$1-files.json; shift
for c in "$@"; do
  for intento in $(seq 1 20); do
    FILES=$(node -e 'const fs=require("fs");console.log(require(process.argv[1])[process.argv[2]].filter(f=>fs.existsSync(f)).join(" "))' $S/$JSONF $c)
    git add -N $FILES 2>/dev/null
    PRECOMMIT_SECUENCIAL=1 HUSKY_SKIP_POSTCOMMIT=1 flock /tmp/bsm-pesado.lock git commit -F $S/msg-$PFX-$c.txt -- $FILES > $S/commit-$PFX-$c.log 2>&1
    r=$?
    echo "$(date +%H:%M) $c intento $intento exit $r"
    [ $r -eq 0 ] && break
    grep -hE "error TS|×|FAIL" $S/commit-$PFX-$c.log | head -3
    sleep 180
  done
done
