# ADR-420 — Los modales del panel se comportan como ventanas

- **Fecha:** 2026-09-15
- **Estado:** aceptado — `AdminModal` (167 llamadores) y los modales a mano del libro forestal; los ~95 restantes
  escritos a mano quedan pendientes y se cablean con el mismo hook
- **Pedido por:** Brandon — «*quiero que implementes estas funciones importantes, que los modales en general en todos
  tengan estas funciones: que se puedan mover como una ventana arrastrable, achicarlos y agrandarlos como ventana,
  también opción de fijarlos para trabajar sin el problema que se oculta al presionar fuera del modal*».

## Contexto (medido el 2026-09-15)

| Qué | Cifra |
|---|---|
| Modales que usan `AdminModal` (Radix Dialog) | **167 archivos** |
| Modales escritos a mano, con su propio `role="dialog"` | **103** (19 forestal · 33 admin · 10 documentos · 8 POS…) |
| De esos, los que ya llaman a `useModalAccesible` | **99** — el punto de enganche único que permitió no tocar 99 archivos |
| Modales a mano del forestal que cierran al tocar fuera | **1 de 8** (`Anexo04Campos.tsx:164`) |

O sea: el «se oculta al presionar fuera» que duele es el de **Radix**, que cierra por defecto. Y el caso de uso real
es «Producir sin lote»: ocupa el 96 % del alto, y mientras se cubica hay que mirar la tabla de producción de atrás —
qué corrida se declaró ayer, qué permiso toca. Hasta ahora había que cerrar, mirar y volver a abrir, perdiendo lo
cargado a medio dictar.

## Decisión

Un hook, `hooks/use-ventana-de-modal.ts`, que sirve a las dos poblaciones:
- **`AdminModal`** recibe `ventana?: boolean | OpcionesVentana` y reparte el `estilo`;
- **un modal a mano** le pasa el `ref` que ya tiene y el hook escribe sobre ese elemento, sin tocar su markup.

### Mover
Pointer Events con `setPointerCapture` (soltar fuera de la ventana no deja el modal pegado al cursor). No arrastra si
el gesto nació en un `button`, `input`, `select`, `textarea` o `[role=button]`: el header tiene la X y otros
controles. Teclado: flechas de a 16 px, 1 px con Shift, y Escape durante el arrastre cancela sin cerrar el modal.

El desplazamiento va como custom properties (`--ventana-x/y`) y no como `transform` crudo, porque las variantes
centradas de `AdminModal` **ya usan** `translate(-50%, -50%)` y pisarlo las descoloca.

### Achicar y agrandar
Tirador en la esquina inferior derecha. `width`/`height` inline con `maxWidth/maxHeight: none` — sin eso el
`max-w-*` de la variante recorta el crecimiento (medido: `maxWidth` computado se quedaba en 512 px).

**El tope de posición cuida las dos puntas.** Deja 48 px del header siempre a la vista, y además el borde inferior a
24 px del fondo cuando el modal cabe en la pantalla: medido en «Producir sin lote» (912 px de alto en 950),
arrastrarlo 200 px hacia abajo dejaba el tirador en y = 968, fuera de la vista, y el modal quedaba imposible de
achicar justo cuando más falta hacía.

### Fijar
Es la pata que pidió Brandon con nombre propio. Con el modal fijado:
- el clic fuera **no cierra** (Escape y la X sí, siempre: fijar no puede dejar a nadie encerrado);
- el velo deja de tapar. Radix apaga los clics de toda la página (`body { pointer-events: none }`) y los modales a
  mano pintan su propio `div.modal-backdrop`: **se apagan los dos** y el diálogo se enciende (`pointer-events: auto`),
  o heredaría el `none` del padre.

Medido con el modal fijado y achicado a 471 × 272: `elementFromPoint` sobre la pantalla de atrás devuelve
`DIV.space-y-3` —el contenido real— y no el velo. Sin ese segundo arreglo, «fijar para seguir trabajando» dejaba
mirar pero no tocar, que es la mitad del pedido.

### Dónde NO
- **Móvil (< 640 px)**: las variantes centradas son bottom-sheet; no se dibuja ningún control ni tirador.
- **`fullscreen` y `side`**: no son ventanas, son pantallas.
- **`centered-sm`**: confirmaciones de 24 rem («¿Borrar esto?») que se leen y se cierran. Los dos controles le
  comerían 64 px al título en el modal más angosto del panel. Y para compensar esos 64 px donde sí van, el título
  lleva ahora `title` nativo: con `truncate`, el final de los títulos largos se perdía sin forma de leerlo.

### Memoria
Posición, tamaño y fijado se recuerdan por `claveMemoria` en `localStorage`, siempre dentro de `try/catch` y
descartando lo que no entra en la pantalla actual. Cerrar el modal **no** resetea la posición: volver a abrirlo lo
deja donde estaba, que es el punto de tener ventanas. «Restaurar» lo devuelve al centro y a su tamaño de siempre.

## Consecuencias
- Los 167 llamadores de `AdminModal` lo heredan sin cambiar una línea.
- Quedan ~95 modales a mano fuera del forestal. El cableado es mecánico (5 líneas por archivo) y el hook ya lo
  soporta; no se hizo en esta ronda para poder verificar en el navegador lo que sí entró.
- `AdminModal.tsx` creció a 397 líneas, por encima del estándar de ~300.
- Con el modal fijado, el scroll de la página de atrás **sigue bloqueado** (`react-remove-scroll` de Radix). Se puede
  tocar y leer lo que está a la vista, pero no scrollear hacia otra parte. Queda anotado.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Listeners de `mousemove` en `document` | Soltar el botón fuera de la ventana deja el modal pegado al cursor |
| Invertir/ocultar el overlay al fijar | El velo es de Radix en 167 casos y propio en 103: apagar `pointer-events` cubre los dos sin tocar el markup |
| Cablear los 99 modales a mano uno por uno | `useModalAccesible` ya tenía el `ref` de todos: un enganche en vez de 99 ediciones |
| `Dialog.Root modal={false}` al fijar | Cambia el modo en caliente y remonta el contenido: se pierde lo que el usuario estaba escribiendo |
