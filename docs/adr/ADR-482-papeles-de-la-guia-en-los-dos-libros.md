# ADR-482 — Los papeles de la guía en los dos libros y en los formatos

- **Fecha:** 2026-10-08
- **Estado:** aceptado (implementado)
- **Pedido por:** Brandon (08-10): «en la sección de guías ingresadas y GTF en títulos habilitantes quiero que se ponga en general en documentos del permiso, en el modal de documentos del permiso, la opción de poner ahí todos los documentos de la guía, sea factura, guía de remisión, GTF y lista de trozas originales firmado y demás; aplícalo a guías ingresadas, en formato de guías».
- **Depende de:** ADR-438 (casilleros de la guía como documentos del Drive) · ADR-442 (carpeta titular › permiso › GTF) · ADR-467 (Documentos del plan, envío por WhatsApp).

## Contexto (medido 2026-10-08, sólo lectura)

- Los casilleros de ADR-438 existían sólo para guías de **ingreso** del CTP y guías guardadas: la puerta `datosDeGuia` no reconocía la GTF del Libro TH (`ForestGtf`) ni la de despacho del CTP → 404. La ruta pedía `spec:forestal:ctp-libro`.
- «Documentos del permiso» (LO-TH › GTF) sólo mostraba carpetas del plan y se apagaba sin `planId`.
- La barra de guías elegidas para un trámite no decía qué guía tenía sus papeles.
- «Completa» = 6/6 obligaba a llenar «otros» y la guía del transportista, que no siempre existe.
- Blas: 7 guías de ingreso, 1 GTF del Libro TH emitida, 0 despachos con GTF, **0 documentos con etiqueta `gtf:`**, 5 documentos legados en «Guías forestales (GTF)».

## Decisión

1. **Mismo N° = mismos papeles.** No hay tabla nueva: siguen siendo documentos del Drive con `gtf:<N°>` + `casillero:<clave>`. La GTF del bosque y su ingreso en el CTP comparten el N°, así que lo subido en un libro se ve en el otro.
2. `CtpGuiaDocumentosDB.datosDeGuia` reconoce además la GTF del Libro TH (viva, no anulada) y la GTF de despacho del CTP. Carpeta: guía guardada > GTF del Libro TH > ingreso > despacho (`Despachos del CTP`), para que el bosque y la planta no abran carpetas hermanas.
3. La puerta acepta `spec:forestal:ctp-libro` **o** `spec:forestal:loth-libro` (rutas `guias/documentos` y `guias/documentos/ver`). Roles, CSRF, rate limit y auditoría: sin cambio. **Revisión de seguridad 08-10:** cada papel nace con `allowedRoles = ROLES_PAPELES_GUIA` (admin, almacenero, owner; la misma constante que la ruta), porque «Guías forestales (GTF)» tiene roles vacíos y el cajero veía las facturas en el Drive general. Los ya subidos: `node scripts/restringir-papeles-guia.mjs --aplicar --tenant <id>` (idempotente). Una GTF anulada no muestra pastilla ni recibe papeles; su «Documentos del permiso» deja sólo las carpetas del plan.
4. **Papeles de ley** = factura, guía de remisión del remitente, GTF, lista de trozas (`PAPELES_DE_LEY`). Transportista y «otros» suman, no faltan. `GET ?gtfs=` agrega `faltan` por guía (aditivo).
5. **UI:** pastilla «Papeles 3/4» (verde completa, azul a medias, gris vacía; el título dice qué falta) en la fila de la GTF del Libro TH y en la fila/tarjeta del ingreso del CTP. «Documentos del permiso» suma «Papeles de esta guía» (los mismos casilleros) y lista esos papeles junto a las carpetas del plan para descargar, imprimir o mandar por WhatsApp (enlaces de 7 días, todo o nada). Sin plan, el modal se abre con sólo los papeles. La barra de formatos (Libro TH › GTF y CTP › Guías emitidas) muestra «Papeles completos x de y» y el botón «Papeles» abre cada guía elegida con sus casilleros.

## Consecuencias

- Los papeles de una guía del bosque llegan al CTP sin volver a subirlos.
- Si el N° se escribe distinto en los dos libros, son dos guías para los papeles (no se normaliza el N°: la etiqueta es exacta, como en ADR-438).
- Las guías guardadas siguen con su chip «N/6 docs» (su conteo sale de su propia lectura).

## Referencias

`lib/forestal/documentos-guia.ts` (`PAPELES_DE_LEY`, `faltantesPorGuia`, `labelEnFrase` + test) · `lib/db/ctp-guia-documentos.db.ts` · `app/api/admin/forestal/guias/documentos/{route,ver/route}.ts` · `hooks/use-documentos-guia.ts` · `components/admin/forestal/{GtfDocumentosModal,GtfPapelesDeLaGuia,GtfDocumentosCarpeta,ChipPapelesGtf,GuiasPapelesModal,papeles-guias-contexto,ctp-documentos-guia-contexto}.tsx`.
