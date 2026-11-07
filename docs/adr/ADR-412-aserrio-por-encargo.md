# ADR-412 — El aserrío por encargo se cobra al declarar: dueño, tarifa del día y cuenta

- **Fecha:** 2026-09-13
- **Estado:** aceptado
- **Pedido por:** Brandon — «cuando se va a declarar esta producción, poner el cliente, es decir quién
  es el dueño, y el precio de aserrío de ese momento; también variaciones de precio de aserrío según
  el largo y dimensiones (parámetros para que lo clasifique), precio variado según la especie
  (parámetros para hacer los importes) … y que toda esa información con la fecha vaya a la cuenta del
  dueño o cliente» en Mi Plata › Adelantos › Resumen, «para llevar un mejor control y menor manejo».
- **Depende de:** ADR-317 (directorio) · ADR-322 (cuenta corriente con terceros) · ADR-327 (titular
  del lote) · ADR-349 (paquetes) · ADR-410 (catálogo de especies en KV)
- **Absorbe:** el «dueño de la madera» de la corrida (`duenoMadera`/`titularNombre`), que se había
  numerado ADR-411 por error — ese número ya era de las cámaras del patio.

## Contexto (medido en el tenant real, 2026-09-13)

| Qué | Cifra |
|---|---|
| Corridas de producción | 14 · 85.443 m³ (≈ 36.228 PT) |
| Corridas que dicen de quién es la madera | **0** |
| Paquetes con medidas | 6 de 33 (0.24 de 85.44 m³) — el tipo tiene que salir también del producto |
| Movimientos en la cuenta corriente forestal | **0** — el concepto «Aserrío prestado» existe desde ADR-322 y nunca se usó |
| Personas en Adelantos / partes del directorio / en común | 3 / 4 / **0** |

Dos libretas que no se hablan (Adelantos y la cuenta forestal) y un servicio que se presta sin
anotarse en ninguna.

## Decisión

### 1. El dueño es una parte del directorio, por id y por nombre

`ForestCtpEntry.duenoParteId → ForestParty` + `titularNombre` copiado (acta), el mismo criterio que
el lote (ADR-327 §4). «Es de un tercero» escrito a mano sigue siendo válido para el libro, pero **no
se le puede cobrar**: una cuenta necesita a alguien con id.

### 2. La tarifa: base + ajustes, versionada por fecha, en KV

`PlatformSetting` `ctp-tarifa-aserrio:{tenantId}` (mismo criterio que ADR-410 §1: decenas de filas).

```
precio por PT = base (de la especie o la general) + ajuste por tipo + ajuste por tramo de largo
```

Tres tablas cortas y no una grilla especie × tipo × largo (392 casilleros que nadie llena, y el
vacío cobraría cero). Cada precio se explica en una línea. El tipo sale de las medidas
(`clasificarTipo`) y, si no hay, del producto declarado (`tipoComercialDelProducto`).

Versiones con `vigenteDesde`: una corrida se cotiza con la que regía **en su fecha**. Guardar otra
vez el mismo día corrige la tarifa de ese día.

### 3. El precio se calcula en el servidor y se congela en la corrida

Regla 6 del repo (totales en backend). La pantalla muestra una vista previa con la MISMA función
pura (`lib/forestal/tarifa-aserrio.ts`); el servidor la vuelve a correr y guarda
`aserrioImporte` + `aserrioDetalle` (la cotización entera: líneas, versión, avisos). Cambiar la
tarifa después no toca lo cobrado. Un precio único a mano manda sobre la tarifa y no lleva ajustes.

### 4. El cargo va a la cuenta corriente, una vez por corrida

`ForestCuentaMov` `tipo=cargo`, `concepto=aserrio_prestado`, `ctpEntryId`, `referencia="Corrida N° X"`,
fecha = la de la corrida. Índice único **parcial** `(tenantId, ctpEntryId) WHERE deletedAt IS NULL`.

- **Ampliar** una corrida recotiza sobre TODOS sus paquetes y actualiza el mismo movimiento.
- **Cambiar de dueño o de precio** actualiza el mismo movimiento (id y nombre nuevos).
- **Quitar el dueño** o **anular** la corrida da de baja el movimiento (baja lógica, ADR-322).
- **Sin precio no hay cargo**: una cotización no cobrable no escribe nada y lo informa.
- Cobrar **nunca** hace fallar la declaración: el asiento del libro es lo que se fiscaliza; si el
  cargo falla, la respuesta lo dice y se puede cobrar después desde la corrida.

No es `costoProceso`: ese es lo que le cuesta al CTP (ADR-134). Esto es lo que el CTP cobra.

### 5. Una cuenta por persona en Adelantos › Resumen

`AdelantoBeneficiario.forestPartyId` vincula a la persona con su parte. La fila une por **vínculo
explícito** o por **mismo DNI/RUC**; nunca por nombre («MAMA DE ALEX» no es un documento). Se
muestran las dos patas por separado y el neto con palabras («te debe» / «le debés»): sumar sin
mostrar esconde las dos deudas (lección del saldo de cancelados, 2026-08-04).

## Contrato

