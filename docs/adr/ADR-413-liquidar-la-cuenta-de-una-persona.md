# ADR-413 — Liquidar la cuenta de una persona: cruzar, cobrar y pagar en un solo acto con código

- **Fecha:** 2026-09-13
- **Estado:** propuesto
- **Pedido por:** Brandon — que la cuenta por persona «lleve un mejor control y menos manejo». Hoy
  muestra lo que la persona te debe y lo que le debes, pero no hay forma de saldarlo.
- **Depende de:** ADR-322 (cuenta corriente con terceros) · ADR-329 (código de operación) · ADR-412 §4-§5
  (cargo de aserrío y cuenta por persona)
- **Cierra:** de «Lo que NO cierra todavía» de ADR-322, la parte de **saldar**. La de **valorizar la
  madera recibida** sigue abierta (ver «Lo que NO se hace»).

## Contexto (medido, 2026-09-13, sólo lectura)

Tenant real `cmpxiv6p4000bohvzwl6bnfpv` (Inversiones Agroforestales BLAS):

| Qué | Cifra |
|---|---|
| Adelantos ABIERTOS | 2 · S/ 20,642 — **1 por persona** (MAMA DE ALEX S/ 3,642 · Quispe Galindo Victor S/ 17,000), ninguno con documento |
| LIQUIDADO / CANCELADO / EXCEDIDO | 1 / 1 / **0** |
| Entregas | 2 `LIBRE` · S/ 250 · 0 cuotas pactadas |
| Personas vinculadas a una parte (`forestPartyId`) | **0 de 3** |
| Movimientos en la cuenta forestal | **0** (4 partes vivas, 3 con documento) |
| Caja | 1 abierta **desde el 11/06** (3 meses), 9 movimientos; de los dos adelantos abiertos, sólo el de S/ 3,642 dejó rastro en ella |

Toda la base: 13 ABIERTOS en 2 tenants, **0 EXCEDIDO**, **0 en dólares**, una sola persona con 2
abiertos (tenant `main`, de prueba). Los 8 movimientos forestales que existen son de tenants de QA.

Lo que dice el código:

| Pieza | Estado |
|---|---|
| `AdelantosDB.registrarEntrega` | abre su propio `$transaction`: **no acepta `tx`**, no bloquea la fila del adelanto y mueve la caja fuera de la tx |
| Lecturas de `AdelantoEntrega` | sólo 2 accesos directos (`create` y `aggregate`, ambos en `registrarEntrega`); todo lo demás lee `DbAdelanto.entregas` vía `INCLUDE_FULL` |
| Saldar un EXCEDIDO | **no existe camino**: una entrega sólo baja el saldo (`valor > 0`) |
| Anular una entrega | **no existe camino** |
| `ForestCuentaMov` | saldo por cuenta, sin imputación por documento (ADR-322 §1); no mira cierre de período (ADR-412: el cobro es dato comercial, no acta) |

**Lectura:** hoy, en el tenant real, la única operación con casos es cobrar un adelanto — que
«Registrar entrega» ya hace, pero sin código del acto, sin papel que firmar y sin cruzar libretas. El
cruce se estrena cuando ADR-412 escriba cargos de aserrío y se anote la madera recibida. El modelo es
el mismo para las tres operaciones, así que se diseña entero.

## Decisión

### 1. Una liquidación es UN acto con hasta dos pasos: cruzar y pagar

Cabecera `LiquidacionCuenta` con código `LIQ-AAAA-NNNN`. Adentro, en este orden:

1. **Cruzar** (compensación) — nunca toca la caja.
2. **Pagar** lo que quede — `recibido` (la persona paga) o `hecho` (le pagas), con método y «anotar en la caja».

Las tres operaciones del pedido son combinaciones: sólo cruzar · sólo pago recibido · sólo pago hecho ·
**«dejar en cero»** = cruzar lo máximo + pagar el neto. Un código y un papel para lo que en el patio es un
solo momento frente a la persona.

### 2. Qué se escribe en cada libreta

| Paso | Adelantos (`AdelantoEntrega`) | Cuenta forestal (`ForestCuentaMov`) | Caja |
|---|---|---|---|
| **Cruzar C** (te debe en adelantos, le debes en la cuenta forestal) | entrega `LIBRE` por C, repartida entre sus adelantos · «Cruce LIQ-… con la cuenta forestal» | `cargo` · concepto **`compensacion`** · C | nada |
| **Pago recibido P** | entrega `LIBRE` por lo imputado a cada adelanto · «Pago LIQ-… (efectivo)» | `abono` · concepto `pago` · lo imputado a la cuenta | 1 `ingreso` por P, si se marca |
| **Pago hecho P** (le debes en la cuenta forestal) | — | `cargo` · concepto **`pago_hecho`** · P | 1 `egreso` por P, si se marca |

Todo lo escrito lleva `liquidacionId`; en `ForestCuentaMov.referencia` va el código LIQ, que es lo que se
lee en la cuenta y en el arqueo.

Signos, contra `unificarCuentas`: una entrega baja `teDebe`; un `cargo` lleva `madera.saldo` de negativo
hacia 0; un `abono` lo baja. Cruzar mueve el neto en C − C = 0; pagar lo mueve en ∓P. Ejemplo: adelanto
1000 + madera recibida 800 → neto 200; cruzar 800 → adelanto 200, cuenta 0, neto 200; pago recibido 200 →
todo en 0 y S/ 200 a la caja.

