# Plan de autonomía visual del agente — Buleje

> Brandon (2026-04-28): "quiero que veas mi página, analices, hagas pruebas, mejores constantemente, te adaptes, revises, arregles. Lo más definitivo, mejoras en todo tus usos y habilidades, despliegues agentes de ayuda."

Este documento lista exactamente **qué instalar y configurar** para que pueda iterar sobre el diseño de forma autónoma — capturar screenshots, comparar antes/después, navegar el sitio, detectar regresiones visuales sin intervención manual.

---

## 1. El gap actual (medido)

| Capacidad | Estado | Bloqueador |
|---|---|---|
| Curl HTTP + parsear HTML | ✅ Funciona | — |
| Ejecutar tsc/lint/test | ✅ Funciona | — |
| Editar archivos | ✅ Funciona | — |
| **Navegar como cliente real** | ❌ Bloqueado | `libnspr4.so` falta en WSL → Playwright Chromium no arranca |
| **Tomar screenshot de la UI editada** | ❌ Bloqueado | mismo `libnspr4` |
| **Comparar visual antes/después** | ❌ Bloqueado | sin baseline tool encadenada |
| **Recibir errores de runtime del browser** | ⚠️ Parcial | tail dev.log captura SSR; client-side console ❌ |
| **Reaccionar a Sentry en prod** | ⚠️ Existe skill `production-sync`, falta automatizar |

El cuello de botella es **el browser headless en WSL**. Sin él, todo lo demás (visual regression, automated QA, screenshot diff) está roto.

---

## 2. Qué instalar HOY (orden de prioridad)

### A) **libnspr4 + libnss3** — desbloquea Playwright (bloqueador #1)

```bash
# Brandon: ejecutar UNA VEZ desde tu terminal con sudo
sudo apt-get update
sudo apt-get install -y \
  libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
  libasound2t64 libatspi2.0-0
# alternativa one-liner que Playwright recomienda:
sudo npx playwright install-deps chromium
```

**Después de esto** podré:
- Lanzar `node scripts/visual-verify-admin-focused.mjs` y similares
- Tomar screenshots de cualquier ruta logueado como QA admin
- Comparar baseline vs current con `pixelmatch`
- Ejecutar el skill `/visual-regression` end-to-end

---

### B) **Chrome DevTools MCP** — acceso a console del browser real

```bash
# Permite que vea errores client-side que hoy no detecto
claude mcp add chrome-devtools npx @chromedevtools/mcp@latest
```

Beneficio: cuando un componente falla en el cliente (no SSR), hoy la única señal es el tail del dev log que **no captura** errores de hidratación, console.warn de React, etc. Con esto los veo.

---

### C) **Resemble.js** o **pixelmatch** — comparación visual automática

```bash
npm install --save-dev pixelmatch pngjs
```

Permite que cualquier cambio UI genere un diff PNG automático y me deje claro qué pixeles cambiaron. Ya tengo el skill `/visual-regression` listo, solo falta este paquete.

---

### D) **Playwright trace viewer** (ya viene con Playwright, solo activarlo)

```bash
# Ya está en node_modules, solo hay que invocarlo cuando un E2E falla
npx playwright show-trace test-results/trace.zip
```

Con esto, si un E2E falla, puedo ver **paso a paso** qué pasó en el browser (network, console, DOM) sin re-correr el test.

---

## 3. Hooks que voy a configurar (post-instalación)

Una vez tengas `libnspr4` instalado, configuro estos hooks en `.claude/settings.json`:

### Hook 1 — `post-edit-ui-screenshot` (manual approval)

Cuando edite cualquier archivo en `components/marketplace/**`, `components/store/**`, o `app/marketplace/**`:
1. Espero 3s a que Turbopack recompile
2. Capturo screenshot de la ruta correspondiente con Playwright
3. Lo guardo en `reports/visual-verify/<timestamp>/`
4. Te lo muestro en el siguiente mensaje

