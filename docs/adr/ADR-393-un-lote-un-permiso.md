# ADR-393 — Un lote, un permiso: el título habilitante se elige al armarlo

- **Fecha:** 2026-09-06
- **Estado:** aceptado
- **Pedido por:** Brandon — «que en la creación de lotes se pueda escoger el número de
  permiso y luego la especie, para que en consumo se pueda escoger ese lote y se filtre
  el permiso y la especie, es decir para que no se combine con otros permisos».

## Contexto

Un lote de aserrío se **declara antes de llenarse** (ADR-342): primero se dice qué se va
a aserrar —especie, tipo de producto, ventana del proceso— y recién después se eligen las
piezas en Consumos, filtradas por esa especie.

Falta un filtro: el **título habilitante**. Hoy nada impide meter en un mismo lote trozas
de dos permisos distintos, y ahí la trazabilidad se rompe hacia adelante: la corrida que
sale de ese lote no puede decir de qué permiso salió su madera, porque salió de dos. Lo
que se despacha después arrastra esa ambigüedad hasta el certificado.

Medido en la planta al agregar la columna de permiso a Saldos: de los cinco lotes, uno
declara su permiso y cuatro no tienen ninguno en sus trozas. No hay mezclas hoy — pero
tampoco hay nada que las evite.

**Por qué no se puede derivar el permiso de las trozas.** Sería lo natural: mirar qué
títulos traen las piezas del lote. Pero el lote nace **vacío**, y el filtro tiene que
existir en el momento de elegir las piezas — que es antes de que haya ninguna. Derivarlo
llega tarde: sirve para denunciar la mezcla, no para impedirla.

## Decisión

### 1. `ForestLoteAserrio.permiso String?`

El título habilitante que el lote va a consumir, elegido al armarlo. Nullable porque los
lotes que ya existen no lo declararon y no se les inventa uno.

### 2. El modal pregunta primero por el permiso

El orden del formulario pasa a ser **permiso → especie → producto**, y cada paso acota al
siguiente: elegido un permiso, sólo se ofrecen las especies que tienen madera de ESE
permiso en el patio, con su conteo y su volumen. Es la misma idea que ya aplica la especie
sobre el tipo de producto.

«Todos los permisos» sigue disponible como opción explícita: hay CTP que trabajan con una
sola fuente y obligarlos a elegir sería fricción sin ganancia. Lo que no puede pasar es
mezclar **sin querer**.

### 3. Consumos filtra por permiso además de por especie

Un lote con permiso declarado sólo ofrece piezas de ese permiso. Un lote sin permiso se
comporta como hasta ahora — no se rompe lo que ya funciona.

### 4. La mezcla se sigue mostrando donde ya está

La columna de permiso en Saldos dice «N permisos mezclados» cuando las trozas de un lote
vienen de varios títulos. Ese aviso se queda: es la red que atrapa los lotes armados antes
de esta decisión, o por un camino que no pase por el modal (importación).

## Consecuencias

- Migración **aditiva**: columna nullable, sin backfill.
- No se bloquea nada retroactivamente: un lote viejo con permisos mezclados se sigue
  pudiendo consumir. Se ve, se avisa, no se rompe — la misma regla que el resto del libro
  (`≤`, nunca `==`; el faltante se declara, no se bloquea).
- El permiso del lote es una **declaración de intención**, no un candado sobre la troza: la
  verdad de qué permiso ampara cada pieza sigue viviendo en su ingreso (`WoodEntry.originCode`),
  que es el dato que un fiscalizador cruza.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Derivarlo de las trozas | Llega tarde: el lote nace vacío y el filtro se necesita al elegir las piezas |
| Bloquear el consumo de otro permiso | Un lote viejo con mezcla quedaría inconsumible; el libro admite huecos, no los bloquea |
| Obligar siempre a elegir permiso | Fricción para el CTP de una sola fuente, sin ganancia de trazabilidad |

## Referencias

- ADR-342 (el lote se declara antes de llenarse) · ADR-326 (consumo por pieza)
- `lib/forestal/lote-programacion.ts` — qué ofrece el modal
- `TrozaConsumible.permiso` — el título ya viaja con cada pieza del patio
