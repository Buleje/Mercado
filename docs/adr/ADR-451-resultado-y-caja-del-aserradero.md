# ADR-451 — Resultado y caja del aserradero

**Estado:** Aceptado (2026-09-29). Construido el servidor: función pura, clase de lectura, 3 rutas y los campos nuevos de la proyección de 13 semanas. La pantalla (Ganancias, Movimientos) la hace otro agente sobre este contrato.
**Relacionados:** ADR-141 (P&L de despachos), ADR-374 (gastos fijos = plantillas), ADR-412 (cobro de aserrío por corrida), ADR-413 (liquidar la cuenta), ADR-437 (madera de servicio, compra por guía), ADR-448 (adelantos en las dos direcciones), ADR-449 (cruce de lo recibido).

## Contexto

Mi Plata → Ganancias mostraba **S/ 0** en setiembre para Blas. Medido el 29-09 (sólo lectura, `cmpxiv6p4000bohvzwl6bnfpv`):

| Qué | Cifra |
|---|---|
| Cargos de aserrío vivos (`aserrio_prestado`) | 32 = **S/ 12 323,02** = Σ `aserrioImporte` de las 32 corridas vivas |
| … por mes (fecha guardada a las 00:00 UTC = día de calendario) | setiembre **31 = 11 054,18** · octubre **1 = 1 268,84** (la corrida N° 63, fechada 02/10) |
| Despachos | 4, los 4 anulados → 0 de madera vendida |
| Compras de madera con costo | 0 (21 guías de servicio, 4 pendientes y 1 rechazada sin costo); 0 órdenes de compra |
| Ventas del mostrador | jun 85 · jul 85, las 4 con costo (70 %, no 55 %) |
| Adelantos | 6 DADO abiertos = 26 690; 0 RECIBIDO (los S/ 3 031 de WASACO siguen como DADO) |
| RRHH | 2 colaboradores, 2 tarifas, 14 marcas (última 15/09) |
| Liquidaciones | 0 |

Ganancias sumaba sólo POS + pedidos en el navegador: el aserrío, que es el negocio del aserradero, no estaba en ninguna fórmula.

## Decisión

1. **Resultado devengado con costo de lo vendido.** Suma mostrador, pedidos, aserrío cobrado, madera vendida y fletes cobrados; resta mercadería vendida, costo de la madera **vendida**, aserrío que te hicieron, fletes pagados, gastos y planilla (≈). **La compra de madera no resta**: se muestra en un `memo` («resta al venderse»).
2. **Caja aparte y sin dobles.** La liquidación entra una vez por su `pagoMonto`; sus patas de cuenta no suman en ningún lado y lo cruzado cuenta una vez, por su `montoCompensado` («nunca fue caja»). El cruce de ADR-449 nunca es caja. El adelanto dado sale una vez (su retiro de caja no suma aparte). Una **entrega devuelta en plata** es caja (`adelanto_devuelto` / `recibido_devuelto`); la de trabajo o producto no. Un `pago_hecho` suelto sale. Un gasto de guía sin `paidAt` todavía no salió. Los retiros e ingresos manuales de caja se muestran y **no se suman** (el que ya se contó lleva «ya contado»).
3. **El mes es el calendario de Lima.** Una fecha a las 00:00:00.000 UTC exactas es un día de calendario (`mesDeFecha` = `mesDeGasto` generalizado); cualquier otra hora es un instante y se pasa a Lima. La clase de lectura trae con ±1 día de margen y la función pura decide el mes. La compra y la venta de madera se agrupan por GTF: se trae **la guía entera** (todas sus filas, sin tope de fecha) de cada guía tocada, así el renglón, el detalle y `actual` no dependen de la ventana ni de `meses`.
4. **Venta de madera por guía de salida.** Si la guía está en la cuenta del cliente (cargo `venta`) y en el despacho (`valorVenta`), se cuenta una vez y manda la cuenta. La madera de servicio (ADR-437) no es venta ni faltante.
5. **Lo que no se sabe no es 0.** Sin costo guardado, la mercadería se estima al 55 % y se rotula `estimado`; la planilla es ≈ (lo ganado según asistencia, no la boleta); un renglón que no se puede calcular es `null` («—»). Si un renglón no es `medido`, el total es `estimado`. Otras monedas no se suman (`otrasMonedas`).
6. **Invariante:** `Renglon.monto === Σ filas.monto`, y el detalle devuelve **las mismas filas** (`detalleDeResultado` / `detalleDeCaja` llaman al mismo cálculo).
7. **Gasto de personal con planilla:** si RRHH tiene lo ganado del mes, los gastos de categoría `personal` no se restan (aviso con cuántos y cuánto).
8. **Mes cerrado:** el cobro de un aserrío se puede cambiar después del cierre del Libro CTP, así que el resultado de un mes cerrado lleva `cerradoCtp` + aviso; no se guarda foto en esta versión.

