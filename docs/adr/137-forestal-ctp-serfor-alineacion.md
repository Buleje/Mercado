# ADR-137: CTP aserradero — alineación al estándar SERFOR/OSINFOR (Ficha, export oficial, GTF de salida, plazo)

- **Estado:** Aceptado (2026-07-17)
- **Relacionado:** ADR-124 (ingreso madera), ADR-127 (Libro CTP), ADR-134 (consumo N:M), ADR-135 (despacho→origen), ADR-136 (lotes)
- **Zona de peligro:** `lib/db/forest-ctp-*.db.ts`, `lib/forestal/ctp-compliance.ts` (score/plazo), `lib/db/wood-entries.db.ts` (SQL lateCount)
- **Fuente normativa:** Ley 29763 · D.S. 018-2015-MINAGRI · **RDE N° D000025-2023-MIDAGRI-SERFOR-DE** (formato LO-CTP) · **RDE N° D000259-2024-MIDAGRI-SERFOR-DE** (coeficientes de rendimiento)

---

## Contexto

El módulo CTP (Libro de Operaciones) ya tenía trazabilidad app-level (I1–I5, ADR-134/135),
lotes (ADR-136) y certificado con QR. Faltaba cerrar la brecha con lo que **exige y fiscaliza
SERFOR/OSINFOR**: identidad legal del CTP, formato oficial del libro (LO-CTP / MC-SNIFFS),
GTF de salida con número trazable, y el plazo de registro correcto. Se creó además el skill
`serfor-osinfor-compliance` (+ regla path-scoped) como single source de los lineamientos.

## Decisión

1. **Ficha legal del CTP** (`ForestCtpFichaDB`, tipos puros en `lib/forestal/ctp-ficha-types.ts`):
   Código de CTP, RUC, registro ARFFS, títulos habilitantes, representante, serie GTF y
   **permisos CITES**. Persistida en `PlatformSetting` key `ctp-ficha:{tenantId}` — **sin
   migración** (patrón `rum-history`, desviación documentada del "PlatformSetting es global").
   Encabeza certificado, GTF de salida y export.

2. **Export oficial LO-CTP** (`exportarLibroCtpOficial`): portada con datos del CTP + los tres
   registros (Ingreso, Transformación, Salida) con los nombres de columna de la RDE D000025-2023
   + hoja de Existencias. Convive con el export interno.

3. **GTF de salida formal** (`ForestCtpDespachoDB.emitirGtf`): asigna serie (de la ficha) +
   correlativo auto **reusando `gtfNumber`** (parse del máximo + lock sobre despachos en la tx,
   patrón `loteCode`) — **sin columna ni migración nueva**. Idempotente. Documento imprimible
   con QR (`ctp-gtf-print.ts`).

4. **Plazo de registro = 2 días hábiles** (antes 15 días calendario, incorrecto). Se implementa
   con una fórmula cerrada de días hábiles (lun–vie) **compartida idéntica** entre JS
   (`estaFueraDePlazo`) y SQL (`WoodEntriesDB.stats().lateCount`). **Feriados nacionales NO se
   descuentan** (limitación conocida): es una advertencia del score, no un bloqueo.

5. **Benchmark de rendimiento** (`ctp-rendimiento.ts`): coeficientes referenciales SERFOR
   (56% troza→aserrada, 41% tablillas para piso, RDE D000259-2024). Un `rendimientoPct` muy por
   encima del referencial = señal de sobre-declaración → se marca en Producción.

## Consecuencias

- **Positivas:** el certificado, la GTF y el export salen con identidad legal; el libro se puede
  presentar en formato reconocible; el plazo del score deja de ser incorrecto; sobre-declaraciones
  de rendimiento se ven. Cero migraciones (todo KV / derivado / reuso de columna).
- **A vigilar:** el plazo en días hábiles ignora feriados (puede marcar un registro tardío sólo
  por un feriado). El correlativo de GTF depende de la serie de la ficha; si se cambia la serie,
  el conteo arranca de nuevo por serie. La ficha en `PlatformSetting` no versiona el registro.

## Alternativas consideradas

- **GTF con columnas nuevas** (`gtfSerie`/`gtfCorrelativo`) → descartado: reusar `gtfNumber` con
  correlativo parseado evita una migración en zona de pooler/DIRECT_URL.
- **Plazo aproximado en días calendario** (ej. 4) → descartado: o cría lobos o es laxo; los días
  hábiles exactos son la norma real.
- **Días hábiles con feriados** → pospuesto: mantener un calendario de feriados es costo continuo;
  el warning tolera el borde.

## Referencias

- SERFOR — Guía práctica LO-CTP (RDE D000025-2023).
- SERFOR — Coeficientes referenciales de rendimiento (RDE D000259-2024).
- Skill `serfor-osinfor-compliance` + regla `.claude/rules/forestal-serfor.md`.
