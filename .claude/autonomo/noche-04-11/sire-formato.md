# Ficha técnica SIRE: RCE (compras) y RVIE (ventas)

Investigación del 04-11 (noche autónoma). Solo lectura del código; este es el único archivo escrito.
PDF bajados a `/tmp/claude-1000/-home-usuario-proyectos-Mercado/91389ce9-1231-4aac-aeba-6ca8c8f4a30b/scratchpad/sire/` (no se ejecutó nada de ahí).

## 0. En una frase

SUNAT define **un solo tipo de archivo**: texto plano con los campos separados por `|`, uno por línea, dentro de un `.zip`. El mismo molde sirve para (a) subir **nuestro** registro («reemplazar la propuesta») y (b) subir **nuestro** registro para que SUNAT lo **compare** y le saque un reporte de diferencias. Es como pasarle a SUNAT nuestro cuaderno con las mismas columnas que el suyo.

| Qué | RVIE (ventas) | RCE (compras) |
|---|---|---|
| Propuesta que BAJAMOS de SUNAT | Anexo 2, RS 112-2021 | Anexo 8, RS 040-2022 |
| Archivo que SUBIMOS (reemplazar o comparar) | **Anexo 3**, RS 112-2021 | **Anexo 11**, RS 040-2022 |
| Tablas (tipos, nombres de archivo, CAR) | Anexo 1: tablas 1, 3, 5, 6, 7 | Anexo 1: tablas 1, 2, 4, 7, 11, 12, 13 |
| Código de libro en el nombre | `140400` | `080400` |

### Qué tan firme es cada cosa (honestidad)

- **Oficial leído directo:** Anexos completos originales (RS 112-2021: `anexo-112-2021.pdf`, 63 pág.; RS 040-2022: `anexo-040-2022.pdf`, 57 pág.), anexos modificatorios RS 138-2023 (solo filas cambiadas, con «(…)» en el resto), manual API RVIE v30 (junio 2026, 110 pág.), páginas `cpe.sunat.gob.pe/node/159`, `/node/160`, `/estructura-de-archivos`.
- **Lo que NO se pudo confirmar:** si después de la RS 138-2023 hubo otra modificación de los anexos (2024-2026). El manual v30 sigue citando «RS 112-2021/SUNAT y modificatorias» sin listarlas. **Una propuesta real bajada de SOL resuelve esto en minutos** (ver sección 7).
- `cpe.sunat.gob.pe/node/158` y `/estructura-de-archivos` dan 403 a `curl` (Cloudflare). Se leyeron con el buscador Exa; los PDF sí bajan directo.
- Lo marcado **(secundaria)** viene de blogs, no de SUNAT.

### Fuentes (URL)

| Clave | URL |
|---|---|
| Anexos 1-7 originales RS 112-2021 (RVIE) | https://www.sunat.gob.pe/legislacion/superin/2021/anexo-112-2021.pdf |
| Anexos A-K originales RS 040-2022 (RCE) | https://www.sunat.gob.pe/legislacion/superin/2022/anexo-040-2022.pdf |
| Modificatoria RS 138-2023 (cambia anexos 2, 3, 4, 5, 8) | https://www.sunat.gob.pe/legislacion/superin/2023/anexoII-000138-2023.pdf (y `anexoIII`, `anexoVII`, `anexoI`) |
| Manual API RVIE v30 | https://cpe.sunat.gob.pe/sites/default/files/2026-06/Manual%20del%20servicio%20API%20del%20Registro%20de%20Ventas%20e%20Informaci%C3%B3n%20Electr%C3%B3nica.%20v30.pdf |
| Manual SIRE (pantallas) | https://cpe.sunat.gob.pe/sites/default/files/inline-files/MANUAL%20SIRE_0.pdf |
| Páginas RVIE / RCE / estructuras | https://cpe.sunat.gob.pe/node/159 · https://cpe.sunat.gob.pe/node/160 · https://cpe.sunat.gob.pe/estructura-de-archivos |
| Lectura de la propuesta (secundaria) | https://reycont.pe/blog/como-descargar-propuesta-sire |
| Nombre de archivo de reemplazo (secundaria) | https://facturalaya.com/blog/nombre-del-archivo-de-reemplazo-sire/ |

Nota: el manual API de **compras** (par del RVIE) no se bajó: la estructura de los campos no está en ningún manual API, está en los anexos de las resoluciones (el manual v30 la remite a «tabla 6 del Anexo 1 de la RS 112-2021»). El de compras tendrá los mismos códigos de proceso (Anexo I del v30 lista procesos RCE: 44, 46, 57, 80-84, 93-96).

---

## 1. Archivo: nombre, separador, extensión, compresión

### Reglas generales (iguales para RVIE y RCE)

