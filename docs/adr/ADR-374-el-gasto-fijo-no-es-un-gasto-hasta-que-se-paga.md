# ADR-374 — El gasto fijo no es un gasto hasta que se paga

- **Estado:** aceptado
- **Fecha:** 2026-08-10
- **Ámbito:** `lib/db/finance.db.ts`, `app/api/expenses/**`, `components/admin/compras/historial/**`, `prisma/schema.prisma` (`Expense`)

## Contexto

El panel respondía dos veces, distinto, a la misma pregunta.

Medido en el tenant `main` antes de este cambio:

| Fuente | Decía | Qué alimenta |
|---|---|---|
| `GET /api/expenses/summary` | **S/2.119,80** en 6 gastos | P&L, Break-even, Presupuesto, Reporte Semanal, MoneyLeak |
| `GET /api/expenses/historial` | **S/0,00** en 0 movimientos | Compras › Historial de Gastos |

Los seis "gastos" eran los seis registros `Expense` del tenant, **todos con
`recurring = true`**. Ese flag no marca un gasto que se repite: marca la
**plantilla** del gasto fijo — la tarjeta que el Punto de Compra ofrece para
registrar el pago del mes. Nadie había desembolsado esos S/2.119,80.

El historial ya excluía las plantillas. `getSummary` y `getByDateRange` no, así
que el estado de resultados contaba el acuerdo de pagar el alquiler como
alquiler pagado, y volvía a contarlo cuando el pago se registraba de verdad.
El catálogo además tenía cada gasto cargado dos veces (tres gastos, seis
tarjetas, cada una con su botón «Pagar»), así que el número inflado estaba
además duplicado.

Dos problemas más, del mismo origen:

1. **Gastado y pagado eran el mismo número.** Una `PurchaseOrder` recibida es
   mercadería que entró y plata que se debe; su `Payable` sabe cuánto se pagó.
   El historial sumaba el total de la orden como si hubiera salido de la caja.

2. **La metadata vivía dentro del texto.** Frecuencia, día de pago, método y
   proveedor se serializaban como un bloque `\n---META---\n{…}` al final de
   `Expense.description` (`lib/expense-meta.ts`), decisión tomada para evitar
   una migración. El costo apareció después: no se podía filtrar ni sumar por
   esos campos desde la base, y el bloque se filtraba a la vista —
   `addFromTemplate` copiaba la descripción de la plantilla tal cual, y el CSV
   del historial se exportaba con el JSON adentro.

## Decisión

**1. Una plantilla no es plata gastada.** `ExpensesDB.getSummary` y
`getByDateRange` excluyen `recurring = true` por defecto. Quien necesite el
catálogo lo pide explícito con `{ incluirPlantillas: true }`. La pantalla de
Finanzas › Gastos muestra una franja con los fijos configurados y su total, para
que no desaparezcan sin explicación.

**2. Gastado ≠ pagado.** `getHistorialUnificado` cruza cada orden con su
`Payable` y devuelve `estadoPago` (`pagado` | `parcial` | `pendiente` |
`sin_registro`) y `montoPagado`. La pantalla muestra los tres números:
gastado, ya pagado, queda por pagar. `sin_registro` es un estado propio: una
orden sin `Payable` no permite afirmar que se pagó **ni** que se debe.

**3. La fecha de una compra es cuándo llegó.** El filtro usa `deliveryDate` y
cae en `createdAt` sólo si la orden no declara entrega. Una OC del 28 de junio
recibida el 3 de julio es gasto de julio.

**4. La metadata pasa a columnas** (`frequency`, `paymentDay`, `paymentMethod`,
`supplierName`, `supplierId`, `documentType`, `documentNumber`, `supplierRuc`,
`igvAmount`, `afectoIgv`, `attachmentUrl`, `costCenter`, `createdBy`, `notes`,
`templateId`, `paidAt`), en **expand → migrate → contract**:

- *expand*: todas nullable, aplicadas con SQL idempotente por el pooler
  (`prisma/migrations/adr-374-expense-campos-reales.sql`). Nada se borra.
- *migrate*: `scripts/backfill-374-expense-meta.mjs` copia el bloque a las
  columnas y fecha los pagos ya ejecutados. Idempotente: sólo escribe columnas
  en `NULL`.
- *contract*: limpiar el bloque de `description` — **pendiente**, cuando
  ninguna lectura dependa de él.

Mientras tanto la columna manda y el bloque queda de red: un gasto viejo que
nadie tocó sigue trayendo sus datos sólo en el texto.

**5. El pago sabe de qué plantilla salió.** `addFromTemplate` guarda
`templateId` y `paidAt`, y hereda frecuencia, método y proveedor. Antes,
responder «¿el alquiler de agosto ya está pagado?» dependía de comparar nombre
+ monto normalizados — y un aumento de alquiler rompía la correspondencia justo
cuando más importaba.

**6. `createdBy` sale de la sesión, nunca del body.**

## Consecuencias

- El P&L, el Break-even, el Presupuesto y el Reporte Semanal bajan al gasto
  realmente ejecutado. **Los números históricos de esos tableros cambian**: es
  el punto del cambio, no un efecto colateral.
- Verificado tras el cambio: `summary` y `historial` devuelven lo mismo
  (S/930,00 en 2 movimientos tras registrar dos pagos por la UI).
- `Expense` gana 16 columnas y 2 índices. La tabla es chica; el costo es
  despreciable frente a poder preguntarle a la base por método de pago.
- `supplierId` va sin FK a propósito: dar de baja a un proveedor no debe
  borrar el historial de lo que se le pagó.
- Queda pendiente la fase *contract* y sumar al historial las otras salidas de
  plata del negocio (adelantos al personal, fletes, egresos de caja): hoy sólo
  entran gastos operativos y compras a proveedor.

## Alternativas descartadas

- **Dejar `getSummary` como estaba y arreglar sólo el historial.** Era el
  camino corto y el que dejaba el error donde más caro sale: en el estado de
  resultados.
- **Marcar las plantillas con una categoría reservada** en vez de usar
  `recurring`. Habría funcionado sin migración, pero deja la semántica en una
  convención de texto — exactamente el problema que este ADR cierra.
- **Seguir con el bloque serializado y sólo decodificarlo al mostrar.** Arregla
  el síntoma visible (el JSON en el CSV) y no el estructural: los campos
  seguirían sin poder filtrarse ni sumarse.

## Referencias

- `lib/expense-meta.ts` — el bloque serializado y los helpers de vencimiento y
  duplicados que ya existían y ninguna pantalla llamaba.
- `.claude/rules/verificacion-de-verdad.md` §5 — los gates estáticos pasaron en
  verde con esta contradicción viva; se encontró midiendo los dos endpoints.
