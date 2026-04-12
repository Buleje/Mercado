# ADR 046 — WhatsApp AI Concierge Conversation Engine

**Estado:** Propuesto — cierra ADR-043
**Fecha:** 2026-04-10
**Autor:** Claude (arquitecto de soluciones) — sesion Sprint 2 wave 3
**Sprint:** 2 (AI + WhatsApp + Growth)
**Tier S item:** #6 — extiende el classifier de ADR-043 a acciones reales

---

## Contexto

ADR-043 entrego `lib/whatsapp/ai-intent.ts` con `classifyWhatsappIntent()` que devuelve `{ intent, confidence, items?, productQuery? }`. El classifier ya tiene tests y funciona. Pero ese intent no se conecta a ningun handler — el state machine existente (`lib/whatsapp/conversation-engine.ts`, en dirty tree, NO tocar) sigue siendo 100% keyword-based.

El gap: el cliente escribe "Cuanto cuesta el aceite?" y el classifier devuelve `{ intent: "consultar_producto", confidence: 0.92, productQuery: "aceite" }` — pero nadie lee ese resultado para buscar el producto real y responder.

Este ADR cierra ese loop: construye la maquina de estados que **ejecuta acciones** a partir del intent clasificado.

**Archivos en dirty tree que NO tocar:**
- `lib/whatsapp/conversation-engine.ts`
- `lib/whatsapp/ai-intent.ts`
- `lib/whatsapp/message-templates.ts`

## Decision

Implementar un **Concierge Engine** en `lib/whatsapp/concierge/` que se monta encima del conversation-engine existente como una capa adicional. El flujo es:

```
Mensaje entrante
  → conversation-engine.ts (existente, keyword match)
    → si NO match → concierge-router.ts (NUEVO)
      → classifyWhatsappIntent() [ADR-043]
        → si confidence >= 0.6 → state-machine.ts (NUEVO)
          → action-handlers/ (NUEVOS)
        → si no → fallback a welcome menu existente
```

Este diseno es **aditivo puro** — el conversation-engine existente no se modifica. El concierge se activa solo cuando el engine existente no reconoce el mensaje.

### Estados de la maquina

El modelo `WhatsAppConversation` ya tiene el campo `state` con los valores: `idle | browsing | cart | checkout | awaiting_payment | completed`. El concierge respeta esos estados y los transiciona:

| Estado actual | Intent recibido | Transicion | Accion |
|---------------|-----------------|-----------|--------|
| `idle` | `consultar_producto` | → `browsing` | Busca producto, responde con precio |
| `idle` | `crear_pedido` | → `cart` | Agrega items al carrito |
| `browsing` | `crear_pedido` | → `cart` | Agrega al carrito en sesion activa |
| `cart` | `confirmar_pedido` | → `checkout` | Crea Order con estado `pending` |
| `cart` | `cancelar_pedido` | → `idle` | Limpia carrito, despide |
| `checkout` | `consultar_estado` | → `checkout` | Devuelve estado actual del pedido |
| `*` | `hablar_humano` | → `idle` | Escala a humano, notifica WhatsApp del staff |
| `*` | `desconocido` | no cambia | Fallback al welcome menu |

### Archivos nuevos

| Archivo | Proposito |
|---------|-----------|
| `lib/whatsapp/concierge/types.ts` | Tipos del concierge (ConversationContext, ActionResult, HandlerMap) |
| `lib/whatsapp/concierge/concierge-router.ts` | Entry point: recibe mensaje + contexto, devuelve respuesta |
| `lib/whatsapp/concierge/state-machine.ts` | Transiciones de estado + despacho a handler |
| `lib/whatsapp/concierge/handlers/product-query.handler.ts` | Busca producto en DB, formatea precio/stock |
| `lib/whatsapp/concierge/handlers/cart-add.handler.ts` | Agrega item a `WhatsAppConversation.cartItems` |
| `lib/whatsapp/concierge/handlers/order-create.handler.ts` | Crea Order desde carrito, limpia sesion |
| `lib/whatsapp/concierge/handlers/order-status.handler.ts` | Consulta estado de ultimo pedido del phone |
| `lib/whatsapp/concierge/handlers/human-escalation.handler.ts` | Notifica staff + marca sesion como escalada |
| `lib/whatsapp/concierge/handlers/fallback.handler.ts` | Devuelve welcome menu formateado |
| `lib/whatsapp/concierge/conversation-store.ts` | CRUD de `WhatsAppConversation` con cache + expiry |
| `lib/whatsapp/concierge/response-formatter.ts` | Formatea respuestas con templates Meta (importa `message-templates.ts`) |
| `app/api/whatsapp/concierge/route.ts` | POST endpoint — recibe webhook Meta, orquesta el concierge |
| `__tests__/whatsapp-concierge-router.test.ts` | 15+ casos de conversacion end-to-end |