## Contrato

- `lib/finance/resultado-del-negocio.ts` (puro): tipos (`RespuestaResultado`, `RespuestaDetalle`, `RespuestaCaja`, `Renglon`, `FilaFuente`, …) y `armarResultado`, `armarSerie`, `armarCaja`, `loQueViene`, `ventasDeMadera`, `claseDeFlete`, `mesDeFecha`, `diaDeFecha`, `detalleDeResultado`, `detalleDeCaja`.
- `lib/db/resultado-negocio.db.ts`: `entradaDelPeriodo`, `entradaCaja`, `pendientes`, `resultado`, `detalle`, `caja` (caché 60 s bajo `finanzas:resultado:<tenantId>:`) y `proyeccion.*` (las lecturas de la proyección de 13 semanas).
- `GET /api/finanzas/resultado?mes=YYYY-MM&meses=1..12` → `{ actual, serie, generadoEn }`.
- `GET /api/finanzas/resultado/detalle?mes=YYYY-MM&fuente=<FuenteDetalle>` → `{ mes, fuente, filas, total }`.
- `GET /api/finanzas/caja-del-negocio?mes=YYYY-MM` → `{ caja, viene, generadoEn }`.
- Roles: `RUTAS_PANEL["/api/finanzas/resultado"]` y `["/api/finanzas/caja-del-negocio"]` = admin y dueño, más el corte explícito `soloAdminODueno` después de `requireAdmin` (el management-tier dejaría pasar al encargado): cajero, almacenero **y manager → 403**. Tenant = el de la sesión. Parámetros con Zod `safeParse` (400).
- Caché invalidada por `ForestCuentaDB.invalidar` (cobro de aserrío, pagos, liquidaciones), `revalidateExpenses` de `FinanceDB`, la invalidación de `GuiaPlataDB`, `AdelantosDB` (alta, entrega, anulación) y `ForestCtpDespachoDB.setValorVenta` (precio de un despacho). La clave lleva `p1`/`p0` (con o sin planilla).
- `FilaPnl.fecha?` (ISO de `entryDate`) y `ForestCtpDespachoDB.filasPnlDelPeriodo` (las filas que `pnlDelPeriodo` agrega; `pnlDelPeriodo` no cambia).
- `cashflow-rolling.ts` sólo AGREGA: `weeks[].advanceCollections` (fuera del cierre), `saldoInicial {monto, fuente, estimado}`, `payrollFuente`, `payrollRrhhSemanal` (≈), `adelantosConVencimiento`, `sinFecha`, `cierreSinNomina`. Para admin y owner los campos viejos dan lo mismo que antes (test contra la salida de HEAD); para quien no ve RRHH, ver §Roles y planilla.

## Roles y planilla (revisión 29-09)

- **Resultado y caja del negocio: sólo admin y dueño; el encargado NO.** Motivo: son la
  plata del negocio entero —lo ganado, el margen de la madera, lo que se pagó al liquidar,
  a quién se le adelantó— y el resultado resta la planilla, que es sueldos. Es el mismo
  criterio que ya rige Liquidar (`/api/adelantos/cuentas/liquidaciones`) y lo ganado de
  RRHH (`RRHH_COMPLETO`, ADR-414 §7: el manager gestiona personal y asistencia, «sin
  tarifas ni ganado»). El encargado sigue teniendo lo operativo: la proyección de 13
  semanas, Adelantos y Por cobrar. La pantalla tiene que decidirlo a mano
  (`rol === "admin" || rol === "owner"`): `puedePedir` replica el management-tier.