| Regla | Valor | Fuente |
|---|---|---|
| Separador de campos | `|` (palote). Sin comillas. | Tabla 5 (RVIE) y Tabla 12 (RCE) de los Anexos 1: «Los campos deben estar separados por el carácter "|"» |
| Una línea | Un comprobante por línea | Secundaria (facturalaya); coherente con anexos |
| Texto libre | No puede contener `|`, `/` ni `\` | Tabla 5, regla 2 |
| Alfanumérico | Letras A-Z/a-z y los caracteres `( ) , .` | Tabla 5, regla 3 |
| Fecha | `DD/MM/AAAA` (10 caracteres) | Anexos 3 y 11, campo «Fecha de emisión» |
| Periodo | `AAAAMM` (6 dígitos, mes 01-12) | Anexos 3 y 11, campo 3 |
| Monto | Hasta 12 enteros y hasta 2 decimales, **sin comas de miles** | Anexos 3 y 11 |
| Monto negativo | Formato `"- #.##"` literal de la tabla. **No confirmado si lleva espacio tras el guion** (en SUNAT suele verse `-123.45`). Probar con una propuesta real. | Tabla 5 regla 1 / Tabla 12 regla 1 |
| Extensión y compresión | El `.txt` va **comprimido en `.zip`**. Error 1348 si la extensión no es `.zip`; error 1346 si pesa más de 6 GB; error 1350 si pesa 0 KB | Manual API v30, secciones 5.3-5.7; Manual SIRE líneas 2157, 2277 |
| Archivo vacío | Se puede subir en blanco si no hubo operaciones en el periodo | `cpe.sunat.gob.pe/node/159` y `/estructura-de-archivos` |
| Codificación (UTF-8, ANSI…) | **No confirmado en fuente oficial** (ningún anexo ni manual la nombra). Un blog (secundaria, ReyCont) abre la propuesta bajada como UTF-8. Recomendado: UTF-8 sin BOM y mantener textos sin tildes raras hasta probar con SUNAT. | — |
| Fin de línea, `|` final, fila de encabezado en lo que SUBIMOS | **No confirmado** | — |

### Nombre del archivo (Tabla 6 RVIE, Tabla 13 RCE)

Patrón: `LE` + `RUC` + `AAAA` + `MM` + `00` + `LLLLLL` + `CC` + `O` + `I` + `M` + `2` + `.txt`  (33 caracteres antes de la extensión)

| Posición | Nemotécnico | Significado |
|---|---|---|
| 01-02 | `LE` | Fijo |
| 03-13 | `RRRRRRRRRRR` | RUC del sujeto (11) |
| 14-17 | `AAAA` | Año |
| 18-19 | `MM` | Mes |
| 20-21 | `DD` | Siempre `00` para RVIE/RCE |
| 22-27 | `LLLLLL` | `140400` RVIE · `080400` RCE |
| 28-29 | `CC` | `01` acepta la propuesta · **`02` reemplaza la propuesta** · `03` ajustes posteriores · `04`/`05` ajustes de periodos anteriores (general/simplificado). RCE además: `00` no domiciliados informado |
| 30 | `O` | Indicador de operaciones: `0` cierre de operaciones (baja RUC) · **`1` empresa operativa** · `2` cierre del libro, no obligado |
| 31 | `I` | Contenido: **`1` con información** · `0` sin información |
| 32 | `M` | Moneda: **`1` soles** · `2` dólares |
| 33 | `G` | Generado por el nuevo sistema: **`2` fijo** |
| 34 | `N` | Solo ajustes posteriores (correlativo `NN`) |

Ejemplo armado por mí (RUC de ejemplo, periodo nov-2026, reemplazo, operativo, con información, soles):
`LE2012345678920261100140400021112.txt` (ventas) y `LE2012345678920261100080400021112.txt` (compras, mismo patrón con `080400`).
El `.zip` lleva el mismo nombre base (ejemplo del manual v30 5.3: `LE2010017645020230200140400020112.zip`, verificado decodificando su cabecera base64).
Error 1044 si algo del nombre no cumple («Error en la Posición - Descripción del nombre del archivo plano»). Error 1024 si el mismo archivo ya fue enviado.

---

## 2. RVIE (ventas): archivo que SUBIMOS (Anexo 3 de la RS 112-2021)

Fuente: `anexo-112-2021.pdf` págs. 32-39 (texto original) + RS 138-2023 anexo III (cambios). Largo y tipo vienen de las columnas «Longitud» y «Formato» del propio anexo.
**Cantidad de campos:** 33 obligatorios por línea (campos 1-33). Los campos 34-40 los completa SUNAT sola desde la propuesta («Los campos no informados por el contribuyente del 34 al 40 son completados automáticamente», nota 4). Los campos 41-57 son libres (`CLU`, hasta 200 caracteres, opcionales: «no incluya ni la información ni los palotes»).

| N.º | Nemotécnico (SUNAT) | Tipo | Largo | Obligatorio | Regla clave |
|---|---|---|---|---|---|
| 1 | RUC | Numérico | 11 | Sí | RUC del generador |
| 2 | ID (razón social del generador) | Alfanum. | hasta 1500 | Sí | Debe pertenecer al RUC del campo 1 |
| 3 | Periodo | Numérico | 6 | Sí | `AAAAMM`; periodo del RVIE a generar. Si tipo 14 (recibo servicios públicos): mes de vencimiento |
| 4 | CAR SUNAT | Alfanum. | 27 | **Vacío** | «Consignar vacío. Se completará automáticamente» |
| 5 | Fecha de emisión | Alfanum. | 10 | Sí | `DD/MM/AAAA`; no mayor al periodo |
| 6 | Fecha Vcto/Pago | Alfanum. | 10 | Solo tipo 14 | `DD/MM/AAAA` |
| 7 | Tipo CP/Doc. | Alfanum. | 2 | Sí | Tabla 3 del Anexo 1 |
| 8 | Serie del CDP | Alfanum. | hasta 20 | Según tipo | Tabla 3 + regla general por tipo (Tabla 5); para facturas/boletas/notas la serie es de 4 |
| 9 | Nro CP o Doc. / Nro Inicial | Alfanum. | hasta 20 | Sí | Número del comprobante (o inicial del rango consolidado) |
| 10 | Nro final | Alfanum. | hasta 20 | No | Solo tipos `00, 03, 12, 13, 18, 87, 88`; consolidación diaria. **Boleta (03) con total ≥ S/ 700 debe ir detallada**, no en rango |
| 11 | Tipo Doc Identidad | Alfanum. | 1 | Condicional | Tabla 1. Obligatorio salvo tipos `00,05,06,07,08,11-16,18,19,23,28,30,34-37,55,56,64,87,88`, o boleta/ticket con total < S/ 700, o si campo 14 > 0, o si hay rango (campo 10) |
| 12 | Nro Doc Identidad | Alfanum. | hasta 15 | Condicional | Mismas excepciones; largo/tipo por Tabla 5 (DNI 8 numérico fijo; RUC 11 numérico fijo con módulo 11; CE 12 alfanum.; pasaporte 12) |
| 13 | Apellidos Nombres/Razón Social | Alfanum. | hasta 1500 | Condicional | Persona natural: apellido paterno, materno, nombres. Si el comprobante no lo trae: vacío |
| 14 | Valor Facturado Exportación | Numérico | 12 ent. + 2 dec. | Sí | Positivo. Anulado: `0.00` |
| 15 | BI Gravada | Numérico | idem | Sí | Sin incluir ISC. Negativo en notas de crédito (7, 87) |
| 16 | Dscto BI | Numérico | idem | Sí | Solo en nota de crédito 07/87 de periodos anteriores; negativo |
| 17 | IGV / IPM | Numérico | idem | Sí | Negativo en NC |
| 18 | Dscto IGV / IPM | Numérico | idem | Sí | Solo NC 07/87 de periodos anteriores; negativo |
| 19 | Mto Exonerado | Numérico | idem | Sí | |
| 20 | Mto Inafecto | Numérico | idem | Sí | |
| 21 | ISC | Numérico | idem | Sí | |
| 22 | BI Grav IVAP | Numérico | idem | Sí | Solo tipo 49 (arroz pilado) |
| 23 | IVAP | Numérico | idem | Sí | Solo tipo 49 |
| 24 | ICBPER | Numérico | idem | **Obligatorio en tipos 01, 03, 07, 08, 12** | «De no tener información consignar 0.00» |
| 25 | Otros Tributos | Numérico | idem | Sí | Suma de conceptos fuera de la base imponible |
| 26 | Total CP | Numérico | idem | Sí | |
| 27 | Moneda | Alfanum. | 3 | Sí | ISO 4217 (`PEN`, `USD`…); la moneda en que se emitió el comprobante |
| 28 | Tipo Cambio | Numérico | no capturado | Si moneda ≠ PEN | Formato `#.##` (RVIE) |
| 29 | Fecha Emisión Doc Modificado | Alfanum. | 10 | Solo tipos 07, 08, 87, 88 | `DD/MM/AAAA`. **Desde RS 138-2023:** si la nota modifica varios comprobantes se listan separados por coma (largo 1500) |
| 30 | Tipo CP Modificado | Numérico | 2 | idem | idem (lista con comas) |
| 31 | Serie CP Modificado | Alfanum. | hasta 20 | idem | En exportación, código de dependencia aduanera |
| 32 | Nro CP Modificado | Alfanum. | hasta 20 | idem | En exportación, N.º de DAM |
| 33 | ID Proyecto Operadores Atribución | Alfanum. | hasta 100 (no capturado exacto) | No | Solo consorcios/contratos de colaboración sin contabilidad propia |
| 34-40 | (SUNAT) | | | | NO van en el archivo que se sube |
| 41-57 | CLU | Texto | hasta 200 | No | Libres |

