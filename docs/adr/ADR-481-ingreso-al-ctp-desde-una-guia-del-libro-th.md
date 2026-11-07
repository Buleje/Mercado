# ADR-481 — Ingreso al CTP desde una guía del Libro TH, ya relleno

- **Estado:** aceptado (2026-10-08). Construido y probado en `main` por la pantalla.
- **Pedido por:** Brandon (08-10): «en nuevo ingreso de madera, cuando se sacó de libro de títulos habilitantes a CTP, se tiene que rellenar para registrar ingreso todo: las trozas, lista de trozas, resúmenes, titular… arregla eso».
- **Depende de:** ADR-442 (guías guardadas), «Recibir» del 28-09 + ADR-450 (contar al bajar, la troza recuerda su árbol), ADR-461 (importar guías al Libro TH), ADR-474/477 (código único de troza).
- **Contrato:** `.claude/autonomo/contratos-2026-10-08/K5-ingreso-desde-loth.md`.

## Contexto

«Recibir» ya registraba una guía del TH con todo (un ingreso por especie, cada troza con su código único, D1, D2, largo y m³, `gtfDatos` entero, región, distrito, resolución, árbol de cada troza), pero **sólo si la guía pasó al CTP al emitirla** («Despachar con guía» → guardada). Las guías importadas (ADR-461), las emitidas antes del 28-09 y aquellas cuya guardada se quitó no tenían camino relleno: «Nuevo ingreso» y el puente «Ingresar al CTP» del Libro TH abrían el alta manual con el N° y, a lo sumo, titular y permiso.

Medido en Blas (sólo lectura, 08-10): 3 guías del TH; 1 vigente (`019-001-0000001`, 22 trozas, 20,303 m³, destinatario = RUC de la Ficha) **sin ingreso y sin guardada**: hoy había que tipearla entera.

## Decisión

1. **Una lista, las mismas reglas.** `cruzarGuiasTh` (puro, `lib/forestal/guias-th-por-ingresar.ts`) cruza las guías del TH emitidas de trozas con los ingresos vivos y las guardadas, con las reglas que ya usan el pase y «Recibir»: N° tramo a tramo (`mismoNumeroGtf`) + dueño (`puedeSerDelDueno` / `elegirGuiaDelDueno`), destino propio (`destinoDeGuiaTh`), lista completa (`ingresosDesdeGuiaTh`). Una guía reemitida con el mismo N° y dueño cuenta una vez (la más nueva). Las que no se pueden traer se listan con su motivo y sin botón.
2. **Traer = guardar y recibir.** `GuiaThPorIngresarDB.alistar` valida contra la lista y llama `GuiaThAlCtpDB.pasarAlCtp` (idempotente) para tener la guardada; la pantalla abre `CtpRecibirGuiaThModal`. Nada se registra fuera de `recibir`: cierre de mes, candado del N° (`GtfNumeroDB.bloquear`), duplicado (`crearDesdeGtfEnTx`), trozas ya en el libro, vencida y conteo siguen en un solo lugar.
3. **Doble ingreso:** la guía que ya entró no se lista; pedirla igual (por id o por N°) → 409 `YA_INGRESADA`. Bajo el candado, `recibir` vuelve a mirar (la carrera entre dos pantallas la frena el servidor, no la lista).
4. **Rutas:** `GET /api/admin/forestal/guias/libro-th[?numero=]` → `{ porIngresar, ingresadas }`; `POST { gtfId } | { gtfNumber }` → `{ alistada: { guardadaId, gtfNumber, creada } }`. Guard de las guías guardadas (admin/almacenero/dueño, CSRF en POST, rate limit, spec `ctp-libro`) + límite por negocio en el POST. Tenant de la sesión.
5. **Pantalla:** 3.ª opción «Desde tu Libro TH» en «Cómo se carga el ingreso» del alta (no se recuerda entre altas; en ese modo el pie no registra). El puente «Ingresar al CTP» del Libro TH, cuando la guía no estaba guardada, la alista por N° y abre «Recibir»; si no se puede, avisa el motivo y deja el alta manual.
6. **Trazabilidad sin columna nueva.** El ingreso queda atado a su guía del TH por la llave que ya usa el freno de anular (`GtfNumeroDB.exigirSinIngresosEnElCtp`: N° tramo a tramo + dueño), cada troza por `WoodEntryTroza.lothTrozadoId` (su árbol) y la auditoría `loth_gtf_al_ctp` guarda el id de la GTF. Una columna `WoodEntry.lothGtfId` exigiría `prisma generate` + reiniciar el dev con varios agentes trabajando: queda propuesta.

## Consecuencias

- Una guía del TH con destinatario ajeno, sin RUC del destinatario o sin RUC en la Ficha no se trae (esa madera no va a esta planta, o no se sabe): se ve en la lista con su motivo.
- Elegir una guía y cancelar «Recibir» la deja en «guías por recibir» (el mismo estado que el pase al emitir).
- Prueba en `main` (08-10): GTF `019-001-0000481` del TH sin guardada → «Nuevo ingreso › Desde tu Libro TH › Traer con todo» → «Llegaron todas» → «Recibir»: ingreso N° 5, Maderera El Aguajal SAC, 17-CPO/C-J-001-02, Tornillo 2,126 m³, 2 trozas con D1/largo/m³ y su árbol, `gtfDatos`, Pasco/Constitución, recepcionado. Volver a pedirla → 409. Deshecho con `qa-sembrar-arbol-ctp.mjs --deshacer`.
