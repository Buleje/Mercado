# Spec de diseño — "Tu Barrio Buleje" (Junta del Barrio + Fiado en checkout)

> **Fecha:** 2026-06-18 · **Autor:** Brandon + Claude · **Estado:** aprobado para planificación
> **Branch base:** `audit/storefront-mejoras-verificadas-2026-06-15`

## 1. Resumen

Dos pilares en el home/storefront que ningún competidor (Rappi, súper, otra bodega) puede copiar, porque dependen de **la red social del barrio** y de **la confianza del cuaderno de fiado** — activos que solo una bodega local tiene.

| Pilar | Qué ve el vecino | Foso (diferenciador) |
|---|---|---|
| **A · La Junta del Barrio** | "Tu cuadra: 2/4 pedidos · únete y todos llevan **envío gratis**" | Agregación social local + una moto a varias casas = logística real más barata |
| **B · Paga el día de pago** | En el checkout: "Anótalo — pagas tu día de pago" | El súper jamás fía; la bodega ya tiene el cuaderno digitalizado |

**Analogía (Feynman):** A = automatizar el "vecino, ¿vas a la bodega? tráeme algo" en una compra conjunta con envío gratis. B = el cuaderno de fiado del bodeguero, pero ahora con un botón al momento de pagar.

## 2. Objetivos

- **B (Fase 1):** que un cliente elegible pueda **pagar con fiado en el checkout** ("paga el día de pago"), creando un `Fiado` real, respetando el límite que controla el dueño, con total y elegibilidad validados en backend.
- **A (Fase 2):** convertir la **Junta del Barrio** de fachada muerta a feature real: backend persistido, progreso real, envío gratis al llegar a la meta, y entrega agrupada en una sola ruta.
- Hacer ambos **visibles en el home/PDP** para que sean un diferenciador percibido, no escondido.

## 3. No-objetivos (YAGNI)

- ❌ Fiado con **interés** o cuotas en el checkout (el `createInstallmentPlan` con interés es otro flujo; aquí es "paga todo tu día de pago", sin interés).
- ❌ Junta con **descuento de precio** en Fase 1 (solo envío gratis; descuento por umbrales queda para una Fase 3 futura).
- ❌ Pagos cross-tenant o junta entre tiendas distintas (una junta = un tenant).
- ❌ Geofencing GPS fino para la zona de la junta (se usa la zona de entrega ya existente, no un geohash nuevo).

## 4. Estado actual (verificado, no asumido)

| Pieza | Estado | Evidencia |
|---|---|---|
| Junta del Barrio | 🟥 **Fachada muerta** | `components/marketplace/GroupBuyCard.tsx` no está montado en ningún archivo; linkea a `/marketplace/grupo` que **no existe** (404); **no hay modelo** de grupo en `schema.prisma`; progreso "2/4" es prop fake; copy en **voseo** (viola regla de tuteo). |
| Portal de crédito | 🟩 **Real** | `app/(store)/mi-credito/page.tsx`: usa `calculateCreditScore`, `getAvailableCredit`, `FiadosDB.list`, `MeCreditScoreDB.getHistory`. Gated por `isFiadoDigitalPhase1Enabled()`. |
| Modelos de fiado | 🟩 **Vivos** | `Fiado` (schema:2056) + `FiadoCuota` (schema:2075); `lib/db/fiados.db.ts`; `lib/db/me-credit-score.db.ts`. |
| Fiado como método de pago | 🟥 **No existe** | `CheckoutPaymentSection.tsx` solo tiene `"yape" \| "efectivo"`; cero referencias a fiado en `components/checkout/` ni `orders.db.ts`. |
| Crédito disponible (motor) | 🟩 **Real** | `lib/credit/installment-manager.ts` → `getAvailableCredit()`, `AvailableCreditResult`. |
| Crons de recordatorio | 🟩 **Existen** | `app/api/cron/fiados-reminder`, `credit-reminders`, `fiados-mark-vencido`, `credit-overdue`. |
| Delivery / zonas | 🟩 **Existen** | `lib/db/delivery.db.ts`, `lib/db/admin-delivery-zones.db.ts`. |