Reglas transversales (Anexo 2 notas 3-4, Anexo 3 nota 3):
- Comprobante electrónico con **baja comunicada** o físico **anulado**: se anota **en cero** (`0.00`), no se omite la fila.
- Comprobantes con CDR distinto de aceptado: también en cero (Anexo 3 original, nota 3).
- Moneda y tipo de cambio: el comprobante se declara con su moneda; el tipo de cambio es obligatorio solo si la moneda no es `PEN`. La **propuesta** de SUNAT usa el tipo de cambio venta de la fecha de emisión (Anexo 2 nota 3). Qué moneda deben tener los MONTOS cuando el comprobante es en dólares: el anexo dice «se consignará el tipo de cambio utilizado para la conversión a soles en caso lleve su contabilidad en soles», lo que implica montos en soles. Un blog (secundaria) confirma que la propuesta baja con importes ya en soles aunque la moneda diga USD.

---

## 3. RCE (compras): archivo que SUBIMOS (Anexo 11 de la RS 040-2022)

Fuente: `anexo-040-2022.pdf` págs. 33-38 (texto original). Cambios de la RS 138-2023 afectan el Anexo 8 (fecha de emisión) y los de ajustes; **no se verificó** si cambiaron el 11.
**Cantidad de campos:** 37 por línea (campos 1-37). Los campos 38-41 los completa SUNAT. Libres: 42 al 80 (`CLU`, hasta 200, opcionales).