### Tipos clave (`lib/whatsapp/concierge/types.ts`)

```ts
import type { WhatsAppConversation } from "@prisma/client";
import type { WhatsappIntent } from "../../whatsapp/ai-intent"; // importa SIN modificar

export interface ConversationContext {
  tenantId: string;
  phone: string;
  message: string;
  conversation: WhatsAppConversation | null;
}

export interface ActionResult {
  reply: string;                    // texto a enviar al cliente
  newState?: WhatsAppConversation["state"];
  updatedCartItems?: CartItem[];
  shouldEscalate?: boolean;
}

export interface CartItem {
  productId: number;
  name: string;
  quantity: number;
  price: number;
  unit: string;
}

export type HandlerFn = (ctx: ConversationContext, intent: ClassifiedIntent) => Promise<ActionResult>;
```

### Historial persistente

`WhatsAppConversation` ya tiene `state`, `cartItems` (JSON), `lastMessageAt` y `expiresAt`. El concierge actualiza esos campos via `conversation-store.ts`. La sesion expira en 30 min de inactividad (logica de `expiresAt` ya definida en el modelo).

Para historico de mensajes (debug/auditoria), los mensajes importantes se loggean en `ActivityLog` via fire-and-forget:
```ts
logActivity(tenantId, "whatsapp.message", phone, { intent, state, reply }).catch(() => {});
```

### Escalada a humano

`human-escalation.handler.ts` hace dos cosas:
1. Envia mensaje al cliente: "Te conectamos con un asesor en breve"
2. Fire-and-forget a `sendWhatsAppNotification(staffPhone, alertMessage)` — notifica al dueno

Si `WHATSAPP_STAFF_PHONE` no esta configurado, la escalada es silenciosa (solo responde al cliente).

### Integracion con ADR-043

El concierge importa `classifyWhatsappIntent` y `shouldTrustAi` directamente desde `lib/whatsapp/ai-intent.ts` (que esta en el dirty tree como untracked — NO modificar, solo importar via path relativo).

```ts
// lib/whatsapp/concierge/concierge-router.ts
import { classifyWhatsappIntent, shouldTrustAi } from "../ai-intent"; // import sin modificar el archivo
```

### Endpoint webhook Meta (`app/api/whatsapp/concierge/route.ts`)

```ts
// Verificacion webhook Meta (GET)
// Recepcion de mensajes (POST)
// Valida X-Hub-Signature-256 con WHATSAPP_WEBHOOK_SECRET
// Responde HTTP 200 inmediatamente, procesa async (Meta requiere respuesta < 5s)
```

## DAG de dependencias entre archivos

```
lib/whatsapp/concierge/types.ts
  └── lib/whatsapp/concierge/conversation-store.ts
  └── lib/whatsapp/concierge/response-formatter.ts   ← importa message-templates.ts (sin modificar)
  └── lib/whatsapp/concierge/handlers/*.handler.ts
        └── lib/whatsapp/concierge/state-machine.ts
              └── lib/whatsapp/concierge/concierge-router.ts  ← importa ai-intent.ts (sin modificar)
                    └── app/api/whatsapp/concierge/route.ts
```

## Test battery — 15 casos de conversacion

