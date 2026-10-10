# «Musa» — página propia (`pagina-musa`)

La página pública **entera** (`/t/musa`) de **un solo negocio** (ADR-458): Musa, belleza profesional en
Ciudad Constitución (Pasco). Lema: «Belleza profesional, cerca de ti». Nació como copia de «Buleje Beauty»
(`pagina-bodega-buleje-test`, la de `main`) el 09-10-2026 y se separó: lo que cambies acá no toca aquella.
Asignada al negocio `musa` por `PUT /api/superadmin/piezas/asignacion` (tabla `TenantPieza`).

## Qué se ve (de arriba abajo)
Franja (envío gratis, asesoría 921 585 006, diagnóstico de los sábados) · barra pegajosa (sello, buscador,
«Asesoría gratis», cuenta, bolsa) · menú (Cabello, Rostro, Cuerpo, Kits y ofertas, ¿Qué quieres mejorar?) ·
portada en carrusel (campaña Navidad, asesoría, cabello) · Lo nuevo · Promos/ofertas · favoritos de Drucila ·
**¿Qué quieres mejorar?** (10 necesidades → categoría o búsqueda) · banner del **diagnóstico gratis** ·
categorías · **Tu compra está protegida** + asesoría · beneficios · pie.

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
`--mu-acento-tinta` (#735b4c, 5,7:1). Fuentes: **Cormorant Garamond** (títulos) y **Poppins** (textos),
auto-alojadas en `public/fonts/musa/` con su `@font-face` DENTRO del `<style>` de la página. En «Buleje Beauty»
Cormorant «falló» porque se cargó con `next/font` desde la pieza y su hoja se colaba en todas las tiendas
`/t/<negocio>`; así no pasa (sólo las páginas de Musa la piden). No usar `next/font` acá.

## Archivos nuevos respecto de «Buleje Beauty»
| Archivo | Qué es |
|---|---|
| `pedido-whatsapp.ts` | pueblos, pagos, `pagosPara`, `armarMensajePedido` (pura) |
| `PedirPorWhatsapp.tsx` | los 3 campos + el enlace a WhatsApp + la nota de envío (cliente) |
| `Sello.tsx` | el logo: aro doble, «MUSA» / «BELLEZA PROFESIONAL» en curva, «M» sobre nude |
| `Salon.tsx` | `Mejorar`, `BannerOscuro` (diagnóstico) y `Protegida` |

Se quitaron `ProveedorTienda.tsx` y `CheckoutEnPortada.tsx` (el checkout). El resto (catálogo con filtros en la
URL, ficha, carril, ficha rápida, marco) es el de «Buleje Beauty» con la paleta y los textos de Musa: su detalle
está en el LEEME de `pagina-bodega-buleje-test`.

## Fotos
Ambiente: Unsplash (licencia Unsplash, sin marcas a la vista), las mismas ya revisadas en «Buleje Beauty»:
`1519699047748-de8e457a634e` (portada 1), `1617897903246-719242758050` (portada 2),
`1522337360788-8b13dee7a37e` (portada 3), `1500917293891-ef795e70e1f6` (diagnóstico).