**Conclusión:** B es ~70% reutilizable (falta el botón de pago + visibilidad). A es greenfield de backend (la UI se refurbishea).

## 5. Arquitectura — Fase 1 (B: Fiado en checkout)

### 5.1 Flujo

```
Cliente logueado en checkout
  └─ Backend evalúa elegibilidad (server-side, NUNCA client):
       logueado? + flag FIADO_DIGITAL_V2_PHASE1 on? + getAvailableCredit() ≥ total?
         ├─ sí  → muestra método "Paga el día de pago (fiado)"
         └─ no  → método oculto o disabled con razón ("límite insuficiente", "iniciá sesión")
  └─ Cliente elige fiado y confirma
       └─ Backend (orders.db.ts / endpoint de checkout):
            - order.paymentMethod = "fiado", paymentStatus = "pending"
            - FiadosDB.create(tenantId, { orderId, customerId, total, fechaVence = día de pago })
            - suma usedCredit (vía installment-manager / FiadosDB)
            - invalida caché de crédito del cliente
       └─ Recordatorio WhatsApp el día de pago → reutiliza cron `fiados-reminder` (ADR-058)
```

### 5.2 Componentes a tocar

| Archivo | Cambio |
|---|---|
| `components/checkout/CheckoutPaymentSection.tsx` | Ampliar `PaymentMethod` a `"yape" \| "efectivo" \| "fiado"`; nueva tarjeta con crédito disponible y fecha de pago. Tipografía DS (`h-12`, tokens). |
| `components/CheckoutModal.tsx` | Pasar elegibilidad + crédito disponible (server-provided) al section. |
| Endpoint de checkout (`app/api/.../route.ts`) | Validar elegibilidad y total en server (regla #6); rechazar si `total > creditoDisponible`. |
| `lib/db/orders.db.ts` (zona de peligro) | Al crear orden fiado: setear `paymentMethod`/`paymentStatus`, crear `Fiado`, sumar `usedCredit`. Idempotency intacta. |
| Home / PDP | Chip "Tu crédito disponible: S/X" para clientes elegibles → enlaza a `/mi-credito`. |
| Admin (fiado) | Verificar que el dueño puede fijar/override el límite por cliente (sobre el sugerido por el score). Si no existe, agregar control. |

### 5.3 Reglas de negocio

- **Día de pago:** configurable por tenant (default: día 15 y 30, o +N días). Setting nuevo o reutilizar config de fiado existente.
- **Límite:** lo manda `getAvailableCredit()` (score sugerido) **con override del dueño**. El dueño tiene la última palabra.
- **Elegibilidad:** solo clientes logueados con teléfono vinculado (igual que `/mi-credito`).
- **Anti-fraude:** total y límite se recalculan en backend; el cliente nunca decide su propio límite.

## 6. Arquitectura — Fase 2 (A: La Junta del Barrio)

### 6.1 Modelo de datos (nuevo)

```prisma
model Junta {
  id              String       @id @default(cuid())
  tenantId        String
  code            String       // slug corto compartible (ej. "BARRIO-7F3")
  initiatorId     String       // customerId que la abrió
  zoneLabel       String       // zona de entrega (reusa delivery zones, no GPS nuevo)
  deliveryZoneId  String?      // FK opcional a admin-delivery-zones
  windowStart     DateTime     // inicio de la ventana de entrega
  windowEnd       DateTime     // cutoff: cuándo se resuelve la junta
  targetMembers   Int          // meta de hogares (default 4)
  status          JuntaStatus  // OPEN | LOCKED | FULFILLED | EXPIRED
  createdAt       DateTime     @default(now())
  members         JuntaMember[]
  @@unique([tenantId, code])
  @@index([tenantId, status, windowEnd])
}

model JuntaMember {
  id          String   @id @default(cuid())
  juntaId     String
  customerId  String
  orderId     String?  // se liga al hacer checkout dentro de la junta
  joinedAt    DateTime @default(now())
  junta       Junta    @relation(fields: [juntaId], references: [id])
  @@unique([juntaId, customerId])
}

enum JuntaStatus { OPEN LOCKED FULFILLED EXPIRED }
```

> **Migración:** SQL **manual idempotente** + script `pg` con `DIRECT_URL` + `prisma generate` + reiniciar dev (gotcha conocido: `prisma migrate` cuelga en el pooler). Ver `reference_prisma_migrate_pooler_workaround`.

### 6.2 Capa de datos y API

| Archivo | Rol |
|---|---|
| `lib/db/juntas.db.ts` (nuevo) | DB class canónica: `create`, `getByCode`, `join`, `attachOrder`, `listOpenByZone`, `resolve`. `tenantId` 1er parámetro, caché + audit + invalidate (rubric `db-class`). |
| `app/api/juntas/route.ts` + `[code]/route.ts` (nuevos) | Crear / unirse / ver progreso. `safeParse` Zod, rate limit, sin `force-dynamic`. |
| `app/api/cron/juntas-resolve/route.ts` (nuevo) | En el cutoff: si `members ≥ target` → `FULFILLED` (envío gratis + tag de ruta agrupada); si no → `EXPIRED` + aviso WhatsApp. |

### 6.3 Mecánica del premio (envío gratis)

- Al hacer checkout **dentro de una junta**, el envío se marca `S/0 si la junta se completa`.
- El cobro real del envío se finaliza en el cutoff (`juntas-resolve`): meta alcanzada = gratis; no alcanzada = envío normal cobrado al fulfillment (o se ofrece extender la ventana).
- Backend calcula el envío (regla #6); el cliente no fuerza envío gratis.

### 6.4 UI / surfacing

| Archivo | Cambio |
|---|---|
| `components/marketplace/GroupBuyCard.tsx` | Cablear a datos reales (no props fake); **fix voseo → tuteo** ("Arma"/"Ahorras"/"Compartes"/"súmate"). |
| Home strip + PDP banner | "Tu cuadra: 2/4 — únete". Solo si hay junta OPEN en la zona del cliente. |
| `app/(store)/junta/[code]/page.tsx` (nuevo) | Landing real de la junta (mata el 404 actual). |
| Delivery (admin/repartidor) | Órdenes con `juntaId` se ven agrupadas = una sola vuelta. |

### 6.5 Copy WhatsApp (tuteo, ejemplo)

> "Vecinos, estoy armando una compra en Buleje: si somos 4 de la cuadra, **todos llevamos envío gratis**. Faltan 2 — súmate acá: {link}"

## 7. Secuencia de entrega

1. **Fase 1 — B (fiado en checkout):** menor, construye sobre lo existente. Ship primero detrás de `FIADO_DIGITAL_V2_PHASE1` (canary).
2. **Fase 2 — A (Junta del Barrio):** greenfield. Migración manual + DB class + API + cron + UI. Detrás de su propio flag.

Cada fase es un spec→plan→implementación independiente con sus gates.

## 8. Zonas de peligro y mitigación

| Zona | Riesgo | Mitigación |
|---|---|---|
| `components/checkout/**`, `orders.db.ts` | Totales, idempotency, state machine de orden | Skill `checkout-squad`; total/límite en server; no romper idempotency keys. |
| `prisma/schema.prisma` | Modelos Junta, drift | Migración SQL manual idempotente + `pg` directo + `prisma generate`. |
| Límite de fiado | Fraude / sobre-crédito | Recalcular en backend; override del dueño manda; rechazar `total > disponible`. |
| Delivery batching | Rutas mal agrupadas | Tag `juntaId`; agrupar por zona+ventana; no auto-asignar sin validar. |

## 9. Métricas de éxito

- **B:** % de checkouts elegibles que usan fiado; tasa de pago puntual el día de pago; cero órdenes fiado sobre el límite.
- **A:** juntas creadas/semana; tasa de juntas que alcanzan la meta; pedidos por junta; reducción de costo de delivery por ruta agrupada.

## 10. Decisiones cerradas

| Pregunta | Decisión |
|---|---|
| Premio de la Junta | **Envío gratis** por entrega conjunta (no descuento de precio en V1). |
| Orden de entrega | **B primero**, luego A. |
| Día de pago | Configurable por tenant (default 15/30). |
| Límite de fiado | Score sugiere, **dueño override**. |
| Zona de la junta | Reusa zonas de entrega existentes (no GPS nuevo). |
