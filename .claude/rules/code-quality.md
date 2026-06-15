---
paths:
  - "components/**"
  - "app/**"
  - "lib/**"
  - "hooks/**"
  - "packages/**"
---

# Estándar de calidad de código (enterprise) — formato fijo

> Norte: cada línea debe ser **legible, tipada, testeable y consistente** con el código vecino. Imita el estilo del archivo que tocás (densidad de comentarios, naming, idioma). Calidad > velocidad cuando hay dinero/datos/compliance de por medio.

## 1. TypeScript
- **Cero `any`.** Tipos explícitos en params/retornos públicos. `unknown` + narrowing antes que `any`.
- Validar entrada externa con **Zod `safeParse`** (nunca `.parse()`); tipá desde el schema (`z.infer`).
- Sin imports sin usar (eslint `no-unused-vars` es error). Imports primero (`import/first`).
- Nullables: `?.` / `??`, no `!` salvo invariante probado.

## 2. Componentes React
- **Máx ~300 LOC.** Si crece: extraé sub-componentes a archivos, lógica a `hooks/use-*`, tipos/configs a un `shared.ts(x)`.
- Datos: un **hook dedicado** (`use-<dominio>`), no `fetch` gigante inline en el componente.
- `"use client"` primera línea, solo si hay interactividad.
- Sin `function X` definido dentro del render (re-mount). Helpers a top-level o memo.
- Listas: `key` estable (no índice si reordena).
- No anidar `<button>` en `<a>` ni viceversa → usar `<div role="button" tabIndex={0} onKeyDown>`.

## 3. Design System (NO negociable en admin/store) — ADR-070/075
- Headings: **`PageTitle`/`SectionTitle`/`CardTitle`** del DS, nunca `<h1/h2/h3 className="...diseño...">`.
- Texto: `text-xs/sm/base/...` o `text-[length:var(--ts-2xs|xs|...)]`. **Prohibido `text-[10px]`** y tamaños arbitrarios.
- Color: tokens `--data-{success,warning,error,info}` / `--text-*` / `--surface-*`. **Sin hex ni `emerald/red-700` literales.**
- Tablas densas: preferí `<DataTable>`; `<table>` raw solo con headers/sort/spans custom (warning aceptable).
- Bordes/sombras: tokens (`--shadow-*`); no `shadow-2xl`.

## 4. Errores y side-effects
- **Nunca `.catch(() => {})` vacío.** Fire-and-forget = `.catch((err) => logger.error("[ctx] x failed", { error: String(err) }))`.
- Background work no rompe el request (try/catch + log), pero **siempre loguea**.
- Mutaciones: invalidar caché tras el write.

## 5. Refactors (cómo descomponer sin romper)
1. **Behavior-preserving primero, pulir después** (dos pasos, no mezclar).
2. Editá **en `main`, NO worktree** (los worktrees branchean de base vieja y pierden lógica).
3. Extraé **de abajo hacia arriba** (no corre las líneas de lo que falta).
4. Copia a nivel shell (`cat header <(sed -n a,bp) > file`) = cero pérdida de lógica; `tsc`/eslint atrapan imports faltantes.
5. **single source**: helpers/configs compartidos a un módulo, sin duplicar.
6. Eliminá código muerto (verificá `grep -rn` repo-wide que no se use antes de borrar).
7. Verificá **delta LOC negativo + que no se borró lógica** (líneas no-`className`).

## 6. Verificación antes de decir "listo" (gate real, no narrado)
`tsc --noEmit` (con `NODE_OPTIONS=--max-old-space-size=8192`) · `eslint` 0 errores · **design gate Y design-strict en 0 errores** · vitest related · y **evidencia ejecutable**: curl + dev-log, o screenshot/snapshot del navegador. Si no se puede verificar, no se reporta como hecho. Distinguí **gate bloqueante** de **preview**: no llames "verde" a un preview con errores.

## 7. Commits
- Conventional Commits, **subject en minúscula** (commitlint `subject-case`), ≤100 chars.
- Commit solo con gates en verde **de verdad** (los del pre-commit). Co-author al final.

## 8. RAM / WSL (operativo)
- Cerrá el navegador Playwright antes de `tsc` 8GB (si no, mem-guard mata el proceso).
- No matar `next.exe` ni wipear `.next` (restart Turbopack 30-90s).
