---
name: serfor-osinfor-compliance
description: |
  Lineamientos oficiales SERFOR + OSINFOR (Perú) para el módulo forestal / CTP
  aserradero: Libro de Operaciones electrónico (LO-CTP / MC-SNIFFS), Guía de
  Transporte Forestal (GTF), cadena de custodia, trazabilidad, especies CITES,
  plazos de registro, y el MAPEO código↔regulación. Cargar SIEMPRE antes de
  crear o editar features del CTP (lib/db/forest-*, lib/forestal/**,
  components/admin/forestal/**, app/api/admin/forestal/**) o cuando Brandon
  hable de SERFOR, OSINFOR, aserradero, fiscalización, Libro de Operaciones,
  GTF, rendimiento/coeficiente, o trazabilidad de madera.
user-invocable: true
disable-model-invocation: false
context: main
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
argument-hint: "[ingreso | transformacion | despacho | gtf | cites | export | plazos]"
---

# SERFOR / OSINFOR — estándar de cumplimiento del CTP aserradero

> **Objetivo:** que toda feature del módulo forestal case con lo que exige la ley
> forestal peruana, de modo que el Libro, los despachos y los certificados sean
> **fiscalizables de punta a punta** por un inspector de SERFOR u OSINFOR.
> Verificado contra fuente primaria SERFOR el **2026-07-17** (ver §9).

Regla de oro: **un dato que un fiscalizador no puede cruzar contra su documento de
origen no sirve.** Cada salida debe poder responder *"¿de qué árbol / de qué GTF
salió esto?"*. Eso es lo que fiscaliza OSINFOR y lo que exige la EUDR para exportar.

---

## 1. Los dos organismos (no confundir roles)

| | **SERFOR** | **OSINFOR** |
|---|---|---|
| Qué es | Autoridad **rectora** nacional (adscrita a MIDAGRI) | **Supervisor/fiscalizador** autónomo |
| Rol | Normativa, registros, **SNIFFS**, formato del Libro, GTF | **Supervisa y sanciona** títulos habilitantes; verifica origen legal |
| Al CTP le importa | Dónde registra (LO-CTP), qué formato, qué plazo | Puede auditar la cadena de custodia del CTP hacia atrás |
| Sistemas | **SNIFFS** (MC-SNIFFS, LO-CTP), aplicativo GTF | **SIGO-SFC**, DataBOSQUE, reporte de trazabilidad del TH |
| Rige por | Ley 29763 + Reglamento Gestión Forestal | Ley 29763 + su ley de creación |

**ARFFS** = Autoridad Regional Forestal y de Fauna Silvestre (el GORE). Es quien
**registra el CTP**, asigna su **Código de CTP** y **autoriza el correlativo/foliado**.

---

## 2. Marco legal (jerarquía)

1. **Ley N° 29763** — Ley Forestal y de Fauna Silvestre (vigente desde 2015; derogó la Ley 27308).
2. **Reglamento para la Gestión Forestal** — D.S. 018-2015-MINAGRI (+ 019/020/021 para fauna, comunidades, plantaciones).
3. **RDE N° D000025-2023-MIDAGRI-SERFOR-DE** — aprueba el **formato del Libro de Operaciones de CTP de productos y subproductos forestales maderables** (LO-CTP). ⚠️ **Fuente autoritativa de campos y plazos.**

Un ADR nuevo (`/adr`) es obligatorio si una feature cambia contratos de trazabilidad,
el schema forestal, o cómo se acredita origen legal (ver ADR-134/135/136).

---

## 3. Libro de Operaciones del CTP (LO-CTP) — el corazón

El titular del CTP está **obligado** a registrar **ingresos, transformación y salidas**
para garantizar el origen legal. Módulo electrónico: **LO-CTP** dentro del
**MC-SNIFFS** (Módulo de Control del SNIFFS). Registro manual **o** electrónico;
con soporte informático → debe ir al SNIFFS.

**Los 3 registros y sus campos oficiales** (RDE D000025-2023) ↔ **cómo los guarda el código**:

### 3.1 Registro de INGRESO (materia prima) → `WoodEntry` (`lib/db/wood-entries.db.ts`)
| Campo oficial SERFOR | Campo en el código |
|---|---|
| Fecha | `entryDate` |
| Tipo de Documento / Número de Documento | (GTF) `gtfNumber` + `gtfSeries` + `gtfDate` |
| Número de Fuente de Origen/Procedencia | `originCode` |
| Código de Origen/Procedencia | `originType` + `originRegion`/`originDistrict` |
| Tipo de Producto | `productType` (rolliza, etc.) |
| Especie | `speciesCommonName` + `speciesScientificName` |
| Unidad de Medida / Cantidad | `unit`(implícito m³) + `volumeM3` (Decimal 12,4) |
| (proveedor) | `providerName` + `providerDocument`/`providerDocumentType` + `supplierId` |
| CITES | `speciesCites` (bool) |
| Observaciones | `notes` |

### 3.2 Registro de TRANSFORMACIÓN → `ForestCtpEntry section="produccion"`
| Campo oficial SERFOR | Campo en el código |
|---|---|
| Tipo de Producto / Especie | `productType`, `speciesCommon`/`speciesScientific` |
| Materia prima consumida | `volumeInputM3` + puente `ForestCtpConsumo` (N:M) |
| **Coeficiente de rendimiento** | `rendimientoPct` (output/input %) |
| Cantidad / Unidad | `quantity` (Decimal 14,4) + `unit` (m3/pt/kg/unidad) |
| **Lote** | `ForestProdLote`/`ForestProdLoteMiembro` (ADR-136) |
| Observaciones | `observations` |

### 3.3 Registro de SALIDA (despacho) → `ForestCtpEntry section="despacho"`
| Campo oficial SERFOR | Campo en el código |
|---|---|
| Fecha / Tipo de Documento | `entryDate` / (GTF emitida) `gtfNumber` |
| Tipo de Producto / Especie / Lote | `productType`, especie, lote |
| Cantidad / Unidad | `quantity` + `unit` |
| Destino | `destino` |
| Origen (qué producción lo respalda) | puente `ForestCtpDespachoOrigen` (N:M) |

> El **saldo/existencia** = Σ ingresos − Σ consumidos, y Σ producido − Σ despachado.
> Cualquier vista de "existencias" del CTP se deriva de estos tres registros; nunca es un contador aparte.

---

## 4. Cadena de custodia — las invariantes ya son el enforcement

Ver `[[ctp-libro-invariantes-2026-07-15]]`. NO reinventes: I1–I5 son la traducción a
código de la trazabilidad que exige la ley. Todas **app-level + LOCK sobre el recurso
disputado** dentro de la tx (Postgres no puede, agregadas + aislamiento app-level).

| | Regla | Qué previene (lenguaje fiscalizador) |
|---|---|---|
| I1 | Σ consumos(línea) ≤ volumeInputM3 | consumir más de lo que dice el acta |
| I2 | Σ consumos(ingreso) ≤ volumeM3 | **blanqueo**: un ingreso GTF usado dos veces |
| I3 | Σ despachado(producto) ≤ Σ producido | despachar más de lo transformado |
| I4 | Σ orígenes(despacho) ≤ despacho.quantity | atribución incoherente en la salida |
| I5 | Σ orígenes(corrida) ≤ produccion.quantity | **una corrida despachada dos veces** |
| L1 | Σ miembros(corrida) ≤ corrida.quantity | una corrida en dos lotes (ADR-136) |

**Nunca `==`, siempre `≤`.** Forzar atribución total hace que el operador invente un
origen ⇒ la regla fabricaría el fraude que previene. El faltante se reporta como
`sinAtribuir`; **el libro admite huecos, el certificado NO** (`trazabilidadCompleta()`
bloquea EMITIR, nunca guardar).

---

## 5. GTF — Guía de Transporte Forestal (el documento de origen legal)

- **Qué es:** declaración jurada, formato aprobado por SERFOR, que ampara el transporte
  de productos en estado natural o con transformación primaria.
- **Cuándo:** al movilizar producto desde el área de aprovechamiento **o desde el CTP** a
  cualquier destino. → **el CTP emite su propia GTF de salida.**
- **Quién emite:** titulares de título habilitante / regentes / titulares de plantación
  registrada / **titulares de planta de transformación registrada** (emiten la SUYA).
- **Origen legal del ingreso** = la **GTF con la que entró la materia prima** (`WoodEntry.gtfNumber`).
  Sin GTF válida no hay ingreso legal → nunca crear un ingreso sin exigirla.
- **Digital:** existe aplicativo SERFOR de emisión/registro de GTF (opera en varias regiones).
  Si algún día se integra: la GTF de salida del despacho debe llevar **serie + correlativo
  autorizado por la ARFFS**, no texto libre.

**Gap conocido (feature candidata):** hoy la GTF de salida es texto libre en `despacho.gtfNumber`.
Formalizarla (serie/correlativo/formato imprimible) = subir al estándar SERFOR.

---

## 6. Especies CITES / protegidas

- CITES (caoba *Swietenia macrophylla*, cedro *Cedrela* spp., shihuahuaco/*Dipteryx* — listado creciente)
  es **legal con permiso CITES archivado**. NO es infracción.
- **Regla dura (no revertir):** CITES **NO resta** en el score de cumplimiento
  (`ctp-compliance.ts`: fuera de `CATEGORIAS_QUE_RESTAN`). Un score que castiga lo
  incorregible enseña a ignorarlo. Se muestra como recordatorio ("tené el permiso a mano").
- Feature válida: **adjuntar el N° de permiso CITES** al ingreso/despacho de esas especies.

---

## 7. Plazos ⚠️ (RECONCILIAR antes de tocar)

- El código encoda **15 días** (`PLAZO_REGISTRO_DIAS` en `lib/forestal/ctp-compliance.ts`,
  comparado en ms contra `WoodEntriesDB.stats().lateCount`).
- La **guía práctica del LO-CTP (RDE D000025-2023)** apunta a un plazo mucho más corto
  (**~2 días hábiles** para registrar la operación en el libro electrónico).
- **NO cambies el número a ciegas.** Antes de mover `PLAZO_REGISTRO_DIAS`:
  1. Leé el texto vigente de la RDE D000025-2023 y del Reglamento (art. del Libro de Operaciones).
  2. Distinguí "días" vs "días hábiles" y a qué operación aplica cada plazo.
  3. Si cambia: es un cambio de compliance → ADR + actualizar el SQL de `lateCount` **en el mismo commit** (el badge, el panel y el Excel comparten el predicado `estaFueraDePlazo()` — no pueden divergir).

---

## 8. Guardrails al meter features (checklist)

**SIEMPRE**
- Multi-tenant: `tenantId` 1er arg, LOCK sobre recurso disputado en toda tx que atribuya.
- Toda salida trazable hasta una GTF de ingreso; export/certificado gated por `trazabilidadCompleta()`.
- Fechas date-only (`entryDate`/`gtfDate`) se formatean con `timeZone:"UTC"` (bug off-by-one Lima ya fixeado).
- Costos: derivados on-read, congelados al cierre; **sin factura → `null`, nunca `0`** (un 0 finge margen 100%).
- Números con la precisión del schema (volumen Decimal 12,4 / cantidad 14,4); nunca `float` de JS para volúmenes.
- Auditar toda acción nueva vía `ctp-audit.ts` (entity + acción).

**NUNCA**
- Forzar atribución `==` (fabrica fraude). Usar `≤` + reportar `sinAtribuir`.
- Crear un ingreso sin GTF, ni un despacho que exceda lo producido (rompe I2/I3).
- Hacer que CITES reste puntos, ni bloquear GUARDAR por trazabilidad incompleta (solo EMITIR).
- Tocar `prisma.*` directo (usar `lib/db/forest-*.db.ts`), ni `.parse()` de Zod.
- Cambiar un plazo/score de compliance sin ADR + sin sincronizar los 3 lugares que lo leen.

---

## 9. Fuentes primarias (verificar aquí antes de asertar norma)

- **SNIFFS / Módulo de Control:** https://sniffs.serfor.gob.pe/control/
- **Guía práctica LO-CTP (SERFOR, PDF):** https://cdn.www.gob.pe/uploads/document/file/6264954/5511967-guia-practica-para-la-implementacion-y-uso-del-libro-de-operaciones-de-centros-de-transformacion-primaria-de-productos-y-subproductos-forestales-maderables.pdf
- **GTF — Preguntas frecuentes SERFOR:** https://www.serfor.gob.pe/portal/faq/guia-de-transporte-forestal-3
- **OSINFOR SIGO-SFC / trazabilidad del TH:** https://sigosfc.osinfor.gob.pe/
- Base legal: **Ley 29763**, **D.S. 018-2015-MINAGRI**, **RDE D000025-2023-MIDAGRI-SERFOR-DE**.

> Para docs de librerías (Next 16 / Prisma 7 / Tailwind 4) → Context7. Para norma forestal
> peruana → estas fuentes o `firecrawl_scrape` con `parsers:["pdf"]` + `proxy:"stealth"`
> (gob.pe da 403 a fetch directo).

---

## 10. Cómo usar este skill

- **Antes de codear** una feature del CTP: releé §3 (mapeo), §4 (invariantes), §8 (guardrails).
- **`/serfor-osinfor-compliance ingreso`** (o transformacion/despacho/gtf/cites/export/plazos) →
  enfocá la sección relevante.
- Si una feature toca schema/contrato de trazabilidad → `/adr` primero (ADR-134/135/136 son el precedente).
- Memorias relacionadas: `[[ctp-libro-invariantes-2026-07-15]]`, `[[forestal-lotes-produccion-2026-07-17]]`, `[[crear-especializacion-checklist]]`.
