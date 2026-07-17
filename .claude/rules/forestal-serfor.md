---
paths:
  - "lib/db/forest-*"
  - "lib/db/wood-entries.db.ts"
  - "lib/forestal/**"
  - "components/admin/forestal/**"
  - "app/api/admin/forestal/**"
  - "app/verificar/**"
---

# Reglas al tocar el módulo forestal / CTP (SERFOR + OSINFOR)

> Detalle completo + mapeo código↔norma + fuentes: **skill `serfor-osinfor-compliance`**
> (invocalo con `/serfor-osinfor-compliance`). Acá van solo los no-negociables.

- **Trazabilidad de punta a punta:** toda salida debe poder responder "¿de qué GTF/árbol
  salió?". Atribución vía puentes N:M (`ForestCtpConsumo`, `ForestCtpDespachoOrigen`,
  `ForestProdLoteMiembro`) — nunca texto libre para el origen.
- **Invariantes I1–I5 + L1 son ley traducida a código** (`[[ctp-libro-invariantes-2026-07-15]]`).
  App-level + LOCK sobre el recurso disputado dentro de la tx. **Siempre `≤`, nunca `==`**
  (forzar atribución total fabrica el fraude que previene). Faltante = `sinAtribuir`.
- **El libro admite huecos; el certificado NO.** `trazabilidadCompleta()` bloquea EMITIR,
  jamás GUARDAR. No inviertas eso.
- **Origen legal = GTF.** No crear ingreso sin `gtfNumber`. La GTF de salida la emite el CTP.
- **CITES es legal con permiso → NO resta score** (`ctp-compliance.ts`). No lo muevas a `CATEGORIAS_QUE_RESTAN`.
- **Costos:** derivados on-read, congelados al cierre. **Sin factura → `null`, nunca `0`.**
- **Fechas date-only** (`entryDate`/`gtfDate`) → formatear con `timeZone:"UTC"` (bug off-by-one Lima).
- **Plazos/score de compliance:** no cambiar sin ADR + sincronizar los 3 lectores del predicado
  (badge/panel/Excel comparten `estaFueraDePlazo()`). El código dice 15 días; la RDE D000025-2023
  sugiere ~2 días hábiles → **reconciliar contra el texto vigente antes de tocar**.
- Multi-tenant: `tenantId` 1er arg. DB solo vía `lib/db/forest-*.db.ts` (nunca `prisma.*`). Zod `safeParse`.
- Auditar acciones nuevas vía `lib/forestal/ctp-audit.ts`.
