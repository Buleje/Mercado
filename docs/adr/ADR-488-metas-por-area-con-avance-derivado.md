# ADR-488 — Metas por área con avance derivado

- **Estado:** aceptado (2026-10-09). Capa de datos construida. Los dos `CHECK` nuevos ya están en la base (leído 2026-10-09 15:15 con `pg_get_constraintdef`); el `.sql` es repetible y `apply-sql.mjs --dry-run` lo imprime sin ejecutar. Falta la pasada de `security` sobre el lote antes del merge.
- **Pedido por:** Brandon (09-10): «vamos a Metas y Logros y quiero que lo mejores en diseño y lo vincules con todo lo que tiene que ser vinculado: con ventas, compras, todo, para que funcione correctamente; también incluye metas forestales de cubicaciones y demás, vincúlalo con todas, marketplace y demás, y su descripción: decir a cuál le pertenece tal meta». Aprobó ampliar en la base las categorías y los períodos.
- **Extiende:** ADR-415 (metas y tareas por tenant, listas cerradas como `CHECK` sobre `TEXT`). **Schema:** sólo los `CHECK` `AdminGoal_category_chk` y `AdminGoal_period_chk`; ni columnas, ni índices, ni datos.

## Contexto (medido, sólo lectura)

- `AdminGoal` tiene **0 filas en toda la base** (2026-10-09). Sus 6 `CHECK` son los de `adr-415-metas-y-tareas.sql`: 7 categorías de bodega (`ventas`, `pedidos`, `clientes`, `productos`, `caja`, `ticket_promedio`, `retencion`) y 3 períodos (`diario`, `semanal`, `mensual`).
- **Cuatro sistemas de metas que no se hablaban:** (1) `AdminGoal` en «Metas» (`GoalsTab`), con el avance (`current`) **tipeado** y precargado por una cuenta del navegador (`pickAutoCurrent`); (2) las metas diaria/semanal/mensual de «Hoy» y «Semana/Mes» en `localStorage` (3000/5000/50000, distintas en cada navegador); (3) los logros, otra vez en `localStorage` (`achievements`) más `/api/admin/achievements`; (4) la «meta de ventas» del Resumen (`hooks/use-meta-de-ventas.ts`), que lee `AdminGoal` pero no el avance. Una meta no decía a qué área pertenecía, de qué módulo salía su cifra ni llevaba a él.
- No había forma de ponerse una meta de compras, gastos, marketplace, aserradero (ingreso, producción, despacho, cubicación) ni Libro TH, ni metas de trimestre o año.

## Decisión

1. **Categorías por área.** La lista cerrada crece de 7 a 22, agrupadas en 9 áreas: Ventas (`ventas`, `ticket_promedio`, `pedidos`, `productos`), Clientes (`clientes`, `retencion`), Caja y cobranza (`caja`, `fiados_cobrados`), Compras y gastos (`compras`, `gastos`), Marketplace (`marketplace_ventas`, `marketplace_pedidos`), Aserradero CTP (`madera_ingresada`, `produccion`, `despacho`, `venta_madera`, `cubicacion`, `cubicador`), Bosque LO-TH (`loth_tala`, `loth_trozado`), Equipo (`tareas`) y A mano (`manual`). Períodos: + `trimestral` y `anual`.
2. **Un solo catálogo** (`lib/admin/metas-catalogo.ts`, sin `server-only`): por categoría, área, nombre, unidades permitidas, sentido (`sube` o `baja` = tope, sólo `gastos`), «qué mide», «sale de» y el destino del enlace (`hrefDeMeta` usa `hrefDeDestino` de `lib/admin/enlaces-panel.ts`). Los ids son los mismos valores del `CHECK` y de `CATEGORIAS_META`; un test lee el `.sql` y exige que las tres listas sean iguales.
3. **El avance se deriva al leer.** Sale de los datos reales de la ventana del período, por las clases `lib/db` existentes (calculadoras en `lib/metas/avance/*`, contrato en `tipos.ts`). `current` sólo se anota en `manual`:
   - **Zod** (`metaCrearSchema`/`metaEditarSchema`, `superRefine`): con una categoría que no es `manual`, `current > 0` da el issue `avance_solo_manual` y una unidad fuera de `unidades` da `unidad_no_valida` → 422 con el texto en tuteo (`MENSAJES_REGLA_META`). Sin unidad, la `[0]` del catálogo (`normalizarUnidad`).
   - **`AdminGoalsDB.editar`** (PATCH sin categoría en el cuerpo): la regla va en el `WHERE` del `updateMany`, no en un `if` después — `{ current }` escribe sólo `WHERE category = 'manual'`; con categoría o unidad lee la guardada y escribe sólo `WHERE category = <la leída>` (si otro la cambió en el medio → 409, sin pisar). Cero filas en una meta de otro negocio → 404, nunca 422 (no revela que existe). Pasar de `manual` a otra deja `current = 0`.
