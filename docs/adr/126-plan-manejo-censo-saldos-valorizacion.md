# ADR-126 — Plan de Manejo Forestal + Censo + Saldos + Valorización (LO-TH v2)

**Fecha:** 2026-05-28
**Estado:** Propuesto
**Decisión:** Brandon
**Contexto regulatorio:** SERFOR — Ley 29763 + Reglamento Gestión Forestal
**Relacionado:** [ADR-125](125-libro-operaciones-titulos-habilitantes.md) (LO-TH 6 secciones)

---

## Contexto

El LO-TH (ADR-125) ya registra el flujo tala→despacho, pero **sin la base maestra
que lo gobierna**: el Plan de Manejo aprobado y su censo de árboles. Hoy el código
del árbol se escribe libre, no hay volumen autorizado, no hay saldo, no hay
valorización. SERFOR estructura el aprovechamiento sobre 3 pilares que faltan:

1. **Plan de Manejo (PMFI/PO/DEMA)** aprobado por resolución de la ARFFS, con
   especies y volúmenes **autorizados** por parcela de corta.
2. **Censo forestal**: cada árbol aprovechable, georreferenciado (UTM), con
   código único, especie, **DAP** (Ø a 1.30 m), **altura comercial (Hc)** y
   **volumen comercial estimado** = `0.7854 × DAP² × Hc × ff` (ff = factor de forma).
3. **Balance de extracción / saldo** = `volumen autorizado − volumen movilizado (GTF)`,
   por especie y por árbol. Determina cuánto queda por aprovechar.

### Hallazgos de la investigación (norma vigente)

| Proceso | Norma | Qué exige |
|---|---|---|
| Censo / POA | Guías SERFOR MFC 2019, RDE 253-2016 | Árbol: especie, DAP, Hc, ff, V, UTM, código; POA suscrito por regente, 1–3 años |
| Volumen comercial | INFFS | `V = 0.7854 × DAP² × Hc × ff` |
| Balance de extracción / saldo | Guía N°4 SERFOR | autorizado − movilizado(GTF) = saldo, por especie/árbol |
| Reingreso / movilización de saldos | RDE 112-2016 | re-aprovechar o mover saldos no movilizados (plazos 45/365 días) |
| GTF | RDE 122-2015, RDE D000014-2024 | título, plan, parcela, titular, especies+volúmenes, vehículo/conductor, fechas, **declaración jurada**, **QR**; va con **Lista de Trozas** |
| Lista de trozas | RDE 122-2015 | por troza: especie, código, Ø mayor, Ø menor, longitud → volumen total |
| Pago derecho aprovechamiento | RDE 241-2016, Reglamento Tít. XIX | Concesión: `0.01% UIT × ha` + `VEN especie × volumen movilizado`. CCNN: solo VEN × volumen. VEN = VRneto × 10.5% × F.conservación |
| SNIFFS / MC-SNIFFS | RDE 044-2020 | libros electrónicos bosque+CTP, app emisión/registro GTF con QR, consultas en línea, control exportaciones; integra OSINFOR/SUNAT/ADUANAS |
| Cierre POA | RDE 264-2020 | copia del libro a ARFFS, SERFOR y OSINFOR al terminar |

---

## Decisión

### A. Nuevo apartado "Plan de Manejo" (base maestra) — 3 tablas

```
ForestPlan            — el permiso/plan (PMFI|PO|DEMA)
  tipo, numeroPlan, tituloHabilitante, resolucionNumber, resolucionDate,
  titular (FK ForestLothCaratula o campos), arffs, region,
  vigenciaDesde, vigenciaHasta, parcelaCorta, areaHa, uitRef, estado
ForestPlanSpecies     — especies APROBADAS del plan
  planId, speciesCommon, speciesScientific, cites, categoria,
  volumenAutorizadoM3, arbolesAutorizados,
  valorEstadoNaturalSoles (S//m³), precioVentaSoles (S//m³ comercial)
ForestCensusTree      — censo: cada árbol aprovechable
  planId, treeCode (único), speciesCommon, speciesScientific, cites,
  dapM, alturaComercialM, factorForma, volumenEstimadoM3,
  utmZona, utmX, utmY, parcelaCorta, calidad,
  estado (en_pie | talado | descartado)
```

### B. Flujo data-driven (lo que pidió el usuario)

1. En **Tala**, al escribir/escanear el `treeCode` → autocompleta del censo:
   especie, científico, CITES, DAP, Hc estimada, volumen estimado, parcela, UTM.
2. El usuario mide en campo e ingresa **valores reales** (largo aprovechable real,
   Ø reales) → volumen real (Smalian). Se guarda y se **compara estimado vs real**.
