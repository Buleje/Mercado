# «Musa» — página propia (`pagina-musa`)

La página pública **entera** (`/t/musa`) de **un solo negocio** (ADR-458): Musa, belleza profesional en
Ciudad Constitución (Pasco). Lema: «Belleza profesional, cerca de ti». Nació como copia de «Buleje Beauty»
(`pagina-bodega-buleje-test`, la de `main`) el 09-10-2026 y se separó: lo que cambies acá no toca aquella.
Asignada al negocio `musa` por `PUT /api/superadmin/piezas/asignacion` (tabla `TenantPieza`).

## Qué se ve (de arriba abajo) — portada del 11-10, «más general y más creativa»
Barra de bienvenida fija de 1 línea (preventa 10 % mientras dura · envío gratis en Constitución; sin rotar) ·
barra pegajosa (sello, buscador, «Asesoría», cuenta, bolsa) · menú · **héroe único** («Cuidado de salón, *cerca de
casa*», 1 botón «Comprar ahora», la vitrina: arco nude con repisa y 4 envases de las 3 líneas, sello «Kits desde S/ X»)
· **5 círculos** (Rostro coreano, Cabello, Cuerpo, Kits, Asesoría gratis) · **Tu rutina coreana en 3 pasos** (Limpia →
Trata → Protege, con «Agregar» y el KT02 al pie) · **Kits que ahorran** (`#ofertas`, carril + franja de la campaña de
Navidad) · **Encuentra lo tuyo rápido** (pestañas «Menos de S/ 50» / «Todo Musa» / «Favoritos de Drucila» si el
panel marca alguno) · **¿Qué quieres mejorar?** (`#mejorar`, 10 botones compactos) · **Compra tranquila** (3 señales del
manual, pagos y la garantía en un desplegable) · pie con el boletín. Medido: 9,6 → 5,4 pantallas a 1280 px.
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

## Identidad (`tema.ts`, única fuente de color y fuente)
Paleta del manual: Nude #D9B8A3 · Negro #1A1A1A · Hueso #F7F3EF · Acento #8A6F5E · Cacao #2E2421 → tokens
`--mu-*` y los del DS re-teñidos, claro y oscuro. El acento del manual da 4,2:1 sobre hueso: para texto chico va
`--mu-acento-tinta` (#735b4c, 5,7:1). Letras (`letras.ts`): par **A = Cormorant Garamond 600 + Jost** (74 KB, antes 141), auto-alojadas en
`public/fonts/musa/` con su `@font-face` DENTRO del `<style>` de la página. Para comparar: `/t/musa?letras=b`
(Playfair Display + Poppins, la del manual) o `?letras=c` (Fraunces + Plus Jakarta Sans); al elegir, borrar los otros
dos pares y sus archivos. Great Vibes (script) ya no sale en la portada ni en el título del catálogo. En «Buleje Beauty»
Cormorant «falló» porque se cargó con `next/font` desde la pieza y su hoja se colaba en todas las tiendas
`/t/<negocio>`; así no pasa (sólo las páginas de Musa la piden). No usar `next/font` acá.

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
