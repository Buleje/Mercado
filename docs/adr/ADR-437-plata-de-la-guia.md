# ADR-437 — La plata de una guía: madera de servicio, precio por especie, puesto en patio y pago

- **Fecha:** 2026-09-26
- **Estado:** aceptado (en implementación)
- **Pedido por:** Brandon (26-09), sobre el modal «¿Cuánto pagaste por esta guía?» (`CtpCostoGuiaModal.tsx`)
- **Depende de:** ADR-134/135 (costo nullable, congelado al cierre) · ADR-318 (fletes) · ADR-322 (cuenta corriente) · ADR-412 (aserrío por encargo) · ADR-413 (liquidar) · ADR-421/432 (permiso como eje, ficha) · ADR-434/436 (fotos privadas firmadas)

## Contexto (medido 2026-09-26, sólo lectura)

- Blas: 11 guías vivas, 25 asientos, **0 con costo**. La sugerencia de precio nunca aparece (sale del historial, vacío).
- **8 guías (21 asientos, 135,587 m³ = 68 %) del permiso `10-HUA-PUE/PER-FMP-2026-007` son madera de WASACO: Blas sólo asierra** (confirmado por Brandon). 30 corridas `tercero` WASACO y 30 cargos `aserrio_prestado` S/ 9 785,35. Ninguna corrida consume esas guías: la marca sale del permiso y de la confirmación, no de los consumos. Hoy esas guías piden costo y cuentan «sin costo» en la ficha del permiso y en Rentabilidad.
- La madera no entra a la cuenta del proveedor: 0 movimientos `madera` en toda la base; `ForestCuentaMov` no sabe de qué guía es.
- El modal reparte un total por volumen entre asientos (≈2,3 especies por guía) con N PATCH no atómicos; el margen por especie sale falso.
- Flete (`ForestFlete.gtfNumber`) y gastos (`Expense`, sin guía) no se juntan con el costo. No hay estado de pago por guía.
- Dos libretas por persona: Adelantos (`Adelanto`) y cuenta forestal (`ForestCuentaMov`); `unificarCuentas` ya las une en «Cuenta por persona» y ADR-413 ya las liquida. Mi Plata › Movimientos (`getHistorialUnificado`, `lib/db/finance.db.ts:499`) ya marca duplicados con `duplicaDe`.
- Directorio: Nelly y Santos Muñoz sin ficha; `providerDocument` de Nelly y Santa Rosa es el mismo RUC (el de la ATFFS).
- Tenant QA forestal `op-qa-ui`: 0 guías (sembrar antes de probar).

## Decisión

### 1. «Madera de servicio» vive en el asiento y se escribe por guía
`WoodEntry.maderaDeTercero Boolean @default(false)` + `duenoParteId` + `duenoNombre` (foto del nombre).
- La DB class la escribe en **todos** los asientos vivos del mismo `gtfNumber` en una transacción (test: nunca queda mezclada).
- Booleano, no enum nullable: con `null` cada `where` necesita `OR null` y alguno de los ~40 lectores se olvida.
- Permiso: sólo **sugerencia derivada** (`duenoSugerido()`), sin columna.
- El dueño es una ficha del directorio (`ForestParty`), la misma con la que ADR-412 cobra el aserrío.
- Una guía de servicio **no lleva costo** (`costoTotal` queda `null`, nunca 0), no cuenta como «sin costo», no entra al valor del patio ni al precio en tanda; `setCosto` sobre ella → 409 `ES_MADERA_DE_SERVICIO`.

### 2. A quién le pagas: `WoodEntry.proveedorParteId`
Orden (`proveedorDeLaGuia`, pura): enlace explícito → titular del permiso (`ForestContrato.titularId`) → nombre exacto normalizado → nombre parecido (**sólo propone**). **Nunca por `providerDocument`** (RUC de la ATFFS). Sin ficha, el costo se guarda pero no entra a ninguna cuenta.

### 3. Precio por especie; la suma cierra al céntimo
Modos **un total** (reparto por volumen; el resto al último) o **por especie** (asiento = especie, ADR-312), unidad m³ o pt (rolliza: aserrable 56 %; aserrada: m³×424). La cantidad de la factura se tipea; el ≈pt nuestro se propone rotulado «≈». Σ asientos = total factura ± S/ 0,005; si no cierra se muestra la diferencia y sólo se ajusta con «Ajustar S/ X en <especie mayor>». `WoodEntry.costoDetalle Json` guarda el acta. Todo en **una** transacción por guía con los frenos de `setCosto` (período abierto, costo no congelado).

