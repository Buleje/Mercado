# ADR-376 — Se repone lo que rota, no lo que falta para el tope

- **Estado:** aceptado
- **Fecha:** 2026-08-10
- **Ámbito:** `lib/compras/reorden.ts`, `lib/db/compras-sugerencias.db.ts`, `app/api/compras/sugerencias/`, `components/admin/compras/SugerenciasCompraTab.tsx`, `prisma/schema.prisma` (`Supplier.leadTimeDias`)

## Contexto

La pestaña Sugerencias decía «52 productos necesitan reposición · 944
unidades». Medido contra los datos del tenant en la misma corrida:

| | |
|---|---|
| Productos sugeridos | **52** |
| Con venta diaria > 0 | **0** |
| Última venta registrada | 2026-07-08 (hace 33 días) |
| Costo estimado mostrado | «—» (ningún producto tenía precio) |

La regla era `stock < (stockMax ?? stockMin×3 ?? 10)`: **rellenar hasta el
tope**. *Fideos Don Vittorio* tenía 80 unidades, mínimo 15 y `stockMax` 100, así
que la pantalla proponía comprar 20 más de algo que nadie compró en un mes. Una
lista de compras de mercadería parada, presentada como recomendación.

Cuatro fallas más, todas del mismo origen —el criterio no miraba el negocio:

1. **La velocidad de venta dividía siempre entre 30.** Un producto agotado 25 de
   esos días parecía el que menos se vendía, cuando era el que más falta hacía.
2. **No descontaba lo que ya estaba pedido.** Las órdenes abiertas no existían
   para el cálculo, así que proponía pedir de nuevo lo que venía en camino.
3. **No sabía cuánto tarda cada proveedor.** Sin lead time no hay punto de
   reorden: «me quedan 5» no se puede traducir a «pedí hoy».
4. **Agotado (`stock ≤ 0`) caía en URGENTE**, por debajo de un producto que
   todavía tenía tres días de stock.

## Decisión

**La regla es la rotación:**

```
punto de reorden = venta diaria × (días que tarda el proveedor + colchón)
```

Se repone lo que va a faltar **antes de que llegue el pedido**. Todo lo demás
sale de ahí:

| Concepto | Cómo se resuelve |
|---|---|
| Venta diaria | `vendido ÷ días CON stock` (del kardex, `InventoryMovement.newStock`) |
| Disponible | `stock + en tránsito` (órdenes `pendiente`) |
| Lead time | `Supplier.leadTimeDias` declarado, si no el **promedio derivado** de `createdAt → deliveryDate` de sus órdenes recibidas, si no 7 |
| Colchón | 3 días |
| Cantidad | cubrir el doble de la ventana de reposición — pedir justo el punto de reorden obliga a pedir otra vez al día siguiente |
| Urgencia | agotado → CRÍTICO · no llega a tiempo → CRÍTICO · se acaba en la cobertura → URGENTE · resto → PLANIFICAR |

**Lo que no rota se informa, no se sugiere.** Un producto sin una sola venta en
la ventana sale en `sinRotacion` con su exceso sobre el mínimo: «no compres
esto» también es información, y el exceso es plata inmovilizada. En el tenant
real son los 52.

**La regla vive en `lib/compras/reorden.ts`**, fuera del handler: decide si el
negocio gasta plata y tiene que poder probarse sin levantar el endpoint. 12
tests, uno por cada error que cometía la versión anterior.

**La ventana es configurable** (`?dias=`, 7–365, default 30). Un almacén
estacional necesita mirar más atrás para que la rotación signifique algo.

**La pantalla dice lo que no pudo saber.** Si falla la consulta de tránsito o la
del historial de compras, se avisa en vez de devolver una lista que se lee como
completa.

## Consecuencias

- Medido después del cambio, mismo tenant: **0 sugerencias, 52 sin rotación**.
  La pantalla pasó de proponer una compra de 944 unidades a decir «nada que
  reponer» y mostrar qué hay parado. Es el resultado correcto para un negocio
  sin ventas en 33 días.
- «Nada que comprar» dejó de ser un `return` temprano: escondía la lista de lo
  que no rota justo cuando era la única información que quedaba.
- Al crear órdenes se avisa cuántas van **sin precio** (entraban con
  `unitCost: 0`, y ese cero viajaba al Historial de Gastos y al P&L como una
  compra real) y cuántas quedaron **sin cuenta por pagar** (el `Payable` se
  creaba fire-and-forget y su error se tragaba en un `console.warn`).
- `getUltimaCompraPorProducto` usa `distinct` + `take`: traía todos los
  `PurchaseItem` del tenant y filtraba en memoria.
- **Pendiente:** el tránsito sólo cuenta órdenes `pendiente`. Las `parcial` ya
  trajeron algo, pero `PurchaseItem` no guarda cuánto se recibió por línea;
  darlas por pendientes enteras sobreestimaría y haría comprar de menos.
  Registrar la recepción por línea es lo que destrabaría contarlas.

## Alternativas descartadas

- **Mantener `stockMax` y sólo filtrar los de venta cero.** Tapa el caso más
  visible y deja el criterio equivocado: un producto que se vende 10/día y otro
  que se vende 0,1/día seguirían midiéndose contra el mismo tope fijo.
- **Pedir el lead time como dato obligatorio.** Nadie lo carga. Derivarlo del
  historial usa un dato que la base ya tenía y que nadie miraba.
- **Media móvil o suavizado exponencial** para la venta diaria. Más preciso con
  series largas; con 30 días y un catálogo de bodega agrega complejidad que no
  cambia la decisión.

## Referencias

- ADR-374 — la plantilla de gasto fijo no es plata gastada. Mismo patrón: un
  número que la pantalla afirmaba sin que nadie lo hubiera verificado.
- `.claude/rules/verificacion-de-verdad.md` §5 — los gates estáticos pasaban en
  verde con las 52 sugerencias falsas: era un bug de semántica de datos.