3. Al talar, el árbol del censo pasa a `estado = talado` (consume saldo del árbol).
4. **Trozado** hereda especie/código del árbol talado. **Despacho/Consumo** validan
   contra las trozas existentes. **Despacho PT** alimenta la **GTF + lista de trozas**.

### C. Motor de saldos (balance de extracción)

`saldo[especie] = volumenAutorizado − Σ volumen movilizado (despacho con GTF)`.
Vista por especie y por árbol. Alertas cuando el aprovechamiento real **excede** lo
autorizado (→ requiere reformulación) o cuando la **vigencia** del plan vence.

### D. GTF (módulo nuevo, integra despacho)

Genera la GTF con todos sus campos + **lista de trozas** (toma las trozas de
"Despacho de trozas" / piezas de "Despacho PT"), número correlativo, **declaración
jurada**, y **QR** (interno; SNIFFS oficial futuro). El despacho del LO-TH pre-llena la GTF.

### E. Valorización / comercial (mejora sobre lo oficial)

- **Precio de venta por m³ por especie** → valor del lote talado / despachado.
- **Pago por derecho de aprovechamiento** calculado: `0.01% UIT × ha + Σ(VEN especie × vol. movilizado)`.
- Rentabilidad: valor venta − pago derecho − costos.

### F. Mejoras (sobre el proceso oficial)

| Mejora | Beneficio |
|---|---|
| Autocompletado por código (censo→tala→trozado) | Velocidad + cero re-tipeo + trazabilidad fuerte |
| Validación de coherencia inter-sección | No trozar > talado, no despachar troza inexistente, no exceder autorizado |
| Alertas automáticas | Saldo bajo · vigencia por vencer · 15 días sin registrar · CITES · exceso de volumen |
| Mapa de árboles (UTM → Leaflet) | Ubicación visual de la parcela de corta |
| Valorización económica | Precio/m³, valor del lote, pago derecho, margen |
| Export oficial imprimible + PDF GTF con QR | Pegar en libro físico foliado / entregar en control |
| Balance de extracción + informe de ejecución POA | Reportes para ARFFS/SERFOR/OSINFOR al cierre |
| Trazabilidad visual (ADR-125) + QR | Auditoría de un árbol de punta a punta |

---

## Fases de implementación

| Fase | Entrega | Tablas / archivos |
|---|---|---|
| **1** | Apartado **Plan de Manejo + Censo** (CRUD maestro) + especies autorizadas + precio/m³ | ForestPlan, ForestPlanSpecies, ForestCensusTree + DB class + API + UI |
| **2** | **Tala data-driven**: autocompletar por código + estimado vs real + marcar árbol talado | edita LothEntryForm + endpoint lookup censo |
| **3** | **Motor de saldos** + dashboard (autorizado vs movilizado, % avance, alertas) | vista + agregados |
| **4** | **GTF** + lista de trozas + QR + valorización (pago derecho, valor lote) | módulo GTF |
| **5** | Reportes oficiales (balance extracción, informe ejecución), export imprimible, mapa UTM | reportes |

---

## Consecuencias

**Positivas:** convierte el LO-TH en un sistema de gestión forestal real (no solo un
registro): controla saldos, valoriza, previene exceso de volumen (causa típica de
sanción OSINFOR), y deja todo trazable por código de árbol. Base para emisor GTF y
futura integración SNIFFS.

**Negativas / deuda:** crece el schema (3 tablas nuevas + relaciones); el ff (factor
de forma) y el VEN por especie requieren tablas de referencia (se siembran con
valores SERFOR 2016 actualizables); SNIFFS oficial sigue siendo externo.

## Alternativas

1. **Seguir sin censo (código libre)**: simple pero sin saldo, sin valorización, sin
   prevención de exceso — no es un sistema de manejo, solo un cuaderno. Descartado.
2. **Cargar censo por Excel/CSV** en vez de CRUD manual: se contempla como import en
   Fase 1.5 (el censo real tiene cientos de árboles).

## Referencias

- RDE 122-2015-SERFOR-DE (GTF + lista de trozas) · RDE D000014-2024 (formato GTF actual)
- RDE 241-2016-SERFOR-DE (valor al estado natural / pago derecho)
- RDE 112-2016-SERFOR-DE (reingreso y movilización de saldos)
- RDE 253-2016-SERFOR-DE (Marco Metodológico INFFS) · Guías MFC SERFOR 2019 N°2/3/4
- RDE 044-2020-MINAGRI-SERFOR-DE (SNIFFS) · Reglamento Gestión Forestal Tít. XIX