| N.º | Nemotécnico | Tipo | Largo | Obligatorio | Regla clave |
|---|---|---|---|---|---|
| 1 | RUC | Numérico | 11 | Sí | RUC del generador |
| 2 | ID | Alfanum. | hasta 1500 | Sí | Razón social del generador |
| 3 | Periodo | Numérico | 6 | Sí | `AAAAMM` |
| 4 | CAR SUNAT | Alfanum. | 27 | **Vacío** | Se completa sola |
| 5 | Fecha de emisión | Alfanum. | 10 | Sí | `DD/MM/AAAA`; período ≤ periodo del RCE (hay excepción para tipos `01,08,23,30,34,42,46,50,52,53,54` con emisión de meses anteriores) |
| 6 | Fecha Vcto/Pago | Alfanum. | 10 | Si tipo `14,46,50,51,52,53,54` | `DD/MM/AAAA`. Es **fecha de pago** (para tipo 14 puede ser vencimiento) |
| 7 | Tipo CP/Doc. | Alfanum. | 2 | Sí | Tabla 11. No permite `91, 97, 98` (esos van en el archivo de no domiciliados) |
| 8 | Serie del CDP | Alfanum. | hasta 20 | Según tipo | Si tipo `50,51,52,53,54`: código de la dependencia aduanera (Tabla 4) |
| 9 | Año | Numérico | 4 | Si tipo `50,51,52,53,54` | Año de la DAM/DSI, > 1981 y ≤ año del periodo |
| 10 | Nro CP o Doc. / Nro Inicial (Rango) | Alfanum. | hasta 20 | Sí (salvo tipo 00) | Permite consolidar importes diarios que no dan crédito fiscal (tipos `00,03,05-08,11-16,18,19,23,28,30,34-37,44,45,55,56,87,88`) |
| 11 | Nro Final (Rango) | Alfanum. | hasta 20 | No | Solo en el caso de rango |
| 12 | Tipo Doc Identidad | Alfanum. | 1 | Condicional | Tabla 1 |
| 13 | Nro Doc Identidad | Alfanum. | hasta 15 | Condicional | |
| 14 | Apellidos Nombres/Razón Social | Alfanum. | hasta 1500 | Condicional | Del proveedor |
| 15 | BI Gravado DG | Numérico | 12 ent. + 2 dec. | Sí | Adquisiciones gravadas que dan crédito fiscal, solo a operaciones gravadas/exportación |
| 16 | IGV / IPM DG | Numérico | idem | Sí | Mismo signo que el campo 15. En la versión del Anexo 8 (complemento) la tolerancia es base × 0.18 ± 1 |
| 17 | BI Gravado DGNG | Numérico | idem | Sí | Gravadas destinadas a operaciones gravadas y no gravadas |
| 18 | IGV / IPM DGNG | Numérico | idem | Sí | |
| 19 | BI Gravado DNG | Numérico | idem | Sí | Gravadas destinadas a operaciones no gravadas |
| 20 | IGV / IPM DNG | Numérico | idem | Sí | |
| 21 | Valor Adq. NG | Numérico | idem | Sí | Adquisiciones no gravadas |
| 22 | ISC | Numérico | idem | Sí | |
| 23 | ICBPER | Numérico | idem | Obligatorio tipos `01,03,07,08,...` | |
| 24 | Otros Trib/Cargos | Numérico | idem | Sí | |
| 25 | Total CP | Numérico | idem | Sí | |
| 26 | Moneda | Alfanum. | 3 | Sí | ISO 4217, Tabla 2 |
| 27 | Tipo de Cambio | Numérico | 1 entero + 3 decimales | Si moneda ≠ PEN | Formato `#.###` (**ojo: RCE usa 3 decimales; RVIE `#.##`**) |
| 28 | Fecha Emisión Doc Modificado | Alfanum. | 10 | Solo tipos 07, 08, 87, 88 | `DD/MM/AAAA` |
| 29 | Tipo CP Modificado | Alfanum. | 2 | idem | Tabla 11 |
| 30 | Serie CP Modificado | Alfanum. | hasta 20 | idem | |
| 31 | COD. DAM O DSI | Alfanum. | 3 | Si campo 29 = `50` o `52` | Tabla 4 (aduanas; Pucallpa = `217`) |
| 32 | Nro CP Modificado | Alfanum. | hasta 20 | idem | |
| 33 | Clasif de Bss y Sss | Numérico | 1 | Solo si ingresos del año anterior > 1.500 UIT | 1 Mercadería/insumos · 2 Activo fijo · 3 Otros activos · 4 Gastos (educación, salud, viaje, vehículo…) · 5 Otros gastos (Tabla 23) |
| 34 | ID Proyecto Operadores/Partícipes | Alfanum. | hasta 50 | No | Solo consorcios |
| 35 | PorcPart | Numérico | hasta 2 ent. + 2 dec. | No | Solo operadores de contratos de colaboración |
| 36 | IMB | Numérico | 12 + 2 | No | Impuesto materia de beneficio, Ley 31053 |
| 37 | CAR Orig | Alfanum. | 27 | **Vacío** | Solo para ajustes posteriores |
| 38-41 | (SUNAT: detracción, tipo de nota, estado, inconsistencias) | | | | NO van en el archivo que se sube |
| 42-80 | CLU | Texto | hasta 200 | No | Libres |

