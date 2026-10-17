# «Musa» — página propia (`pagina-musa`)

La página pública **entera** (`/t/musa`) de **un solo negocio** (ADR-458): Musa, belleza profesional en
Ciudad Constitución (Pasco). Lema: «Belleza profesional, cerca de ti». Nació como copia de «Buleje Beauty»
(`pagina-bodega-buleje-test`, la de `main`) el 09-10-2026 y se separó: lo que cambies acá no toca aquella.
Asignada al negocio `musa` por `PUT /api/superadmin/piezas/asignacion` (tabla `TenantPieza`).

## Qué se ve (de arriba abajo) — portada del 11-10, «más general y más creativa»
Barra de bienvenida fija de 1 línea (preventa 10 % mientras dura · envío gratis en Constitución; sin rotar) ·
barra pegajosa (sello, buscador, «Asesoría», cuenta, bolsa) · menú · **héroe único** («Cuidado de salón, cerca de
casa», 1 botón «Comprar ahora» + el enlace «Kits desde S/ X», la vitrina: panel gris claro con 4 envases de las 3 líneas)
· **5 círculos** (Rostro coreano, Cabello, Cuerpo, Kits, Asesoría gratis) · **Tu rutina coreana en 3 pasos** (Limpia →
Trata → Protege, con «Agregar» y el KT02 al pie) · **Kits que ahorran** (`#ofertas`, carril + franja de la campaña de
Navidad) · **Encuentra lo tuyo rápido** (pestañas «Menos de S/ 50» / «Todo Musa» / «Favoritos de Drucila» si el
panel marca alguno) · **¿Qué quieres mejorar?** (`#mejorar`, 10 botones compactos) · **Compra tranquila** (3 señales del
manual, pagos y la garantía en un desplegable) · pie claro con el boletín. Medido: 9,6 → 5,4 pantallas a 1280 px.
Si el carrito rechaza un producto que ya no está en la tienda, sale «No pudimos agregar…» con WhatsApp
(`AvisoNoAgregado.tsx`, escucha `CARRITO_NO_AGREGADO` de `contexts/cart-context.tsx`): el botón nunca queda mudo.
Orden tomado de Natura/Sephora/Ésika (benchmark del 11-10). Sin «Más vendidos»: el manual prohíbe decir «el más
vendido» sin datos y el pedido por WhatsApp no deja ventas en el sistema.

## El pedido va por WhatsApp (decisión de Brandon, 09-10)
La bolsa **no usa el checkout ni crea un pedido** en el sistema. Su pie (`PedirPorWhatsapp.tsx`) pide nombre,
pueblo (Ciudad Constitución / Villa Rica / Oxapampa / Puerto Bermúdez / Otro) y forma de pago (Yape / Plin /
Transferencia / Contraentrega, esta última **sólo** con Constitución) y abre `https://wa.me/51921585006?text=…`.
El mensaje lo arma `armarMensajePedido` (`pedido-whatsapp.ts`, función pura, test
`__tests__/musa-pedido-whatsapp.test.ts`). El código de cada línea es el `barcode` del producto (MU001, KT02…)
y un producto con la etiqueta «Por encargo» suma «(por encargo: pago 100 % adelantado)». Los códigos viajan del
servidor (`cargarMarco().codigos`) para no depender de lo que guarda el carrito.

## Reglas que esta página cumple
- **Precios de la base**, nunca escritos a mano; `{descuento}` sólo con rebaja real del historial.
- **Preventa y «Por encargo» se piden sin existencias** (`datos.ts`: `stock` = null): no dicen «Agotado».
- Sin foto, la tarjeta y la bolsa muestran el **sello** con el código del producto (`Sello.tsx`).
- Voz: tuteo, «ayuda a», nunca «cura». Textos editables en `anuncios.ts` y `anuncios-ficha.ts`.
- WhatsApp: el de Ajustes/Mi Tienda si hay; si no, el de Drucila (`WHATSAPP_MUSA`).
- El resto de la tienda (catálogo, ficha, cuenta, legales) lo viste el **marco** (`Marco.tsx`, ADR-460).

## Identidad (`tema.ts`, única fuente de color y fuente) — minimalista desde el 16-10
Pedido de Brandon (16-10): «más minimalista, menos colores fuertes de la marca… como mi.com». Referencias: mi.com,
Aesop, The Ordinary. **Fondo blanco** (oscuro: casi negro cálido), **texto casi negro** y dos grises, **un solo gris
claro** para paneles y fotos (`--surface-sunken` = `--mu-cacao`), bordes finos (`--rule-soft`/`--rule-base`). El nude
del manual queda como **un acento apagado** (`--mu-acento-tinta`, 5,7:1) en pocos lugares chicos: rótulos «Te ayuda a» /
«Qué trae», flechas de enlaces, el camión del envío. Los nombres viejos (`--mu-rosa`, `--mu-oro`, `--mu-selva`,
`--mu-cacao`, `--mu-tinte-*`) siguen existiendo pero valen neutros: no reintroducir colores por sección.
Letras (`letras.ts`): **una sola sans** para títulos, textos, precios y botones; la jerarquía la dan tamaño y peso.
Par **A = Plus Jakarta Sans** (27 KB, variable 400-700). Para comparar: `/t/musa?letras=b` (Inter, la familia de la
letra de mi.com) o `?letras=c` (Manrope). La serif (Cormorant 600) vive **sólo en el sello completo del logo**.
Sin itálicas ni script (Great Vibes, Jost, Playfair, Fraunces fuera de la página; sus archivos siguen en
`public/fonts/musa/` porque `scripts/musa-tarjetas-compartir.mjs` usa Cormorant, Great Vibes y Poppins).
Las caras van auto-alojadas con su `@font-face` DENTRO del `<style>` de la página: con `next/font` la hoja se colaba
en todas las tiendas `/t/<negocio>` (medido 01-10). No usar `next/font` acá.