| # | Estado inicial | Mensaje | Intent esperado | Respuesta esperada |
|---|----------------|---------|-----------------|-------------------|
| 1 | idle | "Hola buenas" | desconocido | welcome menu |
| 2 | idle | "Cuanto cuesta el arroz?" | consultar_producto | precio + stock arroz |
| 3 | idle | "Quiero 2 kg de arroz" | crear_pedido | confirmacion carrito |
| 4 | cart | "Agrega tambien 1 aceite" | crear_pedido | carrito actualizado |
| 5 | cart | "Cuanto va mi pedido?" | consultar_estado | resumen carrito |
| 6 | cart | "Confirmo el pedido" | confirmar_pedido | numero orden + total |
| 7 | cart | "Cancela todo" | cancelar_pedido | carrito vaciado |
| 8 | checkout | "Ya llego mi pedido?" | consultar_estado | estado de la orden |
| 9 | idle | "Quiero hablar con alguien" | hablar_humano | escalada a staff |
| 10 | browsing | "No importa" | cancelar_pedido | sesion reseteada |
| 11 | idle | Mensaje > 500 chars | (rechazado sin LLM) | mensaje de error amable |
| 12 | idle | "mandenme 3 cajas de gaseosa" | crear_pedido | items no encontrados → sugerencias |
| 13 | cart | confidence < 0.6 (mensaje ambiguo) | desconocido | welcome menu sin cambio de estado |
| 14 | idle | Sesion expirada (mock expiresAt pasado) | (nueva sesion) | bienvenida limpia |
| 15 | * | Error de DB en handler | (throw interno) | respuesta generica de error, no crash |

## Alternativas evaluadas

1. **Modificar `conversation-engine.ts` directamente** — descartado: archivo en dirty tree + risk regresion en 80% de flujos que ya funcionan.
2. **Reemplazar conversation-engine por concierge** — descartado: el engine tiene conocimiento del dominio (QUIERO, CONFIRMO, CATALOGO keywords) que funciona y tiene tests.
3. **Usar Dialogflow / Botpress** — descartado: vendor lock-in, costo mensual fijo, y no tiene acceso al catalogo por tenant.

## Consecuencias

### Positivas
- Lenguaje natural funciona para el 90% de casos de uso reales
- Zero regresion — el keyword engine sigue intacto para el 80% restante
- El carrito y el estado persisten en `WhatsAppConversation` (ya modelado)
- Historial de sesiones auditables en `ActivityLog`
- Escalada a humano lista desde el dia 1

### Negativas / riesgos
- Costo: ~$0.0001/mensaje clasificado por LLM (Haiku 4.5). A 20k mensajes/mes = ~$2/tenant/mes
- Latencia: +400ms cuando se llama el LLM (solo en casos no-keyword)
- `order-create.handler.ts` debe coordinarse con la zona de peligro de orders — usar `lib/db/orders.db.ts` existente solo para lectura de estado; crear Order via `POST /api/orders` interno si es necesario

### Seguridad
- Webhook Meta validado con `X-Hub-Signature-256` (HMAC-SHA256)
- Respuesta HTTP 200 inmediata (async processing) — Meta no reintenta si responde rapido
- `tenantId` siempre del contexto del tenant, nunca del payload del mensaje

## Variables de entorno requeridas

```env
WHATSAPP_WEBHOOK_SECRET="whsec_..."     # Para validar X-Hub-Signature-256 de Meta
WHATSAPP_VERIFY_TOKEN="..."             # Para verificacion inicial de webhook Meta
WHATSAPP_STAFF_PHONE="51XXXXXXXXX"      # Opcional: escalada a humano
```

## Fases de implementacion

| Fase | Archivos | Tiempo estimado |
|------|----------|-----------------|
| 1 — Core + Types | `types.ts`, `conversation-store.ts`, `state-machine.ts` | 1.5h |
| 2 — Handlers | Los 5 handlers | 2h |
| 3 — Router + Formatter | `concierge-router.ts`, `response-formatter.ts` | 1h |
| 4 — API endpoint | `app/api/whatsapp/concierge/route.ts` | 1h |
| 5 — Tests | `whatsapp-concierge-router.test.ts` (15 casos) | 2h |

**Agente delegado:** `backend-platform-engineer` para fases 1-4. `test-writer` para fase 5.

## Referencias

- `lib/whatsapp/ai-intent.ts` — clasificador ADR-043 (importar sin modificar)
- `lib/whatsapp/conversation-engine.ts` — engine existente (NO tocar)
- `lib/whatsapp/message-templates.ts` — formatters (importar sin modificar)
- `prisma/schema.prisma` lineas 1311-1326 — `WhatsAppConversation` modelo
- ADR 043 — WhatsApp AI Intent Classifier (prerequisito)
- ADR 016 — plan maestro (Tier S #6)
- CLAUDE.md reglas #3 (tenantId), #7 (fire-and-forget para logs), #9 (requireAdmin en endpoints admin)
