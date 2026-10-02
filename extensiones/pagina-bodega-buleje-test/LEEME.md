# «Buleje Beauty» — página propia (`pagina-bodega-buleje-test`)

La página pública **entera** (`/t/<negocio>`) de **un solo negocio** (ADR-458): una tienda de
salón de belleza y cosmética capilar. El `id` está asignado en la base (`TenantPieza`): no cambiarlo.
Si algo falla al dibujarse, el navegador recarga la página general (`?sinPiezas=1`).

## Qué se ve (de arriba abajo)
Franja de anuncios · barra pegajosa (logo, buscador, reservar, cuenta, bolsa) · menú de categorías ·
portada en carrusel (3 anuncios grandes) · Novedades · Promociones (1 grande + 2 apiladas) y
«Ofertas de la semana» · Favoritos de las estilistas · Nuestras líneas (foto + productos) · banner
oscuro de un servicio · categorías en círculos · servicios reservables por WhatsApp · beneficios · pie.

## El resto de la tienda (ADR-460)
La misma pieza **viste toda la tienda del negocio**, no sólo la portada:
- **Marco** (`Marco.tsx`): el layout de la tienda pone la franja, la barra, el menú, el pie y la bolsa del
  salón en el catálogo, la ficha, la cuenta, «Mis pedidos», los legales y el checkout. La paleta llega en dos
  niveles (`tema.ts`): lo de esta carpeta, dentro de `[data-pagina]`; lo demás (cuenta, checkout…), con los
  tokens globales y un acento vino legible con texto blanco.
- **Catálogo propio** (`Catalogo.tsx`, `/t/<negocio>/tienda`): SÓLO las categorías del salón; título serif,
  píldoras con cuántos hay, ordenar, sólo ofertas, línea y disponibles (en el celular, en una hoja desde
  abajo), la grilla con las mismas tarjetas, los servicios para reservar por WhatsApp y los beneficios.
  Todo el estado va en la URL: `?q=` `?categoria=` `?oferta=1` `?orden=` (destacados · precio-asc ·
  precio-desc · descuento · nuevos) `?marca=` `?disponibles=1` (`filtros.ts`; lo inválido vuelve al defecto).
- Si el marco falla, se ve el encabezado y el pie generales; si el catálogo falla, recarga con
  `?sinPiezas=1` y se ve el catálogo general.

## Archivos
| Archivo | Qué es |
|---|---|
| `servidor.tsx` | `Pagina()` devuelve al instante un `<Suspense>`; los datos se leen adentro (el tope de 2 s nunca salta por la base). Suma `marco` y `Catalogo` |
| `PaginaSalon.tsx` | arma las secciones de la portada + JSON-LD `HairSalon` + esqueleto de carga |
| `Marco.tsx` | el marco del resto de la tienda: tema, encabezado (con su esqueleto), pie y bolsa |
| `Catalogo.tsx` · `CatalogoCliente.tsx` | el catálogo propio: lectura en el servidor, filtrar/ordenar al instante en el navegador |
| `Pildoras.tsx` · `Controles.tsx` · `FranjaServicios.tsx` | píldoras de categoría y «filtrando por», ordenar/filtrar (hoja en el celular), servicios del catálogo |
| `filtros.ts` | los filtros de la URL: leer (Zod), escribir, buscar sin tildes («queratina» = «keratina»), ordenar y contar |
| `anuncios.ts` | **lo que cambia el dueño sin tocar componentes**: franja, portada, promos, líneas, banner, beneficios, categorías (con su bajada del catálogo), búsquedas sugeridas |
| `datos.ts` | lecturas por DB classes con `ctx.tenantId`: `cargarMarco` (liviana: ajustes y categorías) y `cargarVitrina` (productos, visibilidad, historial de precios) |
| `tema.ts` | paleta (`--bb-*`) y tokens del DS re-teñidos, claro y oscuro, en dos niveles; única fuente de color |
| `destinos.ts` | a dónde lleva cada botón (catálogo y sus filtros, secciones de la portada, WhatsApp, bolsa) |
| `Encabezado` · `CampoBuscar` · `FranjaAnuncio` · `Portada` · `Promos` · `Colecciones` · `Salon` · `Categorias` · `Pie` | secciones |
| `TarjetaProducto` · `BotonAgregar` · `Carril` · `Bolsa` · `Cajon` · `estado-bolsa` · `Suscripcion` · `ui` | piezas chicas |

