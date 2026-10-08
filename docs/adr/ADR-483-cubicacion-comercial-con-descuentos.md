# ADR-483 — Cubicación comercial con descuentos, ligada a la cuenta

- **Estado:** aceptado (2026-10-08). Construido el servidor (paso C-BE): cuentas puras, DB class, rutas, frenos y tests. Las pantallas son C-FE-O (Libro TH › GTF) y C-FE-A (Libro CTP › Despacho).
- **Pedido por:** Brandon (08-10): «en Smalian es según SERFOR, pero como yo compro es en Oxapampina descontando huecos y demás, y vincular esa cubicación a alguna cuenta» (O) · «una cubicación aparte con descuentos, la madera aserrada igual, que así vendo al cliente o me venden a mí: uno por uno con el cubicador o poniendo el volumen y el piestaje total con el precio por especie o general» (A).
- **Extiende:** ADR-478 (misma tabla, misma plata, mismos frenos). **Depende de:** ADR-440 §1 (PT oxapampino, 2 Ø), ADR-437 (plata de la guía), ADR-477 (código único de troza), ADR-430.
- **Contrato:** `.claude/autonomo/contratos-2026-10-08/K7-cubicacion-comercial.md`. Migración: `prisma/migrations/20261008_cubicacion_comercial/migration.sql` (paso C-DB).

## Contexto (medido en Blas, sólo lectura, 08-10)

La GTF viva `019-001-0000001` del Libro TH tiene 22 trozas con D1/D2/largo y declara **20,3030 m³** (Smalian, SERFOR). Con esas medidas, la Oxapampina bruta da **5 364,42 PT**; prellenada a 1 decimal (como la ve la pantalla), **5 360,24 PT**. Lo declarado pasado a PT (×424) daría 8 608,47: la Oxapampina queda **37,7 % abajo antes de descontar huecos** — por eso el comercio no paga por lo declarado. Esa GTF **no está** en el Libro CTP (`WoodEntry` sólo tiene `010-001-0000005…14`): con ADR-478 tal cual, ligarla daba 422 `GUIA_NO_ENCONTRADA`. Despachos en el Libro CTP de Blas: 0; cubicaciones de aserrada guardadas (KV): 3, sin dueño ni cuenta.

## Decisión

1. **Una tabla** (`ForestCubicacionTrozas`, aditiva): `material` `troza | aserrada`, fórmula `tablar` para la aserrada (PT = esp″ × ancho″ × largo′ ÷ 12 × cant, `cubicarPieza`), `origen` `libre | ctp | loth | despacho` + `origenId` (sin FK, validado del MISMO negocio), `modo` `pieza | total`, `volumenBruto`, `descuentos` del lote, `referenciaSmalianM3` (lo declarado por la GTF) y `cubicacionRefId` (la cubicación del Cubicador de madera de la que se copiaron las piezas). Mismo código `CUB-AAAA-NNNN` (lock `cub:{tenant}:codigo`) para todo.
2. **Descuentos** (`lib/forestal/cubicacion-comercial.ts`, puro, el mismo en servidor y pantalla):
   - troza: largo neto (L′ = largo − lo que no sirve) → menos el cilindro del hueco con L′ (`cubicarSegun(f, h, L′, h)`) → castigo %. Cada `cubicarSegun` ya redondeado; 20″ × 20″ × 10′ con hueco 6″ = 163,27 − 14,69 = **148,58 PT**;
   - pieza aserrada: piezas descartadas (≤ cantidad) y castigo % (10 × 2″ × 8″ × 10′ = 133,33 → 2 descartadas = 106,67);
   - lote: por especie (`menos` en la unidad del lote ≤ su neto; luego su %) y al final el % general.
   Se guarda bruto y neto; ningún descuento deja < 0 ni neto > bruto: 422 `DESCUENTO_INVALIDO {troza|pieza|clave}` antes de guardar (+ CHECK `volumen_neto_chk`). Castigo % ≤ 90. Sin madera que cobrar después de descontar → 422.
