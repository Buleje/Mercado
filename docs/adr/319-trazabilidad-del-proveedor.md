# ADR-319 — La hoja de vida del titular

- **Fecha:** 2026-07-31
- **Estado:** aceptado
- **Contexto:** directorio forestal (ADR-317) · costo de materia prima (ADR-134) · cadena del lote (ADR-315) · port de `~/proyectos/appforestal` (`proveedores`)
- **Relacionado:** ADR-315 (la misma idea, pero por lote en vez de por titular)

## El problema

Dos preguntas distintas con la misma respuesta:

- el **fiscalizador**: *"esta madera, ¿de qué titular vino y qué pasó con ella?"*
- el **dueño**: *"este proveedor, ¿me rinde? ¿a cuánto me sale su m³?"*

Ninguna se podía responder sin abrir Ingresos, filtrar por nombre y sumar a
mano — y el nombre estaba escrito de tres formas, que es justamente lo que el
directorio (ADR-317) vino a arreglar.

## La decisión

`construirTrazabilidadProveedor()` recorre **ingreso → consumo → corrida →
despacho** para un titular y devuelve guías, especies, corridas, salidas y un
balance con rendimiento y costo.

### 1. Se busca por nombre, no por id

El ingreso guarda `providerName` en texto (ADR-134). El directorio completa esa
identidad pero **no la reemplaza todavía**: migrar el histórico a `parteId` es un
paso aparte. Mientras tanto, `contains` insensible — "Maderera del Oriente SAC"
encuentra también lo que se tipeó sin el "SAC".

### 2. No se prorratea lo compartido

Si una corrida consumió madera de dos titulares, lo producido **no se reparte
entre ellos**. Se marca `compartida: true` y se cuenta como hueco. Es la misma
regla por la que las invariantes usan `≤` y no `==`: un número inventado que
parece exacto es peor que uno declarado incompleto.

### 3. Nada de ceros donde falta el dato

| Situación | Qué devuelve | Por qué no 0 |
|---|---|---|
| Sin consumo | `rendimientoPct: null` | un 0 se lee "rinde pésimo" cuando todavía no se procesó |
| Sin factura | `costoTotal: null` | un 0 fingiría madera gratis (ADR-134) |
| Consumo > volumen | `saldoM3: 0` + hueco | un negativo escondido en un total no lo ve nadie |

### 4. ⚠️ El S//m³ divide por el volumen FACTURADO

Si llegaron 100 m³ y sólo 30 tienen factura, dividir los S/ por 100 daría un
precio por m³ que **nadie cobró** — y se leería como "este proveedor me vende
barato". Se divide por `volumenConCostoM3` y la UI dice cuántas guías siguen sin
factura.

### 5. Los huecos van arriba

Si una corrida mezcló titulares, eso hay que leerlo **antes** que los números, no
en una nota al pie. Mismo criterio que la cadena del lote (ADR-315).

## Consecuencias

- Acción nueva en el Directorio, sólo en la pestaña Proveedores: un destinatario
  no "rinde", no tiene cadena hacia adelante.
- Verificado contra datos reales del tenant: 2 guías · 13.65 m³ ingresados ·
  8.45 consumidos · 6.20 producidos · **73.4 %** · 1 salida · 0 huecos.
- Sólo lectura: no escribe nada, así que no puede alterar el libro.

## Referencias

- `lib/forestal/proveedor-trazabilidad.ts` (puro) · `ForestDirectorioDB.trazabilidadProveedor()` · `__tests__/forestal-proveedor-trazabilidad.test.ts` (11 casos).