Conceptos nuevos en `CONCEPTOS` (la columna es `String`, sin migración): `compensacion` («Cruce con
adelantos») y `pago_hecho` («Pago entregado», tipo sugerido `cargo`). `compensacion` **no** entra al
formulario manual de Fletes › Cuenta corriente (`CONCEPTOS_MANUALES`): un cruce sin su otra pata es medio
hecho.

### 3. Imputación: el más viejo primero, a mano si se quiere, siempre `≤`

- **Partidas saldables:** cada adelanto ABIERTO en soles (orden `fechaAdelanto`) y la cuenta forestal como
  UNA partida (fecha = desde cuándo el saldo está vivo sin volver a 0).
- **FIFO por defecto.** «Repartir a mano» deja editar el monto por partida; el servidor valida que sume
  exacto y que ninguna partida reciba más que su saldo. **Nunca se crea un EXCEDIDO ni se da vuelta el
  signo de la cuenta forestal.**
- **Dentro de la cuenta forestal no se elige cargo.** La cuenta no imputa por documento (ADR-322 §1), e
  imputar ahora pediría una tabla de aplicaciones que nadie más lee. El comprobante lista los cargos que el
  pago «cubre por antigüedad» y lo rotula así: es un derivado, no un dato (rule `verificacion-de-verdad` §2).
- **Cargos de corrida (ADR-412):** el pago es un movimiento aparte y jamás edita el cargo. Si la corrida
  se amplía después, el cargo se recotiza y el pago queda; si se anula, el cargo cae y el saldo queda a
  favor de la persona — que es exactamente lo que pasó.
- **Quedan fuera** (el modal los muestra en «Queda fuera», con el motivo):

  | Qué | Por qué | Medido |
  |---|---|---|
  | Adelantos EXCEDIDO (a favor suyo) | no hay camino para saldarlos; inventarlo toca la fórmula del saldo | 0 en toda la base |
  | Adelantos en otra moneda | la cuenta forestal es en soles | 0 en toda la base |
  | Adelantos con cuotas pactadas | una entrega suelta no marca la cuota: el plan diría «pendiente» con saldo 0 | 0 en el tenant |
  | CANCELADOS | no se cobran | — |

### 4. Cruzar exige el vínculo EXPLÍCITO

La fila une por `forestPartyId` o por mismo documento (ADR-412 §5). Para **mostrar** alcanza el documento;
para **mover plata entre libretas**, no: un DNI mal tipeado cruzaría las deudas de dos personas. El servidor
resuelve la persona sólo por `AdelantoBeneficiario.forestPartyId`. Si la fila vino unida por documento, el
modal ofrece «Es la misma persona» (el `vincular_parte` que ya existe) antes de habilitar el cruce. Cobrar o
pagar dentro de UNA libreta no lo necesita.

### 5. Caja: el mismo criterio que el adelanto, una vez por acto

- `moverCaja` (`lib/adelantos/movimiento-caja.ts`) **después** del commit, **un** movimiento por el pago
  total, etiqueta `Liquidación LIQ-2026-0001 · Nombre`. Sin caja abierta, la liquidación se guarda igual.
- El **método se guarda siempre** (`metodoPago`), se mueva o no la caja: el papel dice «pagó por Yape»
  aunque el Yape no pase por el cajón. «Anotar en la caja» arranca marcado sólo con efectivo.
- La cabecera guarda `cajaMovimientoId` y `cajaResultado` (`movida` · `sin_caja` · `no_mover` · `fallo`).
  Un reintento con la misma clave **nunca** vuelve a mover la caja. Si el proceso murió entre el commit y la
  caja (`moverCaja = true`, `cajaResultado = null`), la pantalla dice «no se sabe si se anotó en la caja:
  revisa el arqueo» en vez de adivinar.
- Cruzar nunca toca la caja.

### 6. Atomicidad, idempotencia y bloqueos

Todo en **una** `prisma.$transaction` (`CTP_TX_OPTS`: 20 s):

1. `pg_advisory_xact_lock(hashtext('liq:<tenant>:benef:<id>'))` y después `…:parte:<id>` — siempre en ese orden.
2. Si ya existe `(tenantId, idempotencyKey)` → se devuelve esa liquidación con `repetida: true`, sin escribir ni mover caja.
3. `SELECT "id" FROM "Adelanto" WHERE "tenantId" = $1 AND "beneficiarioId" = $2 AND "status" = 'ABIERTO' ORDER BY "id" FOR UPDATE`.
4. Se releen las partidas **dentro del lock** (saldo forestal con `groupBy` por `tipo`, sin el tope de 2000
   de `ForestCuentaDB.listar`) y se calcula `huellaDe(partidas)`. Si difiere de la que vio la pantalla →
   **409 `plan_cambio`** con las partidas nuevas: lo que se confirmó tiene que ser lo que se escribe.
5. `planLiquidacion(partidas, intencion)` — la MISMA función pura de la vista previa. Con errores → 422.
6. `pg_advisory_xact_lock(hashtext('liq:<tenant>:codigo'))` → código (§8) → cabecera.
7. Entregas con `AdelantosDB.registrarEntregaEnTx(tx, …)`; movimientos con `ForestCuentaDB.crearDeLiquidacionEnTx(tx, …)`.
8. Commit → caja → auditoría → invalidar cachés.

P2002 en `idempotencyKey` → se relee y se responde `repetida`. P2002 en `codigo` → se reintenta la tx una
vez (mismo patrón de choque único que `forest-aserrio.db.ts`).