## Reglas que esta página cumple (no romperlas al editar)
- **Nada de precios escritos a mano.** Precio, «antes» y % salen de la base: el «antes» es el último
  cambio del historial de precios (`PriceHistory`) que dejó el precio de hoy. `{descuento}` en un texto
  de `anuncios.ts` se llena con el mayor % real del grupo; sin rebaja, ese texto no sale.
- `{pagos}` = los medios de pago prendidos en Ajustes (hoy en `main`: sólo efectivo contra entrega).
- Sólo se muestran las categorías de `CATEGORIAS` (+ «Servicios de salón»): el resto del catálogo de
  `main` (la bodega de prueba) sigue en el catálogo, no acá.
- El carrito es **el de la tienda** (`CartProvider`, mismo guardado por negocio). En la portada (que vive
  fuera del layout de la tienda) la bolsa trae su `CartProvider` y «Finalizar compra» lleva al catálogo con
  la bolsa abierta (`?carrito=abrir`); en el resto usa el del layout (NUNCA un segundo) y «Finalizar compra»
  abre el checkout de siempre ahí mismo. La bolsa se abre con su propio estado (`estado-bolsa.ts`), no con
  el `isOpen` del carrito: la cuenta monta además su cajón general con ese `isOpen`.
- Un **servicio** del salón no va al carrito: se reserva por WhatsApp con el mensaje armado.
- Encabezado y pie salen en todas las páginas: anclas con ruta completa (`/t/<negocio>#servicios`) y, fuera
  de la portada, el logo no es el `<h1>`.
- WhatsApp: `Mi Tienda → Contacto` (o el teléfono del negocio). Sin número, el botón abre WhatsApp con
  el mensaje armado y la persona elige el chat. **`main` hoy no tiene número cargado.**
- Fuente de títulos: Instrument Serif (la que el sitio ya precarga). No meter `next/font` acá: su hoja
  de `@font-face` se cuela en todas las tiendas `/t/<negocio>` (ver `tema.ts`).

## Catálogo de demostración (negocio de prueba `main`)
`scripts/demo-salon/`: `catalogo.mjs` (24 productos + 8 servicios, marcas inventadas) ·
`generar-imagenes.mjs` (SVG originales en `public/demo/salon/`: foto de estudio + `-recorte` para
banners) · `sembrar.mjs` (crea por la API del panel con el login de QA, baja el precio de los rebajados
con PUT para que quede el historial; idempotente: lee lo que existe en la base, sólo lectura).
```
node scripts/demo-salon/generar-imagenes.mjs
node -r dotenv/config scripts/demo-salon/sembrar.mjs dotenv_config_path=.env.local [--seco] [--nombre "…"] [--descripcion "…"]
```

## Imágenes
- **Productos y servicios**: SVG propios (`public/demo/salon/*.svg`, ~2 KB c/u). Sin marcas de terceros.
- **Fotos de ambiente**: Unsplash, [licencia Unsplash](https://unsplash.com/license) (uso comercial
  gratis, sin atribución obligatoria). Elegidas sin logos ni marcas a la vista; las 7 respondieron 200
  el 01-10-2026. Se sirven por `next/image` (en desarrollo sin optimizar).

| Dónde | Foto (images.unsplash.com/photo-…) |
|---|---|
| Portada 1 | `1500917293891-ef795e70e1f6` — cabello ondulado, pared rosa |
| Portada 2 | `1519699047748-de8e457a634e` — cabello rizado, fondo nude |
| Portada 3 | `1521590832167-7bcbfaa6381f` — salón con sillones rosados |
| Línea Buleje Pro | `1522337360788-8b13dee7a37e` — cabello largo de espaldas |
| Línea Selva Botánica | `1617897903246-719242758050` — gotero de aceite y eucalipto |
| Banner oscuro | `1634449571010-02389ed0f9b0` — lavado en el salón |
| Servicios | `1562322140-8baeececf3df` — estilista con secadora |

Descartadas por mostrar marcas: `1526947425960`, `1556228578`, `1608248597279`, `1600948836101`,
`1605497788044`, `1522338242992`, `1527799820374`, `1580618672591`.
