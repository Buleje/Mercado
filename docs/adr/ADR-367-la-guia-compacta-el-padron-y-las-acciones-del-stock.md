# ADR-367 — La guía compacta, el padrón en el campo y las acciones del stock

- **Fecha:** 2026-08-08
- **Estado:** Aceptado
- **Ámbito:** Libro CTP · Despacho y Productos disponibles (`CtpParteCampos`,
  `CtpGtfDatosForm`, `use-documento-lookup`, `use-directorio-forestal`,
  `CtpProductosDisponibles`, `CtpReprocesoModal`)
- **Relacionados:** ADR-316 (saldo único y reproceso), ADR-317 (la libreta),
  ADR-338 (la guía con forma de papel), ADR-349 (producción en paquetes),
  ADR-366 (la ficha del paquete)

## Contexto

Tres cosas que pidió Brandon sobre la misma pantalla, y las tres tenían la
infraestructura hecha sin puerta:

1. **La guía era una columna larguísima.** `ParteCampos` armaba dos columnas
   para siete casilleros: cuatro filas por parte, tres partes, más vehículo y
   traslado. Dentro del modal del despacho eso es scroll puro.
2. **El padrón ya se consultaba… en otro lado.** `CtpParteBarra` (ADR-317) tenía
   «Traer de SUNAT/RENIEC» contra `/api/sunat/lookup-ruc` y `/api/reniec/lookup`,
   mientras existía `/api/documento/lookup` —admin-only, con rate limit y techo
   de 6 s— **sin un solo consumidor**. Tres caminos para la misma pregunta.
3. **Productos disponibles era sólo de lectura.** El reproceso (ADR-316) tenía
   endpoint, invariante I6 y saldo… y ninguna pantalla.

## Decisión

1. **El modal de REGISTRO de la guía se compacta emparejando bloques.** Los seis
   bloques del formato iban apilados: 1874 px de contenido en 795 px visibles,
   2.4 pantallas de scroll. De a dos por fila —propietario con destinatario,
   transportista con traslado— el alto lo fija el más alto de cada par y no la
   suma; la cabecera de cada bloque pasó a una línea, los tres casilleros de
   ubicación entran con el domicilio (6 + 2+2+2) y el verificador de SERFOR
   comparte fila con la autoridad. Resultado medido: **1384 px, 1.74 pantallas**.
2. **La guía de la ficha del despacho ocupa el ancho del modal, no una columna.** Vivía en la columna
   derecha del detalle del despacho (430 px) mientras la izquierda terminaba a
   media pantalla: se pasó a hijo del grid con `md:col-span-2`. Con ~940 px la
   grilla de 12 columnas entra de verdad y cada parte cabe en **dos filas**.
   Además la cabecera del bloque (título · N° de guía · acciones) pasó de tres
   filas a una banda, y el estado de la guía (completa / faltantes / vigencia) de
   una lista a una línea con chips.
3. **La grilla la manda el contenedor, no la ventana.** `CtpParteCampos` usa
   container queries (`@container` + `@sm:grid-cols-6` / `@2xl:grid-cols-12`) y
   los `span` viajan en el `div` que envuelve al campo, no en `Field` (que mapea
   a `sm:`, o sea al viewport) — así el mismo formulario sirve tanto en el modal
   angosto como a ancho completo. El resto pasó a `sm:grid-cols-6 2xl:grid-cols-12`.
4. **El número trae los datos, en el campo donde se tipea.** `useDocumentoLookup`
   consulta al alcanzar 8 u 11 dígitos (medio segundo de espera, una consulta por
   número, caché en memoria) y `CtpParteCampos` **rellena sólo lo vacío**; si el
   padrón difiere de lo cargado aparece «Traer todo del padrón», que sí pisa. El
   tipo de documento lo decide el padrón que contestó.
5. **Un solo camino al padrón.** `consultarDocumento` de la libreta pasa a
   `/api/documento/lookup`. Los dos endpoints viejos quedan para el alta pública
   de vendors, que es su caso de uso.
6. **Productos disponibles tiene acciones por fila**: ficha del paquete
   (ADR-366), cubicación del **ANEXO N° 04** con las medidas del paquete ya
   cargadas, y **reprocesar**. El reproceso son dos actos en orden —nace la
   corrida destino en la línea de recuperación (LRE) y después se le atribuye el
   origen—; si el segundo falla se dice cómo terminarlo, porque borrar el asiento
   de una madera que ya volvió a la sierra sería negar un hecho.

## Consecuencias

- **Sólo se consulta lo que TIPEA una persona.** No alcanza con «cambió respecto
  del primer render»: el propietario se auto-completa con la Ficha después de
  montar y eso disparaba una consulta —y un rojo «SUNAT no tiene ese RUC»— sobre
  un dato que nadie escribió. La señal es el `onChange` del casillero.
- Abrir una guía disparaba tres consultas
  —propietario, destinatario, transportista— sin que nadie pidiera nada, y
  saludaba con un rojo sobre un dato viejo. El documento que ya venía cargado no
  se auto-consulta: para eso está el botón de la lupa. Medido: de 3 llamadas por
  apertura a 1.
- El volumen del anexo sale del **libro** (`paquete.volumenM3`), no de recalcular
  las medidas: si los dos números difieren, el anexo y el libro tienen que decir
  lo mismo y el que vale es el asiento.
- El reproceso descuenta del saldo de la corrida origen (ADR-316): la misma
  madera no se puede vender dos veces.
- Consultar el padrón desde el campo agrega llamadas a un servicio con cuota; por
  eso van con espera, sin repetir número y con el resultado cacheado por sesión.

## Dos bugs que sólo aparecieron midiendo en el navegador

- **El guard `vivo` nacía muerto.** `useEffect(() => () => { vivo.current = false })`
  apaga la bandera al desmontar y nunca la re-enciende: como React monta, limpia
  y re-monta cada efecto en desarrollo, la segunda vida del componente descartaba
  **todas** las respuestas del padrón. El fetch salía, volvía 200 y el formulario
  no mostraba nada. Se arregla poniendo `vivo.current = true` al montar.
- **`sm:` miente adentro de un modal.** Con la grilla en 12 columnas y el panel
  en 430 px, «Tipo doc.» quedaba en 76 px y mostraba «Tipo d…». El umbral tiene
  que salir del ancho real del hueco (`@sm` = 384 px), no del viewport de 1440.

## Verificación

Tenant real, sin credenciales de demo: RUC `20100070970` tipeado en el
destinatario trajo «SUPERMERCADOS PERUANOS S.A.» con dirección y ubigeo, y la
línea `SUNAT (guardado) · ACTIVO · HABIDO`; DNI `44120987` trajo su nombre de
RENIEC. En Productos disponibles la fila ofrece las tres acciones (8 fichas / 10
anexos / 10 reprocesos en pantalla) y el ciclo de reproceso corrió entero: corrida
destino 95053 creada, atribución `ok`, y el saldo del origen bajó de 0.8376 a
0.6282 con `reprocesado 0.2094`.
