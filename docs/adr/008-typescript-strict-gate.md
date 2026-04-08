# ADR 008 — TypeScript Strict Gate (cierre de TD-012)

**Fecha:** 2026-04-07
**Estado:** Aceptado · Aplicado
**Sprint:** Sprint C Final Push

## Contexto

El proyecto venía operando con `typescript.ignoreBuildErrors: true` en `next.config.ts` desde el inicio. Esto significaba que `npm run build` pasaba incluso cuando había errores TypeScript reales en el código, escondiéndolos hasta que explotaban en runtime. Esta deuda fue registrada como **TD-012** en `docs/TECH-DEBT.md`.

**Baselines históricas de TD-012:**

| Fecha | Errores TS | Progreso |
|---|---|---|
| Baseline original | 469 | — |
| 2026-04-06 | 121 | -74% (3 sesiones) |
| 2026-04-07 inicio sesión | 122 | regresión +1 |
| 2026-04-07 fin sesión | **0** | ✅ cerrado (primera vez) |
| 2026-04-08 inicio marketplace D1 | 6 | regresión por schema drift + ediciones del Sprint D1 |
| **2026-04-08 fin sesión D2 F3** | **0** | ✅ **cerrado (segunda vez, definitivo)** |

### Re-cierre del 2026-04-08

Durante la implementación del Bloque D2 del Marketplace (chat buyer↔seller), el gate estricto destapó 6 errores que habían entrado sin detectarse al final de una sesión previa:

1. `__tests__/schema-db-sync.test.ts:120` — regex flag `s` requiere target es2018+ (eliminado, `[^}]+` ya excluye `}`)
2. `app/api/chat/route.ts:8` — `"BALANCED"` no es parte del enum `RateLimitPreset` (cambiado a `"MODERATE"`)
3. `app/api/cron/weekly-email-report/route.ts:64` — `subtotal` no existe en `OrderItemSelect` (cambiado a `price`, calculando subtotal inline)
4. `app/api/cron/weekly-email-report/route.ts:96` — la query usaba `select` sin incluir `items[]` como relación (cambiado a `include`)
5-6. `app/api/webhooks/whatsapp/route.ts:60-61` — body tipado como `Record<string, unknown>` no permitía indexing (creado type `WebhookPayload` explícito)

Todos fueron fixes quirúrgicos sin cambio de comportamiento. Cada uno mencionado en el commit del Sprint D2 Fase 3.

## Decisión

Flipear `typescript.ignoreBuildErrors` de `true` a `false` en `next.config.ts`, activando el gate estricto de tipos en cada build local y en cada deploy a Vercel.

A partir de este commit, **cualquier PR con error TypeScript hace fallar el build en CI**. No se puede deployar código con tipos rotos.

## Cómo se logró

### Fase 0 — Fixes fundacionales (-17 errores)

Ediciones pequeñas pero de alto impacto para destrabar cascadas de errores compartidos:

1. **Unificación `AdminRole`**: `lib/session.ts` y `lib/auth/role-permissions.ts` tenían tipos paralelos de 6 valores cada uno, con solo 3 compartidos. El código real usaba los 9 valores unión. Se unificó `AdminRole` a los 9 valores canónicos (`admin | cajero | almacenero | proveedor | delivery | tienda_owner | owner | manager | analista`) y `Role` pasa a ser alias de `AdminRole`. `PERMISSIONS` se relajó a `Partial<Record<Role, ...>>`.
2. **`LLMResponse.data` y `LLMResponse.attempts`**: agregados como campos opcionales en `lib/llm-providers/types.ts` para soportar los callers legacy que esperaban el raw response del provider.
3. **`SessionPayload.userId → auth.username`**: corregido en `app/api/invoices/emit/route.ts` donde 2 `logActivity()` calls tenían argumentos en el orden equivocado.
4. **`Tab "colas"`**: agregado al type `Tab` en `app/admin/admin-types.ts` (ya existía en `_lib/tabs.types.ts`).

### Fase 1 — Agent Team de 4 teammates en paralelo (-105 errores)

| Teammate | Área | Errores cerrados |
|---|---|---|
| `backend-platform-engineer` | `app/api/**`, `lib/whatsapp`, `lib/forecasting`, `lib/cms-db`, `lib/llm-providers`, `lib/module-permissions` | 43 |
| `frontend-engineer` | `components/admin`, `components/store`, `components/ui`, `components/checkout/CheckoutModal`, `contexts/cart-context`, `hooks/use-store-products`, `app/cms/[slug]` | 52 |
| `database-engineer` | `lib/db/guias-remision`, `lib/db/products` | 3 |
| `qa-reliability-engineer` | `__tests__/`, `capacitor.config.ts` | 7 |