**`registrarEntrega` se parte en dos, sin cambiar lo que hace:** `registrarEntregaEnTx(tx, tenantId,
adelantoId, input)` lleva el cuerpo actual **más** `FOR UPDATE` sobre el adelanto (hoy dos entregas
simultáneas recalculan el saldo con un `aggregate` que no ve la otra), y `registrarEntrega` queda como
`$transaction(registrarEntregaEnTx)` + caja. Cada clase sigue siendo la única que escribe sus tablas;
`LiquidacionCuentaDB` sólo orquesta. La regla del estado (`> 0.009` ABIERTO, `< −0.009` EXCEDIDO) sale a una
función pura `estadoDelSaldo()`, que usan la entrega y la anulación.

### 7. Anular: baja lógica de todo, la caja sólo si se pide, la última primero

| Qué | Cómo |
|---|---|
| Cabecera | `anuladaAt`, `anuladaPor`, `motivoAnulacion` (obligatorio). El código **no se libera** |
| `ForestCuentaMov` con ese `liquidacionId` | `deletedAt = now()` (baja lógica, ADR-322) |
| `AdelantoEntrega` con ese `liquidacionId` | `anuladaAt = now()` (columna nueva) + recalcular saldo y estado de cada adelanto tocado; un CANCELADO sigue CANCELADO |
| Caja | **no revierte sola** (criterio de `AdelantosDB.cancel`): `devolucionCaja: MetodoPago \| null` explícito → movimiento inverso `Anulación de liquidación LIQ-… · Nombre`, guardado en `cajaReversionId` |
| Orden | sólo la **última liquidación viva de la persona** → si no, 409 «Anula primero LIQ-2026-0005». El papel de la siguiente imprimió un «saldo antes» que cuenta a ésta |
| Período cerrado del CTP | no aplica: la cuenta es dato comercial, no acta (`planDeCobro` sólo protege `duenoMadera`/`titularNombre`; `ForestCuentaDB.guardar` no mira cierre) |

Anular nunca deja un estado imposible: quitar un pago o un cruce sólo **sube** una deuda, así que ningún
adelanto pasa a EXCEDIDO por anular.

Baja lógica de la entrega, y no borrado: es plata con un tercero, igual que el movimiento forestal. Sale
barata porque toda lectura pasa por dos puntos: se filtra `anuladaAt: null` en `INCLUDE_FULL.entregas` y en
el `aggregate` de `registrarEntregaEnTx`, y los 7 archivos lectores quedan cubiertos (`estado-cuenta.ts`,
`estado-cuenta-unificado.ts`, `gestion-cobranza.ts`, `sugerencias.ts`, `AnalisisView.tsx`,
`DetalleAdelantoModal.tsx`, `AdelantosModule.tsx`). Un test fija que no aparezca otra lectura de
`adelantoEntrega` sin el filtro.

Los movimientos de una liquidación **no se editan ni se borran sueltos** desde Fletes › Cuenta corriente:
`MovimientoDeLiquidacionError` → 409, y la fila muestra «Se corrige anulando LIQ-…» (mismo patrón que
`CargoDeCorridaError`).

### 8. Código `LIQ-AAAA-NNNN`

Mismo criterio que ADR-329: por tenant y año, sale de los **emitidos** (nunca de `count(*)`), búsqueda
tolerante (`2026-7`, `liq-2026-7`). Se generaliza `lib/adelantos/codigo-operacion.ts` con el prefijo como
parámetro (default `ADL`) en vez de copiar el archivo.

Diferencia con ADR-329: el índice único es **total, no parcial**. Allá era parcial porque los adelantos
viejos no tienen código; acá toda liquidación nace con uno, y una anulada lo conserva porque ese número ya
anda escrito en un papel firmado. El año sale de `limaDateKey(fecha)`, no del reloj del servidor.

### 9. El comprobante es un acta, no un recálculo

`detalle` (JSON, `v: 1`) congela al confirmar: saldos antes/después por libreta y el neto, cada entrega y
movimiento escritos con su id, los cargos cubiertos por antigüedad y lo que quedó fuera. El PDF y el texto
para WhatsApp salen de ahí: un movimiento posterior no cambia un papel ya firmado.

PDF A4 vertical (el A5 apaisado del adelanto no alcanza para la tabla), con jsPDF cargado en demanda como
`comprobante.ts`, reusando `montoEnLetras`:

1. Negocio · «LIQUIDACIÓN DE CUENTA» · código grande a la derecha.
2. Persona, documento, fecha.
3. «Lo que se cruzó»: cada adelanto con su código y monto, contra la cuenta forestal.
4. «Lo que se pagó»: quién a quién, método y monto en cifras y en letras.
5. Tabla **Antes → Después**: Adelantos · Cuenta forestal · Neto en palabras (`leerNeto`).
6. «Queda fuera» (si hay).
7. «Ambas partes están conformes con los saldos que figuran después de esta liquidación.» · dos firmas.
8. Anulada: sello «ANULADA — motivo».

## Contrato

### Puro — `lib/cuentas/liquidacion.ts` (sin React, fetch ni Prisma)

