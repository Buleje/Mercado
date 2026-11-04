#!/usr/bin/env sh
# Gates del pre-commit que corren DESPUÉS de lint-staged (lo llama .husky/pre-commit).
#
# Por qué en paralelo (medido 2026-09-25, 26 .ts sucios, dev server vivo):
#   tipos (tsc 7) ........ 4 s con el árbol ya chequeado · 19 s en frío
#   vitest ............... 17 s con UN solo test (≈15 s son el arranque) · 31 s con 55
#   anidado HTML ......... 9 s (recorre el repo entero)
# Ninguno lee lo que escribe otro, así que en fila el commit pagaba la SUMA y en
# paralelo paga el MÁS LENTO. lint-staged queda afuera y antes: `eslint --fix` y
# `prettier --write` reescriben los archivos que estos gates leen.
#
# Por qué `vitest related <staged>` y no `--changed HEAD`: `--changed` corre los
# tests de TODO lo sucio del árbol, no de lo que se commitea. Con otro agente
# editando al lado, un test roto por su WIP bloqueaba un commit que no lo toca.
# Si se stagea config que vitest trata como «re-correr todo» (package.json,
# vitest/vite config, tsconfig), se vuelve a `--changed HEAD`.
#
# Emergency bypass: HUSKY=0 git commit ...

STAGED=$(git diff --cached --name-only --diff-filter=ACMR)
STAGED_TS=$(printf '%s\n' "$STAGED" | grep -E '\.(ts|tsx|mts|cts)$' || true)
if [ -z "$STAGED_TS" ]; then
  echo "✅ No TypeScript files staged — skipping tsc gate"
  exit 0
fi
STAGED_TSX=$(printf '%s\n' "$STAGED_TS" | grep -E '\.tsx$' || true)
STAGED_UI=$(printf '%s\n' "$STAGED_TS" | grep -E '^(components/(admin|store)|app/t)/' || true)
STAGED_CODE=$(printf '%s\n' "$STAGED" | grep -E '\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$' || true)
VITEST_TODO=$(printf '%s\n' "$STAGED" | grep -E '(^|/)(package(-lock)?\.json|(vitest|vite)\.config\.[cm]?[jt]s|vitest\.setup\.[jt]sx?|tsconfig[^/]*\.json)$' || true)

# ── Rápidos (<1 s): en fila, cortan antes de lanzar lo caro ─────────────────
# Delta check: block NEW empty .catch() in staged files.
EMPTY_CATCHES=$(git diff --cached --diff-filter=ACMR -U0 -- '*.ts' '*.tsx' | grep -E '^\+.*\.catch\(\s*(\(\s*\w*\s*\))?\s*=>\s*\{\s*\}\s*\)' || true)
if [ -n "$EMPTY_CATCHES" ]; then
  echo ""
  echo "❌ New empty .catch(() => {}) detected in staged changes:"
  echo "$EMPTY_CATCHES"
  echo ""
  echo "   Use: .catch((err) => logger.error('[ctx] failed', { error: String(err) }))"
  echo "   Emergency bypass: HUSKY=0 git commit ..."
  exit 1
fi
echo "✅ No new empty .catch()"

# Danger-zone skills integrity (sólo si el hook danger-zone está activo).
if [ -f .claude/hooks/danger-zone.mjs ]; then
  node scripts/check-zone-skills.mjs || {
    echo ""
    echo "❌ Falta algún skill .instructions.md referenciado por danger-zone.mjs."
    echo "   Corre \`npm run dev:dangers:check\` para ver cuál."
    exit 1
  }
fi

# ── Lentos: en paralelo ─────────────────────────────────────────────────────
TMP=$(mktemp -d "${TMPDIR:-/tmp}/pre-commit.XXXXXX")
trap 'rm -r "$TMP"' EXIT
trap 'exit 130' INT TERM

# $1 = nombre; el resto es el comando. Guarda salida y exit code aparte.
gate() {
  nombre=$1
  shift
  "$@" >"$TMP/$nombre.log" 2>&1
  echo $? >"$TMP/$nombre.rc"
}

