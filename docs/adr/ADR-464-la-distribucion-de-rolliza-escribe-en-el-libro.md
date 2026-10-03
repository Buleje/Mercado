# ADR-464 — La Distribución de rolliza escribe en el Libro CTP: el bloque recuerda sus trozas y arma un lote por bloque

- **Estado:** aceptado (2026-10-03). Fases 1 y 2 construidas; fase 3 pendiente. Sin cambio de schema (los campos nuevos viven dentro del JSON de la distribución guardada).
- **Relacionados:** ADR-334 (lote de aserrío), ADR-393 (un lote, un título habilitante), ADR-326/T1 (consumo por pieza), ADR-404 (sugerencia de reproceso), ADR-463 (variado); «Lotes que puedes armar» (2026-09-27).
- **Pedido (Brandon, 03-10):** que la Distribución de rolliza deje de ser una hoja aparte y escriba en el Libro: el bloque traído del Libro arma su lote y, después, cada jornada suya es una producción.

## Contexto (medido)

- `BloqueRolliza` sabía etiqueta, especie, m³, permiso y `loteId`/`paqueteId`, **pero no sus trozas**. Los tres caminos que siembran desde el Libro (`bloquesDeGuiaDe` en Resumen por permiso, `bloquesDesdeCapacidad` en Saldos «Llevar al cubicador» y el lote sobrante del mismo modal) agrupaban por guía + especie y tiraban la lista de piezas. Sin ella, crear un lote desde un bloque era volver a elegir trozas a ojo: inventar el origen (T1).
- El guardado de distribuciones (`/api/admin/forestal/distribuciones`) valida con un schema **whitelist**: un campo nuevo se borra en silencio si no se declara (el mismo agujero que ya costó `tipo` y `paqueteId`).
- «Lotes que puedes armar» propone **un lote por especie + permiso** y deduplica los pedidos por esa clave: dos bloques de Tornillo del mismo permiso (dos guías) daban UN lote y el segundo pedido se saltaba sin aviso.
- Datos (lectura, 03-10): Blas tiene 7 ingresos y 17 trozas libres, **las 17 sin permiso** en el ingreso; `main` (QA) tiene 9 trozas libres, también sin permiso. Hoy ningún bloque de esos puede armar lote: el motivo tiene que decir dónde se arregla.

## Decisión

1. **El bloque guarda sus trozas.** `BloqueRolliza.trozaIds?: string[] | null` (las piezas reales) y `corridaIds?: string[] | null` (lo ya escrito en el Libro, para la fase 3). Lo llenan sólo los caminos que siembran desde trozas sueltas: `bloquesDeGuiaDe` y las fuentes de patio de `bloquesDesdeCapacidad`. Un bloque que sale de un lote ya creado lleva `loteId` (y `origen: "lote"` en el modal del permiso), que es su referencia. Ambos se declaran en el Zod del guardado (`max 500` trozas, `MAX_TROZAS_POR_BLOQUE`); quien siembra un bloque con más no le pega la lista.
2. **Volver a traer un bloque viejo le pone sus trozas** (`unirSiembra`) sólo si es la misma madera: misma huella y el mismo m³ (±0,0005 m³, la unidad de la GTF). Si el m³ cambió, las trozas de hoy no son las de ese bloque y no se pegan.
3. **Un lote por bloque** (decisión de Brandon). «Crear lotes» en la Distribución pide al servidor, por cada bloque traído del Libro y sin lote, UN lote acotado **exactamente** a sus trozas. Se reusa la ruta de propuestas (`POST /lotes-aserrio/propuestas` con `{modo: "previsualizar" | "crear", bloques}`) y las dos puertas de siempre (`ForestLoteAserrioDB.create` + `agregarTrozas`, lock `FOR UPDATE ORDER BY id`, L-A1, ADR-393, LM4, `motivoNoElegible`). El agrupado lo sigue decidiendo `proponerLotes`: el bloque sólo se arma si sus trozas forman una única propuesta.
4. **Todo o nada por bloque.** Si una sola troza ya no puede (ya en un lote, consumida, guía sin recibir, sin especie, sin permiso, otra especie u otro permiso, de otro negocio), el bloque no se arma y se dice el motivo exacto («El ingreso no tiene permiso: corrígelo en Ingresos (guía X)»). Si en la carrera entre leer y lockear el escritor rechaza una pieza, el lote recién abierto se deshace (`softDelete` devuelve las que entraron). Un lote con menos piezas que el bloque haría declarar en la Distribución madera que el lote no tiene (I1/I2: `≤`, nunca atribuir de más).
5. **Sólo bloques traídos del Libro escriben.** Un bloque cargado a mano, importado o traído del cubicador de trozas aparece apagado con «Tráelo del Libro»; uno con `loteId` dice «Ya tiene lote» (no se arma otro: doble consumo); uno de aserrada directa no lleva lote de aserrío. El servidor no confía en eso: la pieza que ya está en un lote se rechaza igual.
6. **Rastro.** Cada lote creado audita `ctp_lote_aserrio_desde_distribucion` con el bloque de donde salió (además del alta y del `trozas_add` de las puertas). El bloque guarda el `loteId` y la distribución se persiste: en el dispositivo siempre, y en el servidor si hay una guardada abierta.

## Alternativas descartadas

- **Lote por permiso + especie** (lo que ya hace «Lotes que puedes armar»): juntaría dos guías aserradas en días distintos en un lote, y la fase 3 no podría decir qué jornada de qué bloque produjo qué.
- **Lote de inventario sin trozas** (`ORIGEN_LOTE_INVENTARIO`): cierra el número pero corta la trazabilidad pieza → GTF que exige SERFOR; es para madera que nunca pasó por la sierra.
- **Lote parcial** con las piezas que todavía se pueden: más permisivo, pero desalinea el bloque (m³ declarado) del lote (m³ real) sin que nadie lo note.

## Consecuencias

- Las distribuciones guardadas antes de este ADR siguen abriendo igual (campos `nullish`); sus bloques dicen «Tráelo del Libro» hasta que se vuelvan a traer.
- Crear el lote no consume nada: cierre de mes y `congeladoAt` aplican en la fase 3, al escribir la producción (las puertas de consumo ya los respetan).
- En Blas y en `main` hoy no se arma ningún lote: todos sus ingresos están sin permiso. El primer uso real pasa por poner el permiso en Ingresos.

## Fase 3 (pendiente)

Cada jornada del bloque (`dias`, `fecha`) es una producción en el Libro, consumiendo `trozaIds` y guardando `corridaIds`. `lib/forestal/consumo-en-jornadas.ts:127` hoy supone 1 bloque = 1 troza: hay que repartir las piezas del bloque entre sus jornadas sin partir una troza (T1) y respetar cierre/congelado.