```ts
export type DireccionPago = "recibido" | "hecho";
export { type MetodoPago } from "@/lib/adelantos/movimiento-caja"; // (tipo puro; se mueve si arrastra server-only)

export interface PartidaAdelanto {
  adelantoId: string;
  codigo: string | null;
  fecha: string;                                   // fechaAdelanto ISO
  saldo: number;                                   // saldoPendiente > 0, PEN
  modalidad: "CUENTA_CORRIENTE" | "DESCUENTO_PLANILLA";
}
export interface PartidaFuera { etiqueta: string; monto: number; moneda: string; motivo: string }

export interface PartidasDePersona {
  persona: { beneficiarioId: string | null; parteId: string | null; nombre: string; documento: string | null };
  /** Hay beneficiario Y parte unidos por `forestPartyId` — la única unión que deja cruzar. */
  cruzable: boolean;
  adelantos: PartidaAdelanto[];                    // ya en orden FIFO
  forestal: { saldo: number; desde: string | null; movimientos: MovimientoCuenta[] } | null;
  fuera: PartidaFuera[];
}

export interface SaldosPersona { adelantosTeDebe: number; maderaSaldo: number; neto: number }

export interface IntencionLiquidacion {
  fecha: string;                                   // YYYY-MM-DD (Lima)
  compensar: number;                               // 0 = no cruzar
  pago: { direccion: DireccionPago; monto: number; metodo: MetodoPago; moverCaja: boolean } | null;
  /** Ausente = FIFO. */
  imputacion?: {
    compensacion?: { adelantoId: string; monto: number }[];
    pago?: { partida: "forestal" | `adelanto:${string}`; monto: number }[];
  };
  notas?: string;
}

export interface EntregaPlaneada { adelantoId: string; codigo: string | null; valor: number; paso: "cruce" | "pago"; descripcion: string }
export interface MovimientoPlaneado { tipo: TipoMov; concepto: "compensacion" | "pago" | "pago_hecho"; monto: number; paso: "cruce" | "pago"; notas: string }
export interface CargoCubierto { movimientoId: string; fecha: string; concepto: Concepto; referencia: string | null; cubierto: number; total: number }

export interface PlanLiquidacion {
  entregas: EntregaPlaneada[];
  movimientos: MovimientoPlaneado[];
  caja: { tipo: "ingreso" | "egreso"; monto: number; metodo: MetodoPago } | null;
  compensado: number;
  pago: IntencionLiquidacion["pago"];
  antes: SaldosPersona;
  despues: SaldosPersona;
  cubiertos: CargoCubierto[];                      // derivado, rotulado «por antigüedad»
  fuera: PartidaFuera[];
}
export type ResultadoPlan = { ok: true; plan: PlanLiquidacion } | { ok: false; errores: string[] };

export interface DetalleLiquidacion extends Omit<PlanLiquidacion, "entregas" | "movimientos"> {
  v: 1;
  entregas: (EntregaPlaneada & { entregaId: string })[];
  movimientos: (MovimientoPlaneado & { movimientoId: string })[];
}
```

| Función | Entrada → salida |
|---|---|
| `saldosDe(p)` | `PartidasDePersona → SaldosPersona` (céntimos en cada paso; debe dar el mismo neto que `unificarCuentas` sin EXCEDIDO) |
| `maximoCompensable(p)` | `→ number` = `cruzable ? min(Σ adelantos, max(0, −forestal.saldo)) : 0` |
| `intencionDejarEnCero(p, fecha, metodo, moverCaja)` | `→ IntencionLiquidacion \| null` (null si no hay nada que saldar) |
| `imputarFifo(partidas, monto)` | `<T extends { saldo: number }>(T[], number) → { partida: T; monto: number }[]` |
| `fechaDeudaViva(movs)` | `MovimientoCuenta[] → string \| null` |
| `cargosCubiertosPorAntiguedad(movs, monto)` | `→ CargoCubierto[]` |
| `planLiquidacion(p, intencion)` | `→ ResultadoPlan` — cruza primero, paga sobre lo que quedó, valida `≤` en cada partida |
| `huellaDe(p)` | `→ string` (FNV-1a de ids + saldos en orden canónico; igual en cliente y servidor) |
| `leerPlan(plan, nombre)` | `→ string[]` («Se descuentan S/ 800 del adelanto ADL-2026-0003») |
| `detalleDeLiquidacion(plan, ids)` | `→ DetalleLiquidacion` |
| `motivoNoSePuedeAnular(liq, ultimaViva)` | `→ string \| null` |
| `textoLiquidacion(d)` | `LiquidacionDTO → string` (WhatsApp) |

Errores de `planLiquidacion` (tuteo, con la cifra): «Para cruzar las dos libretas, primero confirma que es la
misma persona.» · «Lo máximo que cruza es S/ Y.» · «Te debe S/ Y: el pago no puede pasar de eso.» · «Le
debes S/ Y: el pago no puede pasar de eso.» · «El reparto suma S/ X y el pago es S/ Y.» · «El adelanto
ADL-… debe S/ Y: no se le pueden imputar S/ X.» · «Ese adelanto no es de esta persona.» · «No hay nada que
liquidar.»

Zod (en el mismo archivo, siempre `safeParse`):

```ts
const METODOS = ["efectivo", "yape", "plin", "tarjeta", "transferencia"] as const;
const monto = z.number().min(0).max(9_999_999);

export const liquidacionInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    persona: z
      .object({ beneficiarioId: z.string().min(1).max(40).optional(), parteId: z.string().min(1).max(40).optional() })
      .refine((p) => p.beneficiarioId || p.parteId, "Elige a la persona"),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    compensar: monto,
    pago: z
      .object({ direccion: z.enum(["recibido", "hecho"]), monto: monto.positive(), metodo: z.enum(METODOS), moverCaja: z.boolean() })
      .nullable(),
    imputacion: z
      .object({
        compensacion: z.array(z.object({ adelantoId: z.string().min(1).max(40), monto })).max(200).optional(),
        pago: z.array(z.object({ partida: z.string().regex(/^(forestal|adelanto:[\w-]{1,40})$/), monto })).max(200).optional(),
      })
      .optional(),
    huella: z.string().min(1).max(64),
    notas: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.compensar > 0 || d.pago != null, "No hay nada que liquidar");

export const anularLiquidacionSchema = z.object({
  action: z.literal("anular"),
  motivo: z.string().trim().min(3).max(300),
  devolucionCaja: z.enum(METODOS).nullable(),
});
```

