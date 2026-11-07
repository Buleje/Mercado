# ADR-465 — Croquis del aserradero: plano en metros, ubicación por pila o troza separada, siempre informativa

- **Estado:** aceptado (2026-10-03). Backend construido (rutas, KV, imagen privada, historia, limpieza de huérfanas); la pantalla la construye el frontend en paralelo contra `lib/forestal/planta-zona-types.ts` (commit `128bf90fd`). Sin cambio de schema.
- **Relacionados:** ADR-142 (Mapa de Planta sobre el satélite), ADR-434 (bucket privado `forestal-privado`), ADR-445 (`PlatformSettingsDB.actualizar`, lock por clave), ADR-326/T1 (consumo por pieza), ADR-363 (despacho sin aserrar), ADR-441 (lote mixto), ADR-418 (apartados).
- **Pedido (Brandon, 03-10):** ver la planta como es —patio de trozas, ramada, techo parabólico, carbón, leña, máquinas D1–D7— y ubicar ahí la madera del Libro, con la historia de cada troza.

## Contexto (medido)

- El satélite de Esri llega a **z17** en Constitución: el terreno de Blas (54 × 48 m) son **~46 px**. No se distingue el patio de trozas de la ramada; dibujar zonas encima es adivinar.
- Brandon tiene el plano dibujado a escala («Lámina 01/02 · Planta · Versión 8», 37 elementos en la leyenda, escala gráfica de 10 m). Medido sobre la imagen: 867 × 761 px para 54 × 48 m → 16,06 y 15,85 px/m (la escala gráfica da 15,8: coherente).
- La ubicación ya existía por guía (`ctp-planta-asignacion:{tenantId}`, `entryId → {zonaId, lat?, lng?}`), con dos bugs: (1) ubicar varias a la vez mandaba N PUT en paralelo y cada uno leía y reescribía la lista entera — sobrevivía la última; (2) las ubicaciones de madera que ya no está sólo se escondían en la lectura: en Blas, **las 8 guardadas apuntan a registros que no existen** (verificado por `SELECT` de solo lectura el 03-10).
- El Libro ya guarda las fechas de la vida de una pieza: recepción (`WoodEntryTroza.fechaRecepcion` o la de su guía), apartado en mixto (`reservadaMixtoEn`), lote (`ForestLoteAserrio.fechaApertura` / `ForestLoteMixto.repartidoEn`), consumo (`fechaConsumo` + corrida), retrozado (`fechaRetrozo`), despacho entero (`fechaDespacho` + GTF), y del producto de su corrida (`ForestCtpApartado.creadoAt/liberadoAt`, `ForestCtpDespachoOrigen`).

## Decisión

