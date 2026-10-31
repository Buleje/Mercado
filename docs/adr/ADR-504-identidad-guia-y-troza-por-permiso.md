# ADR-504 — La guía es N° + permiso; la troza es código + permiso

- **Estado:** aceptado (2026-10-19). Cambio de schema en 3 pasos (expandir → código → contraer); este ADR cubre el paso 1 (contrato puro + lecturas) y deja marcado el 3.
- **Pedido por:** Brandon (19-10): «permiso 1 GTF 4 / permiso 2 GTF 4 (dos talonarios distintos)… permiso 1 código 12 / permiso 2 código 12… el sistema sólo diferenciará según el número de permiso». Dos permisos tienen talonarios propios: el mismo N° de guía y el mismo código de troza pueden existir en los dos y son cosas distintas.

## Contexto

Hasta hoy la guía se identificaba por su N° (tramo a tramo, `claveNumeroGtf`, memoria `numero-de-guia-tramo-a-tramo`) y, para separar dos titulares con la misma serie, por el dueño (`elegirGuiaDelDueno`: titular o permiso escrito). La troza, por su código: `buscarTrozaPorCodigo` hacía `findFirst` y el índice único ADR-436 cubre `(tenant, upper(btrim(codigoPlanta)))` sin permiso.

Medido en Blas (`cmpxiv6p4000bohvzwl6bnfpv`, 19-10, sólo lectura):

- **24 codificaciones SERFOR repetidas, las 24 en dos permisos** (ej. «12»: 3 trozas en 2 permisos). Con `findFirst`, consumir o retrozar «12» desde el import del libro, el asistente o la ficha SERFOR tomaba una cualquiera.
- **5 de esas 24 se repiten también dentro de UN permiso**, en dos guías distintas: ni el permiso alcanza solo para buscar por codificación; hace falta la guía.
- 0 guías vivas comparten hoy N° con permisos distintos: no porque no pase, sino porque el importador **descartaba la 2.ª** («idéntico»).
- En `main` hay plata atada a guías sin permiso (13 cubicaciones, 4 abonos, 2 pagos): asignar un permiso a esas guías mueve plata.

Tres índices únicos asumen «un N° / un código por negocio»:

| Índice | Dónde |
|---|---|
| `WoodEntryTroza_tenant_codigoPlanta_unico` | `prisma/migrations/adr-436-codigo-planta-unico.sql:41` |
| `ForestCuentaMov_tenantId_gtf_madera_vivo_key` | `prisma/migrations/20260926_guia_plata_adr437/migration.sql:37` |
| `ForestGuiaGuardada_tenantId_gtf_vivo_key` | `prisma/migrations/20260927_guias_guardadas_adr442/migration.sql:45` |

## Decisión

1. **Identidad de la guía = `GuiaRef { gtfNumber, contratoId }`** (`lib/forestal/identidad-guia.ts`, puro). Llave: `claveDeGuiaRef` = `claveNumeroGtf(N°) | contratoId ?? "∅"`. Mismo N° en dos permisos = dos guías.
2. **Al importar** (`decidirGuiaAlImportar`), una fila que llega:
   - con permiso P y existe la guía (N°, P) → `misma` (todas sus especies);
   - con P, y la única guía con ese N° está **sin permiso**, del mismo dueño, sin otro permiso escrito y con especies que coinciden → `asignar-permiso` (se le pone P; `conPlata` avisa si mueve plata);
   - con P, y hay una sin permiso que no cumple lo anterior (otro titular, otro permiso escrito, otras especies, u otras guías con ese N° en otros permisos) → `crear-con-aviso` (se crea aparte y se dice cuál podría ser): **no se adivina**;
   - con P y sólo hay ese N° en otros permisos → `otra`;
   - **sin permiso** → la sin permiso del mismo dueño; si no hay, la única con permiso que no contradiga, o la que diga el permiso escrito; si quedan dos → `ambigua`. **El titular nunca elige entre dos permisos** (un titular puede tener dos talonarios).
