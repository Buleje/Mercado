# ADR-512 — Una guía emitida se corrige por solicitud, nunca editándola

- **Estado:** aceptado (2026-10-23). Schema: `prisma/migrations/20261023a_soporte_correccion_guia_adr512` (aplicada y marcada el 23-10).
- **Pedido por:** Brandon (23-10): eligió la opción A de «Pedir corrección» desde una GTF EMITIDA — un pedido ordenado que llega a la bandeja de soporte del superadmin.
- **Relacionados:** ADR-125 (Libro de operaciones TH: la guía se anula con motivo), ADR-474 (código único de troza por guía; anulada reemitida), ADR-461 (guías despachadas al Libro TH), ADR-017 (índices de `SupportTicket`).

## Contexto
Una GTF con número es un documento oficial: el Libro TH (`ForestGtf`, emitida | anulada) y las guías de salida del CTP (`ForestCtpEntry` del despacho; `forest-ctp-despacho.db.ts` ya rechaza editar una emitida) sólo se anulan con motivo y se emite otra. Cuando el negocio ve un error (una placa, un volumen, una troza) hoy no tiene a quién pedirle la corrección de forma ordenada: escribe por WhatsApp y se pierde qué casillero, qué decía y qué debía decir.

La bandeja de soporte del superadmin (`SupportTicket`, `/superadmin/support`) existía pero sólo la alimentaba el formulario público de contacto (0 filas al 23-10) y sus 4 rutas usaban `prisma` directo.

## Decisión
1. El panel **pide** la corrección: `SupportTicket` con `kind = "correccion_guia"`, `entityType` (`loth_gtf` | `ctp_despacho`), `entityId`, `detalle` (número de guía + lista de cambios), `resolucion`, `resolvedBy`, `resolvedAt`. `tenantId` y `createdBy` ya existían (NOT NULL).
2. Cada cambio dice dónde (`casillero` | `item`), qué clave y lo correcto; **lo que la guía DICE hoy lo lee siempre el servidor** de la guía guardada (`CambioResuelto.dice`). El Zod del navegador no tiene ese campo y lo descarta si llega.
3. Estado en TEXTO, nunca enum: general = `open | replied | closed` (como siempre); corrección = `open | in_review | closed | rejected` con transiciones en `TRANSICIONES_CORRECCION`. Cerrar o rechazar exige `resolucion` (lo que se hizo: «anulé la 001-123 y emití la 001-124», o por qué no). Una fila que el Prisma viejo de producción deje en `replied` se lee como «En revisión».
4. Una sola solicitud abierta (`open`/`in_review`) por guía; la segunda devuelve el id de la que ya existe.
5. La guía NO cambia por la solicitud: la corrección real sigue siendo anular + emitir otra, hecha por una persona.
6. Contrato único en `lib/soporte/correccion-guia.ts` (cliente y servidor); acceso a la base sólo por `SupportTicketsDB` (`lib/db/support-tickets.db.ts`), que también absorbió las 4 rutas del superadmin sin cambiar su respuesta.

## Alternativas descartadas
- **B — sin base (mensaje armado por WhatsApp/correo):** cero schema, pero no queda registro de qué se pidió, quién, ni si se resolvió; el superadmin no puede filtrar ni el negocio ver el estado.
- **C — borrador automático de la guía corregida:** el sistema emitiría la guía nueva con los cambios. Descartada por ahora: una guía oficial no debe salir sin que alguien la revise, y obliga a decidir en cada casillero si el cambio pide anular (casi todos) o sólo anotar.
- **Enum de estados:** un valor nuevo rompe al cliente Prisma viejo de producción en toda lectura que lo encuentre.

## Consecuencias
- Expand puro: las filas existentes quedan `kind = 'general'`; un INSERT del Prisma viejo (sin `kind`) también (probado en transacción con ROLLBACK).
- Índices: `(tenantId, kind, createdAt)` y `(tenantId, entityType, entityId)` para el panel; `(kind, status, createdAt)` para la bandeja del superadmin, que cruza tiendas a propósito.
- Fase 2: rutas `POST/GET /api/admin/solicitudes-correccion` y `PATCH /api/superadmin/support/[id]/correccion`, botón «Pedir corrección» en las guías y vista en la bandeja.
- Pendiente fuera de este ADR: `app/api/support/tickets/route.ts` y `app/api/superadmin/alerts/route.ts` todavía leen `SupportTicket` con `prisma` directo.