Tipos de compra más comunes: `01` factura · `03` boleta · `07` NC · `08` ND · `12` ticket/POS · `14` recibo servicios públicos · `50/52` DUA/DSI · `00` otros. La lista completa de Tabla 11 (más códigos que Tabla 3) **no se transcribió**; está en `anexo-040-2022.pdf` págs. 3-9.

No domiciliados (campo 21 de nuestro libro 8.1 «N.º de comprobante emitido por sujeto no domiciliado»): va en **otro archivo** (Anexo 9, nombre código `080500`, 45 campos). No hace falta para Blas ni la bodega salvo servicios del exterior; no se detalla acá.

---

## 4. Identificar un comprobante: el CAR (Tabla 7, Anexos 1)

El **CAR SUNAT** = 27 caracteres sin separadores: `RUC emisor (11)` + `tipo (2)` + `serie (4)` + `número (10)`.

- Relleno con ceros **a la izquierda** si es más corto; si es más largo se toman los dígitos **de la derecha**. Serie o número vacíos se llenan con ceros.
- RUC del emisor: en **ventas** es el RUC del generador; en **compras** es el RUC del **proveedor** (salvo tipos 46, 50-54, donde se usa el RUC del importador/usuario/retenedor).
- Ejemplo (mío): factura `F001-123` del proveedor RUC `20100176450` → `20100176450` + `01` + `F001` + `0000000123` = `2010017645001F0010000000123` (27 caracteres, sin espacios).
- Esta es la llave para cruzar. Nuestras columnas `tipo` + `serie` + `numero` + `provDoc` (compras) / RUC del negocio (ventas) alcanzan para construirla.

---

## 5. Archivo de PROPUESTA que SUNAT da para descargar

| Punto | Qué se confirmó |
|---|---|
| Cuándo | Desde el 2.º día calendario del mes; se actualiza a diario (`node/159`, `node/160`) |
| Formato | **Mismo molde de campos** que el Anexo 2 (RVIE) / Anexo 8 (RCE): texto con `|`. Se baja por **ticket** (se pide «Exportar» y luego se baja el ZIP desde «Estado de envío de Ticket»). API: `…/rvie/propuesta/web/propuesta/{periodo}/exportapropuesta?codTipoArchivo=0` (0 = txt, 1 = xls; el Anexo IV del v30 lista 0 txt, 1 excel, 2 csv). Todo viene en ZIP. |
| Campos RVIE | 1-33 igual que arriba, más **34 Tipo de Nota** (cat. 09/10), **35 Est. Comp** (estado), **36** uso interno, **37 Valor OP Gratuitas**, **38 Tipo Operación**, **39 Incal** (inconsistencias), **40** uso interno, 41-57 libres (Anexo 2). Campos 34-40 son «a título referencial» y no se usan al devolver el archivo |
| Campos RCE | 1-37 (Anexo 8; el campo 37 trae «CAR Orig / Indicador de Exclusión o Inclusión»), **38 Detracción** (marca, `D` según blog), **39 Tipo de Nota**, **40 Est. Comp**, **41 Incal**, 42-80 libres |
| Cómo se identifica cada fila | Campo 4 **CAR SUNAT** (27) ya viene lleno en la propuesta. Para cruzar con nuestras filas se calcula el mismo CAR (sección 4) y se compara; si falta alguno de los componentes, se cruza por `provDoc + tipo + serie + número` |
| Inconsistencias | SUNAT escribe en el campo «Incal» las inconsistencias que detecta; son «meramente ilustrativas y no forman parte del registro» |
| Encabezados | Un blog (secundaria) cita columnas con los nemotécnicos del anexo («Nro Doc Identidad», «Apellidos Nombres/ Razón Social», «Moneda», «Detracción»), así que **probablemente trae una fila de títulos**; **no confirmado** en fuente oficial. Verlo en la propuesta real |
| Montos y signos | Importes en soles aunque la moneda sea USD y descuentos/NC en negativo (secundaria, ReyCont); coincide con los anexos |
| Delimitador alterno | El portal también deja bajar CSV (secundaria + Anexo IV del manual v30); la estructura de columnas de ese CSV **no confirmada** |

### Atajo oficial para el cruce (importante para el diseño)

SUNAT ya trae su propia comparación: el módulo permite subir un archivo con el molde del **Anexo 3 (RVIE)** o **Anexo 11 (RCE)** («comparar con la propuesta») y devuelve un reporte de diferencias («Reporte de observaciones de comparación», procesos 16, 27, 42, 53, 57, 58 del Anexo I del manual v30). Ese reporte «tiene carácter meramente ilustrativo y no forma parte del RVIE/RCE» (`node/159`, `node/160`).

Consecuencia: construir bien la **exportación** (tramo 1) ya le da al contador el cruce oficial dentro de SOL sin que el sistema toque credenciales. El cruce propio dentro de Buleje (subir la propuesta y listar «falta/sobra/difiere» sin entrar a SOL) es un segundo paso, útil porque sale en el mismo lugar donde se corrige.

---

## 6. Mapeo con lo que ya tiene el sistema

