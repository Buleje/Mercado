# ADR-338 — La guía de SERFOR se muestra con la forma del documento

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** alta de ingreso del Libro CTP, modo «Desde SERFOR» · consulta pública del SNIFFS · cotejo ante fiscalización
- **Relacionado:** ADR-312 (alta desde SERFOR) · ADR-320 (lista de trozas) · ADR-311 (paridad con el formato oficial)

## El problema

Al consultar una GTF por su N° de registro, el alta mostraba la respuesta como
una caja gris con **dieciséis pares «rótulo: valor» en dos columnas**, mezclando
el titular del título habilitante con el conductor del camión y el destinatario.

El papel que se está copiando no está ordenado así. Tiene una cabecera con el
emisor y el número de guía, y **cinco bloques con casilleros numerados**: la
guía (2-12), el propietario del producto (13-21), el destinatario (22-28), el
transportista (29-34) y el detalle del producto (35-38). Quien coteja —el
operador contra el papel que tiene en la mano, o un fiscalizador— mira **un
bloque a la vez** y busca por número de casillero.

Además, la caja **escondía dos cosas**: los campos que la consulta pública no
devuelve (se veían igual que los vacíos) y los que SERFOR publica pero ningún
rótulo mostraba (se perdían en silencio).

## La decisión

### 1. El orden y los rótulos son datos, no JSX

`lib/forestal/gtf-serfor-bloques.ts` (puro, 10 tests) declara los cinco bloques
con sus casilleros, de qué campo sale cada uno y cuánto ocupa. La pantalla
(`CtpGuiaSerforHoja`) los pinta. Así la pantalla y el PDF imprimible
(`serfor-gtf-print`) no pueden declarar casilleros distintos del mismo
documento.

### 2. Ausente ≠ vacío

Cuatro casilleros del papel **no vienen** en la consulta pública: (9) plan de
manejo, (14) D.N.I. del propietario, (20-21) comprobante de compra y (36) GTF de
origen. Se declaran con `noPublicado` y la pantalla dice «No lo publica la
consulta», distinto del «—» de un casillero que el documento trae en blanco.
Ante una fiscalización esa diferencia es todo: uno es un dato que falta y el
otro es un dato que no se puede saber por esta vía.

El pie lo resume: «32/33 casilleros con dato · 5 no los publica la consulta».

### 3. El documento del destinatario se parte una sola vez

SERFOR publica «RUC / DNI» en un campo; el papel tiene los casilleros (23) y
(24) separados. La partición vive en la lib con su test, no repetida en cada
pantalla que lo muestre.

### 4. La tabla (37) con la cabecera agrupada del papel

`(37a) Nombre científico · (37b) Nombre común · (37c) Tipo de producto`, y arriba
de las otras cuatro las dos cabeceras agrupadas —«Forma de embalaje o
presentación» sobre (37d)-(37e) y «Cantidad» sobre (37f)-(37g)— con el volumen
total al pie, como en la guía impresa.

### 5. Lo que SERFOR publicó y nadie mira, a un click

`camposNoMapeados()` compara el volcado crudo (`campos`) contra lo que los
casilleros ya muestran y ofrece el resto en un desplegable. Si mañana SERFOR
agrega una etiqueta, aparece ahí en vez de perderse.

## Consecuencias

- `DatoGuia` y `TablaGuia` (los helpers viejos del formulario) se borraron: su
  trabajo lo hace la hoja.
- La sección pasó de ~16 datos sueltos a los 33 casilleros publicables, y ocupa
  **menos** alto por bloque: la grilla de 12 columnas mete tres datos cortos por
  fila donde antes entraban dos.
- La hoja es un componente propio, así que la misma vista sirve para la ficha de
  un ingreso ya registrado (que guarda `serforGtf`) sin volver a escribirla.
