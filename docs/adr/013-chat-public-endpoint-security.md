# ADR-013: Seguridad del Endpoint Público del Chat (/api/chat/public)

## Estado
✅ Aceptada · 🟡 Revisable en Fase 4 cuando se active el flag en producción

## Fecha
2026-04-08

## Contexto

El Bloque D2 del Marketplace expone un endpoint público `/api/chat/public` para que el buyer del storefront pueda abrir un hilo de chat con la tienda sin necesidad de login admin. Tres acciones:

- `POST ?action=open` — abrir (o reutilizar) un hilo
- `POST ?action=send` — enviar un mensaje
- `GET ?threadId=...&storeSlug=...&customerPhone=...` — listar los mensajes

El endpoint es la **única superficie del sistema que acepta escrituras desde internet sin sesión admin**. Eso lo convierte en un target atractivo para:

1. **Enumeración de datos**: un atacante podría iterar `threadId`s para acceder a conversaciones ajenas
2. **Spam**: un bot podría abrir cientos de hilos para saturar a los sellers
3. **Phishing**: un atacante podría abrir hilos pretendiendo ser otro buyer conocido
4. **Injection**: un body malicioso podría escapar Zod y llegar a la DB
5. **Multi-tenant leak**: un bug en el ownership check podría exponer datos entre tenants
6. **WhatsApp spam**: cada mensaje enviado dispara un job BullMQ que puede acabar en WhatsApp del seller

Necesitamos decidir qué protecciones implementamos en **esta fase** (Fase 3 del D2), qué dejamos como TECH-DEBT, y cuál es el threshold para activar el feature flag en producción.

## Opciones consideradas

### Opción A: OTP vía SMS/WhatsApp antes de abrir el thread
- ✅ Auténtica fuertemente al buyer por su número real
- ✅ Previene phishing por número ajeno
- ❌ Requiere integración con proveedor SMS (costo: ~$0.05 por OTP)
- ❌ Fricción alta en la UX del storefront — muchos buyers abandonan ante el OTP
- ❌ Implementación ~1 sesión extra (provider + DB para OTP codes + rate limit)
- ❌ Bloqueaba el cierre de Fase 3 del D2

### Opción B: Protecciones ligeras + feature flag OFF por default (elegida)
- ✅ Se implementa en esta fase sin sumar dependencias externas
- ✅ Feature flag permite activar gradualmente con monitoring
- ✅ Cumple los requisitos de **smoke testing** en preview sin riesgo de prod
- ❌ No autentica fuertemente al buyer — cualquiera con el número correcto puede abrir un thread
- ❌ Spam requiere mitigación reactiva (no preventiva)

### Opción C: reCAPTCHA / Vercel BotID antes del POST
- ✅ Previene bots automatizados
- ✅ Zero-friction (invisible reCAPTCHA)
- 🟡 Requiere setup en Vercel BotID (ver `vercel:bot-id` skill del plugin ecc)
- 🟡 Se puede sumar en Fase 4 sin refactor grande

## Decisión

**Elegimos Opción B** para la Fase 3, con un plan de activación por capas:

### Capa 1 — Aplicada ahora (Fase 3)

1. **Feature flag `marketplace-chat-public`** arranca OFF en todos los entornos. Sólo se activa con env var explícita.
2. **Ownership validation doble**: cada request debe pasar el check de `(customerPhone, storeId)` contra el thread en DB antes de leer/escribir. Si no matchea → 404 genérico (no `403 forbidden`, que daría pista al atacante).
3. **Rate limiting** delegado al middleware existente (`proxy.ts`) — 60 req/min/IP. Aplicable por default.
4. **Zod `safeParse` estricto** con `max(4000)` en body, `max(20)` en phone, `max(150)` en name.
5. **Validación de tienda publicada** antes de aceptar cualquier acción. Si `isPublished = false` → 404.
6. **Sanitización de campos expuestos** en el response: el buyer nunca recibe `tenantId`, `unreadForSeller`, `readBy*At`, `metadataJson`, `customerName` del thread (podría revelar apellido).
7. **Headers de respuesta**: `Cache-Control: no-store` + `X-Robots-Tag: noindex, nofollow` para prevenir caching de respuestas sensibles.
8. **Sentry reportCriticalError con tag `severity_user_facing=true`** en cualquier error del endpoint — prioridad alta en el dashboard de alertas.
9. **Idempotency key del WhatsApp worker**: máximo 1 WhatsApp por minuto por hilo, previene que un atacante con flood request genere spam al owner del tenant.

