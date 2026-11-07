# ADR-478 — La cubicación de trozas se guarda con dueño y descuenta del adelanto

- **Estado:** aceptado (2026-10-08). Construido el servidor (paso M2): tabla, DB class, 4 rutas, guard doble de la guía, auditoría y tests. Las pantallas son el paso M3.
- **Pedido por:** Brandon (plan 08-10, fila aprobada «Enviar la cubicación a la cuenta de un proveedor o cliente»).
- **Depende de:** ADR-118, ADR-329 (código dictable), ADR-413 (liquidación y anular entregas), ADR-430, ADR-437 §4-6 (plata de la guía), ADR-440 §1 y §6 (PT oxapampino, `ptVisto`), ADR-448 (dirección DADO/RECIBIDO, idempotencia).
- **Contrato:** `.claude/autonomo/contratos-2026-10-08/cubicacion-cuenta.md` (K2). Migración: `prisma/migrations/20261008_cubicacion_trozas_cuenta/migration.sql` (paso M1).

## Contexto

El cubicador de trozas guardaba sólo en el navegador. En Blas hay 4 cuentas de adelantos (6 abiertos, S/ 26 690) y la madera que el proveedor trae para pagarlos se anotaba a mano como entrega libre sin medidas. ADR-413 dejó abierto «valorizar la madera recibida».

## Decisión

