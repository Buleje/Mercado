# ADR-364 — Relación de guías emitidas para SERFOR: anexo tabular sobre el catálogo de trámites

- **Fecha:** 2026-08-19
- **Estado:** aceptado
- **Contexto forestal:** SERFOR (SNIFFS) · módulo Trámites y Oficios (ADR-308)

## Contexto

El catálogo de trámites (ADR-308) resuelve solicitudes de **texto**: campos
sueltos que se pegan en párrafos ya redactados. Brandon pidió un trámite de
otra forma — una **declaración de guías** para presentar en la Sede SERFOR
(Puerto Bermúdez, editable): qué GTF se emitieron en el período, con su lista
de trozas, y cuáles quedaron anuladas. El SNIFFS no tiene un canal para que el
titular registre directamente sus guías ([[serfor-consulta-gtf-publica]]); la
Sede las sube a mano, y para eso necesita la relación en papel.

El dato de origen ya existe: `lib/forestal/guias-emitidas.ts` (ADR-321) deriva
las guías —incluidas las anuladas— de los despachos con `gtfNumber` del Libro
CTP, sin tabla propia. Lo único que faltaba era la **lista de trozas por
guía**, que ese derivado no trae (es un agregado del despacho, no un detalle
pieza por pieza) y una comunidad puede necesitar declarar guías que el CTP
nunca vio (transporte del monte, un talonario anulado antes de registrarse).

## Decisión

### 1. Un formato más del catálogo, con una tabla en vez de un párrafo

`relacion-guias-serfor` es una entrada más de `FORMATOS_TRAMITE`
(`tramites-catalogo.ts`) — mismo membrete, mismo motor de impresión, mismo
expediente. Se le agregó UN flag al contrato, `tablaGuias?: boolean`: cuando
está prendido, `TramiteFormulario` monta `TramiteRelacionGuias` (el editor de
la tabla) además de los campos sueltos de siempre.

Los datos de identidad de la comunidad (razón social, RUC, jefe/representante
legal) son campos comunes del formulario —autollenados desde la Ficha CTP,
editables como cualquier otro— y no un bloque especial: son exactamente lo que
ya guarda `CtpFicha.razonSocial/ruc/representante`. La sede destinataria
("SERFOR — Sede Puerto Bermúdez") es un **placeholder**, no un valor fijo: el
mismo patrón que el resto del catálogo usa para "a quién va" (ver
`CAMPOS_COMUNES` en `tramites-catalogo.ts`), así que cambiar de sede es
escribir encima, no tocar código.

### 2. La tabla se guarda como UN campo más (`datos.guiasJson`)

`lib/forestal/tramites-relacion-guias.ts` (puro, sin React/fetch/DOM) define
`FilaGuiaInforme` y sus funciones de parseo/serialización/armado de HTML. El
array serializado viaja en `datos.guiasJson`: mismo mecanismo de persistencia
que cualquier otro campo del trámite (KV `ctp-tramites:{tenantId}`, ADR-308),
sin tabla ni migración nueva. El único cambio de contrato es el tope: de 4 KB a
20 KB por campo (`tramites-registro.ts` y el Zod del endpoint, coordinados —
subir uno sin el otro deja que el servidor rechace en silencio lo que el
cliente ya validó).

`guiasJson` no está en `formato.campos`: tiene forma propia (una tabla, no un
input), así que el editor genérico de campos lo ignora y `TramiteRelacionGuias`
lo posee por completo.

### 3. Dos formas de llenarla, marcadas por origen

- **Traer del libro** — llama al endpoint ya existente
  `GET /api/admin/forestal/ctp/guias-emitidas` (ADR-321, incluye anuladas) y
  adapta cada `GuiaEmitida` a una fila con `origen:"libro"`. Verificado contra
  el despacho real.
- **Fila manual** — para lo que el libro no tiene: una guía del monte, una
  anulada antes de registrarse. `origen:"manual"`.

La lista de trozas **nunca se inventa**: `guias-emitidas` no la trae (es un
agregado del despacho, no un detalle pieza por pieza), así que una fila traída
del libro llega con `trozas: ""` y el operador la completa. El documento
impreso declara "sin lista cargada" en vez de inventar una — mismo principio
que el resto del módulo forestal (`ausente ≠ vacío`, ver
[[guia-serfor-hoja-casilleros]]).

### 4. El anexo impreso separa emitidas de anuladas

`tablaGuiasHtml()` arma dos tablas (Anexo 1 · emitidas, Anexo 2 · anuladas con
su motivo) e inyecta el HTML dentro de `buildTramiteHtml()` — el mismo
documento que ya arma `tramites-print.ts`, sin motor nuevo. La previsualización
en vivo (`TramitePreview`, iframe) lo hereda gratis: ya recibe `datos` completo
y llama a la misma función.