Fuentes: `lib/contabilidad/libros/registro-ventas.ts` (columnas líneas 122-148) y `registro-compras.ts` (líneas 73-106). Las columnas «Tabla 10» de nuestro libro son los códigos de tipo del formato 14.1/8.1 antiguo; los códigos comunes (01, 03, 07, 08) son los mismos que en Tabla 3 (RVIE) y Tabla 11 (RCE) del SIRE (verificado para 01, 03, 07, 08; el resto de códigos de RCE, no transcrito).

### 6.1 Ventas (RVIE, Anexo 3)

| Campo SIRE | Columna nuestra (clave) | Estado |
|---|---|---|
| 1 RUC, 2 ID, 3 Periodo | (no están en las filas) | **Se calcula/viene del negocio**: RUC y razón social del tenant, periodo `AAAAMM` |
| 4 CAR | — | **Vacío a propósito** |
| 5 Fecha emisión | `fechaEmision` (col 2) | Hay; **convertir a `DD/MM/AAAA`** (revisar el formato que devuelve `fechaLima`) |
| 6 Fecha Vcto/Pago | `fechaVencimiento` (col 3) | Siempre vacía; solo exige tipo 14 → **se puede dejar vacía** |
| 7 Tipo | `tipo` (col 4) | Hay para comprobantes electrónicos y POS con comprobante. **Faltan** las ventas POS sin comprobante y pedidos online sin comprobante: no son comprobantes de pago → quedan fuera o hay que decidir con el contador |
| 8 Serie / 9 Número | `serie` (5), `numero` (6) | Hay. Normalizar (serie 4 caracteres; número sin ceros sobrantes). La nota de crédito interna no tiene serie → **falta** |
| 10 Nro final | — | **Falta / no aplica** (rango consolidado de boletas); dejar vacío y detallar cada boleta |
| 11 Tipo doc cliente | `clienteTipoDoc` (7) | Hay (regla: obligatorio salvo boleta < S/ 700) |
| 12 Nro doc / 13 Razón social | `clienteDoc` (8), `clienteNombre` (9) | Hay; no puede llevar `|` `/` `\` (el sistema ya usa `textoSeguro`, revisar que quite esos tres) |
| 14 Exportación | `exportacion` (10) | Vacía (el negocio no exporta) → poner `0.00` |
| 15 BI Gravada | `baseGravada` (11) | Hay |
| 16 Dscto BI / 18 Dscto IGV | — | **Falta**; solo aplican a NC de periodos anteriores → `0.00` o vacío (**no confirmado** cuál acepta SUNAT; probar) |
| 17 IGV/IPM | `igv` (15) | Hay |
| 19 Exonerado / 20 Inafecto | `exonerada` (12), `inafecta` (13) | Hay |
| 21 ISC | `isc` (14) | Vacío → `0.00` |
| 22 BI IVAP / 23 IVAP | — | **No aplica** (arroz pilado) → `0.00` o vacío |
| 24 ICBPER | — | **Falta y es obligatorio** en tipos 01, 03, 07, 08, 12 («si no hay, `0.00`»). Preguntar si el POS cobra bolsas plásticas |
| 25 Otros tributos | `otros` (16) | Hay |
| 26 Total | `total` (17) | Hay |
| 27 Moneda | — | **Falta**; constante `PEN` (el libro dice que el negocio vende en soles) |
| 28 Tipo cambio | `tipoCambio` (18) | Vacío (correcto con PEN) |
| 29-32 Referencia (fecha, tipo, serie, número) | `refFecha` (19), `refTipo` (20), `refSerie` (21), `refNumero` (22) | Hay en notas de crédito internas; **la nota interna no tiene serie propia** → bloquea (SUNAT las exige) |
| 33 ID proyecto | — | No aplica, vacío |
| Anulados | `estado` = «anulado» | Ya salen en cero: correcto con la regla del anexo |
| (nuestro) `correlativo`, `sinDesglose`, `origen`, `estado`, `idSistema` | col 1 y las del final | **No van en el archivo SIRE.** `sinDesglose` es un problema: hay ventas con total pero sin saber qué parte es gravada, exonerada o inafecta; SUNAT pide los desgloses |

### 6.2 Compras (RCE, Anexo 11)

| Campo SIRE | Columna nuestra (clave) | Estado |
|---|---|---|
| 1-3 RUC, razón social, periodo | — | Del negocio / calculado |
| 4 CAR, 37 CAR Orig | — | Vacío |
| 5 Fecha emisión | `fechaEmision` (2) | **Falta (vacía hoy):** el sistema guarda fecha de llegada/del gasto (`fechaSistema`), no la impresa en la factura. **Es obligatoria en SIRE.** Bloqueo para exportar |
| 6 Fecha Vcto/Pago | `fechaVencimiento` (3) | Vacía; obligatoria solo en tipos 14, 46, 50-54 → se puede dejar vacía para el resto |
| 7 Tipo | `tipo` (4) | Parcial: solo factura (01), boleta (03), notas (07/08); «recibo» y «ticket» quedan vacíos (nota del propio libro) |
| 8 Serie / 10 Número | `serie` (5), `numero` (7) | Hay (vía `partirSerieNumero`) |
| 9 Año DAM/DSI | `anioDua` (6) | Vacío; solo importaciones |
| 11 Nro final | — | Vacío |
| 12-14 Proveedor | `provTipoDoc` (8), `provDoc` (9), `provNombre` (10) | Hay |
| 15-16 BI/IGV (DG) | `bi1` (11), `igv1` (12) | **Solo para gastos con IGV anotado.** Para compras de mercadería **van vacíos**: la orden guarda costo, no el IGV de la factura |
| 17-18 (DGNG) | `bi2` (13), `igv2` (14) | Vacío |
| 19-20 (DNG) | `bi3` (15), `igv3` (16) | Vacío |
| 21 No gravadas | `noGravadas` (17) | Vacío |
| 22 ISC | `isc` (18) | Vacío → `0.00` |
| 23 ICBPER | — | **Falta**; obligatorio en tipos 01, 03, 07, 08: `0.00` |
| 24 Otros | `otros` (19) | Vacío → `0.00` |
| 25 Total | `total` (20) | Hay |
| 26 Moneda / 27 Tipo cambio | `tipoCambio` (24) | Moneda **falta** (asumir `PEN`; **no confirmado** si hay compras en dólares) |
| 28-30, 32 Referencia de nota | `refFecha` (25), `refTipo` (26), `refSerie` (27), `refNumero` (28) | Columnas existen; el libro de compras hoy no llena notas |
| 31 Cód. DAM/DSI | — (`serie` guarda el código aduanero según el rótulo) | Falta; solo importaciones |
| 33 Clasificación | — | **Falta**; solo obligatoria si el negocio facturó > 1.500 UIT el año anterior (**dato de Brandon**) |
| 34-36 Proyecto, participación, IMB | — | No aplican, vacío |
| Detracción (nuestras `detraccionNumero` 22 y `detraccionFecha` 23) | — | **No tiene campo en el archivo que se sube** (la marca «D» de detracción solo aparece en la propuesta, campo 38). No hace falta mandarla |
| No domiciliado (`noDomiciliado`, 21) | — | Va en otro archivo (Anexo 9), no en este |
| (nuestro) `correlativo`, `fechaSistema`, `tipoSistema`, `origen`, `detalle`, `idSistema` | — | **No van** |

### 6.3 Datos que NO existen hoy en el sistema

| Dato | Quién lo pide | ¿Se puede dejar vacío? |
|---|---|---|
| Fecha de emisión de la factura del proveedor | RCE campo 5 | **No** (obligatoria) |
| IGV y base imponible por compra de mercadería | RCE 15-20 | No si hay IGV (sin esto SUNAT no ve el crédito fiscal) |
| Moneda de la compra | RCE 26 | Constante `PEN` si todo es en soles |
| ICBPER | RVIE 24 / RCE 23 | `0.00`, no vacío |
| Código de aduana, año de DUA/DSI | RCE 8, 9, 31 | Sí, salvo importaciones |
| Clasificación de bienes y servicios | RCE 33 | Sí, salvo que superen 1.500 UIT |
| Serie de la nota de crédito interna | RVIE 8, 31 | No |
| Desglose gravado/exonerado/inafecto de ventas sin comprobante | RVIE 15, 19, 20 | No |
| Detracción | solo en propuesta | Sí |
| Rangos de boletas (`Nro final`) | RVIE 10 | Sí (se detalla cada boleta) |

---

## 7. Errores típicos que rechaza SIRE (lo que las fuentes SÍ listan)

Confirmados en el manual API v30 (errores 422 al subir el archivo, secciones 5.3 a 5.7):

| Código | Mensaje |
|---|---|
| 1022 | Nombre del archivo no enviado o vacío |
| 1024 | El archivo `<nombre>` fue previamente enviado |
| 1044 | Error en la «Posición - Descripción» del nombre del archivo plano |
| 1348 | La extensión del archivo es distinta de `.zip` |
| 1346 | El tamaño del `.zip` debe ser menor o igual a 6 GB |
| 1350 | El tamaño del archivo debe ser mayor a 0 KB |
| 1351 | Error al enviar el archivo, reintentar |
| 1002/1003 | RUC no numérico de 11 dígitos / inexistente |
| 1006 | `perTributario` no cumple `yyyymm` |
| 1007 | Periodo mayor a la fecha actual |
| 1048-1050 | `codTipoCorrelativo` vacío o no permitido |
| 1026/1139 | `codProceso` no permitido |

Errores de **contenido** (campos): las reglas del anexo (secciones 2 y 3) son las que SUNAT valida, y si no se cumplen el estado queda «rechazado» y se detalla qué se incumplió (`node/159`, `node/160`). **El catálogo exacto de mensajes por campo (`CATALOGO_ERROR_xxxx`) no aparece en lo que leí: no confirmado.** Los casos más probables, por las propias reglas del anexo:

1. Nombre del archivo mal armado (posiciones 28-33).
2. Fecha fuera del formato `DD/MM/AAAA` o posterior al periodo.
3. Tipo de documento fuera de la tabla, o serie/número que no cumplen la regla del tipo (p. ej. serie ≠ 4 en factura).
4. RUC de 11 dígitos que no pasa el módulo 11; DNI que no son 8 dígitos.
5. Texto con `|`, `/` o `\`.
6. Monto con coma de miles o más de 2 decimales.
7. Nota de crédito/débito sin los cuatro campos de referencia.
8. Comprobante anulado con importe distinto de cero.
9. Boleta ≥ S/ 700 en rango consolidado en vez de detallada.
10. IGV fuera de la tolerancia de ± 1 sol sobre base × 18 % (regla visible en el Anexo 8).
11. Mismo comprobante duplicado en el archivo (el manual SIRE avisa de revisar duplicados antes de generar el registro).

---

## 8. Tramos para construir (mañana)

Cada tramo es ≤ 1 pantalla o ≤ 1 endpoint con su clase. Orden recomendado: ventas primero porque su dato está completo; compras necesita datos nuevos.

| Tramo | Qué se construye | Depende de | Cuidado |
|---|---|---|---|
| **1. RVIE (ventas) exportar en formato SIRE** | Función pura `lib/contabilidad/libros/sire-rvie.ts` (fila del libro → línea de 33 campos, nombre `LE…140400 02 …`, `.zip`) + test con casos: factura, boleta < y ≥ S/700, NC con referencia, anulado en ceros, texto con `|`. Un endpoint que baja el `.zip` + botón en `LibrosContador.tsx` («Formato SIRE (ventas)»). Con una lista previa de lo que **bloquea** (ventas sin tipo/serie/número, NC sin serie) | Nada nuevo en la base | El TXT de trabajo actual se queda como está; el nuevo es aparte y con nombre claro. Codificación y fin de línea por probar |
| **2. RCE (compras) exportar + datos que faltan** | 2a: pedir y guardar en la compra la **fecha de emisión del comprobante** y el **IGV** (compra recibida y gasto) — toca esquema y pantalla de compras → **zona de peligro**, va con skill `migrar-esquema` y un tramo propio. 2b: `lib/contabilidad/libros/sire-rce.ts` (línea de 37 campos, nombre `LE…080400 02 …`) + endpoint + botón | 2a antes de 2b | Sin 2a el RCE sale casi vacío en BI/IGV y sin fecha: SUNAT lo rechaza por campo 5 |
| **3. Cruzar con la propuesta SIRE** | Una pantalla: sube el `.zip` o `.txt` de propuesta (Anexo 2 u 8), lo lee por `|`, arma el CAR de cada fila y el de cada fila nuestra, y muestra tres listas: **solo en SUNAT** (lo que se pierde de crédito fiscal en compras / ventas no registradas), **solo en Buleje**, **distinto importe**. Solo lectura; no envía nada a SUNAT | Un archivo real de propuesta (ver abajo); tramo 1 (CAR de ventas) y tramo 2 (compras) | Alternativa más barata y oficial: que el contador suba el archivo del tramo 1/2 al «comparar» de SOL y use el reporte de SUNAT |

---

## 9. Qué hay que pedirle a Brandon

| # | Pedido | Para qué |
|---|---|---|
| 1 | **Un archivo real de propuesta bajado de SOL**, uno de **compras (RCE)** y uno de **ventas (RVIE)**, de cualquier mes reciente y de Blas SAC (y de la bodega si puede): SOL › Sistema Integrado de Registros Electrónicos › Registros Electrónicos › «Exportar» › TXT › esperar el ticket › bajar el ZIP. No hacen falta claves; basta el ZIP | Confirmar: fila de títulos sí/no, codificación, `|` final, formato del negativo, tipo de cambio, versión vigente del anexo. Sin esto el tramo 3 no se puede probar |
| 2 | ¿Se puede probar el archivo del tramo 1 subiéndolo a «comparar» en SOL un mes ya cerrado (sin presentar nada)? | Verificar el nombre y la estructura contra el validador real |
| 3 | RUC y razón social tal como figuran en SUNAT para Blas SAC y para la bodega (tenants de prueba) | Campos 1 y 2, y nombre del archivo |
| 4 | ¿Todo se compra y vende en soles? ¿Alguna compra en dólares o a proveedores del exterior? | Moneda, tipo de cambio, no domiciliados |
| 5 | ¿El POS cobra bolsas plásticas? | ICBPER |
| 6 | ¿Blas superó 1.500 UIT de ingresos el año pasado? | Campo 33 del RCE |
| 7 | ¿Hay importaciones (DUA) o compras con detracción que el contador necesite ver? | Campos aduaneros |
| 8 | Qué hacer con las ventas del POS sin comprobante electrónico y los pedidos online sin boleta | Hoy quedan sin tipo/serie/número; en SIRE no pueden ir así |
| 9 | Si el contador prefiere declarar boletas en rango diario consolidado (campo 10) o detalladas | Define si se arma `Nro final` |

---

## 10. Para memoria (lo que un agente futuro no sabría)

- Los anexos completos (con todas las filas) son los **originales** `anexo-112-2021.pdf` y `anexo-040-2022.pdf` en sunat.gob.pe/legislacion/superin; los de 2023 (`anexoII…-000138-2023.pdf`) traen solo las filas modificadas.
- `pdftotext -layout` desordena las tablas de anexos; PyMuPDF `page.find_tables().extract()` las saca limpias (campo, descripción, nemotécnico, regla, largo, formato).
- `curl` a `cpe.sunat.gob.pe` pagina HTML = 403 Cloudflare; sus PDF bajan bien; las páginas se leen con `mcp__exa__web_fetch_exa`.
- Diferencia a no confundir: tipo de cambio RVIE `#.##` (2 decimales) frente a RCE `#.###` (3).
- El RCE de reemplazo son **37 campos**; el RVIE de reemplazo, **33**.