- **La planilla (y todo número de RRHH) sólo para `RRHH_COMPLETO`.** `lib/auth/role-permissions.ts`
  no tiene recurso de RRHH (ADR-414 §7 lo dejó afuera a propósito): la fuente es
  `lib/rrhh/roles.ts`. Para el resto:
  - resultado: renglón Planilla `monto: null`, `certeza: "incompleto"`, nota «No tienes acceso a la planilla.»; el detalle, sin filas; lo ganado ni se calcula;
  - lo que viene: `planilla_por_pagar` igual, sin monto;
  - proyección (`/api/finance/cashflow-rolling`): `weeks[].payroll` y `payrollRrhhSemanal` **no viajan** (ausentes, no 0), `payrollFuente: "sin_permiso"` y el cierre de cada semana (y `criticalWeek`) se calcula **sin nómina**, rotulado `cierreSinNomina: true`: restar las filas no deja ningún sueldo escondido. Ni lo ganado de RRHH ni los gastos de `personal` se consultan.
- **Quién pide la proyección: la matriz** (`lib/auth/role-permissions.ts`). No tiene recurso «finanzas»: la proyección son gastos y cuentas por pagar, así que entra quien lee `expenses` Y `payables` = admin, owner, manager, analista. **Cajero, almacenero y tienda_owner → 403** (antes el cajero pasaba por `["admin", "cajero"]`). `RUTAS_PANEL["/api/finance/cashflow-rolling"]` es el espejo (un test lo compara con la matriz) y la ruta vuelve a mirar la matriz después de `requireAdmin`. Manager y analista la ven con el cierre sin nómina; admin y owner, igual que antes.
- Consumidores (grep 29-09): `CashflowRollingTable.tsx` (Mi Plata → Proyección de caja) y `hooks/use-caja-del-negocio.ts` (Movimientos). Mi Plata (`finanzas`) no está en los módulos por defecto del cajero (`lib/module-permissions.ts`); si un negocio se la habilitó en Ajustes, la tabla muestra «Error 403» en vez de la proyección.
- La lectura por defecto es SIN planilla (`OpcionesLectura.verPlanilla = false`): un
  llamador que se olvide de decidir no filtra sueldos.

## Revisión (29-09): la entrega en plata y lo que queda para una columna

El revisor encontró que en Blas setiembre la caja decía «Entró S/ 0» con la devolución en efectivo de ADL-2026-0001 (S/ 1 200) adentro: la entrega LIBRE con `metodoCaja` caía en «nunca fue caja». `AdelantoEntrega` no guarda su movimiento de caja, así que hoy se empareja con el `CashMovement` por **código del adelanto + monto + tipo** (`cajaAlDevolver`: ingreso si fue DADO, egreso si fue RECIBIDO) **+ el comienzo de la etiqueta** («Liquidación de adelanto …» / «Devolución de adelanto recibido …»), y cada movimiento se usa una sola vez. Un test fija que las etiquetas de `lib/adelantos/movimiento-caja.ts` sigan empezando así.

**Columna futura (sin migración en esta versión):** `AdelantoEntrega.cajaMovimientoId String?` (y el método), escrita en `registrarEntrega` dentro de la misma transacción que `moverCajaEnTx`. Con ella el emparejamiento deja de depender de la etiqueta, y una entrega hecha sin caja abierta (`sinCaja`) se distingue de una en especie.

Otros arreglos de la misma revisión: `pago_hecho` suelto a Salió; gasto de guía sin pagar fuera de la caja; mes entre 2000 y 2100 (`esMesDelNegocio`: «0050-01» armaba 693 000 días de planilla por persona); la moneda de la venta de un despacho viaja aparte de la del costo (`FilaPnl.monedaVenta`); «Lo que viene» suma sólo soles (`otrasMonedas`).

## Alternativas rechazadas

- **Restar las compras** («ingresos − compras − gastos»): el mes en que entra un camión sale en pérdida aunque la madera siga en el patio.
- **Restar las compras y además el costo de lo vendido:** la misma madera contada dos veces.
- **Cortar con `rangoDelMesLima` en la base:** un cargo del 01/10 guardado a las 00:00 UTC cae en setiembre.
- **Sumar los movimientos de caja:** son la otra cara de un gasto, un adelanto o una liquidación; sumarlos duplica.

## Consecuencias

- El Resumen y el historial de Gastos siguen contando la madera comprada como gasto (`finance.db.ts`, `maderaDelHistorial`): la pantalla lo explica con un ⓘ; unificarlos es otra decisión.
- El resultado de un mes cerrado puede moverse si se recotiza un aserrío.
- La planilla es una referencia: sin boleta, nunca se presenta como lo pagado.
