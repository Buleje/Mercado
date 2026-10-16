# ADR-494 — La hoja GTF sigue el formato RDE D000014-2024-MIDAGRI-SERFOR-DE

- **Estado:** aceptado (2026-10-16).
- **Pedido por:** Brandon (16-10), eligió «Hoja SERFOR con numeración 2024».
- **Fuente:** RDE N° D000014-2024-MIDAGRI-SERFOR-DE (13-01-2024), Anexo I (formato) y su instructivo. Art. 2: **deja sin efecto la RDE 122-2015-SERFOR-DE**, sin régimen transitorio. Arts. 3-5 repiten los de 2015: Arial, prenumerada, A4, original + 2 copias.
- **Extiende:** la memoria `gtf-formato-2024-partida-y-llegada` (el bloque de partida (17)-(20) ya existía). Convive con ADR-493 (tipo de establecimiento en la ficha → (19)).
- **Schema:** ninguno. **Datos:** ninguno. **Claves internas:** intactas.

## Contexto

«Imprimir hoja SERFOR» (`cuerpoGtfOficial`, `lib/forestal/ctp-gtf-formato.ts`) numeraba como el formato de 2015: del (1) al (40), con DNI y RUC en casilleros separados. Solo el bloque de partida venía del formato 2024, y salía solo si la guía tenía modo de partida. El formato vigente cambia casi todos los números a partir del (8).

## Decisión

1. **La hoja dibuja los 58 casilleros del Anexo I** en su orden, con el número y el rótulo del formato. La tabla de mapeo vive en código: `CASILLEROS_GTF_2024`. Cada casillero dice qué clave de `casillerosGtf` lo llena (`de`) o por qué queda en blanco (`vacio`).
2. **Las claves internas no se renombran.** Las claves de `casillerosGtf` ("8", "35", "37a"…) siguen siendo las de 2015, porque las usan:
   - el talonario (`gtf-talonario:<tenantId>`, posiciones por clave);
   - la libreta;
   - los tests.
3. **Guías viejas:** se imprimen todas en 2024, porque la norma no deja un régimen transitorio. El papel que ya viajó no cambia; una reimpresión sale con el formato vigente. El bloque de partida sale **siempre**, en blanco si la guía no lo cargó. Lo mismo pasa con el (22) del destinatario.
4. **Casilleros 2024 sin dato:** van en blanco con su número. No se inventa nada (regla del hub GTF).
5. **El (5) tiene las 10 casillas de 2024.**
   - Se agregan «Varios orígenes», «Centro de Transformación Primaria-CTP» y «Cesión en Uso».
   - Salen «Plan de Manejo Consolidado» y «Otros»: el formato ya no los tiene, quedan en `ORIGENES_SIN_CASILLA_2024`.
   - Una guía guardada con esos dos valores no cruza ninguna casilla en la hoja. El formulario muestra el valor guardado con «(formato 2015, no sale en el papel)».
6. **El talonario matricial conserva los 12 orígenes:**
   - Las 9 casillas de antes van en su orden, porque la posición de fábrica sale de ese orden. Las 2 retiradas llevan el rótulo «(2015)».
   - Las 3 nuevas nacen ocultas: se activan en «Acomodar».
   - Los rótulos de los campos pasan a la numeración 2024. Los ids no cambian.
7. **La lista de trozas es el anexo del (33)**, ya no del (35). El pie de página cita la RDE D000014-2024.

## Tabla de mapeo (formato 2024 ← clave interna ← número en la hoja 2015)