### Hook 2 — `pre-report-listo-visual-check`

Antes de decir "listo" en cualquier tarea UI, ejecuto `/visual-regression` automáticamente.
Si hay diff > 5% en alguna ruta crítica, **bloqueo el reporte** y te muestro el diff.

### Hook 3 — `post-storefront-edit-typography-lint`

Cuando edite componentes en `/marketplace/**`, ejecuto un lint que busca:
- `text-xs` o `text-2xs` en body text
- `text-gray-*` sin `dark:` variant
- Inputs con `h-8` o `h-9` (deberían ser `h-12` mín)
- Borders con `border` (deberían ser `border-2` en filtros)

Si encuentra algo, lo corrijo automáticamente.

---

## 4. Agentes nuevos que recomiendo crear

| Agente | Para qué | Cuándo dispara |
|---|---|---|
| **storefront-visual-qa** | Audita el storefront completo (hero/categorías/catálogo/reviews) en mobile + desktop, light + dark, captura screenshots y reporta inconsistencias | Manual: `/storefront-qa` o automático tras editar `/marketplace/**` |
| **typography-enforcer** | Reescribe componentes con texto pequeño aplicando las reglas de `bsm-typography-rules` skill | Cuando lint falla en post-edit o manual `/typography-fix [archivo]` |
| **dark-mode-auditor** | Toma 20 screenshots de routes en dark, detecta zonas con contraste < 4.5:1 (axe-core), reporta priorizado | Manual `/dark-audit` o pre-deploy |

---

## 5. Lo que ya hice en esta sesión (queda activo)

| Item | Archivo | Efecto |
|---|---|---|
| Skill `bsm-typography-rules` | `.claude/skills/bsm-typography-rules/SKILL.md` | Auto-cargable. Define mínimos `text-base` body / `h-12` filtros / `border-2` cuadrados / contexts donde sí permite `text-2xs` |
| Dark mode rediseñado | `app/globals.css` | Slate-tinted, jerarquía 3 surfaces, contraste AA verificado, safety-net para legacy `bg-gray-*` |
| OrdenTab horizontal | `components/admin/unified/MarketplaceModule.tsx` | Cards estilo storefront real, drag horizontal, mock botón carrito |
| Storefront tipografía | `StoreCategories.tsx`, `StoreCatalog.tsx`, `StoreHero.tsx`, `UnifiedProductCard.tsx` | Filtros `h-12 border-2 rounded-2xl`, descripción `text-base`, headers `text-xl/2xl`, stats con `gap-x-4` y icons `h-4` |
| Sidebar fix `isDirty` | `components/admin/shared/SidebarConfigurator.tsx` | `useRef` baseline estable evita falsos `dirty=false` por live preview |

---

## 6. Acción inmediata para activar la autonomía

Brandon, ejecutá esto desde tu terminal (NO desde Claude Code):

```bash
cd ~/proyectos/Mercado
sudo npx playwright install-deps chromium
npm install --save-dev pixelmatch pngjs
```

**Después decime "listo, instalá los hooks"** y yo configuro los 3 hooks de la sección 3 + creo los 3 agentes de la sección 4. A partir de ahí, cada vez que edite UI vas a ver:
- Screenshot automático en el reporte
- Diff visual antes/después
- Lint de tipografía que se auto-corrige
- Bloqueo de reportes "listo" si hay regresión visual

---

## 7. Qué NO instalar (anti-recomendaciones)

| Tool | Por qué evitarlo |
|---|---|
| `puppeteer` | Duplica Playwright, mayor footprint |
| `cypress` | Ya tenés Vitest + Playwright, no aporta |
| `storybook-test-runner` | Ya tenés Storybook + Chromatic, no agrega |
| MCP Figma extra | Ya está conectado, no falta nada |
| Servicios cloud (BrowserStack, Percy) | Costo recurrente, Playwright local cubre 95% |