## Consecuencias

**A favor**

- Cero tablas/migraciones nuevas: reusa el KV del expediente y el endpoint de
  guías emitidas que ya existían.
- Una guía traída del libro es trazable (`origen:"libro"`) — el operador sabe
  qué está verificado contra el Libro CTP y qué tipeó a mano.
- El mismo `FormatoTramite.tablaGuias` sirve para el próximo trámite tabular
  que haga falta (p. ej. una relación de Anexos N° 04): no hay que repetir la
  arquitectura, sólo declarar el flag y el editor.

**En contra / riesgos**

- La lista de trozas por guía es manual salvo que el CTP la tenga cargada en
  otro lado y la copie: no hay reconstrucción automática pieza por pieza desde
  el despacho (ese dato vive a nivel de corrida/paquete, no 1:1 con la GTF de
  salida en todos los casos).
- `guiasJson` es JSON dentro de un campo de texto: no se puede buscar por N° de
  guía dentro del KV sin traer el trámite completo. Aceptable al volumen actual
  (docenas de guías por trámite); si hace falta buscar cross-trámite, se
  promueve como el resto del módulo (ver ADR-308 §4).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Reconstruir trozas automáticamente desde el despacho | El despacho no siempre guarda pieza por pieza (paquetes agregados); inventar el detalle sería declarar un dato que no está |
| Tabla Prisma `ForestGuiaRelacion` | Migración no verificable en el turno; el volumen (decenas por trámite) no lo necesita — mismo criterio que ADR-308 §4 |
| Módulo aparte fuera de Trámites y Oficios | El documento SIGUE siendo "lo que el titular le pide a la autoridad" (ADR-308): vive donde ya viven sus siete hermanos |

## Addendum (misma fecha) — Drive, Libro TH, vista en grande, Directorio

Cuatro ampliaciones, todas sobre infraestructura que ya existía:

- **PDF al Drive**: `tramites-documento-pdf.ts` (fotografía `document.body`,
  corte por alto fijo — no necesita la precisión de `.doc-hoja`/`paginar()` de
  `ctp-documento-pdf.ts`, que existe para casilleros que no se pueden partir) +
  `TramiteArchivadorOffscreen.tsx` (mismo patrón `sandbox="allow-same-origin"`
  offscreen que `CtpArchivadorAuto`, un documento a demanda). Carpeta propia
  "Trámites y Oficios (CTP)".
- **Traer del Libro TH**: `ForestGtfDB`/`ForestGtf` (modelo propio de GTF de
  trozas del monte, no derivado) trae lista de trozas REAL por pieza
  (`items[].code/diamMayorM/diamMenorM/lengthM`) — mejor que la del CTP, que
  queda manual. `FilaGuiaInforme.origen` pasa de `"libro"|"manual"` a
  `"ctp"|"loth"|"manual"`.
- **Vista en pestaña / en grande**: reusa `imprimirTramite()` sin el gate de
  completitud (previsualizar un borrador) + `TramiteDocumentoModal.tsx` nuevo
  (mismo `buildTramiteHtml`, `AdminModal` variant `"info"`).
- **Directorio de comunidades**: ya existía (`ForestParty`, ADR-317) con razón
  social, RUC, representante y documentos adjuntos. `TramiteEntidadPicker.tsx`
  sólo lo CONSULTA (rol `proveedor`) — no se creó ningún módulo nuevo.

Detalle completo (incluidos los gotchas de implementación) en memoria
`tramites-relacion-guias-serfor-adr364.md`, sección "Ronda 2".

## Addendum (2026-08-20) — Ronda 7: editar en el mismo documento

Brandon: "quiero que el encabezado... se pueda editar, y otros datos...
funciones que permita editar en el mismo documento (ojo sólo los datos a
rellenar)". Dos cambios, ninguno toca el contrato de datos (siguen siendo los
mismos campos de `datos`, cero migraciones):

- **Rediseño de la hoja**: `.dest` y `.meta` pasan de líneas sueltas a fichas
  con fondo (mismo lenguaje que `.id` en los otros reportes CTP), más un pie
  discreto (`Generado el… · sistema Buleje CTP`). Sólo en `TRAMITE_CSS`
  (`tramites-print.ts`) — no se tocó `CTP_REPORT_BASE_CSS`, compartida con
  Cumplimiento/Existencias.