3. **(O) Origen `loth`**: la GTF del Libro TH del negocio (otra/borrada → 404 `ORIGEN_NO_ENCONTRADO`; de productos → 404; anulada → 422 `GUIA_ANULADA`). **No se exige en `WoodEntry`**: el N° se guarda como el del Libro CTP si la guía ya ingresó (`mismoNumeroGtf`), si no el de la GTF; el texto de guía del cuerpo se ignora. Cada troza con código igual a un ítem de la guía congela su `m3Guia` (SERFOR). El prellenado (`GET …/origen?tipo=loth`) da **2 Ø** (mayor y menor) pasados a pulgadas y pies a 1 decimal, rotulados «de la guía»: la cinta manda.
4. **(A) Aserrada**: «uno por uno» = una cubicación guardada del Cubicador de madera (KV); el servidor copia **sus** piezas por `cubicacionRefId` (el cuerpo no manda piezas con ella; id que no está → 404 `CUBICACION_REF_NO_ENCONTRADA`) o piezas cargadas; «rápida» = PT por especie (o una línea «General») que se tipea: el m³ es informativo y **el servidor nunca convierte m³ → PT para pagar** (`ptSugeridoDeM3` sólo para el rótulo «≈ sugerido»). Con `origen: despacho` el despacho tiene que ser del negocio y vivo (si no, 404) y su GTF de salida es la de la cubicación (no la del cuerpo). Sentido por defecto `venta` (le vendo: devuelve su RECIBIDO); `compra` paga su DADO.
5. **Plata**: aplicar/anular/borrar son los de ADR-478 para todo material. Valorizar por especie con **precio propio > `precioGeneral` > 422 `FALTA_PRECIO`**, en la unidad del lote (S/ por PT en Oxapampina y tablar, S/ por m³ en Smalian); la fórmula de la fila se lee tal cual (`tablar` nunca como Smalian). Las líneas que se cobran salen de `lineasDeEspecie` + `aplicarDescuentoLote` (las mismas que muestra la pantalla). La huella de idempotencia suma el precio general sólo si vino (las huellas guardadas antes siguen iguales).
6. **Frenos**: una guía, una plata (igual que hoy, por `mismoNumeroGtf`, para todo material y origen: las 5 puertas de `costoTotal` ya ven estas cubicaciones). Un despacho, una cubicación aplicada: lock `cub:{tenant}:despacho:{origenId}` y chequeo bajo el lock → 409 `DESPACHO_YA_VALORIZADO {codigo}`; al aplicar se revalida que el origen siga vivo. Orden de locks: guía → despacho → persona → fila → adelantos.
7. **El material no se cambia**: un PATCH de trozas sobre una aserrada (o al revés) → 409 `MATERIAL_DISTINTO`.
8. **Aplicar no toca `ForestCtpEntry.valorVenta`** (P&L ≠ cuenta); el prellenado del despacho trae `valorVentaLibro` (null si a alguna línea le falta: nunca 0).

## Rutas (`requireAdmin` → rol → rate limit → `spec:forestal:herramientas` → CSRF en escrituras → `safeParse`; `tenantId` del JWT)

| Ruta | Cambio | Roles |
|---|---|---|
| `GET /api/admin/forestal/cubicaciones-trozas?…&material=troza\|aserrada\|todas&origen=&origenId=` | sin `material` = sólo trozas (Herramientas y Cuenta no cambian) | admin, almacenero, dueño |
| `POST …/cubicaciones-trozas` | `material: "aserrada"` → `guardarAserradaSchema`; si no, trozas con `origen`, `origenId`, `descuentos` y `trozas[].descuento` | admin, almacenero, dueño |
| `PATCH …/[id]` | lo mismo con `version`; 409 `MATERIAL_DISTINTO` | admin, almacenero, dueño |
| `POST …/[id]/aplicar` | acepta `precioGeneral` (`precios` puede ir vacío con él) | admin, dueño |
| **`GET …/origen?tipo=loth\|despacho&id=`** | `{ prefill }` · 404 `ORIGEN_NO_ENCONTRADO` · 422 `GUIA_ANULADA`; pide además `spec:forestal:loth-libro` o `spec:forestal:ctp-libro` | admin, almacenero, dueño |

## Consecuencias

- Verificado en main por el camino de las rutas (08-10): GTF `019-001-0000771` (declara 1,208 m³) → 2 trozas prellenadas 19,7″/18,1″ × 13,1′ y 17,3″/15,7″ × 11,5′ → CUB-2026-0014 con hueco 4″ + 5 % en la 1.ª y 2 % del lote: bruto 318,79 → neto 295,09 PT; a S/ 1,50 general = S/ 442,64 al adelanto (400 → excedido) y anular lo devolvió a 400. Despacho `QA-SEM-GS-001`: rápida 100 PT − 10 % = 90 PT × S/ 2 = S/ 180 (400 → 220); la 2.ª del mismo despacho → 409 (la guía ya se pagó con CUB-2026-0015); anular → 400. Una GTF de Blas pedida desde main → 404.
- La Oxapampina con lo que prellena la guía (sin cinta) ya es ~38 % menos que lo declarado pasado a PT; es esperado (el divisor 24,5 del comercio, ADR-440), no un error.
- El dev server necesita el cliente Prisma generado con las columnas nuevas (C-DB); sin reinicio, un `select` de ellas da 500.

## Alternativas descartadas

(a) Una tabla aparte para la aserrada — duplicaba aplicar/anular/idempotencia y los frenos ya revisados. (b) Pagar por lo declarado (×424) — un derivado no es el dato, y no es como se compra. (c) Un segundo cubicador de aserrada dentro del despacho — `CubicadorMadera` ya existe; se elige su cubicación guardada. (d) Exigir la GTF del Libro TH en el Libro CTP — dejaba afuera la guía real de Blas.

## Pendientes (default tomado; decide Brandon)

P1 hueco = cilindro con el largo neto (si en la plaza se descuenta «Ø − hueco» al cuadrado, cambia sólo `trozaNeta`) · P2 ¿aplicar llena `valorVenta` del despacho vacío? hoy no · P3 una cubicación por GTF de salida, no por línea · P4 compra y venta de la misma guía siguen bloqueadas entre sí · P5 prefijo único `CUB-` · P6 «Abrir el Cubicador de madera» sólo abre la herramienta · P7 la aserrada `libre` con guía que no está en el Libro CTP se guarda como se escribió (no 422), en compra y en venta.
