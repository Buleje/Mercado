# ADR-127 — Libro CTP completo (producción + despacho + saldos de planta)

**Fecha:** 2026-05-29
**Estado:** Propuesto
**Decisión:** Brandon
**Relacionado:** [ADR-124](124-especializaciones-forestal-ctp.md) (LO-CTP ingreso), [ADR-126](126-plan-manejo-censo-saldos-valorizacion.md)

---

## Contexto

El LO-CTP (ADR-124, `WoodEntry`) solo registra el **ingreso** de madera al Centro
de Transformación Primaria. El libro SERFOR del CTP exige el ciclo completo:

1. **Ingreso** de materia prima (con GTF) → ya existe (`WoodEntry`).
2. **Producción / transformación** — qué producto sale de qué materia prima.
3. **Despacho** de productos transformados (con GTF).
4. **Saldos de planta** — materia prima disponible y stock de productos.

## Decisión

Tabla unificada **`ForestCtpEntry`** con discriminador `section`
(`produccion | despacho`), análoga a `ForestLothEntry`. El **ingreso** sigue en
`WoodEntry`. Los saldos se calculan cruzando ambas:

- **Saldo materia prima** = Σ ingreso (`WoodEntry.volumeM3`) − Σ `volumeInputM3` (consumido en producción).
- **Stock de productos** = Σ `quantity` producida − Σ `quantity` despachada (por tipo/especie).
- **Rendimiento** = output / input de la producción.

Reusa el patrón Buleje (tenantId 1er param, cache, spec guard `spec:forestal:ctp-libro`,
rate-limit GENEROUS bucket `ctp`). Discriminadores `String` validados con Zod (sin enums PG).

## Consecuencias

**Positivas:** cierra el libro CTP (ingreso→producción→despacho→saldos) y habilita la
trazabilidad **bosque (LO-TH) → CTP → industria**. Base para valorización de planta.

**Deuda:** la trazabilidad bosque→CTP es por GTF (la GTF de despacho del titular = GTF
de ingreso del CTP); el enlace es por número de GTF, no FK dura (consistente con el
modelo app-level). Saldos por especie/producto; multi-producto-de-una-troza no se
desagrega (igual que SERFOR para el aserrío).

## Referencias
- RDE D000009-2023-MIDAGRI-SERFOR-DE (LOE-CTP) · RDE 122-2015 (GTF)
