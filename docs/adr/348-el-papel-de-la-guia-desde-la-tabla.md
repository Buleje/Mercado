# ADR-348 — El papel de la guía, a un click de la tabla

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · pestaña Ingresos · columna Acciones
- **Relacionado:** ADR-338 (la guía con la forma del papel) · ADR-346 (la guía es la fila) · ADR-336 (los bloques 13-34) · ADR-312 (un ingreso por especie)

## El problema

El visor de documentos ya existía y las dos hojas también —la GTF con sus
casilleros (2) a (40) y la Lista de trozas (ADR-338)—, pero llegar a ellas
dependía de dos cosas que fallaban seguido:

1. El botón sólo aparecía **si el ingreso traía la ficha de SERFOR**. Las guías
   cargadas a mano o importadas de un inventario —la mayoría del libro— no
   tenían papel que mirar.
2. Con la bandeja por guía (ADR-346), en una GTF de varias especies el botón
   quedaba escondido dentro del detalle desplegado.

## La decisión

### 1. «Documento» es una acción de la fila, siempre

En la columna Acciones, junto a Recepcionar y Validar. Abre el visor con las dos
hojas y sus botones de siempre: descargar PDF, imprimir, guardar en el
expediente.

Las piezas de la lista se piden **al abrir**, no en el listado: son de la hoja 2
y sólo hacen falta ahí. Si ese pedido falla, la GTF se abre igual — la guía no
depende de su lista.

### 2. Sin ficha de SERFOR, el papel se reconstruye del libro

`lib/forestal/ctp-gtf-desde-libro.ts` (11 tests) arma el mismo formato con lo que
el libro tiene: el titular y su título habilitante, los tres bloques del cuerpo
que el ingreso guarda desde ADR-336 (propietario, destinatario, transportista),
el detalle **(37) con una línea por asiento** —que es una por especie— y la lista
de trozas con las medidas del patio.

Cuatro reglas, todas del mismo principio: **ausente ≠ vacío, e inventado nunca**.

- **El emisor es el proveedor, no el aserradero.** En una guía de ingreso el
  titular del recurso es quien la emitió; poner ahí la razón social del CTP
  convertiría el respaldo de una compra en una guía propia.
- **La ARFFS va vacía.** El ingreso no la guarda y deducirla de la región es
  exactamente el dato que después nadie puede defender.
- **El recuadro de estado va en blanco.** Buleje no registra ante la autoridad:
  estampar «REGISTRADA» sin serlo es fabricar la constancia de un trámite.
- **(3) lleva la fecha de la GUÍA, nunca la del asiento.** Fechar un documento de
  la autoridad con el día en que alguien lo cargó al sistema es cambiarle la
  fecha a un papel oficial. Sin `gtfDate`, el casillero queda vacío.

El papel lo dice en la cara: sello **«Reconstrucción — del libro, no del
SNIFFS»** y, debajo, qué casilleros faltan y cómo completarlos (consultando la
guía desde el formulario de ingreso).

## Verificación

- **Con ficha** (`019-0000003`, 2 especies): abre la reproducción del SNIFFS con
  los casilleros (2)-(40), el detalle de las dos especies (Copaiba 9.065 +
  Sapotillo 4.874 = **13.939 m³**), el bloque «ESTADO: REGISTRADA · N° REGISTRO
  1-19-0313629» y la hoja 2 con las 4 piezas, sus dimensiones y el resumen por
  especie.
- **Sin ficha** (`001-0000201`): abre la reconstrucción — cabecera del proveedor
  con su RUC y su concesión `CON-25-UCA-0142`, (5) marcado en «Concesión», los
  casilleros que el libro no tiene en puntos suspensivos, el sello rojo y su hoja
  de 5 piezas.
