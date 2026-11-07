---
name: purga-libro-lotes-dependencias
description: Vaciar Libro CTP con varios alcances + «Lotes» (02-10-2026) — regla de dependencias de lotes, huecos que quedaron abiertos y cómo medir el plan sobre Blas sin escribir
metadata:
  type: project
---

Vaciado del Libro de Operaciones (02-10-2026): casillas combinables (unión) + alcance «lotes»; «todo» excluyente (400 si se combina). Plan PURO en `lib/forestal/ctp-purga-plan.ts` sobre una foto leída dentro de la tx; escritura con conteo exacto por sentencia (si difiere → rollback, 409 `libro_cambio`).

**Regla de lotes elegida:** lote de aserrío sin corrida viva se borra y suelta piezas; con corrida viva se borra SÓLO si esa corrida cae en el mismo vaciado («Consumos», o «Madera» si declaró madera) — punto fijo, porque lote y corrida se habilitan mutuamente. Despacho (aunque anulado: la fila DespachoOrigen sigue y es Restrict), reproceso o consumo congelado → bloqueado con motivo. Comercial: se borra con miembros salvo `despachado` o corrida con guía viva. Mixto: cae si caen todos sus hijos.

**Why:** Brandon pidió «borrar los lotes» sin confundirse; la regla dura era no borrar madera/producción por arrastre ni dejar ids colgando.

**How to apply / huecos abiertos:**
- `ForestLoteDB.softDelete` (comercial) deja sus miembros vivos → protegen la corrida para siempre (Restrict). No se arregló.
- «Consumos + Lotes» también borra corridas que no son de lotes (Blas: 47 = 41 sueltas + 6 de lotes). No existe «lotes con su producción» solo.
- «todo» antes FALLABA con cualquier miembro de lote comercial (Restrict) y dejaba lotes de aserrío colgando; ahora borra lotes. Respuestas de campos personalizados de ingresos siguen huérfanas tras «todo».
- Medir un plan puro sobre Blas sin escribir: `node --env-file=.env.local node_modules/.bin/tsx scripts/tmp-x.mts` con `pg` + `BEGIN READ ONLY` e import RELATIVO del `.ts` (sin alias `@/`). Blas 02-10: 54 corridas, 86 trozas, 7 lotes de aserrío, 0 comerciales/mixtos.

Ver [[ctp-libro-invariantes-2026-07-15]], [[lote-aserrio-cerrar-deja-produccionentryid-null]].
