# Gift Cards Buleje (Agent E)

Tarjetas de Regalo digitales del marketplace Buleje. Mini-feature
"Amazon Gift Cards" adaptado para el barrio de Pucallpa.

## Arquitectura

| Capa | Archivos |
|---|---|
| **Tienda (hub)** | `app/marketplace/gift-cards/page.tsx` + `components/marketplace/gift-cards/*` |
| **Wizard compra** | `app/marketplace/gift-cards/comprar/page.tsx` + `components/marketplace/gift-cards/comprar/*` |
| **Confirmacion** | `app/marketplace/gift-cards/confirmacion/page.tsx` |
| **Dashboard cliente** | `app/(store)/cuenta/gift-cards/page.tsx` + `components/customer/gift-cards/*` |
| **DB** | `lib/db/gift-cards.db.ts` (mock en memoria) |
| **Mocks** | `lib/mocks/gift-cards.mock.ts` |
| **API** | `app/api/gift-cards/{purchase,redeem}/route.ts` |
| **Banner home** | `components/marketplace/gift-cards/GiftCardsBanner.tsx` |
| **Nav** | Link en `MarketplaceNavbar.tsx` (desktop + mobile) |

## Flujo usuario

1. Hub: `/marketplace/gift-cards` — elegi denomination + disenio
2. Wizard: `/marketplace/gift-cards/comprar?amount=50&design=cumpleanos`
   - Step 1: Monto + disenio
   - Step 2: Destinatario (nombre + WhatsApp/email)
   - Step 3: Dedicatoria (200 chars + firma)
   - Step 4: Preview + pago (mock — no toca payment gateway real)
3. Confirmacion: `/marketplace/gift-cards/confirmacion?amount=50&recipient=...`
4. Dashboard: `/cuenta/gift-cards` — tabs Recibidas / Enviadas / Historial

## Estado actual: MOCK

La tabla `GiftCard` NO existe en Prisma todavia — seria una migration
pesada que toca zona peligrosa (`prisma/schema.prisma`, `lib/db/orders.db.ts`
para descontar saldo en checkout). Por eso todo funciona con
`lib/db/gift-cards.db.ts` que es in-memory.

## Pendiente (requiere ADR dedicado)

| Item | Razon no hecho |
|---|---|
| Tabla `GiftCard` + `GiftCardUsage` en Prisma | `prisma/schema.prisma` es zona peligrosa |
| Descuento de saldo en checkout | `components/checkout/**` + `lib/db/orders.db.ts` son zona peligrosa |
| Envio real WhatsApp / email | Requiere setup de provider + cron fire-and-forget |
| Auth real — userId del session | Actualmente mock con `x-user-id` header |
| Rate limiting de compras por usuario (no solo por IP) | Requiere session |

## Integracion checkout (pendiente)

El flujo propuesto cuando se integre:

1. En `/marketplace/gift-cards/comprar` step 4, crear orden regular via
   `OrdersDB.create(...)` con SKU sintetico "GIFT_CARD_<amount>".
2. Al confirmar pago, el webhook de Stripe llama
   `GiftCardsDB.purchase(...)` + fire-and-forget envio WhatsApp/email.
3. En el checkout del marketplace, agregar input de codigo
   "Tengo una Gift Card" que llama `GiftCardsDB.validateCode(...)`
   y descuenta del `balance`.

## API

### POST `/api/gift-cards/purchase`

Zod-validated. Rate limited (5 por IP / 5 min).

```json
{
  "amount": 50,
  "design": "cumpleanos",
  "message": "Feliz cumple!",
  "recipientName": "Ana Torres",
  "recipientContact": "+51 987 654 321",
  "contactMethod": "whatsapp",
  "senderName": "Juana Perez"
}
```

### POST `/api/gift-cards/redeem`

Canjea tarjeta por codigo. Rate limited (10 por IP / 5 min).

```json
{ "code": "BULJ-XXXX-YYYY" }
```
