# SESSION HANDOFF — 2026-05-29 (Cacao · modo autónomo)

**Branch:** `chore/p0-audit-2026-05-28` · **Working tree:** todo commiteado.
**Commits de la sesión:** 19 (`ff8e60f1` → `17ae7fdf`). Ronda 2 (continuación): handoff + empty states (e851413e) + **fix global tokens danger en 15 archivos** (7abec9a1) + sub-tabs mobile scroll (17ae7fdf).
**Gates:** `tsc --noEmit` 0 en cada paso · 30 tests cacao verdes · verificación e2e en navegador (tenant `main`) por feature. NO se corrió `npm run build` completo (recomendado antes de deploy). NO se pusheó.

## Qué se hizo (arsenal de mejoras de Cacao, ADR-128)

| # | Commit | Mejora |
|---|---|---|
| 1 | ff8e60f1 | Fix: tab Cacao no aparecía en sidebar (faltaba en `SPEC_GATED_MODULE_IDS`) |
| 2 | 60a61b81 | Sidebar: split Especializaciones → **Forestal** + **Agricultura** (flag `alwaysGroup`) + acordeón estricto + arranque colapsado |
| 3 | 8e1a99ee | Backend: `cacao.db` (producerDetail/loteDetail/inventory/trends + filtros) + views API |
| 4 | 4b92448d | **Fichas drawer** lote + productor (perfil/historial/editar) + **recibo imprimible** |
| 5 | 802b8065 | **Inventario** seco + valorización + **dashboard** (tendencias/top/calidad/alertas) + filtros + export CSV |
| 6 | 3a702000 | **Mercado**: precio ICE en vivo (Yahoo CC=F) + FX→S//kg + noticias (Google News) |
| 7 | d8cedef9 | **Gráfico de flujo** (recharts, rangos 1S–1A, volatilidad) + **FIX tokens `--data-danger-*`→`--data-error-*`** |
| 8 | 1d5d0097 | **Asesor híbrido**: señal vender/aguantar (determinística) + narrativa IA grounded + checklist |
| 9 | 3504a9da | Rediseño modal **Anular** → AdminModal (a11y) |
| 10 | 7c25d483 | **Tests**: cacao-quality (proyección/rendimiento) + cacao-advisor (30 verdes) |
| 11 | e90a9870 | Asesor: **tu precio de compra vs. internacional** (`avgBuyPrice`) |
| 12 | 811af648 | **ADR-128** (faltaba el archivo) |
| 13 | 279c70d7 | **Reporte de campaña imprimible** (Resumen) |

El módulo de Cacao pasó de 4 sub-vistas a **7**: Acopio · Beneficio · Inventario · Productores · Resumen · Mercado · Asesor.

## Verificación rápida (Brandon)
Ctrl+Shift+R en `/t/pizza-pucallpa/admin?tab=cacao-acopio` (o `main`). Recorré: **Mercado** (gráfico+rangos), **Asesor** (señal+IA+tu precio vs mercado), **Inventario**, click en una fila de Acopio (ficha+recibo), **Resumen** (imprimir reporte).

## Hallazgo importante
🐛 `--data-danger-*` **no existe** en el design system (toda la familia indefinida). El token de rojo es `--data-error-*` (50/100/500/600/700). Arreglé los 9 componentes de cacao. **Quedan ~15 archivos del repo con el token roto** (rojos sin estilo) — fix global pendiente (1 sed). Ver memoria `reference_ds_token_danger_gotcha`.

## Backlog v4 (estado)
1. ✅ Empty states con CTA (onboarding) — hecho.
2. ⬜ Beneficio: avanzar estado (fermentando→secando→terminado) — pendiente (necesita seed: en `main` todos terminado). Mejor diseño: "editar beneficio" (reusar form en modo PATCH).
3. ⬜ Mi-precio histórico (chart en el tiempo) — necesita datos multi-día.
4. ⬜ Trazabilidad pública QR `/verificar-cacao` (como el forestal).
5. ✅ Fix global `--data-danger-*` → `--data-error-*` (15 archivos forestal/docs/inicio/superadmin) — hecho. Queda 1 bare `var(--data-danger)` en `adelantos/AnalisisView` (familia bare distinta).
6. ⚠️ **Schema drift** (sin resolver): `CacaoProducer/Lote/Beneficio` se crearon vía Supabase MCP, NO en `prisma/migrations` → correr en prod antes de deploy.
7. ✅ Mobile: sub-tabs en fila scrolleable — hecho.

## Notas operativas
- Mercado: Yahoo Finance (`CC=F`, `PEN=X`, no-oficial) + Google News RSS — gratis, sin key, degradan con gracia. Cache 20min (precio/news) / 2h (narrativa IA).
- Narrativa IA: `callLLM("cheap")` (Anthropic→Groq→OpenAI). En dev configurada y responde.

## Credenciales (verificadas, carryover)
- Pizzería: `pizza-pucallpa.localhost:3000/admin` → `pizzaadmin` / `Pizza-2026-Buleje`
- Bodega main: `localhost:3000/admin` → `qaadmin` / `Qa-admin-1234`
- Superadmin: `localhost:3000/superadmin/login` → `superadmin` / `Super-2026-Buleje`

## Notas técnicas (carryover)
- Migraciones Prisma: `migrate dev` NO va (pgBouncer). Editar schema → `prisma generate` → DDL via `migrate diff` → aplicar additivo con Supabase MCP. **Reiniciar dev server tras `prisma generate`** (client viejo → 503).
- Iconos: solo los exportados por `@buleje/design-system/icons` (barrel runtime); tsc NO detecta faltantes (d.ts más amplio). `Newspaper` se agregó esta sesión.
