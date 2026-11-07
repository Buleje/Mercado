# ADR-507 — Revendedoras: un grupo de precio con reglas, para todos los negocios

- **Estado:** aceptado (2026-10-20). Sin schema: usa `Customer.listaPrecio` y `Settings.featureFlagsJson`.
- **Pedido por:** Brandon (20-10): «si hay cosas que no se pueden poner porque no hay los módulos, quiero que las crees; eso aplicará a todos los panel admin». Fuente: manual de Musa §10 (qué se acumula) y §11 (red de revendedoras).

## Decisión

1. **Quién es revendedora:** una clienta con `Customer.listaPrecio = "revendedora"` (el «grupo de precio» que la ficha ya tenía: general · mayorista · especial). No hay tabla nueva ni segunda lista que se desincronice. La fecha en que se la marcó vive en `featureFlagsJson.revendedorasAltas[customerId]` (sólo informa «sin crédito hasta…»; si falta, no se muestra).
2. **Reglas del negocio** en `featureFlagsJson.revendedoras` (se escribe con `SettingsDB.pisarClavesFlags`, una sentencia): `activo`, `niveles` (1-4; el primero desde S/ 0; cada nivel con más compras da igual o más descuento), `pedidoMinimo`, `envioGratisDesde` (null = nunca gratis), `margenMinimo`, `categoriasSinDescuento`, `mesesSinCredito`, `metaActivas`. Sin guardar valen los del manual de Musa con `activo: false`.
3. **Precio de revendedora** = precio único del catálogo × (1 − descuento del nivel), redondeado al céntimo, con dos topes:
   - **Ganancia mínima** (`margenMinimo`, Musa 30 % = «ninguna venta deja menos de 30 %»): si el descuento deja (precio − costo) / precio debajo, se cobra el piso (`costo / (1 − margen)`, al céntimo hacia arriba) y se avisa. Si ni el catálogo llega, se cobra el catálogo.
   - **Los descuentos no se suman** (§10): en `categoriasSinDescuento` (Musa: «Kits y ofertas») la revendedora paga el precio de la oferta.
   - Sin costo anotado no se topa: se avisa «no se pudo revisar la ganancia».
4. **Nivel del pedido:** lo comprado en el **mes de Lima** (ventas del POS + pedidos no cancelados, por los últimos 9 dígitos del celular) **más este pedido contado al nivel que ya tenía**. Así, el pedido con el que pasa los S/ 600 ya sale al 25 % y el cálculo no oscila. «Desde» es ≥ (el manual dice «más de S/ 600»: con S/ 600,00 justos ya sube; diferencia de un céntimo).
5. **Pedido mínimo y envío gratis** se miden con lo que ella paga (el total con descuento), no con el precio de catálogo.
6. **Totales en el servidor:** `POST /api/admin/revendedoras {accion:"cotizar"}` lee precio y costo de la base; la pantalla sólo muestra lo que devuelve.

## Consecuencias

- Cualquier negocio lo activa desde Clientes › Revendedoras; las fichas existentes no cambian (ninguna tenía `listaPrecio` puesto al 20-10).
- **El POS todavía no aplica el precio solo**: `app/api/sales/route.ts` ya relee precios de la base y acepta `discount` por ítem; el siguiente paso es que, con `customerPhone` de una revendedora, el servidor ponga ese descuento con `cotizarPedido` (camino de dinero: va con revisión de `security`).
- La ganancia mínima es la del negocio para revendedoras; `margenesRebajas` (piso de rebajas) sigue siendo otra regla.
