# ADR-430 — Precios por cliente, grupos de especies y vínculos del Directorio

- **Fecha:** 2026-09-22
- **Estado:** Aceptado (decisiones de Brandon del 22-09)
- **Ámbito:** Directorio forestal, tarifa de aserrío, cubicador, cobro y cuenta corriente, schema
- **Contrato:** `lib/forestal/precio-cliente.ts` (tipos, Zod y `precioDelCliente`), `lib/forestal/vinculos-parte.ts`, `cotizarAserrio` en `lib/forestal/tarifa-aserrio.ts`, `hooks/use-tarifas-cliente.ts`

## Contexto

Pedido de Brandon: en el Directorio, marcar a alguien como **cliente** y definir **a cuánto se le cobra el pie**, del servicio de aserrío o de la madera vendida; parámetros por tipo («comercial 0.50») y por especie («Tornillo 0.60», «Anacaspi 1.20»); dos modos, **Global** (toda especie a un precio) y **por grupos de especies** que él arma, con lo demás al general; que al cubicar, **elegir el cliente ponga solo ese precio**; y **vincular** el cliente con otro del Directorio (un permiso o un tercero) y con su **cuenta y saldo**.

Medido antes de diseñar (tenant real Blas): 6 partes (4 proveedores, 2 transportistas, 1 conductor; 1 multi-rol), 15 corridas sin dueño, 0 cobros, 0 movimientos de cuenta, tarifa de la planta vacía, 0 despachos, 13 de 15 corridas en Tornillo. No hay datos que migrar. Encontrado de paso: el dueño de la madera se daba de alta como «proveedor»; el cargo de aserrío no copiaba el permiso (`contratoId`) y no entraba al balance del permiso; los precios por especie del cubicador no tenían editor y su cálculo estaba duplicado.

## Decisión

1. **Papel «cliente»** en `ROLES_PARTE` (una parte puede tener varios papeles).
2. **Trato de precio por cliente** en una tabla nueva `ForestParteTarifa` (una fila = una versión, por cliente, servicio `aserrio|venta` y fecha de vigencia). «Global» es tener sólo `basePt`; «Por grupos» es tener grupos con `basePt` como «lo demás». Sin columna de modo.
3. **Grupos de especies de la planta** en el catálogo de especies (KV, ADR-410), cada especie en UN solo grupo (decisión 2). La tarifa de la planta suma un precio por grupo opcional.
4. **Orden del precio** (una sola función, la misma en la pantalla y el servidor):
   1. precio a mano (trato de esa corrida, ADR-429);
   2. trato del cliente: especie → grupo → tipo → su global (decisión 3), **sin recargos de la planta** (decisión 1);
   3. tarifa de la planta: especie → grupo → general, con sus ajustes por tipo y largo;
   4. sin precio no se cobra (nunca S/ 0).
5. **Vínculos** parte↔parte o parte↔permiso en `ForestParteVinculo` (uno de los dos, nunca ambos). La deuda va **siempre al cliente** (decisión 4); el cargo lleva el permiso de la corrida. La ficha muestra el saldo propio y el de sus vinculados, sin mezclar libretas.
6. **Dónde se aplica solo**: el cobro en el servidor (`cobrarCorrida` con el trato vigente a la fecha de la corrida), Declarar producción y los modales de cobro (vista previa con los mismos argumentos), el cubicador (el dueño se elige del Directorio y el precio sale de su trato) y la venta propuesta al despachar (trato de venta del cliente → precio del paquete).

## Consecuencias

- Un mismo cliente puede tener su trato vigente con historial por fecha. Guardar o quitar un trato no reescribe lo ya cobrado; pero si después se corrige la corrida (ampliar, corregir paquetes, volver a declarar), se recotiza con el trato que rija en **su** fecha, igual que la tarifa de la planta (ADR-412). Corregir el trato de ese mismo día cambia ese cargo la próxima vez que se toque la corrida (hallazgo de seguridad del 22-09: el texto decía «congelado» y no lo era).
- Los tratos se leen sin caché: la caché del proyecto es por instancia y la vista previa podía mostrar un trato de hace un minuto mientras el cobro usaba el nuevo. Cuando un trato cambia, las pantallas abiertas lo releen (evento `forestal:tratos-cliente`).
- El P&L del permiso ve el aserrío (el cargo copia `contratoId`).
- ADR-418 rechazó un «catálogo de precios de venta» para **valorizar stock**; esto es otra cosa: un trato con una persona que sólo **propone** el importe al vender.

## Alternativas descartadas

- **Columna `modo` global/grupos**: permitiría un «global» con grupos cargados, contradictorio.
- **Trato del cliente en el KV**: hay que listar qué clientes tienen precio y auditar por cliente; un JSON por tenant crece clientes × versiones.
- **Grupos por cliente**: obligaría a rearmarlos en cada cliente (decisión 2).
- **Sumar los recargos de la planta al precio del cliente**: «0.50 toda especie» no sería 0.50 (decisión 1).

## Referencias

ADR-410 (catálogo de especies) · ADR-412 (cobro de aserrío) · ADR-418 (productos disponibles) · ADR-421/425 (permisos) · ADR-424 (Directorio) · ADR-426 (refs sin FK) · ADR-429 (declarar producción).
