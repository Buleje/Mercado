---
name: commit
description: Crear un commit con mensaje Conventional Commits para los cambios actuales. Usar cuando el usuario quiera guardar cambios, hacer commit, o commitear.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
argument-hint: [mensaje-opcional]
model: haiku
---

# Commit — Buleje

`$ARGUMENTS` = mensaje opcional. Si vacío, auto-generar analizando cambios.

## Pasos

### 1. Analizar cambios

```bash
git status && git diff --staged && git diff
```

### 2. Clasificar tipo (Conventional Commits)

| Tipo | Cuándo |
|------|--------|
| `feat` | Funcionalidad nueva visible al usuario |
| `fix` | Corrección de bug |
| `refactor` | Cambio interno sin comportamiento nuevo |
| `test` | Tests nuevos o modificados |
| `chore` | Mantenimiento, deps, config |
| `docs` | Solo documentación |
| `perf` | Mejora de rendimiento |
| `style` | Formato, nombres (sin lógica) |

### 3. Scope (opcional)

Basado en archivos: `checkout` | `inventory` | `auth` | `api` | `admin` | `cart` | `db` | `ui` | `config`

### 4. Construir mensaje

- Formato: `tipo(scope): descripción en español, imperativo`
- Max 72 chars primera línea
- Sin punto final
- Si `$ARGUMENTS` dado, adaptarlo al formato

### 5. Staging selectivo

```bash
git add <archivo1> <archivo2> ...
```

- **NUNCA `git add .` ni `git add -A`**
- NO agregar `.env*`, secrets, temporales, cache
- En duda: `git diff <archivo>` primero

### 6. Crear commit

```bash
git commit -m "tipo(scope): descripcion"
# Multi-línea si merece cuerpo:
git commit -m "tipo(scope): descripcion corta" -m "Detalle..."
```

### 7. Confirmar

Mostrar: hash, mensaje completo, archivos incluidos.

## Reorganización masiva (>50 archivos sucios simultáneos)

Cuando hay semanas de trabajo acumulado sin commitear (varias features distintas
mezcladas en el mismo working tree), NO es un solo commit ni `git add -A` a
ciegas. Patrón verificado en sesión 2026-08-19 (555 archivos → 13 commits):

1. **Agrupar por área temática**, no por commit único. Categorizar con
   `git status --porcelain=v1` + grep/python por prefijo de path, escribir
   cada grupo a un archivo de pathspecs, y `git add --pathspec-from-file=<f>`
   (evita quoting hell con paths raros).
2. **Verificar el conteo ANTES de commitear cada grupo**: `git diff --cached
   --name-only | wc -l` tiene que matchear lo esperado. Si no matchea, un
   `git add -A` anterior puede haber dejado OTRO grupo ya staged encima — no
   commitear a ciegas, revisar con `git diff --cached --name-only` primero.
   (Un mega-commit mal etiquetado en esa sesión se resolvió con `git reset
   --soft HEAD~1`, seguro porque no rompe nada — deja todo staged de nuevo.)
3. **Un archivo de dominio puede vivir fuera de su carpeta esperada** — pasó
   3 veces esa sesión: `lib/db/<feature>.db.ts` fuera de `lib/<feature>/`,
   `components/admin/<feature>/**` fuera del grep de esa feature. Antes de
   cerrar el último grupo ("resto"), `git status --porcelain=v1 | grep -i
   <nombre-de-cada-feature-ya-commiteada>` para cazar archivos huérfanos y
   darles su propio commit chico en vez de enterrarlos en "admin general".
4. **El gate de vitest `--changed HEAD` da falsos positivos masivos** con
   cientos de archivos sucios simultáneos: detecta cambios en TODO el árbol
   sucio, no sólo lo staged de este commit — un test puede fallar por OTRO
   archivo que sigue dirty y no tiene nada que ver. Antes de usar
   `SKIP_VITEST_GATE=1`: `git diff -- <archivo-que-importa-el-módulo-que-
   falla>` para confirmar que el archivo real está fuera del stage actual.
   Si es así, está justificado — documentarlo en el body del commit (qué
   suite falló y por qué no es de este grupo). Si el fallo SÍ toca algo
   staged, investigar de verdad (no es un falso positivo) y arreglar el
   mock/bug antes de commitear, como se hizo esa sesión con
   `orders-coupon-loyalty.test.ts`.
5. **Con commits en background (`run_in_background: true` por el gate lento
   de tsc), esperar la confirmación real antes de tocar el índice de nuevo**
   — un `git add` de otro grupo mientras el commit anterior sigue en su
   pre-commit hook contamina ESE commit con archivos de dos grupos distintos.

## Reglas críticas

- **NUNCA** commitear `.env*` ni secrets
- Cambios en `prisma/schema.prisma` -> commit separado: `chore(db): ...`
- Múltiples cambios independientes -> sugerir commits separados
- `BREAKING CHANGE:` en cuerpo si API pública cambia incompatiblemente
- Si `$ARGUMENTS` no sigue Conventional Commits, adaptarlo
