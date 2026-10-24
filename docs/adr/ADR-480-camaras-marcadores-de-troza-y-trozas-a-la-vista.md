# ADR-480 — Cámaras: marcadores ArUco en la testa, «Trozas a la vista» y «Consumir»

- **Estado:** aceptado (2026-10-08). Construido: lectura en un worker de OpenCV.js, asignación y lo visto por día en el KV, «Contar ahora» y «Probar con una foto» en Cámaras › Hoy en el patio, hoja «Marcador A4 · cámara» en Imprimir etiquetas, paso «Consumir desde la cámara» en Consumos › Patio. Falta la prueba en el patio de Blas a 3/5/8 m (la hace Brandon con la hoja de prueba) y cablear la lectura EN VIVO en el mosaico (ver «Pendiente»).
- **Relacionados:** ADR-441 (lote mixto), ADR-456 §3-4 (chalecos, la cámara propone y la persona confirma), ADR-475 (vigía del mosaico), ADR-479 (personas por ropa), contrato K3 `.claude/autonomo/contratos-2026-10-08/camaras-trozas-personas.md`.
- **Pedido (Brandon, 08-10):** «Patio: 34 trozas a la vista a las 08:00» · «Consumir 12 de 34 y el CTP las trae». Marcador grande en la testa, probado antes a 3, 5 y 8 m; si falla, plan B = la cámara cerca de la sierra.

## Contexto

- Blas tiene 2 cámaras Hik-Connect 4G; el video H.265 es 1280×720 en HD y el visor arranca en SD (768×432). El QR de 2 cm de las etiquetas no se lee a 5 m.
- Un 4×4 tiene 6 celdas por lado y se lee con ≥3 px por celda (≥4 con el desenfoque del H.265). Bench del 08-10 (`node scripts/probar-marcadores.cjs --autoprueba`, 7 marcadores en 1280×720): nítido lee 7/7 desde 2 px/celda; con blur 0,8 + JPEG 50, 7/7 desde 3,3 px/celda; con blur 1,2, 7/7 desde 5,3. **0 falsos** en 36 casos. 20-57 ms por cuadro (WASM, 1 hilo).
- js-aruco2 (MIT) leyó 0/5 a 24-48 px; AprilTag 36h11 no entra en 20 cm; jsartoolkit es LGPL.

## Decisión