### Capa 2 — Activación en preview (aún pendiente)

Requisitos para prender el flag en preview:

1. **Smoke test manual** del flujo completo con el seed demo (`scripts/seed-chat-demo.ts`)
2. **E2E Playwright verde** en preview (`e2e/chat-flow.spec.ts` con `E2E_CHAT_PUBLIC_ENABLED=1`)
3. **Sentry configurado** para que cualquier error del endpoint público dispare una alerta en < 5 min
4. **Rate limit 60 req/min/IP verificado** con un test de load (k6 o curl loop)

### Capa 3 — Activación en producción (requiere Fase 4)

Antes de flippear a `FEATURE_MARKETPLACE_CHAT_PUBLIC=true` en production, implementar:

1. **Vercel BotID** para prevenir bots automatizados (feature nativa de Vercel, GA desde 2025-06)
2. **Rate limit stricter por customerPhone** (no solo por IP) — evita que un atacante con IPs rotativas abuse del mismo teléfono
3. **OTP opcional** detrás de otro feature flag `marketplace-chat-otp` — activable solo para tenants que lo pidan
4. **Moderation**: escaneo de contenido del body con palabras clave bloqueadas antes de guardar
5. **Log audit trail** de cada request al endpoint público en una tabla `ChatAuditLog` separada

## Consecuencias

### Positivas

- Fase 3 del D2 se puede cerrar sin bloqueos por integraciones externas
- El feature flag OFF por default garantiza que no hay exposición en prod hasta que se active manualmente
- Los tests unitarios (14/14 passing) cubren los casos de ownership y Zod
- El path de activación está documentado paso a paso con gates claros

### Negativas

- **No hay autenticación real del buyer** hasta Fase 4. Un atacante que conozca el `customerPhone` de otra persona puede abrir un thread con ese número.
- **Spam preventivo débil**: rate limit por IP es sorteable con proxies. Mitigación = feature flag + monitoring reactivo.
- **Fricción de UX**: el buyer debe dejar su nombre real y teléfono cada vez (aunque el widget persiste la sesión en localStorage).
- **Sin reCAPTCHA**: bots simples pueden pasar hasta que se active Vercel BotID.

### Mitigaciones activas

| Riesgo | Mitigación |
|---|---|
| Enumeración de threadIds | Respuesta 404 genérica · threadId es UUID → 2^122 keyspace |
| Phishing con número ajeno | Capa 3 agrega OTP opcional · aceptable en Capa 1 porque flag off |
| Spam de aperturas | Rate limit middleware + idempotency del WhatsApp worker |
| Multi-tenant leak | Ownership check doble (storeSlug → tenant → thread.customerPhone) · 14 tests unit cubren los edge cases |
| WhatsApp flood al owner | Idempotency key `(threadId, event, minuteBucket)` · máx 1 msg/min/hilo |
| Exposición de campos sensibles | Whitelist explícita en el response: solo `id, senderType, senderName, body, messageType, attachmentUrl, createdAt` |
| Injection | Zod `safeParse` + `$queryRawUnsafe` con params posicionales `$1 $2 $3` (no interpolation) |
| Cache poisoning | `Cache-Control: no-store` + noindex tags en respuestas |

## Threshold de activación

**No activar el flag en producción hasta cumplir los 4 criterios de Capa 2 + al menos 2 de los 5 de Capa 3.**

El flag `FEATURE_MARKETPLACE_CHAT_PUBLIC=true` sólo se prende en preview para:
1. Smoke testing manual durante Fase 3
2. E2E Playwright en CI
3. Demo a Brandon con seed

## Referencias

- `app/api/chat/public/route.ts` — implementación actual
- `components/marketplace/ChatBubble/` — widget del storefront
- `__tests__/api-chat-public.test.ts` — 14 tests unit de seguridad
- `e2e/chat-flow.spec.ts` — E2E con skip condicional por flag
- ADR 011 — patrón raw SQL del marketplace (aplica acá también)
- ADR 012 — polling vs realtime (aplica acá también)
- `docs/rollback-marketplace-chat-d2.md` — plan de rollback 3 niveles
