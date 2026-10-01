# ADR-448 — Adelantos en las dos direcciones

**Estado:** Aceptado (2026-09-29), servidor construido; pantalla en construcción.
**Relacionados:** ADR-118 (adelantos, caja y tope), ADR-329 (código de operación), ADR-412 §5 (cuenta por persona), ADR-413 (liquidar la cuenta), ADR-421 (contrato), `Prestamo.direccion`.

## Contexto

El adelanto sólo sabía «el negocio da la plata y la persona la devuelve con entregas». En Blas (`cmpxiv6p4000bohvzwl6bnfpv`, medido 28-09, sólo lectura) hay **S/ 3 031** de pagos por aserrío (ADL-2026-0003 y 0004 de WASACO) guardados como entregados: 0 entregas, y ninguno movió la caja porque no había forma de anotar un ingreso. Brandon pidió, en «Nuevo adelanto», elegir si la plata se DIO o se RECIBIÓ, con tres casos:

1. Adelanto por un servicio que el negocio dará (WASACO paga el aserrío antes).
2. Amortización de lo que te deben (no es un adelanto nuevo).
3. Te prestan plata.

## Decisión

1. **Columna `direccion DADO|RECIBIDO`** (default DADO) + **`conceptoRecibido SERVICIO|PRESTAMO`** (sólo en RECIBIDO), con un CHECK en la base (`Adelanto_direccion_chk`): DADO sin concepto; RECIBIDO con concepto y nunca por descuento de planilla. Migración aditiva `20260929_adelanto_direccion`, sin backfill: las 53 filas de los 4 negocios quedan DADO. ADL-0002/3/4 de Blas **no se re-marcan**: Brandon los corrige él con «Corregir dirección».
2. **`saldoPendiente` no cambia de fórmula** (monto − entregas vivas). Lo que cambia es quién le debe a quién (`lib/adelantos/direccion.ts`, puro):

   | dirección | ABIERTO (saldo > 0) | EXCEDIDO (saldo < 0) |
   |---|---|---|
   | DADO | te debe | le debes |
   | RECIBIDO | le debes | te debe |

3. **La lectura por defecto es DADO.** Todo campo y método que existía sigue significando «lo que diste»; lo recibido llega en campos nuevos y se pide por nombre (`direccion: "todas"` o `"RECIBIDO"`). Un lector que no se actualizó deja de ver lo recibido, pero nunca lo cuenta al revés. Los 5 archivos que consultan `prisma.adelanto` por fuera de `AdelantosDB` (por cobrar, finanzas, balance del permiso, liquidación de cuenta y el cron de recordatorios, que pasa a `AdelantosDB`) filtran con `SOLO_DADOS`. Un test barre `adelanto.(aggregate|groupBy|findMany|count)` y el SQL crudo sobre «Adelanto» en `lib/` y `app/`: cada uno menciona `direccion` o está en una lista de excepciones con su motivo.
4. **Caja** (`cajaAlCrear` / `cajaAlDevolver`): dar saca plata; recibir la entra. Devolver en plata: DADO → ingreso, RECIBIDO → egreso. Anular con devolución: lo mismo que devolver.
5. **Entregas de un RECIBIDO**: lo que el negocio da para cancelarlo. Un producto se valúa a **precio de venta** (el negocio lo vende, no lo compra) y `sumarAStock` se rechaza (el producto sale, no entra).
6. **Tope de crédito** sólo con lo DADO abierto en soles; recibir no lo valida ni le quita margen a nadie.
7. **Liquidar la cuenta (ADR-413)**: lo RECIBIDO queda en `fuera` con el motivo «Es plata que te dieron…»; «Dejar en cero» nunca lo cobra. La huella incluye la dirección.
8. **Saldo por persona**: `saldoPendiente`/`saldoAFavor` siguen siendo DADO; nuevos `recibidoPendiente`, `recibidoExcedido`, `teDebe`, `leDebes`, `neto` (por moneda). La cuenta unificada resta lo recibido: `neto = teDebe − aFavorSuyo − recibidoPendiente + recibidoExcedido + madera`.
9. **Amortización (caso 2)** no crea nada nuevo: entrega LIBRE con `metodoCaja` a un adelanto DADO (entra a caja), o el pago recibido de la liquidación (FIFO, ADR-413).
10. **Corregir la dirección** (`PATCH /api/adelantos/[id]` `{action:"corregirDireccion"}`): sólo admin o dueño, sólo sin entregas vivas y sin anular, con motivo legible (≥ 3 letras, sin invisibles). **No mueve la caja** y lo dice la respuesta; deja el antes → después con el motivo en las notas del adelanto y en la actividad.

## Revisión de seguridad (28-09, veto levantado con estos arreglos)

