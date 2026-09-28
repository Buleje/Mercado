# ADR-438 — Documentos de la guía: un casillero por papel, dentro del Drive

- **Fecha:** 2026-09-26
- **Estado:** aceptado (implementado) · guard y carpeta ampliados por ADR-442 (guías guardadas antes del ingreso; carpeta titular › permiso › GTF)
- **Pedido por:** Brandon (26-09): «por cada guía de ingreso, un apartado para agregar documentos (fotos, PDF, etc.) con un casillero para cada uno: factura, guía de remisión del remitente, guía del transportista, lista de trozas, GTF y otros».
- **Depende de:** ADR-306/307 (Drive, carpetas en árbol, contratos archivados) · ADR-434 (fotos privadas de la carga, firma HMAC) · «Documento de la guía» / «Guardar en el expediente» (`CtpDocumentoVisor`, `use-documento-acciones`).

## Contexto (medido 2026-09-26, sólo lectura)

- Ya había **tres** lugares con archivos: el Drive (`Document`, bucket privado `documents`, URLs firmadas, miniaturas, lectura con IA, papelera, auditoría `DocumentAuditLog`, permisos por rol), las fotos de la carga (bucket `forestal-privado`, sólo `image/webp`, firma HMAC con propósito, guardadas en `WoodEntry.photos`) y el visor del «Documento de la guía», que archiva el PDF generado al Drive con etiquetas `["forestal", "GTF" | "lista de trozas", <N°>, proveedor, especie]` en `Guías forestales (GTF)/<año>/<mes>`.
- Lo archivado por ese camino: **main 3 GTF + 1 lista, Blas 1 GTF + 2 listas**. Guías vivas: main 84, Blas 12.
- Ningún lugar guardaba la factura, las guías de remisión ni la del transportista de una guía.

## Decisión

1. **Los archivos son documentos del Drive.** No hay tabla ni bucket nuevo. Un documento es de una guía y de un casillero por dos etiquetas de máquina que pone el servidor: `gtf:<N° del libro>` y `casillero:<clave>` (`factura`, `guia_remitente`, `guia_transportista`, `lista_trozas`, `gtf`, `otros`). Se suman etiquetas humanas (`forestal`, `documento de guía`, el nombre del casillero, el N°) para buscarlo en el Drive.
2. **Sin schema.** La tabla puente repetía lo que el Drive ya da (quién/cuándo, papelera, auditoría, permisos, miniatura). El costo aceptado: la etiqueta se puede editar desde el Drive; al revés, eso también permite meter en un casillero un papel que ya estaba en el Drive.
3. **Legado reconocido:** un documento con `forestal` + `GTF`/`lista de trozas` + el N° exacto (sin `salida` ni `legajo`) cae en el casillero GTF / lista de trozas. `metaArchivado` agrega desde ahora las etiquetas de máquina, así «Guardar en el expediente» llena el casillero directo.
4. **Rutas** (`app/api/admin/forestal/guias/documentos/**`): `GET ?gtf=` (casilleros), `GET ?gtfs=` (llenos por guía, para la fila), `POST` multipart (subir / `reemplaza`), `DELETE` (baja lógica = papelera del Drive, con auditoría `delete` y motivo), `GET ver` (302 a URL firmada de 10 min, auditoría `view` deduplicada por hora). Guard: `requireAdmin(admin, almacenero, owner)` → CSRF en escrituras → rate limit `DRIVE`/`DRIVE_READ` → `spec:forestal:ctp-libro` → la guía existe en el tenant de la sesión (si no, 404).
5. **Tipo real, no el declarado:** PDF por la firma `%PDF-` en el primer KB; imagen por lo que lee `sharp` (jpeg/png/webp/heif/tiff), enderezada por EXIF y pasada a WebP ≤ 2400 px (se van los metadatos con GPS). 4 MB por pedido (tope de Vercel); el cliente achica la foto antes (`comprimirImagen`). Hasta 12 archivos por casillero.
6. **UI:** «Documentos (N de 6)» en el menú de la guía (`ctp-guia-acciones.ts`), chip «N/6 docs» en la fila y en la tarjeta del celular (contexto `ctp-documentos-guia-contexto.tsx`, un solo pedido por página), modal `CtpDocumentosGuiaModal` con un casillero por papel: Foto (cámara trasera), Archivo (PDF/imagen, varios), ver, reemplazar, quitar. El casillero GTF vacío ofrece «La del sistema», que abre el «Documento de la guía».

## Consecuencias

- Lo subido aparece en el Drive (buscable, con lectura IA en segundo plano) y en el expediente del mes sin pasos extra.
- Quitar no borra: va a la papelera del Drive (retención de la papelera) y queda quién y por qué en la auditoría del documento.
- Si alguien borra la etiqueta `casillero:` desde el Drive, el documento cae en «otros»; si borra `gtf:`, sale de la guía (sigue en el Drive).

## Alternativas descartadas

- **Tabla `CtpGuiaDocumento`** (gtf, casillero, documentId): más rígida frente a la edición de etiquetas, pero duplicaba auditoría/papelera y exigía migración + reinicio del dev server.
- **Bucket `forestal-privado`** de las fotos de la carga: sólo acepta WebP y no tiene papelera, búsqueda ni lectura; habría sido un tercer sistema de archivos.

## Referencias

`lib/forestal/documentos-guia.ts` (lógica pura + test `__tests__/forestal-documentos-guia.test.ts`) · `lib/forestal/documentos-guia-server.ts` · `lib/db/ctp-guia-documentos.db.ts` · `hooks/use-documentos-guia.ts` · `components/admin/forestal/CtpDocumentosGuia{Modal,Casillero}.tsx`.
