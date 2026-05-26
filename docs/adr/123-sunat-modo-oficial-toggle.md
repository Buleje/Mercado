# ADR 123 — Modo SUNAT Oficial (toggle formal/informal por tenant)

**Estado:** Aceptado — F0+F1 implementadas
**Fecha:** 2026-05-26
**Autor:** Claude (arquitecto + build) — sesión rediseño admin
**Relacionado:** ADR-045 (SUNAT NubeFact full stack — ahora marcado *parcialmente implementado*)

---

## Contexto

Brandon quiere que el sistema sea oficial con SUNAT: emitir boletas/facturas
electrónicas validadas, e (a futuro) declaraciones e impuestos, todo desde el
panel. Debe ser un **toggle por tenant**: ON para empresas formales que llevan
todo ahí, OFF para negocios informales/normales.

Auditoría 2026-05-26 (2 agentes) encontró que el motor de emisión vía **Nubefact
(OSE certificado por SUNAT)** ya está mayormente implementado (ADR-045 se
construyó): facade robusto `lib/integrations/sunat.ts` (Zod + rate-limit Upstash
+ idempotencia + ventana anulación 7d), correlativo atómico, webhook CDR HMAC,
cron retry. Schema `TenantSunatConfig` + `SunatInvoice` deployados.

**Dos bugs reales:** (1) el tab admin "Factura Electrónica" usaba el cliente
legacy `lib/integrations/sunat-nubefact.ts` (token global, URL formato viejo →
401/404) en vez del facade; el contrato de respuesta no coincidía con la UI
(`{data}` vs `{ok, invoice}` esperado) → mostraba error aun emitiendo OK.
(2) La emisión automática post-venta estaba cableada pero muerta (worker sin
suscribir). El certificado digital lo administra **Nubefact**, no el sistema.

## Decisión

**Toggle "Modo SUNAT Oficial"** vía tabla dedicada `TenantFeatureFlag`
(`flagKey = "sunat-modo-oficial"`), control **manual por superadmin** (decisión
de negocio). OFF = default (informal). ON = formal, con gate de activación.

### Implementado (F0 + F1)

| Fase | Entrega |
|---|---|
| **F0** | `app/api/admin/sunat/generate-invoice` migrado del cliente legacy al facade `lib/integrations/sunat.ts`. Respuesta `{ok, invoice:{serie,número,total,...}}` alineada con `EInvoiceTab`. Arregla el 401/404 y el falso-error. |
| **F1a** | `lib/db/tenant-feature-flag.db.ts` (`isEnabled/set`), `lib/sunat/modo-oficial.types.ts` (flag + bloqueos), `lib/sunat/modo-oficial.ts` (`isSunatOficial`, `computeBlockers`, `getModoOficialState`). |
| **F1b** | `GET /api/admin/sunat/modo-oficial` (admin lee estado). `GET/PUT /api/superadmin/tenants/[slug]/sunat-oficial` (toggle superadmin con gate 422 si hay bloqueos). Guard 403 en `generate-invoice` si el modo está OFF. |
| **F1c** | `SunatModoOficialCard.tsx` read-only en el tab Factura Electrónica (estado + checklist de bloqueos + badge ambiente). |

### Comportamiento

| Aspecto | OFF (informal, default) | ON (formal) |
|---|---|---|
| Emisión de comprobantes | Bloqueada (403) | Habilitada vía facade |
| Config RUC/token | Opcional | Obligatoria (gate) |
| Activación | — | Superadmin, solo si `computeBlockers` = ∅ |
| Bloqueos | `sin_config`, `sin_token`, `ruc_invalido` | — |
| Ambiente | — | `isProduction` → "producción" / "beta" |

## Consecuencias

**Positivas:** un solo pipeline (facade); el toggle reusa infra existente sin
schema nuevo; default OFF = cero impacto para negocios informales; el admin ve
qué le falta para activar.

**Pendiente (fuera de este ADR):**
- **F2** — emisión automática al vender (wirear venta → `emit-on-sale` +
  `initSunatWorkerSubscription()` en `instrumentation.ts`). Toca flujo de venta.
- **F3** — cálculo de impuestos IGV real (hoy `TaxTab` es mock).
- **F4** — declaraciones SUNAT (Form. 621, libros PLE): **greenfield, ADR aparte**
  + asesor contable.
- Cifrar `nubefactToken` en DB (hoy texto plano — Ley 29733).
- UI superadmin del toggle (endpoint listo; falta el botón en el panel de tenant).

## Prerrequisitos del mundo real (cliente/Brandon)

Cuenta Nubefact + token por RUC · RUC ACTIVO+HABIDO · autorización de series en
SUNAT SOL · ambiente beta primero (`isProduction=false`) · `SUNAT_RUC_PROVIDER=apisperu`
para validación real de RUC.

## Alternativas consideradas

- `lib/feature-flags.ts` (env-only, global): descartado, no sirve por-tenant en runtime.
- `lib/flags/tenant-flags.ts` (Settings.featureFlagsJson): descartado, no indexado/auditable.
- Toggle por plan SaaS / autoservicio del dueño: descartado por ahora — control manual
  superadmin da más control mientras se valida con clientes reales.

## Referencias

- ADR-045 (SUNAT NubeFact full stack)
- `lib/integrations/sunat.ts`, `lib/sunat/modo-oficial.ts`, `lib/db/sunat.db.ts`
- Memoria: `project_sunat_estado_real.md`
