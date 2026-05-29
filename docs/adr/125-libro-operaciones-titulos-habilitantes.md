# ADR-125 — Libro de Operaciones de Títulos Habilitantes (LO-TH)

**Fecha:** 2026-05-28
**Estado:** Propuesto
**Decisión:** Brandon
**Contexto regulatorio:** SERFOR (Servicio Nacional Forestal y de Fauna Silvestre — Perú)
**Relacionado:** [ADR-124](124-especializaciones-forestal-ctp.md) (LO-CTP + mecanismo de especializaciones)

---

## Contexto

ADR-124 implementó el **LO-CTP** (Libro de Operaciones de Centros de
Transformación Primaria): registra la madera que **ingresa** a una planta
con su GTF. Pero ése es solo uno de los dos libros que exige SERFOR.

El **Libro de Operaciones de los Títulos Habilitantes (LO-TH)** es el libro
que lleva el **titular de la concesión/permiso/autorización forestal** durante
el aprovechamiento **en el bosque** — desde el árbol en pie hasta el despacho.
Es **obligatorio** (no llevarlo = infracción muy grave) y es **requisito
indispensable** para emitir una GTF: la información de los productos a movilizar
debe estar consignada en el libro **antes** de emitir la guía.

Fuente: *Guía práctica para el registro de información en el Libro de
Operaciones de los Títulos Habilitantes* (SERFOR + FOREST/USAID, 2021, 64 pp).
Formato aprobado por **RDE N° 264-2019-MINAGRI-SERFOR-DE**. Definición legal
en el **Art. 171 del Reglamento** (Ley 29763).

> Es un libro **interno, no oficial**, igual que el LO-CTP: no integra con
> SNIFFS todavía. El libro oficial sigue siendo físico foliado (autorizado por
> la ARFFS) o el SNIFFS digital. Nuestro módulo es un asistente operativo que
> puede **imprimir** para pegar en el libro físico.

### Las 6 secciones (RDE 264-2019)

| # | Sección | Columnas clave |
|---|---|---|
| 1 | Tala | Cód. árbol · R · especie · Ø mayor · Ø menor · long. aprovechable · volumen · obs. |
| 2 | Trozado | Cód. troza · R · especie · Ø mayor · Ø menor · long. · volumen · obs. |
| 3 | Despacho de trozas | Cód. troza · cód. despacho · N° GTF · obs. |
| 4 | Consumo de trozas | Cód. troza · especie · volumen · obs. |
| 5 | Producto terminado | Tipo producto · especie · cantidad · unidad · obs. |
| 6 | Despacho de prod. terminado | N° GTF · tipo · especie (común + científico) · n° piezas · cantidad · unidad · obs. |

### Reglas SERFOR de obligado cumplimiento

- **Volumen** (tala/trozado): fórmula `V = 0.7854 × ((Ø mayor + Ø menor)/2)² × Longitud` en m³.
  (`0.7854 = π/4`; los diámetros son el promedio de ≥2 medidas cruzadas por sección.)
- **Unidades**: solo sistema **métrico** (m, m³, Kg, Unidad). Nunca pies tablares/pulgadas.
- **Plazo de registro**: dentro de **15 días calendario** de la actividad.
- **Orden**: cronológico + correlativo, sin espacios/líneas en blanco, **sin enmendaduras**.
- **Subsanación de errores** (solo fortuitos/omisión): **no se borra** — se marca la línea
  errada, se re-registra corregida y se anota en "detalle de observaciones" qué línea
  corrige a cuál.
- **Carátula** obligatoria (Anexo 1): N° registro (ARFFS), N° tomo, titular, N° título
  habilitante, RUC, DNI, domicilio, depto/prov/distrito, documento de gestión
  (PO/PMFI/DEMA), N° resolución.
- Predios privados **no** llevan libro; concesiones de plantación y cesión agroforestal sí.

---

## Decisión

### A. Especialización nueva

Se añade `spec:forestal:loth-libro` al registry de `lib/specializations.ts`
(vertical `forestal`), habilitable por superadmin vía `TenantFeatureFlag`,
igual que `spec:forestal:ctp-libro`. Tab admin nuevo: `loth-libro-operaciones`.

### B. Modelo de datos — **tabla unificada** (2 tablas nuevas)

En vez de 6 tablas (una por sección) usamos **una tabla unificada
`ForestLothEntry` con discriminador `section`** + una `ForestLothCaratula`
para los datos del libro/tomo. Razones:

- Las 6 secciones comparten ~70% de columnas (fecha, código, especie, diámetros,
  volumen, observaciones). Una tabla evita duplicación y simplifica la API a una
  sola ruta con filtro por sección.
- **Migración aditiva de bajo riesgo**: 2 `CREATE TABLE`, cero cambios a tablas
  existentes, cero pérdida de datos.
- Discriminadores (`section`, `unit`, `productType`, `status`) son **`String`
  validados con Zod** en backend, no enums Postgres nuevos → migración más simple
  y evolución sin `ALTER TYPE`.

Trazabilidad por código (`treeCode` → `trozaCode` → `gtfNumber`) se preserva como
campos; la integridad es a nivel app (consistente con el modelo multi-tenant
app-level del proyecto, sin FKs duras entre secciones).

`lineNo` (correlativo por sección/tomo) se calcula `max+1` en la DB class al crear.

### C. Subsanación conforme a SERFOR

No se borra: `status = "anulado"` + `annulledReason`, y la línea correctora lleva
`correctsLineNo` + `correctionNote`. El soft-delete (`deletedAt`) queda solo para
errores de captura del propio sistema, no para subsanación normativa.

### D. Cubicación

Reutiliza el método de ADR-124 (numéricamente idéntico a SERFOR) pero capturando
**Ø mayor y Ø menor por separado** (lo que el LO-TH exige), aplicando
`V = 0.7854 × ((Ø mayor + Ø menor)/2)² × L` por línea/troza.

---

## Consecuencias

**Positivas:** cubre el segundo libro SERFOR (el que legalmente necesita un titular
que extrae y despacha con GTF); base para un futuro emisor de GTF
(`spec:forestal:gtf-emisor`, que ya requiere libro previo); export imprimible
formato oficial.

**Negativas / deuda:** tabla unificada con columnas nullable por sección (se mitiga
con validación Zod por sección); sin integración SNIFFS (igual que LO-CTP);
`lineNo` calculado app-side podría colisionar bajo alta concurrencia (aceptable para
el volumen real de un titular; futura secuencia si hace falta).

---

## Alternativas consideradas

1. **6 tablas separadas** (una por sección): más type-safe pero 6 migraciones, 6 rutas,
   mucho boilerplate duplicado. Descartado por costo/beneficio.
2. **Extender `WoodEntry`** (LO-CTP): rechazado — son libros distintos con semántica y
   normativa distinta; mezclarlos rompe la trazabilidad y la claridad regulatoria.

## Referencias

- RDE N° 264-2019-MINAGRI-SERFOR-DE (formato LO-TH)
- Art. 171 Reglamento Ley Forestal 29763
- RDE N° 261-2017-SERFOR-DE (rangos de error en medición)
- Guía práctica SERFOR/FOREST 2021 (64 pp)