1. **Capa en metros, no en grados.** El croquis es un plano cartesiano (`L.CRS.Simple`): punto = `[y, x]` en metros, origen en la esquina inferior izquierda del terreno, `y` hacia arriba. KV `ctp-planta-croquis:{tenantId}` = `{ version, anchoM, altoM, imagenPath, maquinas[], actualizadoEn, actualizadoPor }`. `version` es la del plano (la lámina dice «Versión 8»), no un contador.
2. **Imagen de fondo en el bucket privado** `forestal-privado` (el de las fotos de la carga, ADR-434): `<tenantId>/forestal-croquis/<uuid>.webp`, convertida con sharp (≤ 3200 px, webp q88). El KV guarda la **ruta**, nunca una URL (la firmada vence a los 10 min). El cliente recibe `imagenUrl = /api/admin/forestal/ctp/planta/croquis/imagen?v=<uuid>`: esa ruta chequea sesión + tenant y responde 302 a una URL firmada fresca. Subir y guardar son dos pasos (POST imagen → `imagenRef`; PUT croquis con `imagenRef`), como las fotos; el reemplazo borra la imagen anterior (fire-and-forget).
3. **Zonas con `plano: "croquis"`** en la misma lista de zonas. Para ellas el **servidor** calcula el área con la fórmula plana (cordón de zapatos sobre metros) y el centroide, e ignora el `areaM2` que mande el cliente; nunca la geodésica. Validación: ≥ 3 puntos dentro del terreno (holgura 0,5 m) y que exista el croquis. La geometría es la misma función que dibuja la pantalla (`planta-croquis.ts`): servidor y mapa no pueden discrepar.
4. **Se ubica la pila; la troza separada manda.** La clave sigue siendo el `woodEntryId` de la guía (como llega y se apila) y se agrega `troza:<id>` para una pieza separada de su pila. El GET manda en cada pila sus `trozas` **en el patio** (`enPatio`, el mismo predicado del libro) y en todos los ítems `pt`, `piezas`, `dueno`, `permiso` sólo si el libro los tiene (pt de una pila = Σ Oxapampa **sólo si todas** sus piezas están cubicadas; una suma parcial se leería como el total).
5. **Escritura por lote, bajo lock.** `PUT /planta { asignaciones: AsignacionPlanta[] }` (≤ 500) = una lectura + una escritura dentro de `PlatformSettingsDB.actualizar` (advisory lock por clave, lectura sin caché). La forma vieja `{ entryId, zonaId }` pasa por el mismo camino. Una zona inexistente rechaza el lote entero (400). Zonas y croquis también se escriben bajo el lock.
6. **Huérfanas: se borran, pero confirmadas.** Una ubicación cuyo ítem no vino en las listas del plano es sólo *candidata*: las listas tienen tope (300 ingresos, 500 despachos) y una pila vieja con saldo puede quedar fuera. Se confirma **por id** contra la base (troza → `enPatio`; ingreso/corrida → `availableSource` con `ids`; despacho → registrado y vivo) y recién ahí se borra. La de una zona borrada se re-verifica dentro del lock contra las zonas leídas de la base (el caché de otra instancia puede no tener una zona recién creada). Cada limpieza audita `ctp_planta_limpiar`.
7. **Movimientos = sólo lo que el Libro registra.** `GET /planta/troza/[id]/historia` arma `EventoTroza[]` con las fechas del libro; donde la pieza no tiene fecha propia se usa la del documento y el `detalle` lo dice («fecha de apertura del lote»). Lo anulado no es historia viva (una corrida anulada devolvió la madera). Tenant-safe: `tenantId` en el WHERE → 404.
8. **La ubicación nunca toca stock.** Ni saldo, ni consumo, ni GTF, ni cierre: vive en KV aparte y ningún lector del libro la lee.
9. **Permisos:** ver y ubicar = admin/almacenero/owner (como el plano satelital); cambiar el croquis (medidas, imagen, máquinas) = sólo admin/owner.

## Alternativas descartadas

- **Vectorial ahora** (dibujar cada elemento como polígono en vez de imagen de fondo): semanas de trazado para algo que el plano de Brandon ya resuelve; las zonas que importan para ubicar madera sí son polígonos.
- **Página propia** del croquis: duplicaría filtros, ficha de zona y arrastre del Mapa de Planta; es una capa más del mismo mapa (el satélite queda como segunda capa).
- **Montar la imagen sobre el satélite** (georreferenciarla): a z17 el fondo no aporta y alinear 4 esquinas a mano en 46 px mete más error que el que corrige.
- **Tabla de movimientos ya**: Brandon pidió que los movimientos sean los del Libro; una tabla nueva obliga a migración y a registrar traslados que hoy nadie anota.

## Límites conocidos

- Terreno hasta **180 × 90 m**: la ubicación usa el parser compartido con el satélite (`parsearUbicaciones`, |lat| ≤ 90, |lng| ≤ 180). Un aserradero más grande necesita guardar el plano en la ubicación.
- Una sola ubicación por clave: ubicar una pila en el croquis la saca de la zona satelital (y al revés).
- La imagen reemplazada se borra fire-and-forget: si falla, queda un archivo suelto en el bucket privado.

## Fase 2 (si Brandon pide traslados a mano)

Tabla `ForestPlantaMovimiento` append-only (`tenantId`, clave, zona origen/destino, punto, quién, cuándo, motivo), escrita por el mismo PUT por lote dentro de la tx; la historia de la troza sumaría esos eventos a los del libro. Requiere migración (DIRECT_URL) y ADR propio.

## Sembrar

`scripts/sembrar-croquis-planta.mjs` carga por la API el plano v8 (`docs/forestal/croquis-blas-v8.png`, recortado al terreno), las máquinas D1–D7 y 10 zonas en metros (idempotente por código). Sembrado en `main` el 03-10. Para Blas pide sesión de Blas y `--si-es-blas`.
