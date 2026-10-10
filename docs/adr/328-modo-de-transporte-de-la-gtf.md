# ADR-328 — La madera también sale por río

- **Fecha:** 2026-08-01
- **Estado:** aceptado
- **Contexto:** GTF de salida del CTP · Sección 4 (Salidas) del LO-CTP
- **Relacionado:** ADR-321 (guías emitidas) · ADR-317 (directorio) · port de `~/proyectos/appforestal` (`emision-gtf`)

## El problema

El formulario de la guía de salida pedía **placa**, **marca**, **tipo de
vehículo** y **conductor con licencia**. Todo correcto para un tráiler saliendo
de Pucallpa por la Federico Basadre.

En la Selva Central buena parte de la madera **no sale por carretera**: sale por
río, en chata o en balsa. Un puesto de control fluvial no busca una placa —
busca la **matrícula** de la nave y su **nombre**, y el responsable no es un
conductor con brevete sino el **patrón**.

Con el formulario anterior, el operador que despacha por río tenía dos caminos:
dejar la placa vacía —y entonces la guía no se podía imprimir— o **inventar un
dato** para poder emitir. Un documento fiscalizable no puede empujar a eso.

## La decisión

### 1. El modo cambia lo que se pide

`vehiculo.modo`: `terrestre` (default) · `fluvial` · `multimodal`.

| Modo | Identificador | Responsable | Campo extra |
|---|---|---|---|
| terrestre | Placa | Conductor | Tipo de vehículo |
| fluvial | **Matrícula** | **Patrón** | **Nombre de la embarcación** |
| multimodal | Placa | Conductor | Tipo de vehículo |

No son campos nuevos escondidos: es el **mismo campo con el nombre correcto**.
`placa` guarda la matrícula cuando el modo es fluvial, porque físicamente es lo
mismo —el identificador único del medio— y duplicar la columna obligaría a
decidir cuál mirar en cada consulta.

El multimodal se trata como terrestre a efectos de validación: en la práctica el
tramo que cruza los controles es el de carretera.

### 2. La validación y el papel dicen lo mismo

`faltantesGtf()` pide "Matrícula de la embarcación" y "Patrón" cuando el modo es
fluvial, y la impresión rotula igual. Si el formulario dijera "matrícula" y el
papel "placa", el control leería un documento que no coincide con lo que se
cargó.

### 3. El comprobante de venta entra como campo

La GTF ampara el **traslado**; la factura, la **operación**. Van juntas en un
control y hasta ahora el número de la factura sólo vivía en observaciones, donde
no se puede consultar ni validar.

`comprobante: { tipo, numero }` con `ninguno` por defecto: **la guía se emite
antes que la factura** en la mayoría de los despachos, y exigirla bloquearía el
caso normal. No entra en `faltantesGtf` por lo mismo.

## Consecuencias

- Sin migración: `gtfDatos` es un JSONB validado con Zod, y los `.default()`
  hacen que las guías ya guardadas se lean como terrestres sin tocar la base.
- El formulario cambia dos etiquetas y un campo según el modo, en vez de mostrar
  seis campos donde tres no aplican.
- La GTF impresa declara el modo de transporte, que antes no figuraba en ningún
  lado.

## Lo que NO se hace

- No se duplica `placa` en una columna `matricula`: es el mismo dato.
- No se exige el comprobante para imprimir.
- No se infiere el modo del destino: un flete a Lima puede empezar por río.

## Referencias

- `lib/forestal/ctp-gtf-datos.ts` · `__tests__/forestal-ctp-gtf-datos.test.ts`
- `lib/forestal/ctp-gtf-print.ts` · `components/admin/forestal/CtpGtfDatosForm.tsx`
