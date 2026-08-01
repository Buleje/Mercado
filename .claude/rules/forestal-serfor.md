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
- **Invariantes I1–I6 + L1 + T1 son ley traducida a código** (`[[ctp-libro-invariantes-2026-07-15]]`).
  App-level + LOCK sobre el recurso disputado dentro de la tx. **Siempre `≤`, nunca `==`**
  (forzar atribución total fabrica el fraude que previene). Faltante = `sinAtribuir`.
- **T1 · consumo por PIEZA (ADR-326)**: no se consume la ya consumida, la que no llegó
  (ADR-325), el descarte, la **madre retrozada** (van los pedazos: contarla con ellos es
  la misma madera dos veces) ni la sin volumen. El lock va sobre la **troza**, con
  `ORDER BY id` (sin eso, dos tablets se abrazan en deadlock).
- **Toda escritura de trozas respeta cierre y congelado.** El consumo vive en DOS lugares
  —m³ por guía y piezas— y son dos caras del mismo hecho: lo que congela una congela la
  otra. Mes cerrado y `congeladoAt` bloquean ambas. Anular una corrida **libera** sus
  piezas, y los guards miran el **estado** de la corrida, nunca el id pelado (un id que
  apunta a una corrida muerta no bloquea nada).
- **Una troza no puede estar aserrada y no haber llegado**: `noRecepcionada` + consumo
  vivo se rechaza indicando el camino, no con un "no se puede" pelado.
- **El libro admite huecos; el certificado NO.** `trazabilidadCompleta()` bloquea EMITIR,
  jamás GUARDAR. No inviertas eso.
- **Origen legal = GTF.** No crear ingreso sin `gtfNumber`. La GTF de salida la emite el CTP.
- **CITES es legal con permiso → NO resta score** (`ctp-compliance.ts`). No lo muevas a `CATEGORIAS_QUE_RESTAN`.
- **Costos:** derivados on-read, congelados al cierre. **Sin factura → `null`, nunca `0`.**
- **Fechas date-only** (`entryDate`/`gtfDate`) → formatear con `timeZone:"UTC"` (bug off-by-one Lima).
- **Plazos/score de compliance:** no cambiar sin ADR + sincronizar los 3 lectores del predicado
  (badge/panel/Excel comparten `estaFueraDePlazo()`). **Ya reconciliado (2026-07-30):** el CTP
  usa `PLAZO_REGISTRO_DIAS = 2` días **hábiles** (`ctp-compliance.ts` + `FUERA_DE_PLAZO_SQL`),
  que es lo que pide la RDE D000025-2023. Los **15 días** son del **otro** libro, el LO-TH del
  título habilitante (`loth-constants.ts`, RDE 264-2019) — no confundirlos.
- Multi-tenant: `tenantId` 1er arg. DB solo vía `lib/db/forest-*.db.ts` (nunca `prisma.*`). Zod `safeParse`.
- Auditar acciones nuevas vía `lib/forestal/ctp-audit.ts`.