1. **Diccionario `DICT_4X4_250` de OpenCV**: 0-199 trozas, 200-244 chalecos/cascos (sin uso todavía), **245-249 prueba** (la hoja de 3/5/8 m: nunca se asignan a una troza). `errorCorrectionRate = 0`: mejor no leer que leer otro número (el bench lee igual que con 0,6).
2. **OpenCV.js 5.0.0-release.1 exacto** (`@techstark/opencv-js`, Apache-2.0, publicado 2026-06-24), copiado a `public/opencv/` por `scripts/copy-opencv-assets.mjs` en `postinstall` (gitignored). 13,3 MB (3,75 MB gzip) que sólo se bajan al contar.
3. **Worker propio** (`marcadores.worker.ts` + `motor-marcadores.ts`), no el de D-FINE: otro ritmo y el cuadro ENTERO (a 5 m el marcador ocupa ~20 px; achicar lo borra). OpenCV se carga con `import()` del archivo público fuera del bundler (o evaluado si el navegador no deja). Se suelta 60 s después del último uso.
4. **Imprimir sin OpenCV**: la tabla de los 250 códigos va en `lib/camaras/aruco-4x4-250.ts` (1 = celda blanca), sacada de OpenCV y comprobada ida y vuelta por el script. La hoja A4 lleva el cuadrado negro de **180 mm** (celda de 30 mm) con 15 mm de blanco: es lo más grande que entra en un A4 dejando el borde blanco que el lector necesita. ~3,2 px/celda a 5 m en HD (justo); a 8 m no alcanza (A3 o cámara más cerca).
5. **Dos modos.** «Contar ahora» (el confiable): 3 fotos que saca la propia cámara por Hik-Connect (`GET /api/admin/camaras/[id]/marcadores`, HD, no se guardan en Fotos), un id cuenta si sale en ≥2. «En vivo» (`lector-marcadores-vivo.ts`, ≥3 cuadros en ≥2 s, sólo con el cuadro quieto y en HD): la pieza existe y `crearVigia({ marcadores })` la acepta, pero todavía no se cablea (ver «Pendiente»). «Probar con una foto» lee un archivo y no guarda nada.
6. **Asignación por `trozaId`** (el código cambia con ADR-477) en `interno:camaras-marcadores:<t>`; la clave del mapa garantiza «un marcador = una troza». Se asigna al imprimir la hoja (los libres más bajos; la troza que ya tenía uno lo conserva). Un id se libera solo, al leer, cuando su troza salió del patio (corrida viva, despacho vivo, borrada o guía anulada). La troza se lee siempre con el `tenantId` del JWT.
7. **Lo visto por día** en `interno:camaras-trozas-vista:<t>:<AAAA-MM-DD Lima>` (últimas 48 pasadas + por id primera/última/cámaras). El cron de retención de personas borra los días de más de 14 en una consulta.
8. **«Consumir» no escribe nada nuevo**: lleva a `/admin?tab=ctp-libro-operaciones&vista=consumos&desdeCamara=<día>&m=3,7,12`; el Patio abre «Consumir desde la cámara» con lo apartable ya tildado y el resto con su motivo (`motivoNoElegible`, LM3), y aparta con `PATCH /api/admin/forestal/lotes-mixtos {accion:"agregar"}` (o crea el mixto con el POST de siempre).
9. **Sin schema**: KV `interno:` + un campo opcional `Camara.leeMarcadores` (acción `lee-marcadores` del PATCH de cámaras, gemela de `vigila-pila`).

## Rutas

| Ruta | Roles | Qué hace |
|---|---|---|
| `GET /api/admin/camaras/marcadores` | admin, owner, almacenero | asignaciones + libres + cámaras que pueden contar |
| `PATCH /api/admin/camaras/marcadores` | ídem | `asignar` · `vincular` · `liberar` (candado del KV, audit log) |
| `GET /api/admin/camaras/[id]/marcadores` | ídem | foto de la cámara en JPEG HD para leer (12/min por persona) |
| `POST /api/admin/camaras/[id]/marcadores` | ídem | anota una pasada en el día de Lima (30/min; ±10 min del reloj del servidor) |
| `GET /api/admin/camaras/trozas-a-la-vista` | ídem | la lista del día/pasada con el estado de cada troza |

## Consecuencias

- La cámara propone y la persona confirma; LM1-LM4 siguen mandando al apartar.
- 3,75 MB más por equipo la primera vez que alguien cuenta; nada para el resto del panel.
- Con la pestaña oculta Chrome frena los timers: «34 a las 08:00» depende de que alguien toque «Contar ahora» (o del modo en vivo con el mosaico abierto).
- Una hoja reusada sin reasignar propone la troza equivocada: lo frenan la confirmación y LM3.

## Pendiente

1. **Prueba de Brandon a 3/5/8 m** con la hoja de prueba (Cámaras › Hoy en el patio › Trozas a la vista › ⋯ › «Hoja de prueba»). Si a 5 m lee «justo» o no lee: A3 o cámara más cerca.
2. **En vivo**: pasar `crearVigia({ marcadores: camara.leeMarcadores ? crearLectorMarcadoresVivo(camaraId) : undefined })` en `use-detector-personas.ts` y pedir HD en el visor para esa cámara (archivos de ADR-479 y del visor; fuera de este cambio).
3. Probar el worker en el build de producción (Turbopack + `import()` de `public/`).

## Alternativas descartadas

js-aruco2 (0/5 a 24-48 px) · AprilTag 36h11 (10×10 celdas) y 16h5 (30 ids) · QR grande (más módulos por cm) · columna `marcador` en `WoodEntryTroza` (migración sobre la tabla central del CTP para lo que el KV resuelve con unicidad por clave) · leer en el servidor (13 MB de WASM en cada función).
