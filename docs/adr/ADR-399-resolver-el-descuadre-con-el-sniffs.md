# ADR-399 — Resolver el descuadre: declarar desde el SNIFFS, la mesa de lo que falta, y la foto

- **Fecha:** 2026-09-08
- **Estado:** aceptado
- **Pedido por:** Brandon — las tres que eligió después de ADR-398: pegar el detalle sobre un
  lote que ya existe, un panel de «qué no cuadra», y leer fotos de celular además de capturas.

## Contexto

ADR-398 dejó el cuadre pero no cómo resolverlo. Un lote traído de la lista queda con el
consumo declarado y la producción pendiente, y la única forma de completarlo era ir a la
pestaña de Producción a buscar su corrida. Además, el cuadre por tarjeta contesta «¿este
lote está bien?» pero no «¿qué me falta?», que es la pregunta de antes de una fiscalización.
Y el OCR del navegador lee capturas, no fotos de un monitor.

## Decisión

### 1. Declarar sobre un lote existente, desde donde se ve el problema

`CtpDeclararDesdeSniffs` abre el MISMO formulario de producción para la corrida viva del
lote, y elige la acción del libro según su estado: `declarar_produccion` si nunca declaró,
`ampliar_produccion` si le queda margen. Si el lote ya tiene productos guardados del SNIFFS,
aparecen listos para revisar; si no —el caso de la lista—, se pega el detalle ahí mismo y se
guarda como referencia nueva (`accion: "sniffs"` en el PATCH del lote).

El payload de esas dos acciones vivía copiado en dos componentes y ahora es
`guardar-produccion-corrida.ts`, que usan los tres. Tres copias del payload de un asiento es
donde una se queda sin un campo.

La referencia del SNIFFS se guarda **después** del asiento y sin poder romperlo: si esa
escritura falla, la producción ya quedó declarada y lo único que se pierde es el cotejo.

### 2. La mesa «qué no cuadra», ordenada por lo que pesa

`lotesQueNoCuadran()` lista los lotes que difieren **y** los que tienen producción pendiente,
del que más m³ tiene al que menos, cada uno con el botón que lo resuelve. Una barra sobre la
lista la anuncia sólo cuando hay algo: un renglón que siempre dice «0» enseña a no leerlo.

Esto obligó a agregar `produccionPendiente` a `cuadreSniffs()`. Un lote traído de la lista
**cuadra** en lo único comparable —el consumido— y sin embargo le falta declarar lo que
salió; sin ese dato la mesa lo dejaba afuera y la deuda quedaba invisible. Lo encontró la
prueba en el navegador, no el tipo.

### 3. La foto, como segundo intento explícito

`/api/admin/forestal/sniffs-ocr` lee la pantalla con el modelo de visión
(`lib/ai/vision-extract.ts`, el mismo de la GTF y la cubicación) y `detalleDesdeIA()` lleva
su respuesta a la MISMA forma que el parser local, re-mapeando el producto contra el catálogo
del LO-CTP: el catálogo es de SERFOR, no del que transcribe. Aparece como un enlace en el
error del OCR local —«¿Es una foto? Leerla con el modelo»— porque sube la imagen y cuesta por
llamada. Nunca es el primer intento.

⚠️ **Sin verificar de punta a punta**: en esta máquina no hay `OPENAI_API_KEY` ni
`ANTHROPIC_API_KEY`, así que la ruta devuelve 503 con su mensaje para el operador. Lo probado
es el mapeo (`detalleDesdeIA`, con tests) y que el botón sólo aparece tras un fallo local.

### 4. Una programación suelta también se pega

`pareceListaProgramaciones(texto, minimoFilas)`: el Ctrl+V global sigue exigiendo dos filas
con fecha para no confundir cualquier texto con una lista, pero dentro del modal de
importación alcanza una. Exigir dos programaciones para traer una era un candado sin motivo,
y lo destapó intentar importar una sola.

### 5. Pegar la captura de otro lote se avisa

Si el lote ya tiene un N° del SNIFFS y la captura trae otro, sale un aviso rojo: la especie y
el consumido pueden coincidir entre dos lotes de la misma jornada, el número no.

## Consecuencias

- El cuadre de un lote puede cambiar de N° si se pega un detalle de otro: se avisa, no se
  bloquea. La referencia es lo último que se leyó, a propósito.
- La mesa no distingue todavía entre «difiere porque falta declarar» y «difiere porque el
  SNIFFS dice otra cosa»: ambos son trabajo, y el detalle está en la fila.