Cambios en puros existentes: `lib/forestal/cuenta-corriente.ts` (+`compensacion`, +`pago_hecho`,
+`CONCEPTOS_MANUALES`, `MovimientoCuenta.liquidacionId?`) · `lib/adelantos/codigo-operacion.ts` (prefijo
como parámetro, `PREFIJO_LIQUIDACION = "LIQ"`) · `lib/adelantos/movimiento-caja.ts` (+`etiquetaLiquidacion`,
+`etiquetaAnulacionLiquidacion`) · `lib/adelantos/saldo-adelanto.ts` (nuevo: `estadoDelSaldo(monto,
entregado) → { saldo, status }`).

### Schema — Prisma

```prisma
model LiquidacionCuenta {
  id               String    @id @default(cuid())
  tenantId         String
  /// «LIQ-2026-0001»: el número del papel firmado. Único total — una anulada lo conserva.
  codigo           String
  /// Lo genera la pantalla al abrir el modal: el doble clic devuelve la misma liquidación.
  idempotencyKey   String
  beneficiarioId   String?
  parteId          String?
  personaNombre    String
  personaDocumento String?
  fecha            DateTime
  montoCompensado  Decimal   @default(0) @db.Decimal(12, 2)
  pagoDireccion    String?   // recibido | hecho
  pagoMonto        Decimal?  @db.Decimal(12, 2)
  metodoPago       String?
  moverCaja        Boolean   @default(false)
  cajaMovimientoId String?
  cajaResultado    String?   // movida | sin_caja | no_mover | fallo
  /// Acta congelada (DetalleLiquidacion v1): el comprobante sale de acá, nunca de recalcular.
  detalle          Json
  notas            String?
  createdBy        String
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  anuladaAt        DateTime?
  anuladaPor       String?
  motivoAnulacion  String?
  cajaReversionId  String?

  @@unique([tenantId, codigo])
  @@unique([tenantId, idempotencyKey])
  @@index([tenantId, beneficiarioId, createdAt(sort: Desc)])
  @@index([tenantId, parteId, createdAt(sort: Desc)])
}

// ForestCuentaMov   + liquidacionId String?   + @@index([tenantId, liquidacionId])
// AdelantoEntrega   + liquidacionId String?   + anuladaAt DateTime?   + @@index([liquidacionId])
```

Sin relación con `Tenant` (mismo criterio que `ForestCuentaMov`): no se toca el modelo `Tenant`. Los
`liquidacionId` son texto sin FK, como `ctpEntryId`, y siempre se leen con `tenantId`.

### Migración propuesta — `prisma/migrations/adr-413-liquidar-cuenta.sql` (NO aplicada)

```sql
-- Liquidar la cuenta de una persona (ADR-413): una cabecera con código LIQ que
-- agrupa las entregas de adelanto y los movimientos forestales de un mismo acto.
--
-- EXPAND puro: una tabla nueva y columnas nullables. Ningún dato existente
-- cambia y el código actual no lee nada de esto. Idempotente. Para revertir:
-- quitar índices, columnas y la tabla, en orden inverso.
--
-- Uso: USE_POOLER=1 SQL_FILE=prisma/migrations/adr-413-liquidar-cuenta.sql node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local

-- 1. La cabecera. Las CHECK son la red: una liquidación sin persona, sin nada
--    que liquidar o con un pago a medias no puede existir aunque el código falle.
CREATE TABLE IF NOT EXISTS "LiquidacionCuenta" (
  "id"               TEXT          NOT NULL,
  "tenantId"         TEXT          NOT NULL,
  "codigo"           TEXT          NOT NULL,
  "idempotencyKey"   TEXT          NOT NULL,
  "beneficiarioId"   TEXT,
  "parteId"          TEXT,
  "personaNombre"    TEXT          NOT NULL,
  "personaDocumento" TEXT,
  "fecha"            TIMESTAMP(3)  NOT NULL,
  "montoCompensado"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  "pagoDireccion"    TEXT,
  "pagoMonto"        DECIMAL(12,2),
  "metodoPago"       TEXT,
  "moverCaja"        BOOLEAN       NOT NULL DEFAULT false,
  "cajaMovimientoId" TEXT,
  "cajaResultado"    TEXT,
  "detalle"          JSONB         NOT NULL,
  "notas"            TEXT,
  "createdBy"        TEXT          NOT NULL,
  "createdAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "anuladaAt"        TIMESTAMP(3),
  "anuladaPor"       TEXT,
  "motivoAnulacion"  TEXT,
  "cajaReversionId"  TEXT,
  CONSTRAINT "LiquidacionCuenta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LiquidacionCuenta_persona_chk" CHECK ("beneficiarioId" IS NOT NULL OR "parteId" IS NOT NULL),
  CONSTRAINT "LiquidacionCuenta_montos_chk" CHECK ("montoCompensado" >= 0 AND ("pagoMonto" IS NULL OR "pagoMonto" > 0)),
  CONSTRAINT "LiquidacionCuenta_pago_chk" CHECK (
    ("pagoDireccion" IS NULL AND "pagoMonto" IS NULL AND "metodoPago" IS NULL)
    OR ("pagoDireccion" IN ('recibido', 'hecho') AND "pagoMonto" IS NOT NULL AND "metodoPago" IS NOT NULL)
  ),
  CONSTRAINT "LiquidacionCuenta_algo_chk" CHECK ("montoCompensado" > 0 OR "pagoMonto" IS NOT NULL)
);

-- Único TOTAL (no parcial): toda liquidación nace con código y una anulada lo
-- conserva — el número ya está escrito en un papel firmado (ADR-329, sin el
-- caso de filas viejas sin código).
CREATE UNIQUE INDEX IF NOT EXISTS "LiquidacionCuenta_tenantId_codigo_key"
  ON "LiquidacionCuenta" ("tenantId", "codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "LiquidacionCuenta_tenantId_idempotencyKey_key"
  ON "LiquidacionCuenta" ("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "LiquidacionCuenta_tenantId_beneficiarioId_createdAt_idx"
  ON "LiquidacionCuenta" ("tenantId", "beneficiarioId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "LiquidacionCuenta_tenantId_parteId_createdAt_idx"
  ON "LiquidacionCuenta" ("tenantId", "parteId", "createdAt" DESC);

-- 2. La cuenta forestal: de qué liquidación salió el movimiento.
ALTER TABLE "ForestCuentaMov" ADD COLUMN IF NOT EXISTS "liquidacionId" TEXT;
CREATE INDEX IF NOT EXISTS "ForestCuentaMov_tenantId_liquidacionId_idx"
  ON "ForestCuentaMov" ("tenantId", "liquidacionId");

-- 3. Las entregas: de qué liquidación salió y, si se anuló, cuándo. `anuladaAt`
--    NULL en todas las filas existentes = ninguna lectura actual cambia.
ALTER TABLE "AdelantoEntrega" ADD COLUMN IF NOT EXISTS "liquidacionId" TEXT;
ALTER TABLE "AdelantoEntrega" ADD COLUMN IF NOT EXISTS "anuladaAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "AdelantoEntrega_liquidacionId_idx"
  ON "AdelantoEntrega" ("liquidacionId");
```

