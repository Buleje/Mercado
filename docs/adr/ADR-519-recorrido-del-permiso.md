# ADR-519 — El bloque elige sus trozas y el recorrido del permiso sigue desde el servidor

- **Estado:** aceptado (2026-10-27). Sin schema.
- **Pedido por:** Brandon (27-10): «escoje que llevar a cubicador, de eso se a distribuir por bloque… que se puedan consumir las trozas disponibles (según lo agarrado para el volumen), poner a producción… y finalmente escoger para hacer la guía según permiso distribuido… todo ese proceso bien hecho y vinculado».
- **Relacionados:** ADR-403 (Capacidad → cubicador), ADR-464 (la distribución escribe en el Libro: lote por bloque y jornadas), ADR-505 (medidas de troza), ADR-446 (Anexo 04 → despacho), ADR-326 (consumo por pieza, T1). Plan: `.claude/autonomo/recorrido-permiso/plan.md`.

## Contexto

ADR-464 y ADR-446 ya escriben cada tramo (lote por bloque, corrida por jornada, Anexo 04 → despacho), pero al 27-10 Blas tiene 0 consumos y 0 despachos, y la cadena se corta en tres puntos:

1. Un bloque sembrado desde Capacidad (permiso + especie + fuente) lleva **todas** las `trozaIds` del grupo, también las «por recepcionar», y el lote y las jornadas las consumen todas: 65 trozas (96,957 m³) para amparar 10 m³.
2. El permiso no llega a la salida: `AnexoEmitido` y `CorridaOrigen` no lo tienen, y el mejor ajuste de `anexo-a-despacho` puede atribuir la guía del permiso A a corridas del permiso B.
3. La orquestación vive en el cliente: cada jornada son dos pedidos (`consumir` → `declarar_produccion`) y el avance va en el JSON de la distribución; cerrar la pestaña a la mitad deja una corrida abierta sin declarar. `consumirEnPatio` y el despacho de trozas compensan con `softDelete` en vez de una transacción.

## Decisión

1. **Trozas elegidas.** `BloqueRolliza.trozasElegidas?: string[]` (subconjunto de `trozaIds`, en el JSON del KV de la distribución). Las propone `elegirTrozasParaBloque` (`lib/forestal/trozas-para-bloque.ts`, pura, la misma en pantalla y servidor): trozas enteras, primero las que llegaron antes al patio (Brandon 27-10), objetivo de rolliza = máx(usado ÷ % aprovechable, usado ÷ 0,56), cada día ≤ su tope, respetando las medidas (ADR-505), desempate por id. Sólo trozas elegibles por `motivoNoElegible` (T1), sin las «por recepcionar» y sin mes cerrado ni congelado. Si no alcanza, se elige lo que hay y el faltante queda `faltaM3` / `sinAtribuir` (Brandon 27-10: «registrar lo que alcanza»), nunca se fuerza. El lote y las jornadas leen `trozasElegidas ?? trozaIds`.
2. **Un paso, una transacción; el estado se deriva del Libro.** `registrarJornadaEnTx` compone crear la corrida + consumir piezas y m³ + declarar en UNA transacción (sin compensación). `GET /api/admin/forestal/distribuciones/encadenado` devuelve el estado de cada paso del bloque leyendo el Libro (lote por `loteId`, corridas vivas, despachos del anexo); `POST` ejecuta desde el paso pendiente. Nada guarda una segunda verdad del avance.
3. **Permiso en la salida.** `AnexoEmitido.permiso` (JSON) y `CorridaOrigen.permiso` (derivado de `WoodEntry.originCode` / `corrida.originCode`); la propuesta de despacho excluye corridas de otro permiso y lo que no alcanza queda en `sinAtribuirM3` (siempre `≤`).
4. **Sin lote comercial en la cadena** (Brandon 27-10: la salida va directo desde la producción); el paso queda apagado.

## Alternativas descartadas

- **Consumir todo el grupo** (lo de hoy): el rendimiento queda falso y las trozas siguen físicamente en el patio.
- **Elegir sólo a mano** en «Lotes › Trozas»: lento y no controla el tope del 56 %.
- **Reservar al sembrar**: pide schema; queda para después. Mientras, se avisa si otra distribución guardada ya eligió la misma troza.
- **Una transacción para todo el recorrido**: la bandeja de anexos puede quedar tomada hasta 60 s, `CTP_TX_OPTS` corta a los 20 s y se mezclan órdenes de lock (ingresos / corrida→trozas / bandeja→producción→paquetes) → deadlock.
- **Tabla de ejecuciones**: segunda verdad que se desincroniza del Libro.

## Consecuencias

- El Libro consume sólo lo que el bloque ampara; las demás trozas siguen libres en Capacidad.
- Cerrar la pantalla a la mitad ya no deja corridas abiertas sin declarar; el recorrido sigue desde el paso pendiente.
- Una guía de salida sólo se atribuye a corridas de su permiso.
- Cada paso sigue bajo cierre de mes, congelado, I1-I6, L1 y T1-T3; declarar producción puede cobrar aserrío (ADR-412).