### 4. La madera entra a la cuenta del proveedor
Al guardar el costo de una compra con proveedor: **un** `ForestCuentaMov` `abono`·`madera` por guía (monto = Σ costo, `gtfNumber`, `contratoId`), índice único parcial. Se corrige desde la guía (`MaderaDeGuiaError`, patrón `CargoDeCorridaError`). Anular/rechazar la guía → baja lógica; marcar servicio también, salvo pagos imputados → 409 `TIENE_PAGOS`.

### 5. «¿Cuánto le debo?» tiene UNA respuesta
El neto de `unificarCuentas` en «Cuenta por persona». Guías sólo en `ForestCuentaMov`; plata adelantada sólo en `Adelanto`; se cruzan sólo por la compensación de una liquidación (ADR-413 §4). El concepto `adelanto` sale de `CONCEPTOS_MANUALES` de la cuenta forestal (0 filas). El modal muestra: «Por sus guías le debes S/ X · De adelantos te debe S/ Y · Neto».

### 6. Un pago es una liquidación
«Registrar pago» usa `POST /api/adelantos/cuentas/liquidaciones` con pago `hecho` (código LIQ, idempotencia, lock, caja una vez, anulación, papel) + `imputacion.guias[{gtfNumber, monto, paso}]` (movimiento partido en uno por guía con `gtfNumber` + resto sin guía) + `comprobantes` (FotoCarga[] firmadas, `LiquidacionCuenta.comprobantes`). Cada imputación `≤` lo pendiente de esa guía, calculado dentro del lock y en la huella. Relaja ADR-413 §3 sólo para guías.

### 7. Estado de pago derivado
Por parte: cargos con `gtfNumber` cubren su guía; los demás cubren FIFO por fecha (rotulado «por antigüedad»). `pagada` (pendiente ≤ S/ 0,005) · `parcial` · `pendiente`; lo pagado de más se muestra. Nunca se guarda. Servicio: sin estado de pago.

### 8. Costo puesto en patio: derivado, fuera del COGS
= madera + fletes de la guía (`tipo=ingreso`, `pagaQuien=ctp`, vivos; sin monto → «incompleto», nunca 0; `pagaQuien=proveedor` no suma) + gastos de la guía (`Expense.gtfNumber` nuevo; estiba · descarga · carguío · cubicación · vigilancia · otro). No se escribe en `costoTotal` ni `costoUnitarioSnap` (el P&L ya cuenta los `Expense`).

### 9. Mi Plata sin duplicar
Movimientos recibe la fuente `madera` (una fila por guía de compra con costo y su estado de pago). La salida de caja de una LIQ que pagó guías queda `duplicaDe = LIQ-…`. Ningún `Expense` por la madera.

### 10. Aviso en la tira
«3 guías sin pagar a Nelly · S/ 12 400»; `atrasado` si la ficha dice crédito y pasó fecha + `diasCredito`, si no `pendiente`. Nunca `bloquea`.

## Contrato

### Schema (aditivo)
```prisma
model WoodEntry {
  maderaDeTercero  Boolean @default(false)
  duenoParteId     String?
  duenoNombre      String?
  proveedorParteId String?
  costoDetalle     Json?
  @@index([tenantId, proveedorParteId])
  @@index([tenantId, duenoParteId])
}
model ForestCuentaMov { gtfNumber String?  @@index([tenantId, gtfNumber]) }
model Expense         { gtfNumber String?  @@index([tenantId, gtfNumber]) }
model LiquidacionCuenta { comprobantes Json? }
```
```sql
CREATE UNIQUE INDEX "ForestCuentaMov_tenantId_gtf_madera_vivo_key" ON "ForestCuentaMov"("tenantId","gtfNumber")
  WHERE "concepto" = 'madera' AND "gtfNumber" IS NOT NULL AND "deletedAt" IS NULL;
```
Aplicar por `:5432` (`scripts/prisma-session.mjs`), nunca `migrate deploy` por el pooler ni `SET SESSION`; luego `prisma generate` + reiniciar el dev server.

### Rutas
| Método · ruta | Rol | Cuerpo | Respuesta |
|---|---|---|---|
| `GET /api/admin/forestal/guias/plata?gtf=` | admin, almacenero, owner | — | `PlataDeGuiaDTO` |
| `PUT /api/admin/forestal/guias/plata` | admin, owner | `guardarPlataGuiaSchema` | 200 DTO · 409 `ES_MADERA_DE_SERVICIO`/`TIENE_PAGOS`/`PERIODO_CERRADO`/`COSTO_CONGELADO` · 422 `no_cierra` |
| `POST`/`DELETE /api/admin/forestal/guias/plata/gastos` | admin, owner | `gastoGuiaSchema` | `{ gasto }` / `{ ok }` |
| `GET /api/admin/forestal/guias/plata?sinPagar=1` | admin, almacenero, owner | — | `{ porParte: GuiasSinPagarDeParte[] }` |
| `POST /api/adelantos/cuentas/liquidaciones` (existe) | la actual | + `imputacion.guias` + `comprobantes` | la actual |