11. **Corregir la dirección no puede duplicar plata** (`movio_caja`, 409). Si el alta movió la caja, corregir el lado y después «devolver» saca (o entra) la plata dos veces: DADO S/ X con egreso → RECIBIDO → devolución de X = la persona cobra 2X. Blas ADL-0002 (S/ 3 217, egreso del 27/09, 0 entregas) era corregible. Regla, sin migración (`movimientoDelAlta` en `lib/adelantos/direccion.ts`):
    - **Por código** (todo desde ADR-329): cualquier `CashMovement` del negocio cuya descripción nombre el código como palabra entera (ADL-2026-0002 no calza en ADL-2026-00021). Como sólo se corrige sin entregas vivas y sin anular, el único movimiento con ese código es el del alta.
    - **Por monto y día, con o sin código** (segunda revisión): un movimiento del sentido del alta (egreso si se dio, ingreso si se recibió), del **mismo monto exacto**, el **mismo día de Lima** en que se cargó el adelanto, y que no nombra OTRO adelanto ni liquidación (`ADL-…`, `LIQ-…`). Atrapa el egreso anotado a mano en la caja, sin código. Ante la duda bloquea: el peor error es pagar dos veces.
    - Servicio ↔ préstamo no cambia el lado y no mira la caja. El mensaje dice qué hacer: «Esta plata salió de tu caja el 27/09 (S/ 3,217.00). Para cambiarla a recibida, anúlala devolviendo la plata a la caja y regístrala de nuevo como recibida.»
    - **Sin ventana** (segunda revisión): el alta, la entrega y la anulación mueven la caja DENTRO de su transacción (`moverCajaEnTx`). Antes el movimiento se anotaba 0,8–2 s después del commit (medido en 13 filas reales) y en ese hueco la corrección no lo veía. Cambia la regla 1 de `movimiento-caja.ts`: sin caja abierta el adelanto se guarda igual (`sinCaja`); si la base no puede anotar el movimiento, no se guarda nada y la pantalla lo dice.
12. **Roles para sacar plata por lo recibido**: registrar un RECIBIDO, devolverlo en plata (entrega con caja) y anularlo devolviendo la plata son sólo de admin o dueño (`soloAdminODueno`; `manager` pasa `requireAdmin` por el bypass de gestión). La DB class lo decide bajo el lock de la fila (`PermisosDeRecibido`) y, en un recibido con caja, rechaza devolver más que el saldo (`excede_saldo`). Lo DADO no cambia: su hueco de roles (cajero y almacenero pasan `requireAdmin(req)` sin tener `adelantos` en `role-permissions.ts`) es previo y queda reportado.
13. **«Dejar en cero» no propone nada** si `fuera` trae plata RECIBIDA en soles, y `saldosDe` la incluye (`recibidoLeDebes`, `recibidoTeDebe`, `neto`): el «Antes», el «Después» y el recibo ya no dicen «queda en cero» con plata que el negocio todavía debe.
14. **Producto en un recibido: todavía no** (`producto_en_recibido`, 400): el stock no bajaría. Se anota como entrega libre hasta la fase 2.
15. **La corrección se audita en la misma transacción** (`ActivityLog`, antes → después y motivo); ya no se escribe en `notas`, que un PATCH puede reescribir.
16. **Alta y entregas idempotentes**: `Adelanto.idempotencyKey` (único por negocio) y `AdelantoEntrega.idempotencyKey` (único por adelanto), con la huella del cuerpo (`idempotencyHuella`, `lib/adelantos/idempotencia.ts`: persona, monto, moneda, dirección, concepto y caja; en la entrega tipo, valor, producto, cantidad y caja). Migraciones aditivas `20260929_adelanto_idempotencia` y `20260929_adelanto_entrega_idempotencia`. Misma clave y mismo cuerpo → 200 `repetido: true`, sin otra fila ni otra caja; otro cuerpo → **422 `idempotencia_distinta`**.
18. **Rellenos Hangul** (U+115F, U+1160, U+3164, U+FFA0) cuentan como invisibles en `lib/forestal/motivo.ts`: `\p{L}` los contaba como letras.
19. **Las rutas de `/api/adelantos` obedecen la matriz** (`lib/adelantos/permisos.ts` lee `role-permissions.ts`, recurso `adelantos`): GET → `read`, POST/PATCH → `write`, DELETE y anular → `delete`. Antes llamaban `requireAdmin(req)` sin roles y cajero y almacenero —sin `adelantos` en la matriz— creaban personas, daban adelantos con caja pasando el tope y borraban deudas con una entrega libre. Las de liquidar ya exigían admin o dueño. El asistente IA ya mapeaba sus herramientas a la matriz (`lib/agents/permissions.ts`).
17. Balance del permiso: lo recibido excluye los anulados y «por devolver» suma sólo saldos positivos. Pasar de RECIBIDO a DADO informa si supera el tope (`excedeLimite`), sin bloquear. El resumen de lo recibido va sólo por moneda.

## Alternativas rechazadas

- **Saldo con signo**: ya existe EXCEDIDO para el saldo negativo; todo recibido nacería EXCEDIDO y se leería como «le debes porque te entregó de más».
- **Usar `Prestamo`**: va con cuotas e interés, no se paga con madera y no tiene ficha de persona.
- **Registrarlo sólo como `pago` en la cuenta forestal**: la bodega no tiene módulo forestal y no pasa por el alta.
- **Un modelo aparte**: duplica entregas, código, recibo y caja.
- **`sentido ENTREGADO|RECIBIDO`**: misma mecánica, pero «entregado» choca con «entregas».

## Consecuencias

- El cruce del recibido con la cuenta de aserríos (WASACO ya tiene 32 cargos automáticos por S/ 12 323,02) queda para una **fase 2**: nunca a mano, para no cobrar dos veces el aserrío.
- Los adelantos con fecha atrasada movían la caja del día en que se cargaban; la pantalla pasa a proponer «No mover la caja» cuando la fecha no es hoy.
- Ya existía: el balance del permiso no excluye los CANCELADOS (0 casos en Blas).
