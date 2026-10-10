# ADR-379 — La devolución al proveedor mueve stock y tiene valor

- **Fecha:** 2026-08-12
- **Estado:** Aceptado
- **Área:** Compras · `SupplierReturn`, `SupplierReturnItem`, `InventoryMovement`

## Contexto

El módulo de Devoluciones a Proveedores registraba una nota y nada más. Tres
huecos encadenados, verificados en código y en la base:

**1. El ítem no sabe qué producto es.** `SupplierReturnItem` guarda `nombre`
(texto libre), `cantidad` y `unidad`. La pantalla ya usa un buscador contra el
inventario real, pero al elegir se quedaba sólo con el nombre:
`onSelect={(p) => actualizarItem(index, "nombre", p.name)}` — el `id` del
producto se descartaba en el momento exacto en que estaba disponible. Un typo
posterior desconectaba la devolución del producto para siempre.

**2. Devolver no movía el inventario.** Ninguna línea del módulo tocaba
`Product.stock` ni escribía en el kardex. Devolvías diez sacos vencidos y el
sistema seguía afirmando que los tenías: el stock quedaba inflado hasta que
alguien lo corrigiera a mano, sin rastro de por qué.

**3. No había plata.** Sin precio, la devolución no podía responder la pregunta
que el bodeguero realmente hace: *«¿cuánto me debe este proveedor?»*.

El momento para arreglarlo era ahora: en toda la base había **una devolución con
un ítem**, así que el cambio de schema no arrastra datos.

## Decisión

**1. El ítem guarda el producto y su valor.**

```prisma
model SupplierReturnItem {
  productId      Int?      // null = ítem escrito a mano (no vinculable al stock)
  precioUnitario Decimal?  @db.Decimal(12, 2)
}
```

Ambos opcionales a propósito: se puede devolver algo que no está en el catálogo
(un envase, una promoción armada). Lo que no está vinculado no mueve stock, y se
dice en pantalla en vez de fallar.

**2. La mercadería sale del stock al marcar «enviada», no antes.**

Mientras la devolución está `PENDIENTE` la mercadería sigue físicamente en el
depósito y el stock debe reflejarlo. Recién cuando se despacha —`ENVIADA`— sale.
El movimiento va en la misma transacción que el cambio de estado.

**3. El descuento es idempotente por dato, no por confianza.**

`SupplierReturn.stockAplicadoAt` (`DateTime?`) marca que el stock ya se movió.
No alcanza con «sólo descuento en la transición»: la API acepta cualquier estado
válido, así que `ENVIADA → RESUELTA → ENVIADA` descontaría dos veces. Este repo
ya se comió ese bug dos veces —en ventas y en ajustes de inventario—, y la
segunda vez el stock de una venta de 3 restaba 6. La marca en la fila es lo
único que lo vuelve imposible.

**4. Tipo de movimiento propio: `devolucion_proveedor`.**

NO se reusa `devolucion`, que ya existe y significa lo contrario: es la
devolución de un CLIENTE, que **suma** stock. `app/api/inventory/kardex` la tiene
listada en `ENTRY_TYPES`. Reusar ese tipo habría hecho que el kardex contara como
entrada una mercadería que salió — el error más caro posible en un libro de
inventario.

**5. Lo que no se puede descontar se avisa, no se silencia.**

- Ítem sin `productId` o producto sin stock rastreado → no se mueve nada.
- Cantidad con decimales sobre un stock entero → se redondea y se avisa.
- Stock que queda negativo → se registra igual y se avisa. El kardex tiene que
  decir la verdad; un saldo negativo es justamente la señal de que el inventario
  ya estaba mal.

## Consecuencias

- Devolver mercadería deja de inflar el inventario en silencio.
- La devolución responde cuánto debe el proveedor, con el costo del producto al
  momento de registrarla (no el costo de hoy, que puede haber cambiado).
- El kardex explica la salida: tipo `devolucion_proveedor` y referencia a la
  devolución.
- La migración corre por SQL idempotente a través del pooler (`ADD COLUMN IF NOT
  EXISTS`), como manda la regla del proyecto: `prisma migrate` no corre contra
  pgBouncer.
- Regresión cubierta: que descuente **una sola vez**, que no toque productos sin
  vincular, y que el kardex lo cuente como salida.

## Alternativas consideradas

- **Descontar al registrar la devolución.** Más simple, pero descuenta
  mercadería que sigue en el depósito: entre que se anota y se despacha, el stock
  mentiría en la otra dirección.
- **Reusar el tipo `devolucion`.** Un valor menos, pero rompe la lectura del
  kardex y mezcla dos hechos opuestos del negocio.
- **Guardar el precio de venta en vez del costo.** Al proveedor se le reclama lo
  que costó, no lo que se iba a ganar.

## Referencias

- Reporte de QA del módulo Compras, 2026-08-12
- ADR-377 — la orden de compra guarda el papel y el flete (costo real de compra)
- `.claude/rules/db-classes.md` — migraciones por el pooler
