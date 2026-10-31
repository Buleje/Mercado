# ADR-495 — El talonario se acomoda sobre la plantilla medida del papel, y las pantallas de la GTF tienen la cara del talonario

- **Estado:** aceptado (2026-10-16).
- **Pedido por:** Brandon (16-10), con fotos de su talonario: GTF 19-000003 y lista de trozas 19-000006 de la CN Séptimo Unidos de Santa Fe de Aguachini (Imprenta Nueva Imagen, La Merced).
- **Extiende:** ADR-494 (formato GTF 2024) y la memoria `gtf-talonario-matricial-2026-10-15`.
- **Schema:** ninguno. **Datos:** ninguno (la disposición del talonario vive en `PlatformSettings` `gtf-talonario:<tenantId>`; gana un campo opcional `plantilla`).

## Contexto

La posición de fábrica de cada valor del talonario («Imprimir en talonario») salía de una grilla de 4 columnas (x 12 · 58 · 104 · 150) pensada a ojo. No coincidía con ningún papel: los valores caían sobre los rótulos, la tabla del (34) tenía 8 filas donde el papel tiene 7, la lista 20 donde el papel tiene 30, y los campos del formato 2024 (punto de partida, (22), tres casillas del (5)) nacían ocultos aunque el talonario de Brandon es 2024. Además, varios valores no entraban en su caja y se marcaban con un contorno amarillo que nadie explicaba.

## Decisión

1. **Plantilla medida** (`lib/forestal/gtf-talonario-plantilla.ts`). Las dos fotos se enderezaron con una homografía de las 4 esquinas del recuadro a una A4 con el recuadro en x 12,5–197,5 · y 6–289,5 mm (las dos hojas son de la misma imprenta y comparten recuadro). Cada rótulo, punteado, franja, casilla y raya de tabla quedó en mm. Calcada sobre la foto, coincide a menos de 1 mm. La lista se valida sola: 30 filas de 5,647 mm entre 47,4 y 216,8 mm.
2. **Una fuente para el dibujo y la posición**: `RANURAS` es el lugar de fábrica de cada valor (el renglón punteado que sigue a su rótulo, base a 0,5 mm del punteado) y el catálogo `CATALOGO` de `gtf-matricial-disposicion` se arma de ahí. `plantillaTalonario()` dibuja el formulario debajo de los valores en el diseñador, sólo en pantalla: el papel ya lo trae impreso.
3. **Disposiciones guardadas sobre otra plantilla**: `DisposicionHoja.plantilla`. Si no es `PLANTILLA_FABRICA`, se conservan la medida, el corrimiento y el separador de fecha, y los campos y la tabla vuelven a su renglón. La grilla vieja no correspondía a ningún papel y nadie había calibrado sobre una matricial real (memoria del 15-10: «sin probar»).
4. **Lo que la imprenta imprime arranca oculto**: N° prenumerado (rojo), encabezado del titular de la lista, N° de fila de la lista. La columna «Producto» y la fecha de la lista también (el papel no las tiene). Los campos 2024 arrancan visibles.
5. **Cara de papel en pantalla**: tokens `--gtf-tinta / -linea / -franja / -folio / -papel` (claro y oscuro) y piezas `components/admin/forestal/gtf-papel.tsx`. Las usan la hoja del talonario, «Datos de la GTF» y el formulario «Datos de la guía» del Libro TH. Sus tablas replican el papel y por eso no usan `DataTable` (excepción consciente a ADR-489, sólo para estas réplicas).

## Consecuencias

- Un talonario de otra imprenta puede no coincidir: se corrige con la calibración del perfil (corrimiento y escala) y arrastrando, como antes.
- La A4 es supuesta: si el talonario mide distinto, se cambia en «Medida».
- Resuelto el 16-10 (Brandon eligió las tres partes):
  - **30 trozas por lista** (`FILAS_POR_LISTA = 30`), como su talonario: 49 trozas = 2 listas (30 + 19). La lista A4 del sistema entra en UNA hoja con 30 filas (medido con Chromium `page.pdf`, Arial y DejaVu: 30 filas con 4 especies, sello de borrador, observaciones y firmas → 1 página; 31 → 2).
  - **Lo ya emitido no cambia**: la guía guarda `gtfDatos.guia.filasPorLista` al emitirse (la pone la ruta POST de `despacho-guia` y `datosInicialesLoth`). Sin esa marca es de antes y se reimprime de a 20 (`FILAS_POR_LISTA_ANTERIOR`, `filasPorHojaGuardada`): 34 trozas → «5, 6» = 20 + 14, como viajó. Contar los N° guardados del (33) no alcanza: de 31 a 40 trozas, de a 20 o de a 30 son 2 hojas igual. Las guías importadas de SERFOR no traen la marca y siguen de a 20.
  - **Metros y «m3»**: la lista impresa y la pantalla «Lista de trozas a movilizar» escriben d1, d2 y L en metros con 2 decimales (65 cm → 0.65); el formulario sigue pidiendo cm. La unidad del (34f) es «m3»; las guías guardadas con «Metros cúbicos» se normalizan en un solo lugar (`unidadDelPapel`, dentro de `filasDeLaGuia`). Las pantallas del CTP que no son el papel siguen diciendo «Metros cúbicos».
  - **(36) Anexos**: X en el Anexo 03 (madera en rollo) o 04 (transformados) cuando el (33) tiene N° de lista (`marcasAnexos`, claves `36a3`/`36a4`); ADR-494 actualizado.

## Alternativas descartadas

- **Pedir a cada titular una foto del talonario vacío como fondo** (ya existe «Foto de fondo»). Sirve para otra imprenta, pero no da posiciones de fábrica.
- **Hoja SERFOR A4 en celeste.** No se pidió. Sigue en negro.
