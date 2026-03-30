---
applyTo: "**/whatsapp*,**/webhook*,**/reniec*"
---

# WhatsApp & Webhooks — Buleje

## Endpoints relevantes

```
app/api/webhooks/        → Webhook receiver (WhatsApp, Stripe, etc.)
app/api/reniec/          → Consulta de DNI peruano
app/api/message-templates/ → Plantillas de mensajes
app/api/customer-notifications/ → Notificaciones a clientes
```

## Modelo MessageTemplate

```prisma
model MessageTemplate {
  id        Int      @id @default(autoincrement())
  name      String   // "order_confirmed", "order_ready", etc.
  channel   String   // "whatsapp" | "sms" | "email"
  body      String   // Texto con variables: {nombre}, {pedido}
  tenantId  String   @default("main")
}
```

## Seguridad de webhooks

```typescript
// Verificar signature de WhatsApp (Meta)
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Verificar signature HMAC de Stripe:
import crypto from "crypto";
const sig = req.headers.get("stripe-signature")!;
const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
```

## Notificaciones a clientes (flujo)

```
1. Evento (orden confirmada, lista para entrega)
2. → NotificationsDB.send(phone, templateName, vars)
3. → Buscar MessageTemplate en DB
4. → Reemplazar variables en el template
5. → Enviar por canal configurado (push/email/whatsapp)
6. → fire-and-forget (.catch(() => {}))
```

## RENIEC (consulta de DNI peruano)

```typescript
// app/api/reniec/route.ts
// Consulta datos de ciudadano peruano por DNI
// Requiere API key de servicio RENIEC externo
// Usado para verificar clientes en checkout

const RENIEC_API_KEY = process.env.RENIEC_API_KEY;
```

## Variables de entorno

```bash
WHATSAPP_VERIFY_TOKEN=   # Token de verificación de webhook Meta
WHATSAPP_ACCESS_TOKEN=   # Token de acceso WhatsApp Business API
WHATSAPP_PHONE_ID=       # ID del número de WhatsApp Business
STRIPE_WEBHOOK_SECRET=   # Secret para verificar webhooks de Stripe
RENIEC_API_KEY=          # API key para consultas RENIEC
```

## Gotchas

- **Webhooks deben responder en < 5 segundos** — procesar async o encolar
- **WhatsApp webhook GET** → verificación de Meta (responder el challenge)
- **WhatsApp webhook POST** → mensajes entrantes del cliente
- **Stripe signature** → verificar SIEMPRE antes de procesar — previene fraude
- **RENIEC gratis tiene rate limit** — cachear resultados por DNI

## Anti-patrones

- NO procesar webhooks de Stripe sin verificar la signature
- NO responder 500 a webhooks → el servicio reintentará infinitamente
- NO bloquear el response mientras se procesa la lógica de negocio (usar waitUntil o fire-and-forget)
