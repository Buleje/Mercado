# ADR-429 — Declarar producción sin lote: modal propio, un asiento por especie, servicio y precio

- **Fecha:** 2026-09-22
- **Estado:** Aceptado (decisiones de Brandon del 22-09)
- **Ámbito:** Libro CTP (producción), cuenta corriente forestal, schema (`ForestCtpPaquete`)
- **Contrato:** `lib/forestal/declarar-produccion.ts` (tipos, Zod y cuentas puras compartidas por pantalla y servidor)

## Contexto

Pedido de Brandon en «Producir sin lote»: una tabla de resumen por especie y tipo, elegir el
tipo de servicio —**madera propia** (con un precio por especie) o **servicio de aserrío a un
tercero** (a quién, el precio y su cuenta, elegida o creada en el momento, para que quede la
deuda)—, el detalle en otra sección y todo en un **modal aparte**.

Medido antes de diseñar (lectura de solo lectura, tenant real Blas, 22-09):

| Hecho | Evidencia |
|---|---|
| El cobro a un tercero ya existe (ADR-412): parte del directorio + tarifa o precio a mano + un cargo `aserrio_prestado` en `ForestCuentaMov` | `ForestAserrioDB.cobrarCorrida`, `CtpCobroAserrio`, «Por cobrar» |
| En Blas: 15 corridas, 0 con dueño, 0 cargos, la tarifa vacía | hoy sólo cobra el precio a mano |
| «Declarar esta producción» no llamaba a nada: cambiaba de paso dentro del mismo modal | `CtpProducirSinLoteModal.tsx` |
| Con varias especies, elegir una se la ponía a **todas** las piezas: la especie real se perdía | `declararEspecie()` |
| Lo cubicado queda en el navegador después de registrar: reabrir el modal permite declarar y **cobrar dos veces** | libreta `-ctp-produccion` |
| El paquete no guarda su PT: el servidor lo recalcula desde el m³ (±0,21 PT por paquete), y PT × precio no cuadra con el importe | `cubicacion.ts` |

## Decisión

1. **Modal propio** `CtpDeclararProduccionModal` (`AdminModal aboveModals`), abierto desde
   «Producir sin lote», con secciones **Resumen** (especie × tipo: piezas · m³ · PT · precio ·
   importe), **Servicio** y **Detalle** (ordenado especie → tipo → espesor → ancho → largo).
   «Producir sin lote» queda para cubicar.
2. **Un asiento por especie.** El LO-CTP declara una especie por asiento; un lote con panguana
   y tornillo da dos corridas, cada una con sus paquetes.
3. **Madera propia**: un precio por especie en **S/ por pie tablar**, guardado en cada paquete
   (`precioVentaPt`). Sirve para valorizar lo producido y se **propone al despachar** esos
   paquetes. Sin precio → `null`, nunca 0.
4. **Servicio de aserrío**: el precio es un **trato de esa corrida** (no toca la tarifa); sin
   precio a mano, cobra la tarifa si hay una cargada. La cuenta es la parte del directorio;
   se puede crear ahí mismo (`CtpParteModal` encima). El cargo lo hace SIEMPRE
   `cobrarCorrida` (uno por corrida, con su bloqueo).
5. **Un solo pedido** `POST /api/admin/forestal/ctp/produccion-sin-lote` (admin/owner, CSRF,
   Zod `safeParse`): crea y declara todas las corridas o ninguna; el importe se calcula en el
   servidor con lo guardado (regla 6). Posible duplicado (misma fecha, especie y m³ sin lote)
   → 409 salvo `confirmarDuplicado`.
6. **Schema, sólo agregar**: `ForestCtpPaquete.pieTablar Decimal(12,2)?` y
   `ForestCtpPaquete.precioVentaPt Decimal(10,4)?`. El valor de la corrida se calcula al leer.

## Consecuencias

- El Libro deja de perder especies en lotes mezclados.
- Se cierra el doble cobro: el servidor avisa el duplicado y la pantalla vacía la libreta al
  registrar.
- El PT del paquete queda guardado: PT × precio cuadra con el importe del cargo.
- La serialización de paquetes (whitelist) y `bloquesDeCorrida` pasan a llevar `pieTablar`
  y `precioVentaPt`.

## Alternativas descartadas

- **Columna de especie en el paquete** con un solo asiento: cambia el formato del LO-CTP.
- **Reusar `valorVenta`**: es del P&L de despachos, no de la producción.
- **Catálogo de precios de venta**: ADR-418 ya lo rechazó; el sugerido sale del último precio usado.
- **Un solo asiento con la especie principal**: es lo que perdía la especie real.

## Referencias

ADR-402 (permiso declarado sin guía) · ADR-412 (cobro de aserrío) · ADR-417 (especie del
asiento) · ADR-418 (productos disponibles) · ADR-424 (directorio).
