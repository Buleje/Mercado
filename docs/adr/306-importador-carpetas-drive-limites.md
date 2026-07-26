# ADR-306 — Importador de carpetas del drive: árbol en una llamada y límites que dejan usar el drive

**Estado:** Aceptado · **Fecha:** 2026-07-26
**Relacionados:** ADR-119 (drive de Documentos: vencimientos + búsqueda semántica)

## Contexto

El drive de Documentos (`tab=documentos`) sólo aceptaba archivos sueltos. Subir
un año de contratos ordenado en subcarpetas significaba crear cada carpeta a
mano y arrastrar tanda por tanda. Se agregó un **importador de carpetas**
(`ImportarCarpetaModal` + `lib/documentos/importar-arbol.ts`): se elige o se
suelta una carpeta, se ve el plan (cuántas carpetas, cuántos archivos, cuánto
pesa, qué se ignora) y recién ahí se sube.

Al probarlo de punta a punta contra el dev server aparecieron **tres frenos
reales**, ninguno visible en `tsc` ni en los tests unitarios:

1. **Una request por carpeta.** `POST /api/admin/documents/folders` con preset
   `MODERATE` = 20 requests cada 5 min. Una carpeta con 30 subcarpetas moría a
   la mitad y dejaba **medio árbol creado** — el peor estado posible: ni
   importado ni limpio.
2. **`documents:upload` con preset `STRICT`** = 10 requests cada 15 min, y cada
   archivo es un request. Un drive de documentos que acepta 10 archivos cada 15
   minutos no es un drive. Esto ya afectaba a la subida normal (el pool de 3 del
   hook), no sólo al importador: del archivo 11 en adelante quedaban en estado
   "error" con un `console.error` y nada más.
3. **Los listados** (`documents:list`, `folders:list`, `MODERATE`) se agotaban
   solos: el hook hace `fetchAll()` (2 requests) después de **cada** mutación,
   así que crear 6 carpetas ya gastaba 12 de los 20 permitidos.

Además, reimportar la misma carpeta **duplicaba todo** (carpetas y archivos),
cuando lo que espera cualquiera es fusionar.

## Decisión

**1 · El árbol viaja en una sola llamada.** Nuevo endpoint
`POST /api/admin/documents/folders/tree` con `{ parentId, rutas[] }` →
`{ idPorRuta, creadas }`, respaldado por `DocumentsDB.createFolderTree`. Crea
las carpetas faltantes en orden padre→hijo y **reusa** las que ya existen
(mismo nombre bajo el mismo padre, sin distinguir mayúsculas ni espacios). Es
idempotente: reimportar fusiona. Tope de 400 rutas y 6 niveles por request,
validado con Zod `safeParse`.

**2 · Preset `DRIVE` para la subida** (`400 req / 15 min` por IP+tenant) en
`documents:upload`. Quien llega ahí ya pasó `requireAdmin` + CSRF: el límite es
anti-abuso, no anti-uso. El peso lo sigue frenando `MAX_UPLOAD_SIZE` por archivo
y el MIME allowlist.

**3 · Listados a `GENEROUS`** (100/min): son lecturas autenticadas del panel y
se disparan por cada refresco.

**4 · El cliente no inventa el merge.** El modal calcula el reuso sólo para la
**vista previa** (`planReuso`, puro y testeado) contra una **foto** del drive
tomada al armar el plan; la autoridad sobre qué se crea y qué se reusa es del
servidor. La foto importa: si se recalculara en vivo, la propia importación iría
creando las carpetas y al terminar el resumen diría "0 nuevas · 6 ya existían",
contando su propio trabajo como preexistente.

**5 · Si el árbol falla, no se sube nada.** Antes, una carpeta que fallaba
mandaba sus archivos al destino raíz. Con 300 archivos eso es un desastre
imposible de ordenar después: ahora se aborta con el motivo a la vista.

**6 · Tampoco se re-suben los archivos que ya están.** `POST
/api/admin/documents/existing` devuelve, en una llamada, nombre y peso de lo
que ya vive en las carpetas del plan; los que coinciden (mismo nombre + mismo
peso) se marcan "ya estaban" y se omiten. Reimportar una carpeta a la que le
agregaste 3 archivos sube 3, no 300 otra vez. Es una lectura por POST porque la
lista de carpetas no entra en una query string.

## Consecuencias

**A favor**
- Importar una carpeta de 30 subcarpetas = **1 request** de carpetas (antes 30).
- Reimportar fusiona: la vista previa marca "ya existe" carpeta por carpeta y
  "ya estaban" archivo por archivo. Si no falta nada, el botón lo dice
  ("Ya está todo subido") en vez de duplicar el drive entero.
- El drive deja de perder archivos silenciosamente a partir del décimo.
- Los 429 se traducen a español ("el servidor pidió esperar…") en vez de
  `HTTP 429: {...}`.

**En contra / riesgos**
- Subir el techo de `documents:upload` amplía la superficie de abuso de un admin
  comprometido: 400 archivos × `MAX_UPLOAD_SIZE` cada 15 min. Se aceptó porque
  la alternativa era un drive inutilizable; el bucket sigue siendo por IP+tenant
  y el storage ya tiene tope por archivo.
- `createFolderTree` crea de a una fila (no `createMany`) para poder resolver el
  id del padre. Con el tope de 400 rutas es aceptable; si un día hace falta más,
  el paso siguiente es agrupar por nivel.
- El "ya está subido" se decide por **nombre + peso**, no por hash: un archivo
  editado que quedó exactamente del mismo tamaño no se vuelve a subir. Se
  prefirió eso a leer y hashear 300 archivos en el navegador; para versionar un
  documento ya existe el flujo de versiones del drive.
- `documents:delete` y `documents:folders:delete` siguen en `MODERATE`: borrar
  20 carpetas en 5 minutos no es un flujo real de usuario (sí lo es del script
  de QA, que por eso va pausado).

## Alternativas descartadas

- **Backoff en el cliente ante 429.** La ventana es de 5–15 min: reintentar es
  quedarse mirando una barra de progreso. No arregla la causa.
- **Subida multi-archivo en un request.** El límite de tamaño de body de la
  plataforma (~4.5 MB) hace que un solo PDF grande rompa la tanda entera.
- **Merge en el cliente** (crear una por una, saltando las existentes). Deja la
  decisión en el navegador, con carrera si dos pestañas importan a la vez, y no
  arregla el problema de las N requests.

## Referencias

- `app/api/admin/documents/folders/tree/route.ts` — endpoint
- `lib/db/documents.db.ts` → `createFolderTree`
- `lib/documentos/importar-arbol.ts` → `planificarImport`, `planReuso` (puros)
- `components/admin/documentos/ImportarCarpetaModal.tsx` — modal de 4 fases
- `scripts/visual-verify-importar-carpeta.mjs` — verificación end-to-end
- `__tests__/lib/documentos/importar-arbol.test.ts`
