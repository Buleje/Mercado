# ADR-460 — La página propia viste toda la tienda

**Fecha:** 2026-10-02 · **Estado:** aceptado · **Extiende:** ADR-458 (página propia) y ADR-457 (enchufes y piezas) ·
**Pedido de Brandon (02-10):** *«vamos a mejorar el diseño de esta página http://localhost:3000/t/main que cada
sección aplique, que el catálogo sea coherente con ese diseño, bien hecho y elaborado»*.

## Contexto (medido el 02-10)
- La portada `/t/main` es la página propia «Buleje Beauty» (ADR-458): serif editorial, crema/rosa/vino, botones
  negros redondeados. Todo lo demás de la tienda vive en `app/(store)/**` con el **diseño general**:
  `StorefrontNavbar` + `TenantFooter` + el tema del editor (`ThemeInjector`: turquesa del negocio y Lato).
  Capturas «antes» en `reports/visual-verify/2026-10-02-tienda-main-antes/`.
- El catálogo `/t/main/tienda` mezclaba **88 productos en 22 categorías**: los 64 de la bodega de prueba
  (Abarrotes, Bebidas…) con los 24 del salón. La portada sólo muestra las 7 categorías del salón.
- `TenantStoreChrome` pone `data-store-chrome="tenant"` en `<html>` y `globals.css:414` cuadra TODO
  (`border-radius: 0 !important`): con eso el diseño redondeado del salón no se puede dibujar dentro del
  chrome general.
- La portada vive fuera del layout de la tienda (`app/t/[slug]/page.tsx`, con su propio `CartProvider`);
  el checkout (`CheckoutModal`) sólo existe dentro del layout `(store)`.
- En `(store)` el header `x-tenant-id` trae el **slug** (`/t/<slug>/…`), no el id: `resolverPiezas(slug)`
  devolvía 0 piezas en silencio.

## Decisión
1. **Se amplía el enchufe `tienda.pagina`, sin enchufes nuevos.** `PiezaPagina` suma dos partes opcionales
   (`extensiones/_contrato.ts`):
   - `marco?({ ctx, opciones }) → MarcoTienda { tema, encabezado, esqueletoEncabezado, pie, flotantes? }`,
     **síncrona**; cada parte es un `ReactNode` que lee sus datos adentro.
   - `Catalogo?({ ctx, opciones, searchParams })`, con las mismas garantías que `Pagina`.
2. **Un ayudante decide** (`lib/extensiones/pagina-propia-tienda.ts`, `server-only`, `cache` de React):
   `paginaPropiaDeLaTienda()` → `{ piezaId, ctx, opciones, pieza } | null`. Resuelve el negocio por id **o**
   slug (`findTenantByIdOrSlug`) antes de buscar piezas; `null` si no es tienda individual, no hay página
   propia, o su código tira o pasa 2 s. `marcoDeLaTienda()` atrapa un `marco()` que tira.
3. **El layout de la tienda** (`app/(store)/layout.tsx`): con marco → `tema`, `encabezado` dentro de
   `BordeDePieza` (respaldo `StorefrontNavbar`, mientras carga `esqueletoEncabezado`), las páginas, `pie`
   (respaldo `TenantFooter`), `StoreClientShell liveChat={false}` (checkout y modales de pedido de siempre),
   `flotantes`, `QuickAddModal`, `OrderSuccessModal`. **Sin** `TenantStoreChrome` ni `StoreFloatingWidgets`,
   y `StoreProviders temaDelEditor={false}` (no monta `ThemeInjector`: ni Lato ni el turquesa). Sin marco,
   el árbol **exacto** de antes. La consulta arranca en paralelo con las demás lecturas del layout.
4. **El catálogo** (`app/(store)/tienda/page.tsx`): si la página propia trae `Catalogo`, se dibuja ése
   (`lib/extensiones/CatalogoPropio.tsx`: tope de 2 s, `BordeDePieza` + `RecargarSinPiezas`; `?sinPiezas=1`
   → el general). La búsqueda sólo se espera en esa rama.
