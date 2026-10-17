# ADR-316 — Reproceso, y el saldo único de una corrida

- **Fecha:** 2026-07-30
- **Estado:** aceptado
- **Contexto:** Libro CTP · invariantes I1–I5 (ADR-134/135) · lotes (ADR-136)
- **Relacionado:** ADR-313 (retrozado, la misma idea un paso antes)

## El problema

En el aserradero un producto ya terminado vuelve a la sierra: una tabla que se
re-asierra en tablillas, un cuartón que se parte. El libro sólo modelaba
**ingreso → producción → despacho**, en un sentido. Si algo volvía, no había
dónde anotarlo y el saldo mentía.

## La decisión

### 1. El reproceso descuenta stock; el lote no

| | ¿descuenta? | por qué |
|---|---|---|
| Despacho | **sí** | la madera se fue del patio |
| **Reproceso** | **sí** | el producto original dejó de existir como tal |
| Lote | **no** | es una etiqueta comercial, no un segundo stock (ADR-136) |

`ForestCtpReproceso` espeja a `ForestCtpDespachoOrigen`: mismo patrón, misma
precisión `Decimal(14,4)`, mismo LOCK ordenado por id.

### 2. Invariante I6

```
Σ reprocesado(corrida) + Σ despachado(corrida) ≤ corrida.quantity
```

### 3. ⚠️ Lo importante no fue agregar I6 sino que I5 e I3 lo VIERAN

Hasta ahora el despacho era el único consumidor, así que I5 podía calcular
`disponible = producido − despachado` por su cuenta. Con un segundo consumidor,
dos cálculos separados dejan un hueco evidente:

> producir 10 → reprocesar 8 → despachar 10 · **cada validación pasa por
> separado**, con 8 m³ de madera que ya no existen.

Por eso el saldo se calcula **una vez**, en `lib/db/forest-ctp-saldo-corrida.ts`,
y lo usan los dos. Y **I3 también tuvo que cambiar**: es un agregado por producto
—`Σ producido − Σ despachado`— que no mira atribuciones, así que necesitaba su
propio descuento del reprocesado.

Verificado en aislamiento con un producto inventado para la prueba:

```
1. producir 10                        → 201
2. despachar 10 (sin reproceso)       → 201  permitido
3. reprocesar 8
4. despachar 10                       → 422  "Sólo quedan 2"
5. despachar 2                        → 201  permitido
```

### 4. Otras decisiones

- **La unidad tiene que coincidir; el producto no.** Reprocesar es justamente
  cambiar de producto (tabla → tablillas), pero sumar m³ contra kg daría un
  número sin significado.
- **`codigoRaiz` se hereda del primer origen**: un tablón hecho tablillas sigue
  apuntando a la corrida de la que nació, por muchos reprocesos que pasen.
- **Una corrida no se reprocesa a sí misma**, y no puede aparecer dos veces en el
  mismo reproceso (se suma, no se duplica).
- **Los reprocesos de corridas anuladas no reservan nada**: si el acta se anuló,
  la madera volvió a estar disponible.
- El picker ofrece **el mismo saldo que valida el servidor**. Un picker que
  ofrece lo que el backend niega enseña al operador a pelearse con el formulario.
- **La corrida se guarda primero y el reproceso después** (necesita su id). Si el
  segundo paso falla, la corrida queda y se avisa: perder la producción por un
  origen mal puesto sería peor.

## Consecuencias

- Código de error nuevo: `I6_SOBRE_REPROCESO` (409). Acción auditable
  `ctp_reproceso_set`.
- FK `RESTRICT` en el origen (no se borra una corrida que ya alimentó un
  reproceso) y `CASCADE` en el destino (borrar el resultado devuelve el saldo).
- `saldosDeCorridas` es ahora la única fuente del disponible de una corrida:
  cualquier consumidor futuro se suma **ahí**, no con una cuenta propia.

## Lo que NO se hace

- El lote sigue sin descontar (frontera del ADR-136).
- No se recalcula la cantidad de la corrida de origen: lo reprocesado se deriva
  del puente, no se resta del acta.