Después: `prisma generate` + reiniciar el dev server (rule `db-classes`).

### DB classes

**`lib/db/liquidacion-cuenta.db.ts` — `LiquidacionCuentaDB`** (orquesta; `tenantId` primero en todo)

| Método | Firma | Tira |
|---|---|---|
| `partidas` | `(tenantId, persona: { beneficiarioId?: string; parteId?: string }) → Promise<PartidasDePersona \| null>` | — |
| `crear` | `(tenantId, input: LiquidacionInput, usuario) → Promise<{ liquidacion: LiquidacionDTO; repetida: boolean; caja: ResultadoMovimiento \| null }>` | `PersonaNoEncontradaError` · `SinVinculoError` · `PlanCambioError(partidas, huella)` · `PlanInvalidoError(errores)` · `CuentaForestalDeshabilitadaError` |
| `listar` | `(tenantId, persona, opts?: { incluirAnuladas?: boolean; limite?: number }) → Promise<LiquidacionDTO[]>` | — |
| `obtener` | `(tenantId, id) → Promise<LiquidacionDTO \| null>` | — |
| `anular` | `(tenantId, id, { motivo, devolucionCaja }, usuario) → Promise<LiquidacionDTO \| null>` | `NoEsLaUltimaError(codigo)` · `LiquidacionYaAnuladaError` |

```ts
export interface LiquidacionDTO {
  id: string;
  codigo: string;
  fecha: string;
  persona: { beneficiarioId: string | null; parteId: string | null; nombre: string; documento: string | null };
  compensado: number;
  pago: { direccion: DireccionPago; monto: number; metodo: MetodoPago; moverCaja: boolean } | null;
  caja: { resultado: "movida" | "sin_caja" | "no_mover" | "fallo" | null; movimientoId: string | null };
  detalle: DetalleLiquidacion;
  notas: string | null;
  creadaPor: string;
  creadaEn: string;
  anulada: { en: string; por: string; motivo: string; reversionCajaId: string | null } | null;
}
```

**Primitivas en las clases dueñas** (única vía para escribir sus tablas dentro de la tx de otro):

| Clase | Método nuevo |
|---|---|
| `AdelantosDB` | `registrarEntregaEnTx(tx, tenantId, adelantoId, input: EntregaInput & { liquidacionId?: string }) → Promise<{ entregaId: string; valor: number; saldo: number; status: AdelantoStatus } \| null>` |
| `AdelantosDB` | `anularEntregasDeLiquidacionEnTx(tx, tenantId, liquidacionId) → Promise<{ adelantoIds: string[] }>` (filtra `adelanto: { tenantId }`: la entrega no tiene `tenantId` propio) |
| `ForestCuentaDB` | `crearDeLiquidacionEnTx(tx, tenantId, input: MovimientoInput & { liquidacionId: string }, usuario) → Promise<MovimientoCuenta>` |
| `ForestCuentaDB` | `bajaDeLiquidacionEnTx(tx, tenantId, liquidacionId) → Promise<number>` |
| `ForestCuentaDB` | `guardar`/`eliminar` + `assertNoEsDeLiquidacion` → `MovimientoDeLiquidacionError(codigo)` |

