# ADR-308 — Trámites y oficios forestales: módulo propio, catálogo de formatos y expediente en KV

- **Fecha:** 2026-07-29
- **Estado:** aceptado
- **Contexto forestal:** SERFOR · ARFFS · OSINFOR (ver skill `serfor-osinfor-compliance`)

## Contexto

El sistema ya genera todo lo que el CTP **registra**: el Libro de Operaciones
(LO-CTP), el ANEXO N° 04, la GTF de salida, el informe ARFFS, la carpeta de
fiscalización, el expediente EUDR y los reportes de existencias y cumplimiento.

Lo que no genera es lo que el CTP **le pide a la autoridad**. Eso hoy se escribe
a mano en Word, cada vez desde cero, y con eso se pierden tres cosas:

1. **El membrete legal.** Una solicitud sin razón social, RUC, Código de CTP y
   registro ARFFS exactos vuelve observada. Esos datos ya están en la Ficha CTP.
2. **Los datos del libro.** Un visado de talonario de GTF se pide diciendo qué
   serie y qué correlativo se agotó; eso lo sabe el libro, no la memoria.
3. **El rastro.** Nadie sabe qué se presentó, cuándo, ante quién, ni si la
   autoridad respondió. Un trámite sin fecha de presentación es un trámite que
   se vuelve a hacer.

Los trámites concretos que aparecen: visado/autorización de talonario de GTF,
inspección o revisión de campo, registro y actualización de datos del CTP,
remisión del Libro/informe periódico, cambio de regente, descargo ante una
supervisión de OSINFOR, constancia CITES para exportar, y oficios varios.

## Decisión

### 1. Módulo propio, no una pestaña más del Libro CTP

Tab admin nuevo `forestal-tramites` ("Trámites y Oficios"), montado como los
libros (misma cabina `libro-chrome`), **gated por la especialización existente
`spec:forestal:ctp-libro`** — no se crea una spec nueva.

Por qué no dentro del Libro CTP:

- Los trámites sirven al CTP **y** al Libro de Títulos Habilitantes. Metidos
  dentro de uno, el otro los pierde.
- Tienen su propio ciclo de vida (borrador → presentado → observado → resuelto),
  ajeno a las cuatro fases del libro (Operación → Trazabilidad → Control →
  Gestión).
- El Libro CTP ya lleva 12 vistas en 4 grupos; un 5º grupo lo desordena.

Por qué reusar la spec del libro en vez de crear una: quien lleva el Libro de
Operaciones es exactamente quien tramita ante la ARFFS. Una spec nueva son 7
archivos de cableado y un toggle más en superadmin para el mismo público.

### 2. El catálogo de formatos es DATA, no componentes

`lib/forestal/tramites-catalogo.ts` (puro, testeado): cada formato declara su
autoridad destino, asunto sugerido, base legal, campos a llenar (con tipo y
ayuda), el cuerpo del documento como función de los datos, y los anexos que
conviene adjuntar.

Agregar un trámite nuevo = una entrada en esa tabla. No se toca la UI, ni el
generador, ni el endpoint.

### 3. El documento se arma con el membrete real y se imprime como los demás

`lib/forestal/tramites-print.ts` reusa `ctp-print-shared` (ventana de impresión,
escape, bloque de identidad del CTP) y la Ficha CTP como membrete. Un solo motor
de impresión para todo el módulo forestal: si mañana cambia el pie de página
legal, cambia en un lugar.

### 4. El expediente se guarda en KV por tenant, sin migración

Patrón ya probado en **cubicaciones guardadas** (`ForestCubicacionesDB`, key
`ctp-cubicaciones:{tenantId}`) y en zonas de planta: registro versionado en KV
con validación y normalización **en el servidor**, tope de filas, y auditoría.

`ForestTramitesDB` (key `ctp-tramites:{tenantId}`) guarda: id, formato, autoridad,
asunto, datos del formulario, estado, N° de expediente de la autoridad, fecha de
presentación, fecha de respuesta y notas.

Se elige KV y no un modelo Prisma **para esta etapa** porque:

- el volumen es de decenas por año, no miles;
- una migración en esta red exige `DIRECT_URL` accesible (ver
  `[[prisma-generate-restart-dev]]`) y no puede verificarse en el mismo turno;
- el contrato de datos queda escrito acá, así que promoverlo a modelo propio
  después es una migración de datos trivial (leer el KV, insertar filas).

**Cuando** promoverlo a modelo Prisma: si se necesita buscar por texto en el
cuerpo, adjuntar archivos por trámite, o cruzar trámites entre tenants. El
precedente de esa promoción es ADR-307 (los contratos salieron de Notes a modelo
propio cuando necesitaron PDF y firma).

### 5. Lo que el módulo NO hace (a propósito)

- **No inventa códigos de formato oficial.** Ningún "Formato N° 05-SERFOR"
  fabricado: se genera una solicitud administrativa con la estructura estándar
  (destinatario, referencia, asunto, cuerpo, base legal, anexos, firma) y cada
  formato avisa que el requisito exacto se coteja en el **TUPA de la ARFFS**
  correspondiente. Un formato inventado que parece oficial es peor que ninguno.
- **No presenta el trámite.** No hay integración con mesa de partes virtual: el
  documento se imprime o se baja, y el operador registra cuándo lo presentó.
- **No firma digitalmente.** El espacio de firma va en el documento; la firma es
  del titular o del regente.

## Consecuencias

**A favor**

- Un trámite pasa de "media hora de Word" a llenar 3 campos: el membrete y los
  datos del libro ya están.
- Queda el rastro: qué se presentó, cuándo, ante quién y en qué estado está.
- Sumar formatos es agregar datos a una tabla; el módulo no crece en superficie.

**En contra / riesgos**

- El KV no sirve para buscar dentro del cuerpo de los trámites ni para adjuntar
  archivos: cuando eso haga falta, hay que promover a modelo (ver §4).
- El texto de los formatos es responsabilidad del titular. El módulo ayuda a
  redactarlo con los datos correctos, no certifica que la ARFFS lo acepte.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Pestaña "Trámites" dentro del Libro CTP | Los deja fuera del alcance del Libro de Títulos Habilitantes y desordena la cabina de 12 vistas |
| Plantillas en el módulo Documentos (drive) | El drive no conoce el libro: no puede llenar el correlativo de GTF agotado ni el volumen del período |
| Modelo Prisma `ForestTramite` desde el día uno | Migración no verificable en el turno; el KV ya es un patrón probado para este volumen |
| Un generador de PDF nuevo (pdf-lib) | Ya hay motor de impresión con el membrete del CTP; un segundo motor es un segundo pie de página legal que mantener |

## Referencias

- Ley N° 29763 (Ley Forestal y de Fauna Silvestre) · D.S. 018-2015-MINAGRI
- RDE N° D000025-2023-MIDAGRI-SERFOR-DE (formato del LO-CTP)
- Ley N° 27444 (Procedimiento Administrativo General) — estructura de la solicitud
- ADR-124 (módulo forestal / especializaciones) · ADR-307 (documentos con PDF y firma)
- Skill `serfor-osinfor-compliance` §5 (GTF) y §9 (fuentes primarias)