1. **La cuenta es la de Adelantos** (`AdelantoBeneficiario`); `parteId` (directorio forestal) es contexto. Una cubicación sólo con `parteId` se aplica a la ficha de adelantos vinculada a esa parte (`forestPartyId`); sin ficha → 422 `SIN_ADELANTO_ABIERTO`.
2. **Tabla `ForestCubicacionTrozas`** con código `CUB-AAAA-NNNN` (año de la fecha de la cubicación, lock `cub:{tenant}:codigo`), medidas **congeladas por el servidor** en `trozas`, estado `borrador | aplicada | anulada`, versión e idempotencia.
3. **El servidor re-cubica** cada troza desde sus medidas crudas (`cubicarSegun`, la misma cuenta que `conVolumen`): nunca toma el m³/PT del cliente. Ø o largo por encima de `RANGO_FORMULA` = dictado mal oído → 422 `MEDIDA_FUERA_DE_RANGO {troza}`; por debajo del mínimo se guarda marcada (`sospechosa`). Con 1 Ø la troza queda pareja (d2 = d1).
4. **Valorizar = servidor**, por especie (`claveEspecie`: sin tildes ni mayúsculas) y **en la unidad del lote**: S/ por PT en Oxapampina, S/ por m³ en Smalian; nunca se convierte m³ → PT. Monto de cada especie al céntimo, medio céntimo hacia arriba sobre el decimal (33,33 × 2,5 = 83,33; el float daba 83,32). La pantalla manda `montoVisto`; si difiere más de S/ 0,005 → 409 `MONTO_CAMBIO {monto, porEspecie}`.
5. **Aplicar** (sólo admin/dueño, bypass de `manager` cortado) = entregas `LIBRE` **sin caja**, una por adelanto, con `AdelantosDB.registrarEntregaEnTx` (la única que escribe `AdelantoEntrega`) en UNA transacción. FIFO por `fechaAdelanto` entre los adelantos ABIERTO/EXCEDIDO de la persona en la dirección del sentido (compra → DADO, venta → RECIBIDO), **en soles y sin cuotas pactadas** (el criterio de `clasificarAdelantos` de la liquidación; uno en USD o con cuotas elegido a mano → 422 `ADELANTO_NO_VALIDO`); `adelantoIds` opcional para elegir (B2). Reparto en céntimos enteros; el volumen se prorratea con redondeo acumulado (la suma cierra). Cada entrega: `cubicacionId`, `cantidad` = volumen imputado, `descripcion` «Madera · CUB-2026-0003 · 34 trozas · 2 140 PT · parte 1 de 2». Sin valor nuevo en el enum `AdelantoEntregaTipo` (rompería al cliente Prisma viejo).
6. **Sobrante** (B1): en DADO se carga al último adelanto (por fecha), que queda EXCEDIDO («le debes la diferencia»). En RECIBIDO, 422 `EXCEDE_LO_RECIBIDO {debe}`. **Corrección (revisión M, 08-10):** el contrato decía que lo excedido «se paga con Liquidar cuenta», y es falso: la liquidación manda el DADO EXCEDIDO a `fuera` («Está a favor suyo: acá no hay cómo saldarlo», `lib/cuentas/liquidacion.ts`). Hoy esa deuda se ve pero se paga por fuera del sistema; la pantalla lo dice («págala aparte»). B1 vuelve a Brandon con tres caminos: tope al saldo con 422 (como en RECIBIDO), anotar el sobrante como abono en la cuenta forestal, o que la liquidación pague lo excedido.
7. **Una guía, una sola plata.** Aplicar una cubicación con `gtfNumber` cuya guía ya tiene abono `madera` vivo, costo en algún asiento vivo u otra cubicación aplicada → 409 `GUIA_YA_VALORIZADA`. Al revés, las TRES puertas que escriben `WoodEntry.costoTotal` (`GuiaPlataDB.guardarCompra` → 409 `GUIA_PAGADA_POR_CUBICACION`; `WoodEntriesDB.setCosto` y la tanda `WoodEntriesPrecioDB.ponerPrecio` → 422 `ESTADO_NO_EDITABLE` con `motivo: GUIA_PAGADA_POR_CUBICACION`) frenan una guía con cubicación aplicada, con un solo helper (`lib/db/guia-cubicacion.db.ts`). Todos los chequeos van bajo el MISMO lock de la guía (`ForestCuentaDB.bloquearGuiasEnTx`) y comparan con `mismoNumeroGtf`, no por el texto. **El N° de guía de la cubicación se guarda canónico:** en una compra se busca en el Libro CTP (`WoodEntry`) y se guarda ese texto («10-1-5» → «010-001-0000005»); si no está → 422 `GUIA_NO_ENCONTRADA`. En una venta (guía de salida) queda como se escribió.
8. **Locks** en el orden de la liquidación: guía → persona (`liq:{tenant}:benef:{id}`, la misma clave que ADR-413) → la fila de la cubicación (`FOR UPDATE`) → los adelantos destino `ORDER BY id FOR UPDATE`; los saldos se releen bajo el lock.
9. **Idempotencia**: la clave y la huella del cuerpo (precios, `montoVisto`, versión, adelantos elegidos) quedan en la cubicación. Misma clave + mismo cuerpo → 200 `repetido` sin escribir; otro cuerpo → 422 `IDEMPOTENCIA_DISTINTA`. Cada entrega lleva `{clave}:{adelantoId}` como segunda red.
10. **Aplicada = congelada.** No se edita (409 `YA_APLICADA`); se **anula** (baja lógica de sus entregas con `AdelantosDB.anularEntregasDeCubicacionEnTx`, el mismo cuerpo que la de liquidación) y se guarda otra. Anular se bloquea con 409 `LIQUIDADA_DESPUES {liquidacion}` si un adelanto tocado tiene una entrega de liquidación viva posterior. Anular dos veces = 200 `repetido`. Una anulada no se vuelve a aplicar (409 `ANULADA`). **Revisión M:** anular un ADELANTO con madera de una cubicación viva se frena como el de una liquidación (`AdelantosDB.cancel` → 409 `con_cubicacion`, «anula primero la CUB-…»); y anular una cubicación con un adelanto tocado ya CANCELADO → 409 `ADELANTO_ANULADO` (el saldo no revive a un adelanto anulado y la madera quedaría sin pagar en ninguna parte).
11. **Dato comercial, no del libro** (ADR-440 §3): no lo frena el cierre de mes ni toca nada declarado a SERFOR.
12. **Rastro**: `auditCtp` con `ctp_cubicacion_trozas_guardar | _aplicar | _anular | _borrar` (entidad `ForestCubicacionTrozas`): código, persona, trozas, volumen, monto, imputación e IP. Aplicar y anular con `auditCtpEsperando`. Tras aplicar/anular se invalida la lista propia (`forest-cubic-trozas:{tenant}:`) y el resultado del negocio (`AdelantosDB.invalidarResultado`, ahora público).

