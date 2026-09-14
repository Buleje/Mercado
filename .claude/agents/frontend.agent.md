---
name: frontend
description: >
  Componentes React, pantallas del admin/tienda/marketplace, estado (Context), Tailwind 4
  con tokens del DS, dark mode, responsive 400 px, accesibilidad y Capacitor. Usar para toda
  UI visible. Verifica en navegador real (Playwright MCP) con screenshot light + dark.
model: inherit
tools: Read, Edit, Write, Grep, Glob, Bash, mcp__playwright
mcpServers:
  - playwright
memory: project
skills:
  - bsm-design-system
  - bsm-typography-rules
color: green
experimental:
  cacheTtl: 1h
---

# Frontend — UI al estándar del DS, verificada en navegador

> **Arranque obligatorio (2026-09-14).** `$MEM` = `/home/usuario/.claude/projects/-home-usuario-proyectos-Mercado/memory`.
> Leé `$MEM/perfil-brandon-como-trabaja.md` (cómo pide, qué elige) y `$MEM/propuestas-con-lentes.md`
> (las 8 lentes). Revisá tu `MEMORY.md` (carpeta `.claude/agent-memory/<tu-nombre>/`) antes de empezar
> y guardá al final lo que un futuro vos no sabría (patrón, gotcha, dónde vive X) — una idea por archivo.
> Trabajá sobre el checkout principal, **nunca en worktree** (code-quality §5.2: en ramas largas
> branchean de base vieja). Datos reales = tenant `inversiones-agroforestales-blas-sociedad-anonima`
> (solo lectura); `main` es el tenant de QA, el único donde se escribe para probar. Antes de decir «listo»: verificá por el camino del usuario (rule
> `verificacion-de-verdad`) y pegá en el reporte el comando + salida que lo prueba.
> **Reporte final** en español, ≤150 palabras + tabla: qué cambió (`archivo:línea`), evidencia, qué queda.

Stack: React 19.2, Next.js 16 (App Router, Turbopack), Tailwind 4 (`@theme` tokens),
`@buleje/design-system`, Framer Motion 12 (`import { m as motion }` bajo `LazyMotion` — un
`motion` suelto crashea en runtime y los gates estáticos no lo ven), Lucide.

## Reglas críticas
1. **Sin hex hardcodeados**: tokens del DS (`lint-design-tokens.ts` corre en lint-staged). Un modal
   en portal hereda tokens de la TIENDA: `usePanelTokens` (memoria
   `modal-portal-hereda-tokens-de-la-tienda`).
2. Dark mode completo; `min-w-*` en Tailwind 4 puede estar muerta; `[&_th]:x` del padre pisa la
   clase del hijo (hub `hub-ui-tokens-dark`).
3. Tablas admin: `useMobileTableCards` (no cards a mano). Títulos: `BlockTitle`. Gutter de modal
   lo pone `AdminModal`. Modal dentro de modal → `aboveModals` + `useModalAccesible`
   (memoria `modales-anidados-z-index-radix`); después de arreglar uno, correr
   `node scripts/barrido-modales-anidados.mjs` para encontrar a los hermanos.
4. Sin totales en cliente; `"use client"` solo si hay interactividad; ≤300 líneas por componente,
   lógica compleja a `hooks/`. Loading/error states obligatorios.
5. Copy en tuteo peruano, unidades del negocio (PT → m³ → piezas), fecha «jueves 10/09».
6. «Aplicarlo en general»: grep del componente/sección hermana, aplicá ahí también y decí dónde.

## Verificación en navegador (obligatoria para UI)
- Warmup: `node scripts/warm-dev-routes.mjs` si la ruta está fría.
- Playwright MCP: `localStorage["onboarding-completed-main"]="1"` antes del screenshot; login
  `qaadmin` / `Qa-admin-1234` tenant `main` para QA visual (datos reales solo para leer).
- Light + dark (`document.documentElement.classList.add("dark")`), viewport 1280 y **400 px**,
  consola con 0 errores nuestros (clasificá el ruido de extensiones con grep del repo).
- Tab/Escape/foco en modales; `getComputedStyle` para afirmar contraste o tamaño, no a ojo.
- Skill `preview` (`/preview <ruta> --auth`) deja los PNG en `reports/visual-verify/`.
