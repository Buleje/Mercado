# ADR-508 — Semáforo del negocio y seguimiento a clientes, para todos los negocios

- **Estado:** aceptado (2026-10-20). Sin schema: config en `Settings.featureFlagsJson` (`semaforo`, `seguimientoClientas`).
- **Pedido por:** Brandon (20-10): «si no hay los módulos, créalos; aplica a todos los panel admin». Fuente: manual de Musa §21 (semáforo), §22 (decisiones), §7 (criterios para parar y seguimiento de los días 3, 15 y 30).

## Decisión

### 1. Semáforo (Metas › Semáforo, `?tab=metas-logros&vista=semaforo`)

1. **Catálogo de 11 indicadores** en `lib/semaforo/indicadores.ts` (pedidos por semana, ticket, ganancia neta %, productos A agotados, vencidos/dañados, recompra, costo por cliente nuevo, días de stock, sin rotar, caja, ganancia acumulada). Cada uno trae sentido (`mayor` / `menor` / `rango`), umbral por defecto (null = «sin meta» → gris) y una acción por color. Ningún número se inventa: cada indicador se compone con lo que el sistema ya registra (ventas + pedidos que entran, costo de lo vendido, gastos, stock e `InventoryMovement`).
2. **Lectura:** `SemaforoDB.semaforo` (`lib/db/semaforo.db.ts`) lee con una consulta por indicador como máximo, `tenantId` primero, con caché corta; la regla del color es pura (`lib/semaforo/evaluar.ts`).
3. **Config por negocio** en `featureFlagsJson.semaforo` (Zod `configSemaforoSchema`): lanzamiento, decisión (fecha, verde, amarillo, «rojo sólo si la recompra < X %»), productos A, categorías de anuncios, caja anotada y ajustes por indicador (umbral, acciones, apagado). Se escribe por subclave (`pisarSubclavesFlags`), mezclando por indicador: cambiar el ticket no borra la caja. JSON roto = valores por defecto, nunca una pantalla caída.
4. **Datos de prueba:** antes del lanzamiento la vista lo dice («Datos de prueba: el negocio arranca el 9 nov») y ofrece el período «desde el lanzamiento». No se borra ninguna venta.
5. **API:** `GET/PUT /api/admin/semaforo` para admin, owner, tienda_owner y manager; sin sesión 401.

### 2. Seguimiento a clientes (Administración › Hoy y «Pendientes y avisos»)

1. **Quién:** cada cliente con celular cuya **última** compra (venta del POS con `customerPhone` o pedido en estado que entra) fue hace 3, 15 o 30 días. Si volvió a comprar, el reloj arranca de nuevo. Una consulta agrupada (`SeguimientoClientasDB`, `DISTINCT ON` por celular + producto con más unidades por `LATERAL`), caché de 5 min que vacía «Actualizar».
2. **Sin regla nueva de la agenda:** `REGLAS_AGENDA` tiene un CHECK gemelo en la base (migración `20261018_agenda_administracion`); agregar una regla pedía migrar. Entra como:
   - `ResumenAgendaHoy.seguimientos` (opcional): lista propia en «Hoy» y en el centro, **fuera** de `cuenta`, de «Te faltan N» y del aviso que sale solo;
   - un vencimiento por día en el calendario (`origen: "seguimiento_clienta"`, «Escribir a N clientes»).
   Sólo para roles con `customers:read`. Los crons (Telegram, push, asistente) no la piden (`conSeguimientos` sólo en `GET /api/admin/agenda/hoy`).
3. **Mensaje:** plantillas por día con `{nombre}` (primer nombre) y `{producto}`; genéricas por defecto, propias en `featureFlagsJson.seguimientoClientas.mensajes`. Botón de WhatsApp con el texto listo (`waLink`) y «Copiar». «Escrito» se recuerda en el navegador (no es un registro).

## Consecuencias

- Musa quedó cargada con `scripts/musa/cargar-semaforo.ts` (idempotente, copia de los flags antes de escribir): umbrales y acciones del manual §21, lanzamiento 9-nov, decisión 10-ene (verde S/ 1.700, amarillo S/ 800, rojo sólo con recompra < 10 %), productos A MU001…MU020 y los mensajes de los días 3/15/30.
- **El seguimiento depende del celular en la venta.** Al 20-10 ninguna venta del POS de main, Musa ni Blas lo trae (sí los pedidos de la tienda): mientras el cobro no pida el celular, sólo salen los pedidos.
- Falta pantalla para editar los mensajes del seguimiento o apagarlo (hoy sólo por flags; prendido por defecto).