# El .rc arranca en 2 («no terminó») ANTES de lanzar: si el gate muere sin
# escribir el suyo (OOM, kill), el reporte lo da por fallado. Sin esto, un .rc
# ausente hacía desaparecer el gate del reporte y el commit pasaba en verde
# (reproducido con kill -9 por el reviewer, 2026-09-25).
# Con poca RAM libre corren en fila: en paralelo suman tsc 2,5-4,9 GB + vitest +
# nesting 0,7 GB. PRECOMMIT_SECUENCIAL=1 fuerza la fila.
DISPONIBLE_MB=$(awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null)
EN_PARALELO=1
if [ "${PRECOMMIT_SECUENCIAL:-0}" = "1" ] || [ "${DISPONIBLE_MB:-99999}" -lt 4096 ]; then
  EN_PARALELO=0
fi
lanzar() {
  echo 2 >"$TMP/$1.rc"
  if [ "$EN_PARALELO" = "1" ]; then
    gate "$@" &
  else
    gate "$@"
  fi
}

tokens() {
  npx tsx scripts/lint-design-tokens.ts --staged || return 1
  # ADR-075 Sprint D6: preview informativo, no bloquea.
  echo "🎨 design-strict preview (warnings only):"
  npx tsx scripts/lint-design-tokens.ts --staged --design-strict || true
}

MODO="en paralelo"; [ "$EN_PARALELO" = "1" ] || MODO="en fila (${DISPONIBLE_MB:-?} MB libres)"
echo "🔎 Gates $MODO — $(printf '%s\n' "$STAGED_TS" | wc -l | tr -d ' ') archivo(s) TS staged"
T0=$(date +%s)
# Sello (03-11, «guardar sin repetir»): si el código es el mismo que ya pasó un
# typecheck o vitest verde (`npm run typecheck`, `scripts/dev-helpers/probar.sh`
# o un commit anterior que falló por otra cosa), ese gate no se repite.
CLAVE=$(sh scripts/dev-helpers/sello.sh clave 2>/dev/null || true)
TSC_LANZADO=0; VITEST_LANZADO=0
# SKIP_TSC_GATE=1: sólo cuando el que commitea ya verificó que los errores son de
# archivos ajenos sin commitear (carriles en paralelo; `scripts/dev-helpers/tsc-ajenos.mjs` desde `commit-carril.sh`).
if [ "${SKIP_TSC_GATE:-0}" = "1" ]; then
  echo "⏭️  tipos verificados aparte (SKIP_TSC_GATE)" >"$TMP/tsc.log"; echo 0 >"$TMP/tsc.rc"
elif sh scripts/dev-helpers/sello.sh ok tsc "$CLAVE"; then
  echo "⏭️  tipos ya verificados con este mismo código (sello)" >"$TMP/tsc.log"; echo 0 >"$TMP/tsc.rc"
else
  lanzar tsc node scripts/tsc7.mjs --noEmit; TSC_LANZADO=1
fi

if [ "${SKIP_VITEST_GATE:-0}" != "1" ]; then
  if [ -n "$VITEST_TODO" ]; then
    lanzar vitest npx vitest run --changed HEAD --project unit --passWithNoTests
  else
    # Extra = tests que leen el FUENTE con readFileSync (`related` no los ve;
    # 04-10 `loth-cupo-t9-reglas` quedó rojo con un commit verde) + guardianes de
    # TODO el repo (recorren carpetas; 04-10 `infotip-no-anidado` estuvo rojo 4
    # días). La lista sale de `vitest-extra.sh`, la misma que usa `probar.sh`.
    # set -f: 342 rutas del repo llevan corchetes ([tenantSlug]) y sin esto el
    # shell las toma como comodines al expandir la lista.
    set -f
    # shellcheck disable=SC2086
    VITEST_EXTRA=$(sh scripts/dev-helpers/vitest-extra.sh $STAGED_CODE)
    # shellcheck disable=SC2086
    if sh scripts/dev-helpers/sello.sh ok vitest "$CLAVE" $STAGED_CODE; then
      echo "⏭️  tests ya pasados con este mismo código (sello)" >"$TMP/vitest.log"; echo 0 >"$TMP/vitest.rc"
    else
      # shellcheck disable=SC2086
      lanzar vitest npx vitest related $STAGED_CODE $VITEST_EXTRA --project unit --run --passWithNoTests
      VITEST_LANZADO=1
    fi
    set +f
  fi
