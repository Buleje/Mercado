# ADR-087 — Sistema de Delivery estilo Rappi (cascada de ofertas + GPS)

**Status:** Implementado
**Date:** 2026-05-01
**Owner:** Brandon

## Contexto

Buleje tenía `DeliveryPartner` y `DeliveryAssignment` (1:1 con `Order`) — un admin asignaba a mano un partner por nombre. Sin GPS, sin offers, sin notificación al partner, sin cliente viendo dónde está su pedido. El admin perdía tiempo coordinando por WhatsApp y los clientes llamaban "¿dónde está mi pedido?".

El objetivo era replicar el flujo de Rappi/Uber Eats: el pedido sale a flotear, el partner más cercano recibe una oferta con countdown de 2 minutos, si no acepta pasa al siguiente, etc. Sin perder el modelo multi-tenant ni el aislamiento de seguridad ya existente (ADR-082).

## Decisión

Sistema de cascada de ofertas con GPS en tiempo real. Diseñado en 9 fases (F1–F9), implementado en 10+ commits.

### Schema

Campos nuevos en `DeliveryPartner` (todos opcionales / con default — sin data loss):

```prisma
passwordHash    String?       // bcrypt — null hasta primer login bootstrap (phone)
lat             Float?        // GPS actual
lng             Float?
lastPingAt      DateTime?     // heartbeat — partner offline si > 5min
isOnline        Boolean       @default(false)  // separado de isActive (registro)
currentOrderId  String?       // si está atendiendo, no recibe ofertas
acceptanceRate  Float         @default(1.0)    // 0..1, baja con rejects
maxRadiusKm     Float         @default(5.0)    // radio max para ofertas
totalOffers     Int           @default(0)
totalAccepted   Int           @default(0)
```

Modelo nuevo `DeliveryOffer` (cada invitación a un partner):

```prisma
model DeliveryOffer {
  id          String          @id @default(cuid())
  orderId     String
  partnerId   String
  status      String          @default("pending")  // pending | accepted | rejected | expired | cancelled
  offeredAt   DateTime        @default(now())
  expiresAt   DateTime        // offeredAt + 2 min
  respondedAt DateTime?
  distanceKm  Float
  feeOffered  Decimal         @db.Decimal(12, 2)
  attempt     Int             @default(1)       // 1 = primer candidato
  tenantId    String

  @@index([orderId, status])
  @@index([partnerId, status])
  @@index([status, expiresAt])  // cron busca expired
}
```

### Algoritmo de matching (`lib/delivery/matchmaking.ts`)

Score por partner (más bajo = mejor):
```
score = 0.6 × (distance / maxRadius)
      + 0.2 × ((5 - rating) / 5)
      + 0.2 × (1 - acceptanceRate)
```

Filtros pre-score:
- `isOnline = true`
- `lastPingAt > now - 5min`
- `currentOrderId = null` (no atendiendo)
- `distance <= maxRadiusKm`
- NO en `excludePartnerIds` (anti-loop)

### Flujo cascada (`lib/delivery/offer-cascade.ts`)

```
Order created → trigger en orders.db.ts
  → createNextOffer(orderId) — primera oferta al partner #1 más cercano
    → DeliveryOffer { status: pending, expiresAt: now + 2min }
    → Push Web (VAPID) + WhatsApp fallback al partner

Partner acepta dentro de 2min:
  → status: accepted
  → cancela otras offers pending del orderId
  → crea DeliveryAssignment
  → ocupa partner.currentOrderId

Partner rechaza o expira:
  → cron `/api/cron/delivery-offer-cascade` cada 1min:
     → marca offers expiradas (status: expired)
     → crea próxima oferta al partner #N+1 (excluye los previos)
     → max 5 attempts, después marca order delivery_unassigned
```

### Endpoints partner (cookie `buleje-partner-sess` HMAC SHA-256)

| Endpoint | Verb | Función |
|---|---|---|
| `/api/delivery/me/login` | POST | Login con phone + password (bootstrap = phone) |
| `/api/delivery/me/me` | GET | Profile + stats |
| `/api/delivery/me/online` | POST | Toggle online + GPS inicial |
| `/api/delivery/me/ping` | POST | Heartbeat GPS cada 30s |
| `/api/delivery/me/offers` | GET | Lista offers pending |
| `/api/delivery/me/current` | GET | Assignment activo |
| `/api/delivery/me/password` | POST | Cambio password (bcrypt) |
| `/api/delivery/me/assignments/[id]` | GET | Detalle del pedido |
| `/api/delivery/me/assignments/[id]` | PATCH | Transición de estado |
| `/api/delivery/offers/[id]/accept` | POST | Acepta oferta (TX con race guard) |
| `/api/delivery/offers/[id]/reject` | POST | Rechaza oferta |

