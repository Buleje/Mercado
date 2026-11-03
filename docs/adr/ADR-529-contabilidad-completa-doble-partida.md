# ADR-529 — Contabilidad completa: doble partida con el PCGE, armada de las mismas fuentes que «Resultado»

- **Estado:** aceptado (2026-11-02). Probado: cifras reales de Blas y main 09-11/2026 (Σ debe = Σ haber, cruce con Resultado = 0, caja 10 = Caja del mes salvo el retiro manual por aclarar, situación cuadra) y las 3 pantallas en claro/oscuro/400 px. Sin probar: cerrar/reabrir un mes real (solo con base simulada). Schema EXPAND aplicado: `AsientoContable`, `AsientoContableLinea`, `PeriodoContable`, `CuentaContablePropia`, `ContabilidadAjustes` (migración `20261102a_contabilidad_adr529`).
- **Pedido por:** Brandon (02-11): «qué es un SAP y si mi sistema se considera uno» → «arma la contabilidad completa». Era lo único grande que le faltaba al ERP (pendiente n.º 51 del roadmap, «Libro mayor automático (doble partida)»).
- **Relacionados:** ADR-527 (Cuentas: todo lo que entró y salió), resultado del negocio (`lib/finance/resultado-del-negocio.ts` + `lib/db/resultado-negocio.db.ts`: single source de ingresos, costos y caja del mes).

## Contexto
El panel ya sabe, fila por fila y sin contar dos veces, qué se ganó (ingresos y costos por devengo: mostrador, pedidos, aserrío, madera vendida, fletes, mercadería, costo de madera, gastos, planilla) y qué entró y salió de la caja (cobros, adelantos, liquidaciones, pagos). Le faltaba escribirlo en el idioma del contador: asientos de debe y haber con cuentas del PCGE, libros, balance y cierre de mes.

## Decisión
1. **Los asientos automáticos se DERIVAN, no se duplican.** Para un mes abierto se arman en vivo con las filas de `ResultadoNegocioDB` (las mismas que suman los renglones de «Resultado» y «Caja del mes»): un hecho = un asiento, con `origen = <fuente>:<id>`. Nada se escribe al leer. Si alguien corrige una venta, el libro del mes abierto ya sale corregido.
2. **Cerrar el mes congela.** Al cerrar se guardan los automáticos en `AsientoContable` (`tipo = auto`) y una foto de los totales en `PeriodoContable.resumen`. Desde ahí el libro de ese mes sale de la base; si las fuentes de hoy dan otro total, se avisa «el mes cerrado se movió» (no se reescribe solo). Reabrir (owner/admin) borra la foto.
3. **Devengo y caja en dos asientos que se compensan.** La venta carga a Clientes (12) y abona Ventas (70); el cobro carga Caja (10) y abona Clientes. El saldo de 12 = lo que te deben. Igual con proveedores (42), personal (41) y adelantos (14/42).
4. **PCGE 2019 base en código** (`lib/contabilidad/plan-pcge.ts`), inmutable; el negocio agrega subcuentas propias (`CuentaContablePropia`) y puede cambiar la cuenta de una regla (`ContabilidadAjustes.mapeo`).
5. **IGV:** NRUS = sin IGV. RER/RMT/General = 18 % incluido en el precio de venta (se separa a 40111), salvo que el negocio diga lo contrario (`ventasConIgv`, p. ej. exonerado por la Ley de la Amazonía). En compras y gastos solo se separa si el gasto trae su `igvAmount`.
6. **Lo que no se sabe qué es, no se esconde:** los movimientos manuales de caja («sin sumar») van a 4699 «Movimientos de caja por aclarar» y salen como aviso.
7. **Manuales:** asiento de apertura (saldos iniciales, sugerido desde lo que te deben y lo que debes) y ajustes (depreciación, correcciones). Solo cuadrados (Σ debe = Σ haber), solo en meses abiertos.

### Reglas por defecto (cuenta cambiable en negrita)
| Hecho (fuente) | Debe | Haber |
|---|---|---|
| Venta mostrador / pedido | 1212 | **70111** + 40111 |
| Aserrío cobrado / flete cobrado | 1212 | **70411** / **70412** + 40111 |
| Madera vendida | 1212 | **70211** + 40111 |
| Costo de mercadería vendida | **69111** | 20111 |
| Costo de la madera vendida | **69211** | 24111 |
| Aserrío recibido / flete pagado | **63991** / **63111** | 4212 |
| Gasto (por categoría) | **63x/65x** (+40111) | 4212 |
| Planilla | **62111** | 4111 |
| Cobro (mostrador, pedido, forestal, liquidación) | 1011 | 1212 |
| Adelanto dado / devuelto | 1412 (trabajador) · 4221 (proveedor/chofer) · 1629 (otro) / 1011 | al revés |
| Adelanto recibido / devuelto | 1011 / 1221 | al revés |
| Pago a proveedor, gasto, flete, liquidación | 4212 (4111 si es personal) | 1011 |
| Caja manual sin sumar | 1011 ó 4699 | 4699 ó 1011 |

## Consecuencias
- Cruce obligatorio en cada mes: utilidad contable = resultado del panel − IGV de ventas + IGV de compras ± ajustes manuales; caja (10) del mes = neto de «Caja del mes» ± caja manual. Si no da, el panel lo muestra en rojo.
- El Balance General necesita el acumulado desde el `inicio`: meses cerrados salen de la base (rápido), abiertos en vivo. Conviene cerrar cada mes.
- Simplificaciones conocidas (para el contador): costo de ventas directo a 69 contra existencias (sin el par 60/61 de compras con destino); sin cuentas de destino (clase 9); una sola cuenta de efectivo (1011) hasta que tesorería separe bancos; préstamos e intereses fuera hasta tener su fila de caja.
- Revisión (reviewer + security, 02-11): **alquileres fuera** (ADR-524: el local de Drucila no es plata del negocio); el retiro de caja de un gasto pagado no se cuenta dos veces; pagos a proveedor por su regla (4212/1011, fuera de «Caja del mes»); compensaciones de liquidaciones y de la cuenta forestal se asientan (sin persona → aviso, no asiento); la apertura sugerida sale en 0 para completar (lo pendiente a esa fecha no se reconstruye con certeza); escribir asientos, plan, cierre y ajustes = solo dueño/admin; el encargado no ve planilla ni en meses cerrados.
- Exportación a Excel por libro para el contador. PLE/SIRE (formatos SUNAT) queda para después: el RER solo lleva Registro de Compras y de Ventas.