## Rutas (todas: `requireAdmin` → rol → rate limit → `spec:forestal:herramientas` → CSRF en escrituras → `safeParse`; `tenantId` del JWT)

| Ruta | Roles | Respuesta |
|---|---|---|
| `GET /api/admin/forestal/cubicaciones-trozas?beneficiario=&parte=&estado=` | admin, almacenero, dueño | `{ cubicaciones }` sin medidas |
| `POST …/cubicaciones-trozas` | admin, almacenero, dueño | 201 `{ cubicacion }` · 404 `PERSONA_NO_ENCONTRADA` · 422 `MEDIDA_FUERA_DE_RANGO` / `GUIA_NO_ENCONTRADA` / `validation_error` (fecha que no existe o futura) |
| `GET …/[id]` | admin, almacenero, dueño | `{ cubicacion (con trozas), adelantosAbiertos, ultimosPrecios }` · 404 |
| `PATCH …/[id]` (+ `version`) | admin, almacenero, dueño | `{ cubicacion }` · 409 `DESACTUALIZADA` / `YA_APLICADA` / `ANULADA` |
| `DELETE …/[id]` | admin, dueño | 204 (sólo borrador) · 409 `YA_APLICADA` |
| `POST …/[id]/aplicar` | admin, dueño | `{ cubicacion, imputacion, repetido? }` · 409 / 422 de arriba |
| `POST …/[id]/anular` | admin, dueño | `{ cubicacion, repetido? }` · 409 `LIQUIDADA_DESPUES` / `NO_APLICADA` / `ADELANTO_ANULADO` |

Errores de negocio: `{ error: CODIGO, message, ...datos }`; Zod → 422 `validation_error` con `issues`. `ultimosPrecios` = el último precio por especie aplicado a esa persona con la misma fórmula (R10), para sugerirlo rotulado «último: S/ X».

## Consecuencias

- «Cuenta por persona» y el detalle del adelanto ven cada entrega de madera con su `cubicacionId` (`DbAdelantoEntrega.cubicacionId`) y pueden abrir las medidas («Ver medidas» sólo para los roles que pasan el GET: admin, almacenero, dueño y gestión; el analista ve el rótulo sin el botón).
- El saldo baja sin pasar por una liquidación. Verificado en main 08-10: CUB-2026-0002, 3 trozas Smalian 1,518 m³ a S/ 400 y S/ 350 por m³ = S/ 586,36 → S/ 400 al adelanto del 03-08 (LIQUIDADO) y S/ 186,36 al del 04-08 (333,34 → 146,98); anular devolvió 400,00 y 333,34.
- Riesgo que queda a la vista, no resuelto: con **1 Ø** el PT oxapampino sale hasta 21 % más alto que con dos puntas (ADR-440 §1) y ahora se PAGA con él. Se guarda `diametros` y la pantalla debe decir «medido con 1 Ø» (B3).

## Alternativas descartadas

(a) KV como la aserrada — sin dueño consultable, sin idempotencia ni marca para las entregas. (b) `ForestCuentaMov` abono `madera` + liquidación — correcto para guías (ADR-437) pero Blas tiene 0 personas vinculadas al directorio: dos pasos más para el caso común. (c) Valor `MADERA` en `AdelantoEntregaTipo` — rompe al cliente Prisma viejo. (d) Convertir m³ → PT para pagar — un derivado no es el dato.

## Lo que NO se hace

Ligar troza por troza al Libro (lo resuelve el código único, ADR-477); tarifa de compra guardada por proveedor (B4); cubicación de madera aserrada (sigue en KV); mover la caja al aplicar.