### Transitions del assignment

```
assigned   → picked_up | cancelled
picked_up  → in_transit | delivered | cancelled
in_transit → delivered | cancelled
delivered/cancelled → terminal
```

Al `delivered` o `cancelled`: libera `partner.currentOrderId` (puede tomar nuevo pedido).

### Tracking del cliente (push automático)

Hook en `PATCH /me/assignments/[id]`: crea entry en `DeliveryTracking` (tabla persistente, idempotente con ventana 5min) y envía WhatsApp al cliente con CTA al `/tracking/[orderId]`.

Mensajes por status:
- `picked_up` → "📦 Tu pedido fue recogido"
- `in_transit` → "🛵 Tu pedido está en camino"
- `delivered` → "✅ Tu pedido fue entregado"
- `cancelled` → "⚠️ Tu pedido fue cancelado"

### Endpoints admin

| Endpoint | Función |
|---|---|
| `/api/admin/delivery/partners-live` | Lista partners online + asignación + offers (mapa live) |
| `/api/admin/delivery/manual-assign` | Override cascade — admin asigna partner X al order Y |
| `/api/admin/delivery/ranking?period=week\|month\|all` | KPIs: delivered, cancelled, completion rate, earnings, avg time |

### UI

**Partner** (`app/delivery-app/`):
- `/login` — phone + password (bootstrap = phone)
- `/` (dashboard) — toggle online, auto-ping cada 30s, offers polling cada 10s, stats
- `/mapa` — Leaflet con marker propio + offers como markers ámbar con fee visible
- `/perfil` — datos + stats + cambio password + logout
- `/oferta/[id]` — pantalla countdown 2:00 con accept/reject sticky bottom
- `/pedido/[id]` — flujo recogido → en camino → entregado con CTAs sticky

**Admin** (`/admin?tab=delivery-partners`):
- 6 sub-tabs: **En vivo** (mapa Leaflet con todos los partners + summary cards) · Repartidores · Solicitudes · Asignaciones · Ranking (KPIs reales) · Permisos
- `OrdersDetailPanel` tiene botón "Asignar repartidor del marketplace" → abre `ManualAssignModal`

## Consecuencias

### Positivas

- **Sin coordinación manual del admin**: cascada automática asigna en segundos
- **Cliente informado**: WhatsApp + tracking page sin tocar la tienda
- **Algoritmo justo**: distancia 60% + rating 20% + acceptance 20%, anti-gaming via lower acceptance
- **Race-safe**: accept usa `prisma.$transaction` con check de assignment existente — 2 partners no pueden tomar el mismo pedido
- **Fallback robusto**: push falla → WhatsApp; partner falla → cascada al siguiente; cascade agotada → admin override manual
- **Multi-tenant blindado**: cookie partner-sess incluye `tenantId`, queries de admin filtran por `auth.tenantId`

### Trade-offs aceptados

- **GPS pull (ping) vs push (websocket)**: pull es simple (interval HTTP). Si crece >100 partners simultáneos, migrar a websocket
- **TTL hardcoded 2 min**: configurable via env var `DELIVERY_OFFER_TTL_SEC`. Sin slider en admin todavía
- **Sin geocoding del `customerLocation`**: offers se muestran con offset hash-based ±1km al rededor del partner. Real geocoding = fase 2
- **Sin gamification de fee**: fee fijo 5 + 1.5/km. Surge pricing = fase 2

## Migración

Aplicada con `scripts/push-delivery-schema.ts` (idempotente, `ALTER TABLE ADD COLUMN IF NOT EXISTS`). Sin downtime — todos los campos nuevos son opcionales o tienen default.

## Validación E2E

Playwright headless probó:
- Inscripción → DB partner pendiente
- Aprobación admin → isActive
- Login partner → cookie HMAC
- Toggle online + GPS → ping correcto
- Mapa Leaflet renderea con marker
- Perfil con stats reales
- Endpoints admin con auth correcta

## Referencias

- `lib/delivery/matchmaking.ts` (haversine + score)
- `lib/delivery/offer-cascade.ts` (cascada + push notify)
- `lib/delivery/partner-session.ts` (cookie HMAC)
- `prisma/schema.prisma:2572-2640` (DeliveryPartner + DeliveryOffer)
- `__tests__/delivery-matchmaking.test.ts` (18/18 unit tests)
- ADR-082 (Multi-tenant isolation) — base de seguridad usada
- ADR-084 (Trial suspension) — patrón de cascade similar para tenants