fi
[ -n "$STAGED_UI" ] && lanzar tokens tokens
[ -n "$STAGED_TSX" ] && lanzar nesting node scripts/check-html-nesting.mjs
wait
# Sellar lo que pasó verde: si el commit falla por otra cosa (lint, mensaje) y
# se reintenta con el mismo código, no se repite.
if [ "$TSC_LANZADO" = "1" ] && [ "$(cat "$TMP/tsc.rc" 2>/dev/null)" = "0" ]; then
  sh scripts/dev-helpers/sello.sh poner tsc "$CLAVE" || true
fi
if [ "$VITEST_LANZADO" = "1" ] && [ "$(cat "$TMP/vitest.rc" 2>/dev/null)" = "0" ]; then
  set -f
  # shellcheck disable=SC2086
  sh scripts/dev-helpers/sello.sh poner vitest "$CLAVE" $STAGED_CODE || true
  set +f
fi

# ── Reporte en orden fijo ───────────────────────────────────────────────────
FALLO=0
# Ausente = 1 y 2 = «no terminó»: nunca se lee como éxito.
rc() { cat "$TMP/$1.rc" 2>/dev/null || echo 1; }
no_termino() {
  [ "$(rc "$1")" = "2" ] && [ ! -s "$TMP/$1.log" ] && echo "   ⚠️  $1 no terminó (¿lo mató la memoria?). Reintentá con PRECOMMIT_SECUENCIAL=1."
  return 0
}

if [ "$(rc tsc)" = "0" ]; then
  tail -1 "$TMP/tsc.log"
else
  cat "$TMP/tsc.log"
  no_termino tsc
  echo ""
  echo "❌ TypeScript errors detected. Fix them before committing."
  echo "   Run \`npm run typecheck\` locally to see the full list."
  echo "   Comparar con el compilador viejo: \`npm run typecheck:legacy\`"
  FALLO=1
fi

if [ -f "$TMP/vitest.rc" ]; then
  if [ "$(rc vitest)" = "0" ]; then
    echo "✅ related tests pass — $(grep -E 'Test Files|sello' "$TMP/vitest.log" | tail -1 | sed 's/^ *//')"
  else
    cat "$TMP/vitest.log"
    no_termino vitest
    echo ""
    echo "❌ Tests related to staged changes failed."
    echo "   Reproducir: npx vitest related <archivos staged> --run"
    echo "   Skip gate for this commit: SKIP_VITEST_GATE=1 git commit ..."
    FALLO=1
  fi
fi

if [ -f "$TMP/tokens.rc" ]; then
  if [ "$(rc tokens)" = "0" ]; then
    cat "$TMP/tokens.log"
    echo "✅ Design tokens clean"
  else
    cat "$TMP/tokens.log"
    no_termino tokens
    echo ""
    echo "❌ Design token violations detected (ADR-068 armonia)."
    echo "   Fix or add to whitelist in scripts/lint-design-tokens.ts."
    FALLO=1
  fi
fi

if [ -f "$TMP/nesting.rc" ]; then
  if [ "$(rc nesting)" = "0" ]; then
    echo "✅ Anidado HTML limpio"
  else
    cat "$TMP/nesting.log"
    no_termino nesting
    echo ""
    echo "❌ Anidado HTML inválido — React va a tirar error de hidratación."
    echo "   Bloque dentro de <p> → usá <div>. Control dentro de <button>/<a> →"
    echo "   sacalo afuera, o el contenedor va <div role=\"button\" tabIndex={0} onKeyDown>."
    echo "   Wrappers en riesgo (no bloquean): npm run lint:nesting:strict"
    FALLO=1
  fi
fi

echo "⏱️  gates $MODO: $(( $(date +%s) - T0 )) s"
if [ "$FALLO" = "1" ]; then
  echo "   Emergency bypass: HUSKY=0 git commit ..."
  exit 1
fi