4. **Ventana en el día de Lima** (`lib/admin/metas-periodo.ts`): diaria, semana lunes-domingo, mes, trimestre calendario (ene-mar…) y año. La meta es recurrente y mide la ventana que contiene hoy; si su vencimiento ya pasó, mide la ventana que lo contiene y queda `cerrada` cuando esa ventana termina. `ritmoEsperado` (línea recta, `null` en un día) y `estadoDeMeta` (`cumplida`, `en_camino`, `atrasada`, `pasada_del_tope`, `no_cumplida`, `sin_dato`) son la misma cuenta en el servidor y en la pantalla.
5. **Caché** por (negocio, categoría, unidad, ventana): `claveCacheAvance`, 60 s ventana abierta y 600 s cerrada; `AdminGoalsDB` borra `metas-avance:<tenantId>:` tras crear, editar o borrar.
6. **SQL repetible** (`prisma/migrations/adr-488-metas-por-area.sql`): `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` con el **mismo nombre**, en una transacción. Lista nueva ⊇ vieja. Se aplica por el pooler de sesión (:5432) con `scripts/aplicar-migracion-sesion.mjs` (`--ensayo` primero), nunca `SET SESSION` sobre `DATABASE_URL`; archivo suelto como ADR-415, sin `prisma migrate resolve`.

## Alternativas descartadas

- **Enum de Postgres / Prisma:** un valor de enum no se puede quitar y cada alta es un `ALTER TYPE`; ADR-415 ya eligió `CHECK` sobre `TEXT` por eso.
- **Sacar el `CHECK` y validar sólo con Zod:** la base aceptaría cualquier texto que llegue por otra vía (script, asistente); el catálogo no sabría medirla.
- **Columna `area` en `AdminGoal`:** el área se deduce de la categoría; guardarla duplica el dato y abre la puerta a que se contradigan. Schema cero.
- **Tabla `AdminGoalCategory` (catálogo en la base):** cada categoría necesita su calculadora en código; una fila sin calculadora sería una meta que nunca mide nada, y el catálogo se leería con una consulta más en cada pantalla. El catálogo vive en código y un test-guardián (`__tests__/metas-catalogo.test.ts`) lee el `.sql` y exige que el `CHECK`, el Zod y el catálogo tengan los mismos valores.
- **Seguir tipeando el avance:** es justamente lo que hacía que la meta no reflejara ventas ni compras reales; queda sólo para `manual`.
- **`ADD CONSTRAINT "…_v2_chk"` con otro nombre** (patrón de idempotencia con savepoints): sólo es repetible con `aplicar-migracion-sesion.mjs`; con el mismo nombre lo es con cualquier ejecutor, y el nombre sigue siendo el que cita ADR-415.

## Consecuencias

- **Positivas:** cada meta dice a qué área pertenece y lleva a su módulo; el avance ya no miente ni depende del navegador; las metas forestales (m³/PT con `PT_POR_M3` y `unidadDe`) y de marketplace entran sin tocar el schema de esos módulos.
- **Contrato que cambia:** `PATCH /api/goals/:id { current }` sobre una meta que no es `manual` pasa de 200 a 422 (`code: avance_solo_manual`), y `POST` con `current > 0` o una unidad ajena también. `MetaDTO` no cambia de forma.
- **Negativas:** leer las metas cuesta lecturas reales por categoría (acotado por la caché y el memo por pedido). `Herramientas` todavía no lee `?vista=`, así que «Ver en …» de `cubicacion` abre en el Cubicador de madera, no en el de trozas.
- **Vuelta atrás:** recrear los dos `CHECK` con la lista de ADR-415, sólo si `SELECT count(*) FROM "AdminGoal" WHERE category NOT IN (…7 viejas…) OR period NOT IN (…3 viejos…)` da 0.
- **Medido antes de prometer:** main tiene 1 venta POS en 30 días, 0 compras recibidas (33 OC pendientes) y 15 lotes de cubicación anulados; Blas, 7 ingresos (56,9 m³) y 0 lotes cubicados. Varias metas van a arrancar en 0 de verdad, y el ⓘ dice de dónde sale cada cifra.

## Referencias

- `prisma/migrations/adr-415-metas-y-tareas.sql` (listas originales) y `prisma/migrations/adr-488-metas-por-area.sql`.
- `lib/admin/metas-catalogo.ts`, `lib/admin/metas-periodo.ts`, `lib/admin/metas-tareas.ts`, `lib/metas/avance/tipos.ts`, `lib/db/admin-goals.db.ts`, `app/api/goals/**`.
- Tests: `__tests__/metas-catalogo.test.ts` (guardián de las tres listas), `__tests__/metas-periodo.test.ts`, `__tests__/api-goals-tasks.test.ts`.
- `lib/admin/enlaces-panel.ts` (`hrefDeDestino`), `lib/forestal/semana-de-registro.ts` (`rangoDeLaSemana`), `lib/forestal/cubicacion.ts` (`PT_POR_M3`).
- Memorias: `adelantos-idor-beneficiario-ajeno` (ownership en el WHERE), `loyalty-redeem-race-doble-canje` (condición en el WHERE del `updateMany`).