Todas: `requireAdmin` → CSRF en escrituras → rate limit → guard `spec:forestal:ctp-libro` → `safeParse` → `auth.tenantId`.

### Zod (`lib/forestal/plata-de-guia.ts`)
```ts
export const METODOS_PAGO = ["efectivo", "yape", "plin", "tarjeta", "transferencia"] as const; // = liquidacion.ts
export const CATEGORIAS_GASTO_GUIA = ["estiba", "descarga", "carguio", "cubicacion", "vigilancia", "otro"] as const;
export const costoDetalleSchema = z.object({
  v: z.literal(1), modo: z.enum(["total", "especie"]), unidad: z.enum(["m3", "pt"]),
  precio: z.number().positive().max(100_000).nullable(),
  cantidadFactura: z.number().positive().max(10_000_000).nullable(),
  ptDerivado: z.number().nonnegative().nullable(),
  totalFactura: soles,
});
export const guardarPlataGuiaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("servicio"), gtfNumber, duenoParteId, vistos }),
  z.object({ tipo: z.literal("compra"), gtfNumber, proveedorParteId: nullable, totalFactura: soles,
    lineas: z.array({ woodEntryId, costoTotal: soles, detalle: costoDetalleSchema }).min(1).max(50),
    anotarEnCuenta: z.boolean() /* sin .default (Zod 4 .partial) */, vistos }),
]).superRefine(/* Σ lineas = totalFactura ± 0,005; anotarEnCuenta exige proveedorParteId */);
export const gastoGuiaSchema = z.object({ id?, gtfNumber, categoria: z.enum(CATEGORIAS_GASTO_GUIA), monto: soles,
  fecha /* AAAA-MM-DD ≤ hoy Lima */, metodo: z.enum(METODOS_PAGO).nullable(), pagado: z.boolean(), pagadoA?, notas? });
```
`vistos = [{ id, antes: number|null }]` = optimistic check del costo que el usuario vio.

### Funciones puras
- `lib/forestal/madera-de-servicio.ts`: `FILTRO_REQUIERE_COSTO = { maderaDeTercero: false }`, `FILTRO_REQUIERE_COSTO_SQL`, `requiereCosto(e)`, `esSinCosto(e)`, `duenoSugerido(guiasDelPermiso, corridasDelPermiso)`.
- `lib/forestal/plata-de-guia.ts`: `ptDeLinea`, `repartirPorVolumen`, `costoPorEspecie`, `cuadrarConFactura`, `proveedorDeLaGuia`, `costoPuestoEnPatio` → `CostoPuesto`, `estadoDePagoDeGuias` → `EstadoPagoGuia[]` (invariante: Σ pendiente por parte = max(0, Σ madera − Σ cargos) cuando los únicos abonos son madera), `guiasSinPagarPorParte`, tipo `PlataDeGuiaDTO`.
- `cuenta-corriente.ts`: `MovimientoCuenta.gtfNumber?`; `CONCEPTOS_MANUALES` sin `compensacion` ni `adelanto`.
- `liquidacion.ts`: `imputacion.guias`, `MovimientoPlaneado.gtfNumber?`, `PartidasDePersona.forestal.guias`, huella con guías.
- `ctp-pendientes.ts`: `guiasSinPagar?`, filtro `"sin-pagar"`.

## Migración de Blas (WASACO)
Script `scripts/migrar-blas-wasaco-adr437.mjs`, **dry-run por defecto**, escribe sólo con `--aplicar` y autorización de Brandon; llama a `GuiaPlataDB.marcarServicio` por guía (auditoría + invalidación). Esperado antes: 8 guías · 21 asientos · 135,587 m³ · 0 con costo; después: «sin costo» del permiso 21 → 0, del tenant 25 → 4.

## Alternativas descartadas
Marca en el permiso (mezcla venta/servicio) · tabla `GuiaPago` propia (tercer camino de pago) · tabla de aplicaciones pago↔guía · guardar el costo puesto (doble conteo en P&L) · `Expense` por la madera (duplica caja y mete COGS como gasto) · enlazar por `providerDocument` (RUC de la ATFFS).

## Consecuencias
Todo aditivo. Todos los lectores de «sin costo» pasan por `requiereCosto`/`FILTRO_REQUIERE_COSTO` (el refutador corre `grep -rn "costoTotal: null\|costoTotal == null\|tieneCosto(" lib components app`). Fase 2: una corrida que consume una guía de servicio hereda `tercero` + dueño.

**No hacer:** costo 0 en servicio · guardar saldo o costo puesto · fletes/gastos en `costoTotal` · tabla de pagos aparte · enlazar por RUC · escribir en Blas desde un agente · `SET SESSION`/`migrate deploy` por pooler · `git stash`/`reset` · worktree.
