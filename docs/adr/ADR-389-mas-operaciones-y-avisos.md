# ADR-389 — Tres operaciones más, y el asistente que habla primero

**Estado:** aceptado · **Fecha:** 2026-09-04 · **Ámbito:** Asistente IA · Compras · Tesorería · Forestal

## Contexto

ADR-387 dejó al asistente anotando gastos, ingresos, adelantos y cobros.
ADR-388 le puso un bot y oídos. Faltaban las operaciones que Brandon nombró
—compra a proveedor, movimiento entre cuentas, gasto contra un lote, flete— y
que el asistente hablara **sin que le pregunten**.

## Decisión 1 · La orden de compra queda PENDIENTE, nunca recibida

Dictar «compré 20 sacos de arroz a Distribuidora Ucayali» crea una
`PurchaseOrder` con estado `pendiente`. Es el **documento** de compra.

Recién al marcarla `recibido`, la pantalla de Compras sube el stock y recalcula
el costo promedio. Que un dictado hiciera eso sería declarar recibida mercadería
que todavía está en el camión — y el módulo ya arrastra la cicatriz de contar
stock dos veces (ADR-377).

**El dictado deja la orden armada; recibirla se hace mirando lo que llegó**, que
es cuando se sabe si vinieron 20 sacos o 18.

Cada línea necesita un `productId` real (la tabla tiene FK a `Product`), así que
la frase activa también `inventory_buscar_producto`. Es una dependencia entre
dominios del ruteo, y está en los tests: sin ella el modelo tenía con qué
escribir la orden y no con qué saber qué producto era.

## Decisión 2 · Tesorería: transferir y mover son cosas distintas

Con `cuentaDestinoId` es una **transferencia** (`TreasuryDB.transferir`, que deja
los dos movimientos atados). Sin ella es un movimiento suelto. Confundirlas
descuadra las dos cuentas a la vez.

Dos frenos que devuelven un error legible en vez de un asiento roto:

- **Saldo insuficiente:** «"Caja chica" tiene S/ 500.00 y querés mover
  S/ 99,999.00. No alcanza.»
- **Monedas distintas:** un cambio necesita su tipo de cambio, y el tipo de
  cambio es una decisión. Inventarlo mete una diferencia que después nadie
  explica, así que se manda a Tesorería.

## Decisión 3 · El gasto forestal va por el centro de costo, no por un libro nuevo

Los lotes de producción **no tienen** libro de gastos propio. Lo que existe es
`Expense.costCenter`, que ya soportaba `plata_registrar_gasto`.

Lo que faltaba era el código exacto: `plata_buscar_lote` devuelve
`usarComoCentroCosto: "L-2026-003"` para que «el lote L-2026-3» dictado no
termine en tres variantes que después no suman juntas.

## Decisión 4 · El flete guarda la placa además del id

Va por `ForestFleteDB.guardar`, que copia placa y transportista dentro de la
fila. No es descuido: **un viaje ocurrió**, y si mañana el camión se da de baja
el viaje de marzo siguió siendo el de esa placa (ADR-318). Con el volumen, el
resumen muestra el S//m³ — que es el número que se compara entre transportistas.

«Salida» se traduce a `despacho` acá y no en el prompt: es como se dice, no como
se guarda, y dejar que el modelo adivine el enum es pedirle que acierte.

## Decisión 5 · Los avisos: una sola lista, tres canales

`lib/asistente/avisos.ts` calcula **lo que vale la pena contar hoy**. La misma
función alimenta:

| Canal | Cuándo |
|---|---|
| Campana del panel | siempre, con dedupe de 20 h por clave de aviso |
| Bot de Telegram | sólo si hay avisos **nuevos** |
| Flujo de n8n | sólo si hay nuevos, y el dueño llamó a algún flujo «aviso»/«resumen» |
| El chat (`analytics_avisos`) | cuando preguntás «¿qué hay de nuevo?» |