| 2024 | Rótulo del Anexo I | Clave interna | 2015 |
|---|---|---|---|
| (1) | N° | `numeroGtf` | N° (sin número) |
| (2) | ARFFS | `2` | (2) |
| (3) | Fecha de expedición | `3` | (3) |
| (4) | Fecha de vencimiento | `4` | (4) |
| (5) | Origen del recurso o procedencia | `5` | (5) |
| (6) | N° (del título) | `6` | (6) |
| (7) | Nombre del Titular | `7` | (7) |
| (8) | Rep. Legal | `rep` | sin número |
| (9) | N° Resolución | `8` | (8) |
| (10) | Plan de Manejo (Tipo) | `9` | (9) |
| (11a)(11b)(11c) | Departamento · Provincia · Distrito | `10` `11` `12` | (10)(11)(12) |
| (12) | Propietario del producto | `13` | (13) |
| (13) | DNI/RUC N.º | `15` + `14` | (15) RUC + (14) DNI |
| (14a)–(14d) | Dirección · Dpto · Prov · Dist | `16`–`19` | (16)–(19) |
| (15) | Tipo de Comprobante de Compra o Venta | `20` | (20) |
| (16) | N° de comprobante | `21` | (21) |
| (17)–(20d) | Punto de partida · N° Autorización · Tipo de Establecimiento · Dirección · Dpto · Prov · Dist | `p17`–`p20d` | ya 2024, solo con modo |
| (21) | Destinatario | `22` | (22) |
| (22) | N° Autorización | `d22` | ya 2024, solo con modo |
| (23) | DNI/RUC N.º | `24` + `23` | (24) RUC + (23) DNI |
| (24a)–(24d) | Dirección · Dpto · Prov · Dist | `25`–`28` | (25)–(28) |
| (25) | N.º Guía de Remisión de Transportista | `29` | (29) |
| (26) | Tipo de Transporte | `30` | (30) |
| (27) | Tipo de vehículo | `31` | (31) |
| (28) | Placa (s)/ Matrícula N.º | `31p` | (31) «Placa(s)» |
| (29) | Nombre del conductor | `32` | (32) |
| (30) | DNI N° | `33` | (33) |
| (31) | Lic. Conducir N.º | `34` | (34) |
| (32) | N.º GTF de origen | `36` | (36) |
| (33) | Lista de Trozas/ Productos Transformados N° | `35` | (35) |
| (34) | Cuadro detalle de productos | título del cuadro | (37) |
| (34a)–(34g) | Científico · Común · Tipo · Descripción · Cantidad · Unidad · Total | `37a`–`37g` | (37) columnas |
| (34h) | Total movilizado | `volumenTotal` | fila de total |
| (35) | Observaciones | `38` | (38) |
| (36) | Anexos (01-04) | **no se llena** | — (nuevo) |
| (37) | Firma y sello del emisor | **a mano** | (39) |
| (38) | Nombres y apellidos del emisor | **a mano** | (40) |
| (39) | Documento de Identidad del emisor | **no se llena** | — (nuevo) |

**Quedan en blanco con su número:**
- (36): qué anexo viaja lo marca quien emite.
- (37) y (38): se llenan a mano.
- (39): el sistema no guarda quién firma.
- (5), las tres casillas nuevas: ningún dato las produce todavía, pero se pueden elegir.
- (17)–(20d) y (22) en las guías que no los cargaron.

Fuera de la hoja quedan el QR y el código de barras, que solo genera el SNIFFS (art. 3), y el reverso «Registro de control».

## Evidencia (16-10)

Se imprimieron las 42 guías con `gtfDatos` de main y de QA-ui, antes y después, con la misma función de la pantalla, `papelesGuiaLoth`:
- Los **921 valores** que la hoja de 2015 imprimía con número caen en su casillero 2024: 921 de 921.
- Valores perdidos:
  - «X Otros» en 4 guías de main: esa casilla ya no existe.
  - La frase «NO APLICA — el producto inicia…» en 1 guía: ahora sale como «NO APLICA» en cada uno de los 7 casilleros de la partida.
- Valor ganado: el N° de la guía en el (1).

Test de la tabla: `__tests__/forestal-gtf-formato-2024.test.ts`. Comprueba:
- el oráculo de los 58 números;
- que cada casillero tiene clave o motivo;
- que ninguna clave queda sin casillero;
- que una clave llena un solo casillero;
- los rótulos en la hoja.

## Consecuencias

- Una guía impresa antes del cambio y su reimpresión numeran distinto, aunque los valores sean los mismos.
- **Formularios del panel con la numeración 2024 (16-10, hecho):** los rótulos salen de `casilleroGtf2024(clave)` (`lib/forestal/ctp-gtf-formato.ts`, derivada de `CASILLEROS_GTF_2024`), no de números a mano. `Field`/`Casillero` aceptan `number` (LO-CTP) o `string` (GTF 2024).
  - Hechos: `CtpGuiaOficialForm`, `CtpIngresoPartesForm`, `CtpIngresoEditModal` (solo su sección GTF; los casilleros LO-CTP 2-13 no cambian), `WoodEntryForm` (textos de ayuda GTF; sus casilleros son del LO-CTP), `LothGuiaDatos`, `CtpGuiaDatosTab`, `LothGuiaTraslado`, `LothGuiaDocumento`, `LothGuiaBloques`, `LothGuiaListaMovilizar`, `ctp-guia-bloques-partes`, `CtpCuadrarGuiaModal`, `CtpListaProductosTab`, `huecosDelTitulo` (y su gemelo de `ctp-ficha-types`), `LothImportarGuiasBloques`/`Ficha`, `CtpGtfSeccion`, `CtpFichaReadView`, `CtpFichaFormTitulos`, `CtpParteModal`, `CtpGuiaRegistrada`.
  - El texto «RDE 122-2015» de `CtpGuiaDatosTab` y `CtpGtfDatosForm` cita ahora la RDE D000014-2024 (arts. 3-5).
  - No se tocan: `CtpGuiaSerforHoja` y `serfor-gtf-print` (reproducen la guía tal como la publica SERFOR, con sus números) y los casilleros LO-CTP.
  - Test: `__tests__/forestal-gtf-rotulos-panel.test.ts`.
- Un talonario ya calibrado con «Otros» o «Plan consolidado» visibles sigue cruzando esa casilla (rótulo «(2015)»). Quien imprime sobre papel 2024 debe ocultarla en «Acomodar».
