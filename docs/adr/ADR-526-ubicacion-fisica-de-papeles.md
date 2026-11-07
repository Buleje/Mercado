# ADR-526 — Dónde está el original: archivador y separador del papel físico

- **Estado:** aceptado (2026-10-31). Schema: `prisma/migrations/20261031a_ubicacion_fisica_adr526` (aditivo: 1 columna nullable en `DocumentFolder` y 1 en `Document`).
- **Pedido por:** Brandon (31-10), «Dónde está el original». Cada carpeta del Archivo anota en qué archivador y separador están sus papeles físicos. Al marcar un papel registrado, lo hereda. Al buscar, el panel dice dónde está.
- **Relacionados:** ADR-516 (código único del papel y «Ya lo anoté»: el momento en que se hereda), ADR-525 (formato y validación «vacío → null» en un solo lugar).

## Contexto
ADR-516 dio a cada papel su código (`DOC-000123`) y la marca de que ya se escribió en la hoja física. Faltaba lo que se pregunta después: **¿en qué archivador lo guardé?** Hoy eso está en la memoria de quien lo guardó. Los papeles de una misma carpeta casi siempre van al mismo archivador, así que anotarlo papel por papel es trabajo repetido. Basta anotarlo una vez en la carpeta.

## Decisión
1. **Dos columnas `TEXT` nullable**, sin default ni índice: `DocumentFolder.ubicacionFisica` y `Document.ubicacionFisica`. Una frase libre («Archivador Guías 2026 · separador octubre»), no un catálogo de archivadores: Brandon nombra sus archivadores como quiere y un catálogo pediría otra pantalla.
2. **Validación en un solo lugar** (`lib/documentos/ubicacion-fisica.ts`, `ubicacionFisicaSchema`). Lo usan el PATCH de la carpeta y el del papel:
   - recorta los bordes;
   - `""`, solo espacios o `null` la borran (`null`);
   - acepta hasta 120 caracteres; 121 responde 400, no se recorta a escondidas;
   - si la clave no viene, no se toca nada.
3. **Se hereda al marcar registrado.** Es el mismo `UPDATE … RETURNING` de `marcarCodigoFisico`:
   - toma la del papel si tiene una no vacía;
   - si no, la de **su** carpeta, buscada con `f."id" = d."folderId" AND f."tenantId" = d."tenantId"`: una carpeta de otro negocio nunca se cuela;
   - la respuesta de `PATCH /codigo-fisico` agrega `ubicaciones: { [id]: texto | null }`, y con eso el aviso dice «· guárdalo en …».
4. **Deshacer suelta la heredada.** Si la del papel es igual a la de su carpeta, al deshacer «Ya lo anoté» vuelve a `null`; una que se escribió a mano en el papel se queda. Sin esto, un clic por error dejaba el papel con un archivador que nadie eligió.
5. **No mueve `updatedAt`.** La PC usa `updatedAt` como versión del papel en drive-sync. Anotar un archivador no cambia el archivo, así que va por SQL con parámetros (`ponerUbicacionFisica`, el mismo camino de `codigoFisicoAt`). El PATCH del papel con solo la ubicación no hace otra escritura: relee el papel y lo devuelve.
6. **Historial:** el cambio de ubicación de un papel se anota con la acción `tag`, con `metadata.ubicacionFisica = { de, a }`. No se agregó una acción nueva a `DocAction`.
7. **Búsqueda.** El texto se busca también en la ubicación: en el `ILIKE` de Prisma (`enTodoElDoc`) y en la búsqueda sin tildes (`buscarIdsSinTildes`). En la lista, «¿Por qué apareció?» dice «Guardado en: …» (campo `guardado` de `relevancia.ts`, peso 7, entre la descripción propia y la del lector).
8. **Pantallas.**
   - Ventana de la carpeta: el menú pasa de «Cambiar ícono» a «Ícono y archivador» y la ventana trae el campo «¿Dónde guardas estos papeles?» con ⓘ. En lote no aparece, porque no hay un valor común.
   - Control del código: «Guardado en: …» con editar en el lugar.
   - Vista lateral: «Original: …», con «· el de su carpeta» si es heredada.

## Alternativas descartadas
- **Heredar al leer (sin copiar):** cambiar el archivador de la carpeta movería en pantalla papeles que ya están guardados en el archivador viejo. Copiar al marcar fija dónde quedó ese papel ese día.
- **Copiar a todos los papeles de la carpeta al guardarla:** pisaría lo que cada papel ya tiene y anotaría papeles que todavía no se guardaron.
- **Tabla `Archivador` con separadores:** más pantallas y más pasos para lo que hoy es una frase. Si un día hace falta, las frases sirven de semilla.
- **Recortar a 120 en silencio:** se perdería el final sin aviso. Mejor 400, y el campo ya tiene `maxLength`.

## Consecuencias
- **Sin caché de servidor que invalidar.** `DocumentsDB` no usa `getOrSet`/`cacheTag` en carpetas ni papeles. El panel refresca su lista con el resultado del PATCH.
- **Dev server tras `prisma generate`:** el PATCH de la carpeta escribe con Prisma (`data: patch`). Un servidor que no se reinició conserva el cliente viejo y responde 500 «Unknown argument `ubicacionFisica`». Las escrituras del papel van por SQL y no tienen este problema.
- **Prisma viejo en producción:** son columnas nuevas nullable, así que el cliente viejo las ignora. No hay enum ni NOT NULL que lo rompa.
- **Revertir:** `ALTER TABLE "Document" DROP COLUMN "ubicacionFisica"; ALTER TABLE "DocumentFolder" DROP COLUMN "ubicacionFisica";` y quitar los dos campos del schema. Solo se pierden las frases anotadas.