## Pautas (cómo agregar algo sin romper el estilo)
- **Botón**: `BOTON` (lleno, casi negro, `rounded-full`, 48 px de alto) para UNA acción por bloque; `BOTON_BORDE`
  (borde fino) para la segunda; el resto son enlaces con `mu-subrayado`. Sin degradés, sin `hover:scale`, sin sombra.
- **Tarjeta de producto**: sin borde, sin fondo, sin sombra; la foto sobre el gris claro (`aspect-square`, radio
  `--mu-radio-tarjeta`); debajo categoría y código en gris terciario, nombre, una línea de «ayuda a», precio y «Agregar».
- **Panel o aviso**: borde `--rule-soft` y radio de tarjeta; fondo blanco o el gris claro, nunca un color.
- **Título**: `TituloBloque` (`--mu-t-bloque`, peso 600) con una línea gris debajo si hace falta; rótulo arriba con
  `KICKER` (minúsculas, peso 500, gris). Nada en MAYÚSCULAS ni con `tracking` ancho; nunca itálica en un párrafo.
- **Tamaños**: cuerpo 16 px (`--mu-t-cuerpo`); nada visible bajo 14 px (`text-sm` es el piso; sin `text-xs`).
- **Espaciado**: secciones `py-12 sm:py-20`, separadas por una línea `--rule-soft`, no por bandas de color; ancho
  `ANCHO` (1280 px); entre tarjetas `gap-4 lg:gap-6`.
- **Color nuevo**: no. Si algo pide destacar, peso 600 o el acento apagado; los colores viven sólo en `tema.ts`.

## Archivos nuevos respecto de «Buleje Beauty»
| Archivo | Qué es |
|---|---|
| `pedido-whatsapp.ts` | pueblos, pagos, `pagosPara`, `armarMensajePedido` (pura) |
| `preventa.ts` | preventa de Navidad (16 nov, S/ 20, provincia 18 dic, entregas 24 dic), franja de campaña y `estadoProducto` (en stock / preventa / por encargo) — fechas del manual vigente, día de Lima |
| `PedirPorWhatsapp.tsx` | los 3 campos + el enlace a WhatsApp + la nota de envío (cliente) |
| `Sello.tsx` | el logo: aro doble, «MUSA» / «BELLEZA PROFESIONAL» en curva, «M» sobre nude |
| `Salon.tsx` | `Mejorar` (botones compactos) y `Confianza` (3 señales + pagos + garantía) |
| `Portada.tsx` | el héroe: título, botón y la vitrina con la repisa (envases recortados a su `ventana`) |
| `Circulos.tsx` · `RutinaCoreana.tsx` · `Kits.tsx` · `PorPrecio.tsx` + `Pestanas.tsx` | los bloques de la portada |
| `letras.ts` | los 3 pares de letras y `?letras=` |

Se quitaron `ProveedorTienda.tsx` y `CheckoutEnPortada.tsx` (el checkout). El resto (catálogo con filtros en la
URL, ficha, carril, ficha rápida, marco) es el de «Buleje Beauty» con la paleta y los textos de Musa: su detalle
está en el LEEME de `pagina-bodega-buleje-test`.

## Fotos
Ambiente: Unsplash (licencia Unsplash, sin marcas a la vista), las mismas ya revisadas en «Buleje Beauty»:
`1519699047748-de8e457a634e` (portada 1), `1617897903246-719242758050` (portada 2),
`1522337360788-8b13dee7a37e` (portada 3), `1500917293891-ef795e70e1f6` (diagnóstico).

Envases ilustrados (`public/musa/productos/<CÓDIGO>.webp`, 1200 px) en 3 anchos: `480/`, `800/` y el original;
`Ilustracion` los pide con `srcSet` + `sizes` (`anchosIlustracion`, `imagenes.ts`). Medido 11-10: la portada a
390 px bajaba 386 KB de envases de 1200 para huecos de 170 px; los 27 en 480 suman 184 KB. Si sumas un envase,
recorta sus dos copias (sharp: `resize(480)` y `resize(800)`, webp calidad 82) con el mismo nombre.

## Compartir (WhatsApp, Facebook, Instagram) — `compartir.ts`
Musa se vende pasando el enlace. La portada y el catálogo dan «Musa — Belleza profesional, cerca de ti», la
descripción del manual y la tarjeta `public/musa/og.jpg` (1200 × 630); `?categoria=Rostro` comparte esa
categoría. Cada ficha da la tarjeta de su producto (`public/musa/og/<CÓDIGO>.jpg`, sin precio: cambia). Las
genera `node scripts/musa-tarjetas-compartir.mjs [CÓDIGO]` (lee la base sólo para leer; si sumas un producto,
agrégalo a `CON_TARJETA`). La canónica y `og:url` usan el dominio con el que entró la petición
(`lib/seo/origen-de-la-peticion.ts`), nunca buleje.pe (no existe). En la ficha, «Compártelo con una amiga»
(`CompartirProducto.tsx`) abre el menú de compartir del celular o WhatsApp en la compu.

## Buscar por lo que quieres mejorar — `filtros.ts` (`NECESIDADES`)
«granitos», «acné», «ojeras», «cabello dañado», «sol»… traen los productos que su tarjeta de «¿Qué quieres
mejorar?» ya nombra (antes daban 0). Lo que Musa no vende («caspa», «canas») sigue sin resultados.