5. **Utilidades `*-primary` con el color de la marca** también bajo `[data-marco]`
   (`globals.css`: `:is([data-store-chrome="tenant"], [data-marco])`, sin los bordes rectos), más los
   degradados `from-primary`/`to-primary-dark` del checkout sólo bajo `[data-marco]`. El layout pone
   `data-marco` en un envoltorio `display: contents` (llega en el HTML) y `MarcoEnElDocumento` lo copia a
   `<html>` para lo que se monta en portal (checkout, modales).
6. **La pieza «Buleje Beauty»** (`extensiones/pagina-bodega-buleje-test/`): `Marco.tsx`, `Catalogo.tsx` +
   `CatalogoCliente.tsx` (+ `Pildoras`, `Controles`, `FranjaServicios`), `filtros.ts` (Zod `safeParse` por
   parámetro: `q`, `categoria`, `oferta=1`, `orden`, `marca`, `disponibles=1`; inválido → defecto). La
   bolsa se parte: `ProveedorBolsa` (portada, con su `CartProvider`) y `PartesBolsa` (marco, con el del
   layout — **nunca un segundo `CartProvider`**); «Finalizar compra» en el marco llama `openCheckout()`.
   El cajón usa un estado propio (`estado-bolsa.ts`), no el `isOpen` del carrito: la cuenta y «Mis pedidos»
   montan su `CartSidebar` con ese `isOpen` y se abrían los dos. `tema.ts` en dos niveles: global (`:root`,
   sólo en las páginas de este negocio) con un acento vino **legible con texto blanco** en claro (9,2:1) y
   oscuro (4,6:1), y `[data-pagina]` con el rosa claro sólo para lo de la carpeta. `cargarSalon` se parte en
   `cargarMarco` (liviana: ajustes y categorías) y `cargarVitrina` (precios e historial).
7. **Alcance**: cuenta, pedidos, legales, ficha y checkout reciben **sólo el marco y los tokens** (no se
   reescriben). El código del checkout (`components/checkout/**`, `cart-context`) no se toca.

## Consecuencias
- Las otras tiendas no cambian: DOM armado de `/t/<slug>`, `/tienda`, `/cuenta` y `/terminos` en 5 negocios
  sin página propia, **0 líneas de diferencia** contra la base (ruido entre dos corridas de la base: 0).
  La ubicación de `<title>/<meta>` (en `<head>` o al final de `<body>`, «streaming metadata» de Next 16) varía
  sola en la base y con el cambio (5/30 y 4/30 en `<body>`): se compara como conjunto.
- Una página propia que quiera marco escribe su encabezado y pie **para cualquier página**: anclas con la
  ruta completa (`/t/<negocio>#servicios`), el logo no es el `<h1>` fuera de la portada.
- Las pantallas generales (cuenta, checkout) se ven con la paleta del negocio pero conservan sus defectos
  propios: el panel del checkout en oscuro es blanco (`bg-white dark:bg-background`, y `bg-background`
  está horneado en blanco) — pendiente, zona de peligro.
- Al vestir la ficha apareció que caía ENTERA al error en todas las tiendas (`/reviews-detailed` responde
  `{ data, summary }` y el cliente guardaba `data`): se arregló el mapeo en `ProductDetailClient`.
- El cupón de bienvenida general (z 7000) tapaba «Finalizar compra» y «Ver N productos» en el celular: los
  overlays de la pieza van en la capa `z-system`.
- La paleta global vive en la pieza: un `--color-*` nuevo en `globals.css` que use la cuenta habrá que
  sumarlo a `CSS_GLOBAL` (pasó con `--color-card`: la cuenta salía azul pizarra en oscuro).

## Alternativas descartadas
- **Enchufes aparte** (`tienda.encabezado`, `tienda.pie`, `tienda.catalogo`): tres asignaciones que el
  superadmin tendría que mantener juntas para un mismo negocio; una página propia ya es exclusiva y es el
  lugar natural de su identidad.
- **Sólo `storeTheme`** (colores y fuente del editor): pinta el turquesa por el vino pero no cambia el
  encabezado, el pie, el catálogo mezclado ni los bordes cuadrados; y el editor no expresa «sólo las
  categorías del salón».
- **Copiar el layout de la tienda en la pieza**: duplicaría los proveedores (un segundo `CartProvider`
  agrava el ping-pong del carrito entre pestañas) y el checkout, y dejaría de recibir los arreglos del layout.
