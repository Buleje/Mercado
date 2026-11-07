# Invariantes y guardrails

Complemento de `SKILL.md`; si algo difiere, manda la regla `forestal-serfor` (`.claude/rules/forestal-serfor.md`). Todas las invariantes son de la app y toman LOCK sobre el recurso disputado dentro de la tx: Postgres no puede, son agregadas y el aislamiento es de la app. Memoria: `ctp-libro-invariantes-2026-07-15`.

| | Regla | Qué previene (lenguaje del fiscalizador) |
|---|---|---|
| I1 | Σ consumos(línea) ≤ `volumeInputM3` | consumir más de lo que dice el acta |
| I2 | Σ consumos(ingreso) ≤ `volumeM3` | **blanqueo**: un ingreso con GTF usado dos veces |
| I3 | Σ despachado(producto) ≤ Σ producido, menos lo reprocesado | despachar más de lo transformado |
| I4 | Σ orígenes(despacho) ≤ `despacho.quantity` | atribución incoherente en la salida |
| I5 | Σ orígenes(corrida) ≤ `produccion.quantity` | **una corrida despachada dos veces** |
| I6 | Σ reprocesado(corrida) + Σ despachado(corrida) ≤ `corrida.quantity` | producir 10, reprocesar 8 y despachar 10 (ADR-316; saldo único en `lib/db/forest-ctp-saldo-corrida.ts`) |
| L1 | Σ miembros(corrida) ≤ `corrida.quantity` | una corrida en dos lotes (lotes: ADR-315, 327, 337; el ADR-136 que citan ADR-137 y 305 no tiene archivo en `docs/adr`) |
| T1 | consumo por pieza, con lock sobre la troza (ADR-326, ADR-325) | la misma troza aserrada dos veces, o una que no llegó |

**`≤`, nunca `==`**: forzar atribución total hace que el operador invente un origen, y la regla fabricaría el fraude que previene. El faltante se reporta como `sinAtribuir`. **El libro admite huecos, el certificado no**: `ForestCtpDespachoDB.trazabilidadCompleta()` bloquea EMITIR, nunca guardar.

## Al meter una feature

**Siempre**: LOCK sobre el recurso disputado en toda tx que atribuya · toda salida trazable hasta una GTF de ingreso · fechas date-only (`entryDate`, `gtfDate`) con `timeZone:"UTC"` · costos derivados al leer y congelados al cierre (sin factura: `null`, nunca `0`, porque un 0 finge margen del 100 %) · números con la precisión del schema (volumen Decimal(12,4), cantidad Decimal(14,4)), nunca `float` de JS · auditar la acción nueva en `lib/forestal/ctp-audit.ts` (entidad + acción) · `tenantId` como 1.er argumento.

**Nunca**: forzar atribución con `==` · ingreso sin GTF ni despacho que exceda lo producido (rompe I2 e I3) · que CITES reste puntos · bloquear GUARDAR por trazabilidad incompleta · `prisma.*` directo (usar `lib/db/forest-*.db.ts`) ni `.parse()` de Zod · cambiar un plazo o un score sin ADR ni sincronizar los 3 lectores del predicado.