**Puro** — `lib/forestal/tarifa-aserrio.ts`: `Tarifario`, `VersionTarifa`, `versionTarifaInputSchema`,
`revisarVersion`, `guardarVersion`, `quitarVersion`, `versionVigente`, `cotizarAserrio`,
`bloquesDeCorrida`, `explicarPrecio`, `etiquetaTramo`. — `lib/adelantos/cuenta-unificada.ts`:
`unificarCuentas(...)`.

**Schema** — `prisma/migrations/adr-412-aserrio-por-encargo.sql`:
`ForestCtpEntry.duenoParteId/aserrioImporte/aserrioDetalle` · `ForestCuentaMov.ctpEntryId` ·
`AdelantoBeneficiario.forestPartyId`.

**API**

| Endpoint | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/admin/forestal/tarifa-aserrio` | — | `{ tarifario }` |
| `PUT /api/admin/forestal/tarifa-aserrio` | `VersionTarifaInput` | `{ tarifario }` · 422 `{ message }` |
| `DELETE /api/admin/forestal/tarifa-aserrio?id=` | — | `{ tarifario }` |
| `PATCH /api/admin/forestal/ctp` `declarar_produccion` / `ampliar_produccion` | + `aserrio?: { duenoParteId: string \| null; precioManualPt?: number \| null }` | + `aserrio?: ResultadoCobro` |
| `PATCH /api/admin/forestal/ctp` `cobrar_aserrio` | `{ id, duenoParteId: string \| null, precioManualPt?: number \| null }` | `{ aserrio: ResultadoCobro }` |
| `GET /api/adelantos/cuentas` | — | `{ forestal: boolean, personas: CuentaPersona[], truncado: boolean }` — `truncado` cuando la cuenta forestal llega al tope de `ForestCuentaDB.listar` (2000): la pantalla lo dice en vez de mostrar una cuenta corta como si fuera entera. Los saldos de adelantos salen de un `groupBy`, sin tope de filas |
| `PATCH /api/adelantos/beneficiarios/[id]` `vincular_parte` | `{ action, forestPartyId: string \| null }` | `{ ok }` |

`ResultadoCobro = { cobrado: boolean; importe: number | null; parteNombre: string | null; movimientoId: string | null; motivo: string | null; cotizacion: Cotizacion | null }`.

### Ausente no es `null` (corregido tras la revisión adversarial)

La primera versión trataba igual «no mandé el campo» y «lo mandé vacío», y eso cobraba lo que el
operador no eligió. Quedó así:

| Campo | Ausente | `null` | Valor |
|---|---|---|---|
| `aserrio` (declarar / ampliar) | sin cambio: recotiza si la corrida ya tiene dueño | — | ver abajo |
| `aserrio.duenoParteId` / `cobrar_aserrio.duenoParteId` | **mantener el dueño actual** | **dejar de cobrar** (baja lógica del cargo) | cobrarle a esa parte |
| `precioManualPt` | **mantener el trato actual** de la corrida | cobrar con la tarifa | precio a mano |

La pantalla sólo manda lo que el operador tocó. La primera versión de este arreglo hacía que la pantalla
arrancara con el dueño de la corrida y mandara `null` si no lo encontraba — pero dos flujos («Producción
de lote», «Declarar desde SNIFFS») no conocían el dueño, y tocar sólo el precio mandaba
`duenoParteId: null` y daba de baja el cargo. El replanteo quita esa dependencia: con «ausente = mantener»
para las dos claves, una pantalla que no sabe el dueño no puede borrarlo. Las corridas exponen además
`duenoParteId` y `aserrioPrecioManualPt` para que lo que se MUESTRA también sea cierto.

### Otros caminos que tocan el cargo

- **Purga del libro** (vaciar todo o la madera): da de baja los cargos de las corridas que borra, en la
  misma transacción. Sin esto quedaban deudas vivas de corridas que ya no existen.
- **Corregir sólo el titular** de una corrida que se cobra se rechaza: el dueño se cambia con «Cobrar
  aserrío», o el libro diría un titular y el cargo sería de otro.
- **Completar** especie, producto o cantidad recotiza, igual que corregir.
- **Parte dada de baja**: se sigue recotizando al MISMO dueño (el cargo no queda desfasado de los
  paquetes); a un dueño nuevo dado de baja no se le cobra.
- **Una parte, una persona**: índice único parcial `(tenantId, forestPartyId) WHERE forestPartyId IS NOT
  NULL` en `AdelantoBeneficiario` (`adr-412b-vinculo-unico-persona-parte.sql`); si dos personas traen la
  misma parte, la segunda se muestra sin madera — sumar el mismo saldo dos veces es plata inventada.

## Lo que NO se hace

- No cambia ningún campo del LO-CTP ni del SNIFFS: el dueño y el precio son datos comerciales.
- No emite comprobante SUNAT por el servicio.
- No une personas por nombre parecido.
- No recotiza lo ya cobrado cuando cambia la tarifa.

## Referencias

`lib/forestal/tarifa-aserrio.ts` · `__tests__/forestal-tarifa-aserrio.test.ts` ·
`lib/forestal/dueno-de-la-madera.ts` · `lib/forestal/cuenta-corriente.ts` · `lib/db/forest-cuenta.db.ts`.
