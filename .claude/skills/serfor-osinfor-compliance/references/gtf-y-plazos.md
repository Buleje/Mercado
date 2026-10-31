# GTF, plazos y fuentes

Complemento de `SKILL.md`. Lo no negociable vive en la regla `forestal-serfor`.

## Marco legal

Ley 29763 (2015; derogó la 27308) · D.S. 018-2015-MINAGRI (+ 019, 020, 021: fauna, comunidades, plantaciones) · RDE D000025-2023-MIDAGRI-SERFOR-DE (formato del LO-CTP, fuente de campos y plazos). El LO-CTP vive en el MC-SNIFFS (Módulo de Control del SNIFFS).

## GTF: Guía de Transporte Forestal

- Declaración jurada (Ley 29763 art. 124) con formato aprobado por SERFOR; ampara mover producto desde el área de aprovechamiento **o desde el CTP**. La emiten titulares de título habilitante, regentes, plantaciones registradas y plantas de transformación registradas (la suya). El CTP puede emitir su GTF de salida (D.S. 018-2015-MINAGRI art. 172 inc. c). Existe un aplicativo SERFOR de emisión y registro.
- Origen legal del ingreso = la GTF con la que entró la materia prima (`WoodEntry.gtfNumber`): sin GTF válida no hay ingreso legal.
- **Serie y correlativo de la salida**: `ForestCtpDespachoDB.emitirGtf` (`lib/db/forest-ctp-despacho.db.ts`; ADR-137, cierre de período ADR-139) asigna `{serie}-{correlativo:6}` desde la serie autorizada por la ARFFS (`gtfSerie` de la ficha, `ForestCtpFichaDB`). Lock `FOR UPDATE` sobre los despachos del tenant, correlativo derivado del máximo existente, idempotente (`yaEmitida`), auditado (`ctp_gtf_emitir`). Rechaza: serie no configurada, despacho anulado, fuera de serie, salto de correlativo (propone el siguiente) y mes cerrado. Cableado en `components/admin/forestal/CtpGuiaDeLineaModal.tsx` y `app/api/admin/forestal/ctp/route.ts`.
- **Impresión** (`lib/forestal/ctp-gtf-print.ts`): según su encabezado, las reglas formales salen de la RDE D000014-2024-MIDAGRI-SERFOR-DE (que deroga la 122-2015): art. 3 Arial, prenumerada, autocopiativa, A4; art. 4 talonario registrado ante la ARFFS; art. 5 original + 2 copias. No reemplaza el talonario oficial. Datos del cuerpo (propietario, destinatario, transportista, vehículo, conductor, títulos, traslado): `lib/forestal/ctp-gtf-datos.ts`.
- Gemelo del LO-TH: `ForestGtfDB` (`lib/db/forest-gtf.db.ts`) y `LothGtfView` (`components/admin/forestal/LothGtfView.tsx`); ADR-305 y 371 a 373; memoria `loth-seis-secciones-rde264-verificado`.
- Gap «LOTH↔GTF» (Cargar trozas despachadas marcaba una troza «no está en el libro»): **cerrado**. La lista de códigos del libro ya no sale de las trozas disponibles para despachar sino de `ForestLothDB.trozaCodesRegistrados` (`?trozaCodes=1` en `app/api/admin/forestal/loth/route.ts`); memoria `loth-blindaje-2026-07-20`.

## Plazos del registro

- **CTP: 2 días hábiles** entre la operación (`entryDate`) y el registro (`createdAt`): `PLAZO_REGISTRO_DIAS = 2` y `estaFueraDePlazo()` en `lib/forestal/ctp-compliance.ts`. La misma fórmula está en SQL (`DIAS_HABILES_REGISTRO_SQL` y `FUERA_DE_PLAZO_SQL` en `lib/db/wood-entries.db.ts`) para que `stats().lateCount` y el filtro den el mismo conjunto; badge, panel y Excel comparten el predicado. **No descuenta feriados** (ADR-137): un registro tardío solo por un feriado puede marcarse.
- **LO-TH** (otro libro, otra norma): **15 días** (RDE 264-2019), `lib/forestal/loth-constants.ts`.
- Antes de mover un número: leer el texto vigente de la RDE D000025-2023 y del Reglamento, distinguir «días» de «días hábiles» y a qué operación aplica cada plazo. Si cambia, es un cambio de compliance: ADR y SQL en el mismo commit.
- Historia: el CTP usaba 15 días calendario (incorrecto); se reconcilió a 2 hábiles el 2026-07-30.

## CITES

Caoba (*Swietenia macrophylla*), cedro (*Cedrela* spp.) y shihuahuaco (*Dipteryx*), lista creciente: legal con permiso CITES archivado. No es infracción y no resta score (`CATEGORIAS_QUE_RESTAN` en `ctp-compliance.ts`): un score que castiga lo incorregible enseña a ignorarlo; se muestra como recordatorio. El N° de permiso se guarda dentro de `notes` del ingreso («… · Permiso CITES: X»), sin columna aparte; lectura estructurada en `lib/forestal/ctp-compliance.ts`.

## Fuentes primarias (verificar aquí antes de asertar una norma)

- SNIFFS / Módulo de Control: https://sniffs.serfor.gob.pe/control/
- Guía práctica del LO-CTP (PDF): https://cdn.www.gob.pe/uploads/document/file/6264954/5511967-guia-practica-para-la-implementacion-y-uso-del-libro-de-operaciones-de-centros-de-transformacion-primaria-de-productos-y-subproductos-forestales-maderables.pdf
- GTF, preguntas frecuentes: https://www.serfor.gob.pe/portal/faq/guia-de-transporte-forestal-3
- OSINFOR SIGO-SFC (trazabilidad del TH, DataBOSQUE): https://sigosfc.osinfor.gob.pe/
- gob.pe da 403 al fetch directo: usar `firecrawl_scrape` con `parsers:["pdf"]` y `proxy:"stealth"`. Docs de librerías (Next, Prisma, Tailwind): Context7.
- Memorias: `ctp-libro-invariantes-2026-07-15`, `forestal-lotes-produccion-2026-07-17`, `crear-especializacion-checklist`.
