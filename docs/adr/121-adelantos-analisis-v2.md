# ADR-121 — Análisis de Adelantos v2 + refactor del módulo

**Estado:** Aceptado · **Fecha:** 2026-05-25 · **Autor:** Buleje + Claude

## Contexto

El tab `adelantos` → sub-tab **Análisis** (en `AdelantosModule.tsx`, 1790 líneas)
tenía 3 gráficos básicos (evolución, modalidad, top deudores) y **un bug**: sumaba
montos de **distintas monedas** (PEN + USD) como si fueran lo mismo — el módulo es
multi-moneda desde ADR-118. Sin KPIs ni análisis de cobranza.

## Decisión

Reescribir el Análisis y **extraerlo a su propio archivo** (refactor seguro,
sin tocar el kanban/forms del módulo grande).

### Nuevo `AnalisisView.tsx`
1. **KPIs arriba** (5): adelantado, liquidado, pendiente, % recuperado
   (+ velocidad media de liquidación en días), personas con saldo abierto.
2. **Segmentación por moneda** (fix del bug): todo se computa por moneda. Toggle
   S/ ↔ US$ si hay >1; default a la de mayor volumen. `fmtMon` por moneda.
3. **Aging de saldos** (0-30 / 31-60 / 61-90 / +90 días) con color escalado —
   prioriza cobranza ("priorizá los de la derecha").
4. **Tasa de recuperación + tendencia**: % recuperado + días promedio para liquidar.
5. Se conservan evolución mensual, modalidad y top deudores, ahora por moneda.

### Refactor
- `components/admin/adelantos/shared.tsx` — helpers compartidos (`fmtMon`,
  `sumByMoneda`, `fmtMonedas`, `EmptyState`, `SkeletonGrid`) extraídos del módulo.
- `AnalisisView.tsx` — la vista de Análisis sale del archivo de 1790 líneas.
- `AdelantosModule.tsx` importa ambos; se eliminó el código duplicado + recharts
  (solo lo usaba Análisis).

## Consecuencias

**+** Análisis orientado a cobranza (aging) + correcto en multi-moneda. **+** El
módulo baja de 1790 líneas; helpers reutilizables. **−** 2 archivos nuevos en el
módulo. **−** El toggle de moneda solo aparece con >1 moneda (esperado).

## Verificación

- tsc 0, lint 0 errores, sin imports huérfanos (recharts removido del módulo).
- Verificado en vivo (pizza-pucallpa, 2 adelantos PEN liquidados): KPIs correctos
  (100% recuperado, 0 pendiente), aging con estado vacío celebratorio, evolución
  y modalidad OK. Toggle oculto (1 moneda) — correcto.

## Referencias
- `components/admin/adelantos/{AnalisisView,shared}.tsx`, `AdelantosModule.tsx`
- ADR-117/118 (adelantos base + multi-moneda + enterprise)