### Reglas duras impuestas a los teammates

- **Prohibido** tocar `prisma/schema.prisma` (riesgo de migración DB en producción).
- **Prohibido** `@ts-ignore` masivo o `as any` sin justificación.
- **Prohibido** tocar archivos fuera de la bolsa asignada.
- Para schema drift: preferir corregir el código > eliminar uso con TECH-DEBT > `as unknown as TypeX` con comentario (último recurso).
- CheckoutModal aislado con warning explícito de zona de peligro + obligación de correr tests de checkout.

## Bugs reales encontrados en el camino

El gate estricto destapó 4 bugs latentes que `ignoreBuildErrors: true` estaba ocultando:

1. `app/api/sales/[id]/route.ts`: argumentos invertidos en `SalesDB.add(tenantId, sale)`.
2. `app/api/cotizaciones/[id]/convertir/route.ts`: faltaba generar `orderId` (el modelo `Order` no tiene `@default`).
3. `app/api/inventory/import-csv/route.ts`: faltaba `category` (campo requerido sin default en `ProductCreateInput`).
4. `lib/cms-db/pages.ts`: `findUnique({where:{slug}})` fallaba porque el unique constraint real es compuesto `[tenantId, slug]` → cambiado a `findFirst`.

## Schema drift descubierto (nueva deuda técnica)

El sprint destapó 4 gaps reales entre el código y `prisma/schema.prisma`. Registrados como nuevas entradas en `TECH-DEBT.md`:

- **TD-030**: modelo `LoyaltyTransaction` referenciado pero inexistente. Historial de puntos de fidelidad no persiste.
- **TD-031**: `Review.imageUrls` usado en código pero no existe en schema.
- **TD-032**: `Coupon.storeId` usado para diferenciar cupones marketplace vs POS, no existe.
- **TD-033**: `Tenant.settings` usado por crons como si fuera relación — en realidad los feature flags viven en `Settings.featureFlagsJson`. Ya corregido en código.

## Verificación

```bash
npx tsc --noEmit        # 0 errors ✅
npm run build            # Compiled successfully in 26.9s ✅
npm run test             # 2172/2172 tests verde ✅
```

## Consecuencias

### Positivas

- **Gate de calidad fundacional activo**: bugs de tipos no llegan más a runtime.
- **DX mejor**: el IDE y `npm run build` reportan los mismos errores que CI.
- **Confianza para refactors**: Sprint A (`admin/page.tsx` refactor) y Sprint B (Float→Decimal) pueden ejecutarse sin riesgo de regresiones tipadas invisibles.
- **4 bugs reales eliminados** que estaban esperando romper producción.

### Negativas / Trade-offs

- **CI más lento**: cada build ahora corre el type-check completo. Mitigación: Next.js 16 cachea tipos con Turbopack.
- **PRs pueden rebotar más seguido**: los contribuyentes ahora deben correr `tsc --noEmit` localmente antes de push.
- **4 nuevos TECH-DEBT descubiertos** (TD-022 a TD-025) que requieren migraciones futuras.

## Próximos pasos (habilitados por este gate)

1. **Activar TD-026**: agregar `npx tsc --noEmit` como gate en `.husky/pre-commit` — antes estaba bloqueado por TD-012.
2. **Sprint A**: refactor de `app/admin/page.tsx` (1259 líneas → <300) ahora sin riesgo de regresiones invisibles.
3. **Sprint B**: TD-018 Float → Decimal en 47 campos de 22 DB classes.
4. **Schema migration futura**: abordar TD-022 a TD-025 en una sesión dedicada con `migration-planner`.
5. **Limpiar worktree abandonado** `.claude/worktrees/agent-a0a19316/` que desde 2026-03-22 contamina el scan de ESLint con 257 errores fantasma.

## Referencias

- `docs/TECH-DEBT.md` — entradas TD-012 (cerrada), TD-030, TD-031, TD-032, TD-033 (nuevas).
- `docs/ts-errors-baseline-2026-04-06.md` — baseline previa (desactualizada, conservada como historial).
- `next.config.ts:13` — el flag flipeado.
- Commit de cierre: este mismo commit.