3. **Lectura de una ref** (`GtfNumeroDB.resolverGuia(db, tenantId, ref)` → `una | ninguna | ambigua{candidatas}`): con permiso, sólo esa; sin permiso, la misma regla que el import sin permiso.
4. **Ambigua = 409 `GUIA_AMBIGUA`** con las candidatas (`GuiaAmbiguaError`, `mensajeGuiaAmbigua`). Nunca «la primera».
5. **Plata: EN PAUSA** (ver «Plata por permiso: PAUSADA»). La plata sigue por N° de guía con el freno estricto de antes; `decidirPlataDeGuia` salió del código y vive en el parche.
6. **Identidad de la troza = código + permiso** (`claveDeTroza`, `chocanTrozas`): P1 «12» y P2 «12» no chocan; cualquiera de los dos contra un «12» **sin permiso** sí (no se sabe de cuál es). La troza lleva su propio `contratoId` (columna nueva, copia del de su ingreso al crearse; un índice no ve otra tabla).
7. **Índice nuevo con `COALESCE("contratoId", '')`** (falla segura): `(tenant, upper(btrim(codigoPlanta)), COALESCE(contratoId,''))`. Ataja P–P y ∅–∅; el P–∅ lo ataja la regla de la app (`chocanTrozas`), que va bajo el mismo candado del alta. Igual para `ForestCuentaMov` y `ForestGuiaGuardada` (N° + permiso), que con la plata en pausa quedan **sin efecto** (los viejos por N° mandan).
8. **Dentro de un archivo** (`decidirTrozasDelArchivo`): dos filas idénticas del mismo permiso **entran las dos** con aviso «Filas N y M idénticas»; la fila que ya está en la base es `ya-estaba` (re-subida, apareadas por conteo); mismo código y permiso con otros datos, o sin permiso contra con permiso → `choca`. `codigoOcupado` le dice al alta que no repita un código de planta que el índice rechazaría.
9. **`buscarTrozaPorCodigo(tenantId, codigo, ambito?)` → `una | ninguna | varias`** (tope 20), acotable por permiso o por ingresos. `varias` se trata como no encontrada + aviso en sus tres llamadores (import del libro, ficha SERFOR, asistente). Mientras la columna no esté llena, filtra por el permiso del **ingreso** (`TODO ADR-504-paso-3`).
10. **Migración en 3 pasos:**
    - **Expandir** (`20261019a`…`d`): columna `WoodEntryTroza.contratoId` + FK + índice; índices únicos nuevos con permiso **junto** a los viejos (los viejos siguen mandando: nada cambia de golpe); backfill `scripts/backfill-troza-contrato-adr504.mjs`.
    - **Código**: import y pantallas usan este contrato (la plata no: en pausa); el alta de troza copia `contratoId`; los guards (`guardCodigoPlantaUnico`) pasan a `chocanTrozas`.
    - **Contraer** (`adr-504-paso3-contract-NO-APLICAR.sql`): sólo el índice viejo de la troza (`WoodEntryTroza_tenant_codigoPlanta_unico`), cuando lo anterior esté en producción, tras re-correr el backfill y con `--ensayo` en 0. Los de plata se quedan.

## Alternativas descartadas

- **Sólo control de app, quitando el índice viejo:** sin índice, dos pestañas importando el mismo archivo duplican trozas (la carrera que ADR-436 cerró). El índice con `COALESCE` mantiene la red en la base y sólo deja pasar lo que la regla permite.
- **La serie como diferenciador** (019-001 vs 019-002): en los datos de Blas y `main`, **0 negocios** usan series distintas por permiso; los dos talonarios del pedido comparten serie.
- **Columna nueva en la troza** — descartada en ADR-503 («la troza hereda el permiso del ingreso») — **se revierte acá**: un índice único no puede mirar `WoodEntry.contratoId`, y sin la columna el código por permiso no tiene red en la base.

## Consecuencias

- Ninguna lectura puede devolver «la primera» guía o troza con un N°/código: tiene que decir `ambigua`/`varias` y la pantalla, elegir.
- El import deja de descartar la 2.ª guía con el mismo N° si es de otro permiso, y deja de descartar filas de trozas repetidas del mismo permiso (entran con aviso).
- La plata sigue por N°: dos guías N° 4 de permisos distintos comparten freno, abono `madera` y guía guardada (el comportamiento de antes). Ponerle el permiso a una guía no mueve su plata.
- Una troza vieja sin permiso con código «12» bloquea un «12» nuevo con permiso hasta que se le asigne el suyo; el backfill reduce ese caso a las guías que de verdad no tienen permiso.
- Mientras convivan los índices viejos y nuevos, el viejo sigue rechazando P1 «12» + P2 «12» en `codigoPlanta`: el código nuevo tiene que tolerar ese rechazo hasta el paso 3.

## Plata por permiso: PAUSADA (Brandon 19-10)

Brandon (19-10): «solo continúa con temas forestal que te indique; cosas con otros módulos como plata y otros, páusalos». Además, security vetó el carril de plata (CRÍTICO: pedir la guía 4 con un permiso Z que no la tiene daba «libre» → pago doble) y el reviewer encontró una ALTA (`moverPlataAlPermiso` movía el abono de otro titular).

- **Qué queda vivo (forestal):** importar todo; guía = GTF + permiso en el import (`decidirGuiaAlImportar`, `GUIA_AMBIGUA`); troza = código + permiso (columna `WoodEntryTroza.contratoId` + índice nuevo, aplicados); escáner con «varias».
- **Plata = por N° con freno estricto** (pagos, abonos, cubicaciones, fletes, gastos de guía): cualquier plata con ese N° frena, nunca pago doble. `setCosto`, cuentas, cubicaciones, fletes y sus pantallas volvieron a como estaban antes de ADR-504; `TituloGuiaDB.declarar` ya no mueve la plata al ponerle el permiso a la guía.
- **El parche:** `.claude/autonomo/adr-504-plata-pausada.patch` (40 archivos; copia de los componentes y tests nuevos en `.claude/autonomo/adr-504-plata-pausada/`). Se aplica con `git apply` sobre el árbol del commit forestal de ADR-504. Antes de reaplicarlo hay que cerrar el CRÍTICO y la ALTA de arriba.
- **Índices:** los viejos por N° (1: `ForestCuentaMov_tenantId_gtf_madera_vivo_key`, 2: `ForestGuiaGuardada_tenantId_gtf_vivo_key`) **se quedan**. Los nuevos con `COALESCE` del permiso de cuenta y guía guardada quedan **sin efecto y conviven** (el viejo es más estricto). El paso 3 sólo suelta el de la troza.
