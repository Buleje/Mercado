# «Buleje Beauty» — página propia (`pagina-bodega-buleje-test`)

La página pública **entera** (`/t/<negocio>`) de **un solo negocio** (ADR-458): una tienda de
salón de belleza y cosmética capilar. El `id` está asignado en la base (`TenantPieza`): no cambiarlo.
Si algo falla al dibujarse, el navegador recarga la página general (`?sinPiezas=1`).

## Qué se ve (de arriba abajo)
Franja de anuncios · barra pegajosa (logo, buscador, reservar, cuenta, bolsa) · menú de categorías ·
portada en carrusel (3 anuncios grandes) · Novedades · Promociones (1 grande + 2 apiladas) y
«Ofertas de la semana» · Favoritos de las estilistas · Nuestras líneas (foto + productos) · banner
oscuro de un servicio · categorías en círculos · servicios reservables por WhatsApp · beneficios · pie.

## Archivos
| Archivo | Qué es |
|---|---|
| `servidor.tsx` | `Pagina()` devuelve al instante un `<Suspense>`; los datos se leen adentro (el tope de 2 s nunca salta por la base) |
| `PaginaSalon.tsx` | arma las secciones + JSON-LD `HairSalon` + esqueleto de carga |
| `anuncios.ts` | **lo que cambia el dueño sin tocar componentes**: franja, portada, promos, líneas, banner, beneficios, categorías |
| `datos.ts` | lecturas por DB classes con `ctx.tenantId` (productos, visibilidad de Mi Tienda, historial de precios, ajustes) |
| `tema.ts` | paleta (`--bb-*`) y tokens del DS re-teñidos, claro y oscuro; única fuente de color |
| `destinos.ts` | a dónde lleva cada botón (catálogo `?q=` / `?categoria=` / `?oferta=1`, WhatsApp, bolsa) |
| `Encabezado` · `FranjaAnuncio` · `Portada` · `Promos` · `Colecciones` · `Salon` · `Categorias` · `Pie` | secciones |
| `TarjetaProducto` · `BotonAgregar` · `Carril` · `Bolsa` · `Suscripcion` · `ui` | piezas chicas |

## Reglas que esta página cumple (no romperlas al editar)
- **Nada de precios escritos a mano.** Precio, «antes» y % salen de la base: el «antes» es el último
  cambio del historial de precios (`PriceHistory`) que dejó el precio de hoy. `{descuento}` en un texto
  de `anuncios.ts` se llena con el mayor % real del grupo; sin rebaja, ese texto no sale.
- `{pagos}` = los medios de pago prendidos en Ajustes (hoy en `main`: sólo efectivo contra entrega).
- Sólo se muestran las categorías de `CATEGORIAS` (+ «Servicios de salón»): el resto del catálogo de
  `main` (la bodega de prueba) sigue en el catálogo, no acá.
- El carrito es **el de la tienda** (`CartProvider`, mismo guardado por negocio): «Finalizar compra»
  lleva al catálogo con la bolsa abierta (`?carrito=abrir`) y se paga por el flujo de siempre.
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