**Telegram y n8n sólo con avisos nuevos.** La campana puede reusar una
notificación sin molestar a nadie; un mensaje al celular no. Repetir el mismo
aviso cada mañana es la forma más rápida de que el dueño silencie el bot.

Qué entra: lo **accionable y no obvio**. «Vendiste S/ 2.400 ayer» ya está en la
pantalla de inicio. «El camión N12 lleva 40 % más de combustible que el mes
pasado» no lo estaba mirando nadie.

Los cinco chequeos y sus umbrales, elegidos para que la lista no mienta:

- **Combustible por máquina:** se compara el MISMO tramo de mes (a día 8, los 8
  primeros días de cada uno). Contra el mes entero diría «gastás la mitad» todos
  los días 15. Pide ≥3 cargas de referencia: con una sola, cualquier variación
  es ruido. Umbral +30 %.
- **Fletes impagos:** sólo los de más de 7 días. Uno anotado ayer no es una
  alerta, es un flete normal — avisar de eso convierte cada registro en una
  notificación al día siguiente.
- **Adelantos vencidos:** los que tenían fecha pactada y la pasaron. Un adelanto
  viejo sin fecha no incumplió nada (ADR-332).
- **Fiados de más de 30 días**, agrupados: el número que importa es cuánto suman.
- **Máquinas paradas o en mantenimiento.**

Cada chequeo se aísla en un `allSettled`: uno que falle —un módulo que ese
negocio no usa— no puede dejar sin avisos a los demás.

`analytics` y no `plata` es donde vive el tool a propósito: el ruteo manda el
núcleo (analítica, pedidos, inventario) cuando la frase no nombra ningún
dominio, y «¿qué hay de nuevo?» es justamente una frase así.

## Lo que se arregló de paso

**`/api/agents/execute` devolvía tareas a medio terminar.** Seis agentes
(analytics, inventory, orders, customers, notifications, pricing) emiten
`task:completed` ELLOS MISMOS, antes de devolverle el resultado al orchestrator
—que es quien lo guarda—. Leer la tarea en el instante del evento la agarraba en
`running` y sin `result`. Medido: `analytics/daily-kpis` devolvía «running» con
la tarea resuelta 2 segundos antes.

Importa porque **ese es el endpoint documentado para verificar un agente sin
gastar cuota de LLM**: una respuesta que miente es peor que no tenerlo. Ahora se
espera al estado terminal real, con tope de 2 s.

## Consecuencias

- El dominio `plata` pasó a 14 acciones y el archivo se partió en `plata/`
  (`comun` · `busquedas` · `escrituras`) — la división es por rol, no por tamaño.
- El catálogo completo de herramientas es ya **8.358 tokens**, más que el límite
  POR MINUTO de la cuenta. El ruteo de ADR-387 dejó de ser una optimización: sin
  él, ninguna operación se anota. Los tests lo fijan.
- Un aviso nuevo se agrega escribiendo una función en `avisos.ts`; los tres
  canales lo reparten solos.

## Alternativas descartadas

- **Que el dictado reciba la mercadería.** Es la que sube stock y recalcula
  costos. Se hace mirando lo que llegó.
- **Un libro de gastos por lote.** El centro de costo ya existe y lo leen los
  reportes; una tabla paralela sería un segundo lugar donde buscar lo mismo.
- **Mandar el digest aunque no haya nada nuevo.** «Todo tranquilo» cada mañana
  entrena a no abrir el mensaje.

## Referencias

- ADR-387 (anotar operaciones dictadas) · ADR-388 (bot de Telegram y audio)
- ADR-377 (el costo real de la mercadería) · ADR-318 (fletes) · ADR-332 (adelantos)
- `lib/agents/domains/plata/` · `lib/asistente/avisos.ts`
- `app/api/cron/asistente-avisos/route.ts` · `__tests__/agentes-tool-routing.test.ts`
