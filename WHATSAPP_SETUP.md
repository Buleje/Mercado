# WhatsApp Concierge — Setup en 1 página

## Qué hace

Un solo número de WhatsApp donde cualquier cliente puede:

| Acción | Ejemplo de mensaje |
|---|---|
| Buscar productos del marketplace (cross-tenant) | "tienen arroz?", "cuánto la coca cola" |
| Recibir recomendaciones IA | "qué me recomiendas para una parrilla" |
| Armar carrito multi-tienda | "quiero 2 kg de arroz y 1 pollo asado" |
| Confirmar pedido + Yape | "sí confirmo", luego envía foto del Yape |
| Consultar estado | "dónde está mi pedido" |
| Hablar con humano | "quiero hablar con una persona" |

El motor está en `lib/whatsapp/concierge/`. Usa state machine + LLM clasificador + búsqueda cross-tenant + multi-vendor checkout.

## Activar IA — pegar 1 key

Editá `.env.local` y descomentá UNA línea (en este orden de preferencia):

```bash
# Opción A — Gratuito (recomendado para arrancar): https://console.groq.com/keys
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx

# Opción B — Pago, mejor calidad español-Perú: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx

# Opción C — Alternativa: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-xxxxxxxxxxxx
```

Después: `npm run dev` (el provider auto-detecta y prioriza Anthropic > Groq > OpenAI).

## Probar local sin Meta

```bash
node scripts/test-whatsapp-concierge.mjs
```

Simula 6 conversaciones contra `/api/whatsapp/concierge/test`. Ese endpoint solo responde fuera de producción.

| Escenario | Intent esperado | Handler |
|---|---|---|
| "hola buenas tardes" | saludo | fallback (welcome menu) |
| "tienen arroz?" | precio | product-query (cross-tenant) |
| "qué me recomiendas para parrilla" | recomendar | recommend (IA) |
| "quiero 2 kg de arroz" | pedido | cart-add |
| "dónde está mi pedido" | estado | order-status |
| "quiero hablar con una persona" | humano | human-escalation |

## Conectar Meta WhatsApp Cloud API

Las env vars ya están en `.env.local`:

| Variable | Para qué |
|---|---|
| `WHATSAPP_API_TOKEN` | Token Bearer para enviar mensajes |
| `WHATSAPP_PHONE_NUMBER_ID` | Número emisor (de Meta) |
| `WHATSAPP_VERIFY_TOKEN` | Token que Meta envía en GET de verificación |
| `WHATSAPP_APP_SECRET` | Para validar firma X-Hub-Signature-256 |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA |

En Meta Developer Console, configurá el webhook:

| Campo | Valor |
|---|---|
| Callback URL | `https://tudominio.com/api/whatsapp/concierge` |
| Verify Token | el de `WHATSAPP_VERIFY_TOKEN` |
| Subscribe to | `messages`, `message_status` |

## Flag de seguridad

| Var | Default | Efecto |
|---|---|---|
| `WHATSAPP_AI_FIRST` | `true` | Si lo seteás a `false`, el webhook salta el concierge IA y usa el motor keyword legacy (`conversation-engine.ts`). Útil como kill switch sin redeploy. |

## Multi-tenant + WhatsApp único

El webhook resuelve `tenantId` desde `phone_number_id` vía `tenantWhatsAppConfig`. Si no hay match, cae a `tenantId="main"` (variable de entorno global). Eso significa:

- **Modo "WhatsApp único marketplace"**: NO configurar `tenantWhatsAppConfig` para ningún tenant → todos los mensajes caen a `main` y el concierge busca cross-tenant en TODO el marketplace.
- **Modo "tienda dedicada"**: configurar `tenantWhatsAppConfig.phoneNumberId` por tenant → cada tienda atiende su propio número.

## Troubleshooting rápido

| Síntoma | Causa | Fix |
|---|---|---|
| Todo responde "¡Hola! Soy tu asistente…" (welcome menu) | Sin AI key activa → clasificador devuelve `desconocido` | Pegar `GROQ_API_KEY` o `ANTHROPIC_API_KEY` y reiniciar dev |
| `403 CSRF token invalido` en POST | CSRF no exenta `/api/whatsapp/` | Ya arreglado en `lib/csrf.ts` |
| `searchProductsCrossTenant` devuelve `[]` | Marketplace sin productos publicados | `npm run db:seed` o crear vendors en `/superadmin` |
| Meta GET verification falla | `WHATSAPP_VERIFY_TOKEN` no coincide | Sincronizar en Meta Developer Console |

## Endpoints

| Ruta | Método | Para qué |
|---|---|---|
| `/api/whatsapp/concierge` | GET | Verificación Meta (hub.challenge) |
| `/api/whatsapp/concierge` | POST | Recibir mensajes Meta (firma HMAC requerida) |
| `/api/whatsapp/concierge/test` | GET | Health: provider activo, key presente |
| `/api/whatsapp/concierge/test` | POST | Simular mensaje (`{tenantId?, phone, message}`) — solo dev |
| `/api/whatsapp/webhook` | GET/POST | Webhook legacy (igual flujo, mismo resolver de tenant) |
| `/api/whatsapp/yape-capture` | POST | Recibe foto Yape para checkout multi-vendor |

## Costos (free tier Groq)

| Plan | Límites |
|---|---|
| Groq Free | 14,400 req/día, 30 req/min en `llama-3.3-70b-versatile` |
| Anthropic | Pago por token — Haiku 4.5 ≈ $0.001 / mensaje clasificado |
| OpenAI | Pago por token — gpt-4o-mini ≈ $0.0005 / mensaje |

Para el clasificador (1 LLM call por mensaje entrante), Groq free aguanta ~14k mensajes/día = sobra para arrancar el marketplace.

## Archivos clave

```
lib/whatsapp/
├── ai-intent.ts                  # Clasificador IA (10 intents)
├── conversation-engine.ts        # Motor legacy (kill-switch fallback)
├── message-templates.ts          # Plantillas formateadas
└── concierge/
    ├── concierge-router.ts       # Entry point: classify → dispatch → persist
    ├── state-machine.ts          # (state, intent) → handler
    ├── conversation-store.ts     # Persistencia DB (WhatsAppConversation)
    ├── cross-tenant-search.ts    # Búsqueda en marketplace global
    ├── multi-vendor-checkout.ts  # Split por tienda + Yape capture
    ├── response-formatter.ts
    ├── types.ts                  # CartItem multi-vendor, ConversationState
    └── handlers/
        ├── product-query.handler.ts    # Búsqueda → lista numerada
        ├── recommend.handler.ts        # IA recomienda 3 con razón
        ├── cart-add.handler.ts         # Agregar al carrito
        ├── order-create.handler.ts     # Crear orden (single + multi-vendor)
        ├── order-status.handler.ts     # Estado del pedido
        ├── human-escalation.handler.ts # Escalada a humano
        └── fallback.handler.ts         # Welcome menu (intent desconocido)

app/api/whatsapp/
├── concierge/route.ts          # Webhook Meta principal (firma HMAC)
├── concierge/test/route.ts     # Endpoint dev para probar sin Meta
├── webhook/route.ts            # Webhook legacy (compatibilidad)
└── yape-capture/route.ts       # Captura de foto Yape

scripts/
└── test-whatsapp-concierge.mjs   # Smoke test E2E (6 escenarios)
```