Fechas: la cabecera y `ForestCuentaMov.fecha` son date-only a medianoche UTC (`fechaUtc`, como la cuenta
forestal). `AdelantoEntrega.fecha` es timestamp real (0 de 11 entregas medidas caen a medianoche): `now()` si
la fecha es hoy en Lima; si no, `${fecha}T12:00:00-05:00` (mediodía de Lima, mismo día en UTC y en Lima).

### API — bajo `/api/adelantos/cuentas/` (donde vive la pantalla)

Todas: `assertCsrf` en escrituras · `applyRateLimit(req, "MODERATE", "adelantos-liquidacion")` ·
`requireAdmin(req, ["admin", "owner"])` (ver dudas) · `Cache-Control: private, no-store`.

| Endpoint | Cuerpo / query | Respuesta | Errores |
|---|---|---|---|
| `GET …/partidas?beneficiario=&parte=` | — | `{ partidas: PartidasDePersona, huella: string }` | 400 sin persona · 404 |
| `GET …/liquidaciones?beneficiario=&parte=&anuladas=1` | — | `{ liquidaciones: LiquidacionDTO[] }` | 400 |
| `POST …/liquidaciones` | `liquidacionInputSchema` | **201** `{ liquidacion, caja }` · **200** `{ liquidacion, repetida: true }` | 400 JSON · 422 `validation_error` (issues) · 422 `plan_invalido` `{ message, errores }` · 404 `persona_no_encontrada` · 409 `sin_vinculo` · 409 `plan_cambio` `{ message, partidas, huella }` · 403 `specialization_disabled` (el plan toca la cuenta forestal y el tenant no la tiene) |
| `GET …/liquidaciones/[id]` | — | `{ liquidacion }` | 404 |
| `PATCH …/liquidaciones/[id]` | `anularLiquidacionSchema` | `{ liquidacion }` | 422 · 404 · 409 `no_es_la_ultima` `{ message }` · 409 `ya_anulada` |
| `POST /api/admin/forestal/cuenta` · `DELETE ?id=` (existentes) | — | — | + 409 `movimiento_de_liquidacion` `{ message }` |

`GET /api/adelantos/cuentas` no cambia.

### UI

**Dónde:** `FilaCuentaPersona` suma el botón **«Liquidar»** junto a «Ver movimientos». Se muestra si
`|neto| > 0.005` o si hay algo que cruzar.

**Archivos** (≤ 300 líneas cada uno): `components/admin/adelantos/cuentas/liquidar/LiquidarCuentaModal.tsx`
(`AdminModal` + `useModalAccesible`) · `FormularioLiquidacion.tsx` · `VistaPreviaLiquidacion.tsx` ·
`LiquidacionesDePersona.tsx`. Hook `hooks/use-liquidacion-cuenta.ts`: `{ partidas, huella, loading, error,
previa(intencion) → ResultadoPlan, confirmar(intencion), liquidaciones, anular(id, motivo, devolucionCaja) }`;
la `idempotencyKey` sale de `crypto.randomUUID()` **una vez por apertura** del modal.

**El modal, de arriba abajo:**

1. Las dos patas y el neto con `leerNeto` (lo mismo que la fila).
2. Si la fila está unida por documento y hay algo que cruzar: aviso «Para cruzar las dos libretas,
   confirma que es la misma persona» + botón «Es la misma persona».
3. **Qué hacer** (tarjetas de opción): «Dejar en cero» (recomendada cuando se puede) · «Solo cruzar lo que
   se deben» · «Me pagó» · «Le pagué».
4. Monto (prellenado con el máximo) · método (Efectivo, Yape, Plin, Transferencia, Tarjeta) · «Anotar en la
   caja» · fecha (hoy, Lima) · notas · «Repartir a mano» (desplegable con el monto por partida, FIFO de
   partida).
5. **Vista previa** (`DataTable`; en 400 px, tarjetas): Libreta · Qué se escribe · Referencia · Monto.
   Debajo, **Antes → Después**: Adelantos · Cuenta forestal · Neto en palabras. Línea de caja: «Entran
   S/ 200 a la caja (efectivo)» / «No mueve la caja». «Queda fuera: …» si aplica. Errores del plan en rojo
   y botón deshabilitado.
6. **Confirmar liquidación** → éxito con el código grande, «Descargar comprobante» y «Copiar para WhatsApp».
   Un 409 `plan_cambio` recarga las partidas y dice «La cuenta cambió mientras la mirabas: revisa la vista
   previa».

**Historial:** al abrir «Ver movimientos», `LiquidacionesDePersona` lista código, fecha, cruzado, pagado,
caja y estado, con «PDF» y «Anular» sólo en la última viva. Anular abre `ConfirmDialog` (`aboveModals`: nace
dentro de un modal) con el motivo y, si la caja se movió, «¿Devolver a la caja?» con el método.

**Pantallas hermanas que cambian:**

| Pantalla | Cambio |
|---|---|
| `CtpCuentaCorriente.tsx` (Fletes › Cuenta corriente) | fila con `liquidacionId` → «Se corrige anulando LIQ-…» en vez del tacho; el select de concepto usa `CONCEPTOS_MANUALES` |
| `DetalleAdelantoModal.tsx` | la entrega de una liquidación muestra su código LIQ |
| `estado-cuenta.ts` · `estado-cuenta-unificado.ts` · `por-cobrar.db.ts` · Personas | sin cambio de código: leen saldos derivados y las entregas ya filtradas |

### Multi-tenant, IDOR y auditoría

