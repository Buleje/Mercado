# ADR-503 — Permiso por archivo al importar el libro

- **Estado:** aceptado (2026-10-19). Sin cambio de schema.
- **Pedido por:** Brandon (19-10): en «Importar el libro» del Libro CTP, cada archivo lleva un permiso —elegido del catálogo o creado ahí mismo con titular y RUC— que se aplica a todo lo de ese archivo; varios archivos por sección, cada uno con el suyo.

## Contexto

El formato del SNIFFS identifica la madera por el N° de guía y, a veces, por un «Código de origen»; no trae al titular. Medido en Blas (`cmpxiv6p4000bohvzwl6bnfpv`, 19-10): **7 de 7 guías** y **5 de 5 corridas** importadas no tienen permiso, y **los 6 permisos** del catálogo no tienen RUC del titular. Sin permiso, «Solo este permiso» (ADR-421/431), la relación de guías y los formatos por título quedan vacíos, y el proveedor de la Sección 1 queda como el relleno «Origen X · GTF». Además, el `providerDocument` de una ficha SERFOR es el RUC de la **instancia** (ATFFS), no el del titular: copiarlo como proveedor sería falso.

## Decisión

1. El cuerpo de `POST /api/admin/forestal/wood-entries/import` acepta `asignacion: { contratoId }` (contrato en `lib/forestal/asignar-permiso-import.ts`). Se elige **por archivo**: el modal manda un POST por archivo con su permiso.
2. **Sólo admin/dueño** pueden asignar (`soloAdminODueno`; `requireAdmin` deja pasar al encargado). Sin `asignacion`, el almacenero importa como siempre. Un permiso inexistente, de otro negocio o dado de baja → **422** (`ForestContratoDB.get` filtra por `tenantId` y `deletedAt`).
3. **Sólo se llena lo vacío** (`decidirPermisoFila`, puro y probado):
   - fila sin código → `asignado`: `originCode`, `originSourceNumber` (si la fila no trae) y `contratoId`;
   - mismo código normalizado (`normalizarCodigoContrato`) → `ya-tenia`: queda su texto y se vincula;
   - otro código → `conflicto`: queda el suyo, se importa igual y la respuesta lo dice;
   - sin código pero con **otra resolución** (comparada sin puntos ni espacios, `mismaResolucion`) → `conflicto` con `delArchivo` = la resolución de la fila y `motivo` «la fila trae otra resolución». La misma resolución escrita distinto, o el código del permiso puesto en esa columna, cuentan como el mismo permiso;
   - corrida con consumo de guías o trozas → `hereda` (ADR-402: el origen sale de lo consumido).
4. Aplica a ingresos (Sección 1 y rolliza en patio) y a corridas **sin consumo** (Sección 3 y aserrada en depósito). La guía que **ya estaba** en la base se completa con `TituloGuiaDB.declarar` (mismo camino que «Declarar permiso de la guía»: mes cerrado y anulados mandan, `UPDATE` condicionado, auditoría por ingreso), una vez por guía.
5. El proveedor de **relleno** de la Sección 1 se reemplaza por el titular del permiso con **su** RUC (11 dígitos, tipo RUC); un nombre real y la marca del inventario de patio quedan como vienen. Vale igual para la guía que ya estaba (`TituloGuiaDB.completarProveedorDeRelleno`, `updateMany` condicionado a lo leído, asiento `ctp_ingreso_titular_del_permiso`), sólo en los ingresos que quedaron con ESTE permiso.
   - **La fuente del relleno no se pierde** (reviewer 19-10): en «Origen X · GTF» la X era el único lugar de la N° de fuente de origen. Antes de reemplazarlo, X va a `originSourceNumber` si está vacío; si no, a `notes` («Fuente de origen: X»); si ya está en alguno de los dos, no se repite (`rescatarFuenteDelRelleno`). El rescate corre **después** de decidir el permiso y no lo decide: X puede ser la resolución o el código de origen, y sólo la columna de resolución dice cuál es.
6. La respuesta lleva `resumen.permiso` (conteos por estado) y `detalle[].permiso`; el preview da los mismos conteos sin escribir. Cada archivo con permiso deja un asiento `ctp_import_permiso` sobre el `ForestContrato`.
7. El permiso nuevo se crea **antes**, con `POST /api/admin/forestal/contratos` (titular y RUC incluidos); el import sólo recibe su id.
8. **Las filas de ingreso se agrupan por guía + especie + producto antes del alta** (bug de `01b26cec7`: la Sección 1 trae una fila por PIEZA y la 2.ª fila de una guía recién creada caía en «idéntico», perdiendo su troza y sus m³). Los m³ se suman en diezmilésimas enteras (`Decimal(12,4)`, sin float acumulado); las trozas se juntan por «Código de CTP» sin repetir (la fila cuyas piezas ya estaban es «duplicada en el archivo» y no suma). La 2.ª especie de una guía es otro ingreso (ADR-312/435): la base se compara por guía y especie (`WoodEntriesDB.comparablesPorGuia`), y si el archivo no trae ninguna especie de las que ya están, la fila «difiere» con aviso en vez de duplicar la guía. Las demás filas del grupo dicen «Va en el mismo ingreso que la fila N» y el resumen trae `agrupadas`.
9. En la producción, un código de troza que no está en el patio se dice en la fila («AVISO: N troza(s) no se encontró…»), ya no se salta en silencio.
10. `declarar` recibe el plan ya leído (antes ~8 idas por guía); los asientos `ctp_import` y `ctp_import_permiso` se escriben en un `finally`, con lo que sí se hizo aunque el bucle se corte a la mitad. La vista previa dice lo mismo que hará el commit (proveedor y dónde quedará la fuente) sin escribir.

## Alternativas descartadas

- **Pisar todo con el permiso del archivo:** fabrica origen. Una fila que el libro oficial declara con otro permiso quedaría atribuida al elegido; es exactamente el fraude que la trazabilidad previene.
- **Crear el permiso dentro del import:** dos responsabilidades en una ruta que ya es larga, un alta que el almacenero podría disparar sin pasar por el catálogo, y un permiso a medio crear si el import falla.
- **Columna nueva en la troza:** la troza ya hereda el `originCode` de su ingreso; una segunda fuente del permiso por pieza podría contradecir a la guía y exigiría migrar la tabla compartida con producción.

## Consecuencias

- Reimportar el mismo archivo no duplica: las guías existentes pasan por `declarar`, que no reescribe lo que ya tiene.
- Las corridas que ya estaban en la base sin permiso no se completan con este import (es insert-only para la producción): quedan como estaban.
- Una guía con mes cerrado o anulada queda en `conflicto` con `motivo`: el permiso no se aplicó y alguien tiene que mirarla.
