# ADR-350 — La ficha de la guía: se revisa y se recibe en el mismo lugar

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · pestaña Ingresos · columna Acciones
- **Relacionado:** ADR-348 (el papel de la guía) · ADR-346 (la guía es la fila) · ADR-339 (los tres actos de la recepción) · ADR-336 (los bloques 13-34)

## El problema

Recepcionar era un botón suelto en la fila. El operador que quería mirar antes de
recibir —¿de qué título viene?, ¿quién la trae?, ¿cuántas piezas dice?— tenía que
abrir el papel imprimible, cerrarlo y volver a la tabla a apretar «Recepcionar».

**Recibir en otra pantalla que la que se revisa termina en guías recibidas sin
mirar.**

## La decisión

Un botón **«Ficha»** —primero en Acciones, antes que «Documento»— que abre la
guía entera en pantalla:

| Bloque | Qué muestra |
|---|---|
| Cabecera | estado · fecha de ingreso · folio del libro · volumen y pie tablar |
| **Qué falta** | los casilleros vacíos, nombrados: «Faltan 22 … se completan editando el ingreso; recepcionar no los exige» |
| Detalle del producto | un asiento por especie (37a-37g) con su volumen y su estado |
| Documento y origen | (2) a (12) |
| Proveedor / titular | (7) y (13) a (21) |
| Destinatario | (22) a (28) |
| Transportista y vehículo | (29) a (34) |
| Lista de trozas | (35): N°, codificación, código de planta, especie, medidas, volumen y **estado de recepción por pieza** |

Y en el pie: **Recepcionar guía**, con el contador `5/27 casilleros · 10 piezas ·
0/10 recibidas` al lado — el estado a la vista en el momento de decidir.

Cuatro reglas, todas del mismo principio: **lo que falta se ve faltando**.

- **Las secciones vacías se muestran vacías.** Un bloque que desaparece porque no
  tiene datos hace creer que la guía no lo necesita.
- **Por río se pide matrícula, no placa.** En la selva central buena parte de la
  madera sale por agua y una guía fluvial no lleva placa.
- **Una guía ya recibida lo dice, no esconde el botón** («Ya recepcionada»).
- **Al recibir, la ficha se cierra**: la guía deja la bandeja y se va al archivo;
  dejarla abierta mostraría un estado que ya cambió.

Del papel se vuelve con «Ver el documento», que **reemplaza** la ficha en vez de
apilarse: son dos vistas de lo mismo y dos modales encimados obligan a cerrar dos
veces.

Las secciones las arma `lib/forestal/guia-ficha.ts` (puro, 6 tests) y no el
componente: la ficha, el papel y el Excel tienen que nombrar los mismos
casilleros o el que revisa ve uno y el fiscalizador otro.

## Verificación

Camino completo en el tenant real con `QA-CUADRE-5467124`:

1. **Ingresos → Ficha**: abrió con «Pendiente · folio 30 · 5.0000 m³ · 2.119 pt»,
   el aviso de 22 casilleros faltantes, el detalle (1 especie, 10 piezas) y la
   lista de trozas con las 10 «sin fechar». Pie: `5/27 casilleros · 10 piezas ·
   0/10 recibidas`.
2. **Recepcionar guía** desde la misma ficha → se cerró y la guía salió de la
   bandeja.
3. **GTF ingresadas**: la guía en un bloque — «Validado · **10/10 piezas
   recibidas**» — con sus botones Ficha y Documento.
4. **Consumos**: el patio pasó de **34 a 44 trozas** (30 → 40 libres) y las piezas
   de esa guía ya aparecen para elegir.

Queda dicho: esa guía era de los datos de prueba del tenant `main` y **quedó
recepcionada** — no hay acción de «des-recepcionar», y fabricar una para revertir
un QA sería peor que dejar el dato.