- Todo id del cuerpo (`beneficiarioId`, `parteId`, cada `adelantoId` de la imputación) se relee con
  `tenantId` en el WHERE. Además, cada `adelantoId` imputado **tiene que estar en las partidas de ESA
  persona**: un id válido del tenant pero de otra persona es 422 (misma clase que el IDOR del beneficiario
  ajeno).
- La persona se resuelve en el servidor: nunca se cruza un `beneficiarioId` con un `parteId` que no sea su
  `forestPartyId`. Si mandan uno distinto → 409 `sin_vinculo`.
- `AdelantoEntrega` no tiene `tenantId`: se llega a ella por el adelanto bloqueado con `tenantId`.
- Auditoría: **una fila por acto**, `logActivity(accion, "LiquidacionCuenta", detalle, id, usuario,
  undefined, tenantId)` **con** `tenantId`. Acciones `liquidacion_cuenta_crear` / `liquidacion_cuenta_anular`;
  el detalle enumera cada pata con su monto y cómo quedó la caja. Los movimientos internos no emiten
  `ctp_cuenta_create` sueltos (serían 5 filas por un solo acto).
- Tras el commit: `ForestCuentaDB.invalidar(tenantId)`.

### Verificación (lo que tiene que pasar para decir «listo»)

1. `__tests__/cuentas-liquidacion.test.ts`: FIFO · reparto a mano que no suma · cruce ≤ mínimo · pago mayor
   que la deuda rechazado · «dejar en cero» con neto + y − · EXCEDIDO, dólares y cuotas en «Queda fuera» ·
   `huellaDe` estable · código LIQ por año y búsqueda tolerante · anular sólo la última ·
   `0.1 + 0.2` no deja cola · `saldosDe` coincide con `unificarCuentas`.
2. Por el camino del usuario, en un tenant de QA: doble clic en «Confirmar» → 1 cabecera y 1 movimiento de
   caja · agregar un movimiento entre la vista previa y el confirmar → 409 y vista previa nueva · anular →
   los saldos vuelven exactamente a «antes» · Fletes › Cuenta corriente no deja borrar un movimiento de la
   liquidación.
3. `tsc` + `lint` + screenshot del modal en claro, oscuro y a 400 px.

## Lo que NO se hace

- **No valoriza la madera recibida.** `WoodEntry` apunta a `Supplier` (`supplierId`), no a `ForestParty`: el
  abono «Madera recibida» se sigue anotando a mano. El hueco de ADR-322 sigue ahí.
- No salda adelantos EXCEDIDO, en otra moneda ni con cuotas pactadas (0 casos medidos; se revisa cuando
  aparezca el primero).
- No imputa pagos a un cargo puntual de la cuenta forestal.
- No reemplaza «Registrar entrega» del adelanto: producto, planilla y cuotas siguen por ahí.
- No edita liquidaciones: se anulan y se hace otra.
- No cruza libretas por documento sin vínculo explícito; por nombre, nunca.
- No reintenta sola la caja ni la revierte al anular sin que se pida.
- No emite comprobante SUNAT ni mueve cuentas bancarias.
- No liquida varias personas en tanda.

## De paso (medido al leer, fuera de este ADR)

1. `registrarEntrega` anota en la caja `resultado.entregas[0].valor`, y `INCLUDE_FULL` ordena las entregas por
   `fecha desc`: con una entrega **fechada en el pasado**, la caja recibe el importe de OTRA entrega. La
   partición de §6 lo arregla (usa el `valor` de la entrega recién creada).
2. `PATCH /api/adelantos/[id]` con `cancelar: true` usa `requireAdmin(req)` sin roles; el `DELETE`, que hace
   lo mismo, exige `["admin"]`.
3. Las rutas de adelantos llaman `logActivity(…, id, auth.username)` **sin `tenantId`**: el registro cae en
   `__unknown__` (cadena de auditoría, Ley 29733).
4. `siguienteCodigoDeTenant` usa `new Date().getFullYear()` del servidor (UTC): un adelanto del 31/12 después
   de las 19:00 de Lima sale con el año siguiente.

## Dudas que decide Brandon

> **Estado 2026-09-14:** se implementan las dos recomendaciones como decisión por defecto (sobrepago **rechazado**; liquidar y anular **sólo admin y dueño**). Brandon puede cambiarlas: la primera es una regla de `lib/cuentas/liquidacion.ts` y la segunda la lista de roles de las rutas.

| # | Pregunta | Recomendación |
|---|---|---|
| 1 | Si la persona paga **más** de lo que debe, ¿se rechaza o se deja el resto «a su favor» en la cuenta forestal como anticipo? | **Rechazar** con la cifra: el vuelto se da en el acto, y un anticipo es otro trato que merece su propio registro |
| 2 | ¿Quién puede liquidar y anular? | **Admin y dueño** — los mismos que hoy escriben la cuenta forestal. El cajero sigue cobrando entregas desde el adelanto |

## Referencias

`lib/adelantos/cuenta-unificada.ts` · `lib/adelantos/movimiento-caja.ts` · `lib/adelantos/codigo-operacion.ts`
· `lib/adelantos/comprobante.ts` · `lib/db/adelantos.db.ts` (`registrarEntrega`, `cancel`, `INCLUDE_FULL`) ·
`lib/db/forest-cuenta.db.ts` · `lib/db/forest-aserrio.db.ts` (lock + choque único) ·
`lib/forestal/aserrio-cobro.ts` (`cargoSeCorrigeDesdeLaCorrida`, `planDeCobro`) · `lib/db/por-cobrar.db.ts` ·
`components/admin/adelantos/cuentas/*` · `components/admin/forestal/CtpCuentaCorriente.tsx`.
