# Logos oficiales de medios de pago

Dejá acá los **archivos oficiales** (brand kits) de cada medio de pago. El
componente `PaymentMethodIcon` (components/marketplace/PaymentIcons.tsx) los usa
automáticamente si existen, y si no, cae al arte custom (sin imágenes rotas).

## Archivos esperados (nombre EXACTO)

| Medio | Archivo | Fuente oficial |
|---|---|---|
| Yape | `yape.svg` | Brand kit de Yape (BCP) |
| Plin | `plin.svg` | Brand kit de Plin (consorcio Interbank/BBVA/Scotiabank) |

- **Formato:** SVG preferido (escala perfecto). Si solo tenés PNG, subilo como
  `yape.png` / `plin.png` y avisame para cambiar la extensión en el código.
- **Recorte:** el logo debe venir con su propio fondo/badge (cuadrado o con
  padding), porque se renderiza dentro de un cuadrito. Idealmente el "isotipo"
  cuadrado de marca (no el wordmark horizontal largo).
- Estos son marcas registradas de sus dueños; se muestran con fin nominativo
  ("aceptamos X"). Usá los assets oficiales que los propios proveedores publican
  para comercios.

Para sumar otro medio (ej. `tarjeta.svg`), agregá el archivo y su clave al set
`OFFICIAL_LOGOS` en `PaymentIcons.tsx`.