- **Campos tocables en el papel**: `buildTramiteHtml` gana `editable?: boolean`
  (default `false` → idéntico byte a byte a antes; lo verifican los tests
  existentes sin cambios). Envuelve en `<span data-campo contenteditable>` sólo
  lo rellenable — membrete (razón social, el mismo dato que Brandon señaló
  como "dice Maderera San Martín pero es otra empresa" en la ronda 6),
  destinatario, asunto/referencia/expediente, y firma. El cuerpo redactado y
  la base legal NUNCA se editan ahí: son texto fijo de la solicitud, no un
  dato del operador. `imprimirTramite`/PDF al Drive siguen sin pasar
  `editable` → el papel final nunca lleva marca de edición.
- **Cableado**: `hooks/use-tramite-documento-editor.ts`, usado por
  `TramitePreview` y `TramiteDocumentoModal` (ambos ganan un `onCampoChange?`
  opcional — sin él, quedan de sólo lectura como antes). Ata `input` a cada
  `[data-campo]` (escribe a `datos` vía `set()`, el mismo callback del
  formulario) y DIFIERE el reload del `<iframe srcDoc>` mientras hay foco
  adentro (si no, cada tecla recargaría el documento y le patearía el cursor
  al usuario) — se aplica recién al `blur`. El membrete grande y la línea bajo
  la firma comparten `data-campo="membreteEmpresa"`: tocar cualquiera
  actualiza el mismo dato, así el papel nunca se contradice a sí mismo (el
  riesgo que ya señalaba el comentario de la ronda 6).
- Requiere `sandbox="allow-same-origin"` en el iframe de `TramitePreview`
  (antes `""`) — mismo permiso que ya usaba `TramiteDocumentoModal` para medir
  el alto natural del papel; el documento sigue sin `<script>` propio (todo
  pasa por `esc()`), sólo el padre lee/escribe su `contentDocument`.

Verificado en el navegador contra el tenant forestal real (Inversiones
Agroforestales BLAS, razón social "Maderera San Martín S.A.C."): tocar el
nombre del membrete en el papel actualiza en vivo el campo del formulario de
al lado, y al salir del campo ambos lugares del papel (encabezado y firma)
quedan sincronizados.

## Addendum (2026-08-20) — Ronda 8: RUC/código/registro editables + Anexo 2 en rojo

Tres pedidos más de la misma ronda; sólo dos se implementaron:

- **RUC / Código de CTP / Registro ARFFS / Dirección del membrete, editables
  en el papel**: mismo mecanismo que `membreteEmpresa` — `datos.membreteRuc/
  CodigoCtp/RegistroArffs/Direccion` ganan si el operador los corrige PARA ESE
  documento, la Ficha CTP sigue siendo el default. Deliberadamente NO se
  agregaron como `CampoTramite` del catálogo (no aparecen como input siempre
  visible en el formulario de los nueve formatos): son identidad legal que
  casi nunca cambia por documento, y ya se editan en el papel mismo — sumar
  cuatro inputs más al formulario sería ruido por un dato que se toca una vez
  cada mil. La ubicación (distrito/provincia/región) se dejó SIN editar: es
  un compuesto de tres campos de la Ficha, no un dato suelto.
- **Anexo 2 (anuladas) con tinte rojo**: `tablaGuiasHtml()` envuelve la
  sección en `.anexo-anuladas` — mismo semántico "anulada/error" que el resto
  del módulo, para que un fiscalizador no lea esa tabla como válida al mismo
  golpe de vista que el Anexo 1. Las filas anuladas y emitidas YA vivían en
  tablas separadas (nunca mezcladas) — este cambio es visual, no reordena datos.
- **NO se extendió a Cumplimiento/Existencias** (`ctp-cumplimiento-print.ts`,
  `ctp-existencias-print.ts`): se revisó el código antes de tocarlo y son
  reportes 100% derivados (score de cumplimiento, niveles de stock — los
  mismos números que el panel y el Excel) sin un solo campo "a rellenar", y
  sin preview en pantalla (`printCumplimiento`/`printExistencias` abren
  directo una ventana de impresión, no hay panel lado a lado como
  `TramitePreview`). Dejar editable un score de cumplimiento o un stock
  calculado violaría el principio anti-fraude del módulo (invariantes I1-I5,
  `≤` nunca `==`) — sería literal-mente un botón para falsificar el
  documento que se le muestra al fiscalizador. Si en el futuro esos reportes
  necesitan un dato de puño y letra del operador (una nota, un motivo), ahí sí
  aplicaría el mismo `data-campo`+diferir-reload — pero hoy no tienen ninguno.

## Referencias

- ADR-308 (módulo Trámites y Oficios) · ADR-321 (`guias-emitidas.ts`) · ADR-317 (Directorio forestal)
- `lib/forestal/tramites-relacion-guias.ts` · `components/admin/forestal/TramiteRelacionGuias.tsx`
- `lib/db/forest-gtf.db.ts` (GTF del Libro TH) · `lib/forestal/directorio.ts` (Directorio)
- Skill `serfor-osinfor-compliance`
