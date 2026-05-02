# ADR-088 — WhatsApp Concierge AI multi-vendor + Yape Vision close-loop

- **Status:** Accepted
- **Fecha:** 2026-05-02
- **Autores:** Brandon Buleje + Claude Opus 4.7 (sesión 22 commits)
- **Relacionado:** ADR-046 (concierge state machine), ADR-043 (intent classifier),
  ADR-019 (Next 16 cache), ADR-058 (fast-path routing), ADR-072 (multi-tenant
  isolation), `WHATSAPP_SETUP.md` (operational guide).
- **Supersede a:** N/A — extiende el concierge existente con cross-tenant
  search + multi-vendor checkout + Yape Vision; no reemplaza nada.

---

## 1. Contexto (Feynman)

Antes de esta sesión el WhatsApp del SaaS funcionaba como **un bot por tenant**:
cada tienda configuraba su número y los clientes consultaban un solo catálogo.
El cliente quería algo más cercano a una experiencia tipo Rappi/PedidosYa donde:

| Antes | Ahora |
|---|---|
| Un número por tenant | **Un número único** del marketplace global |
| Cliente consulta solo a su bodega | Cliente consulta **todo el marketplace** |
| Carrito = una tienda | Carrito **multi-tienda** (multi-vendor) |
| Pago = transferencia "manual" verificada por el dueño | **IA Vision lee el Yape** y un superadmin aprueba en bulk |
| Sin recomendaciones | **IA recomienda 3 productos** según contexto |

La motivación es comercial: en Pucallpa la mayoría de bodegas son pequeñas
(<200 SKU). Si el cliente solo ve UNA tienda, frustración alta. Si ve TODAS
las del marketplace, cada vendor gana acceso a tráfico de la red entera.

## 2. Decisión

### 2.1 Webhook único + tenant fallback

Mantenemos `tenantWhatsAppConfig` para tenants que QUIEREN su propio número
(modo white-label), pero el comportamiento por defecto es:

```
Mensaje entrante → resolver tenant por phoneNumberId
                → si no hay match → tenantId = "main"
                → handlers cross-tenant
```

`"main"` es el tenant-platform que actúa como root del marketplace.

### 2.2 Cross-tenant search en `lib/whatsapp/concierge/cross-tenant-search.ts`

Ranking:
- Con lat/lng del cliente → **Haversine ASC** + price ASC
- Sin lat/lng → **rating DESC** + price ASC
- Cache 60 s, fallback `[]` (nunca throw)

Reutiliza `MarketplaceSearchDB.search()` (no DB direct, regla CLAUDE.md #1).

### 2.3 Multi-vendor checkout en `lib/whatsapp/concierge/multi-vendor-checkout.ts`

```
Cart con N storeIds distintos → groupByStore
                             → 1 Order por vendor con idempotencyKey
                                "wachat:{conversationId}:{storeId}"
                             → 1 PaymentApproval global linkeada a TODOS
                                vía Order.paymentApprovalId
                             → state = awaiting_payment_capture
```

Decisión clave: **PaymentApproval es global** (sin `tenantId`), porque el
equipo Buleje revisa todas las dudas en un solo dashboard. Esto rompe la
regla CLAUDE.md #3 (`tenantId` 1er filtro) intencionalmente, documentado en
el header del `payment-approval.db.ts`.

### 2.4 Yape Vision close-loop

```
Cliente envía foto Yape
  ↓ /api/whatsapp/yape-capture (Twilio O Meta payload)
PaymentApproval pending creada
  ↓ extractYapePayment() en background (Claude Sonnet 4.6 Vision)
setVisionResult() decide pending vs review_required (delta >5%)
  ↓ Superadmin entra a /superadmin/pagos-yape
Approve/Reject con UPDATE atómico (WHERE status IN pending|review_required)
  ↓ por cada Order con paymentApprovalId = approvalId
OrdersDB.update(tenantId, orderId, { status: confirmado|cancelado })
  ↓
notifyYapeApproved/Rejected → sendBotReply al cliente vía WhatsApp
```

### 2.5 Provider AI fallback chain

`lib/ai/provider.ts` auto-selecciona en este orden:
1. **Anthropic** Haiku 4.5 (chat) / Sonnet 4.6 (smart + vision)
2. **Groq** llama-3.3-70b-versatile (free tier 14k req/d, OpenAI-compatible via createOpenAI baseURL)
3. **OpenAI** gpt-4o-mini / gpt-4o

Sin AI key → Anthropic stub que falla en runtime → caller try/catch → menú welcome (fail-safe).

### 2.6 Recommend handler nuevo

Intent `recomendar` en `ai-intent.ts`. Handler en `recommend.handler.ts`:
1. searchProductsCrossTenant(query, limit=8)
2. Top 3 → smartModel escribe opener natural-Peruvian (≤60 palabras)
3. Append `formatCrossTenantResults(picks)` → cliente responde "1", "2" o "3" para agregar al carrito (cart-add handler ya existente)

## 3. Consecuencias

### Positivas

| Área | Impacto |
|---|---|
| **Negocio** | Cualquier cliente puede comprar en cualquier tienda con 1 solo número |
| **DX** | El concierge es ÚNICO entry point — no hay que mantener N bots por tenant |
| **Coste IA** | Groq free tier cubre clasificación (~14k msgs/día). Anthropic solo para Vision (Yape ~$0.005/captura, budget $1/día) |
| **Tests** | 72 tests vitest cubriendo el pipeline (`__tests__/whatsapp/`) |
| **Operación** | Superadmin tiene dashboard único de aprobaciones (`/superadmin/pagos-yape`) |

### Negativas / trade-offs

| Trade-off | Mitigación |
|---|---|
| `PaymentApproval` global rompe regla #3 (`tenantId`) | Documentado en header, accesible solo via superadmin auth |
| Cross-tenant search requiere productos publicados marketplace-wide | Fallback a tenant search si 0 resultados |
| Yape Vision depende de Anthropic (no Groq) | Si falla, queda en `review_required` → humano revisa |
| Schema drift `Order.paymentApprovalId` | Workaround raw SQL en `lib/db/order-payment-link.db.ts`, cleanup PR programado para sábado vía routine `trig_016QQYSckqyzQy8wHyDh35K9` |
| 4 migraciones pendientes en prod | `scripts/apply-may2-migrations.sql` listo para Supabase Editor |

### Seguridad (audit 2026-05-02)

11 de 13 hallazgos cerrados en sesión. **Pendientes:**
- High #3: `/api/whatsapp/yape-capture` no valida X-Twilio-Signature ni X-Hub-Signature
- High #8: approve no es transaccional (server crash mid-loop = inconsistencia)

## 4. Alternativas consideradas

| Opción | Por qué no |
|---|---|
| Bot por tenant (statu quo) | Frustra cliente, no escala marketplace |
| OCR open-source (Tesseract) | Fallaría con capturas Yape modernas (gradients, fonts custom). Tesseract tiene ADR-radar pendiente para uso secundario |
| Pago automático via API Yape | Yape no expone API B2B en Perú. Mejor opción a futuro: integrar Niubiz/Izipay |
| Multi-vendor con 1 Order que tenga N items de tiendas distintas | Rompería el modelo Order existente (1 tenantId, 1 vendor). Multi-Order es más extensible |
| Sin cross-tenant search (cliente elige tienda primero) | UX peor: cliente quiere "arroz", no "arroz en Bodega X" |

## 5. Implementación

29 commits en sesión 2026-05-02. Highlights:
- `ae318f64` feat(whatsapp): multi-vendor concierge core
- `6e9a074b` feat(yape-vision): full pipeline + close-loop
- `61160eeb` feat(delivery): rider dashboard 2.0
- `c4fcef15` feat(i18n): quechua + auto-translator
- `27ea3cb4` fix(whatsapp): 2 critical signature vulnerabilities
- `0cc6f22f` fix(security): atomic approve/reject
- `b252b7be` fix(security): idempotency + ghost approval

Archivos clave (relativos al repo root):
```
app/api/whatsapp/concierge/route.ts            # webhook firmado HMAC
app/api/whatsapp/concierge/test/route.ts       # dev-only smoke
app/api/whatsapp/yape-capture/route.ts         # Twilio + Meta image webhook
app/api/superadmin/payment-approvals/          # CRUD aprobaciones
app/superadmin/pagos-yape/                     # UI dashboard
lib/whatsapp/concierge/cross-tenant-search.ts  # Haversine ranking
lib/whatsapp/concierge/multi-vendor-checkout.ts# split + idempotency
lib/whatsapp/concierge/handlers/recommend.handler.ts
lib/ai/yape-vision.ts                          # Sonnet 4.6 OCR
lib/db/payment-approval.db.ts                  # self-bootstrap DB class
lib/db/order-payment-link.db.ts                # cross-tenant lookup
lib/whatsapp/notify-yape-result.ts             # cliente notify
__tests__/whatsapp/                            # 72 tests vitest
scripts/test-whatsapp-concierge.mjs            # E2E smoke
scripts/apply-may2-migrations.sql              # Supabase manual fallback
WHATSAPP_SETUP.md                              # operational guide
```

## 6. Cómo activar

```bash
# 1. Pegar AI key en .env.local (recomendado: Anthropic para Vision)
echo 'ANTHROPIC_API_KEY=sk-ant-xxx' >> .env.local

# 2. Aplicar migraciones — pegar contenido en Supabase SQL Editor
#    https://supabase.com/dashboard/project/<ref>/sql/new
cat scripts/apply-may2-migrations.sql

# 3. En Vercel: setear WHATSAPP_WEBHOOK_SECRET para activar fail-closed
#    (ADR-088 §2.4 + audit fix #1).

# 4. Smoke local
node scripts/test-whatsapp-concierge.mjs
```

## 7. Métricas de éxito

A monitorear post-deploy:
- **% mensajes clasificados** (no "desconocido") — target ≥85%
- **Latencia p95 Vision** — target <8 s
- **% aprobaciones automáticas** (no `review_required`) — target ≥80%
- **Conversión cart → confirmed Order** — target ≥25%
- **Coste IA por pedido** — target <$0.02

## 8. Referencias externas

- [Meta WhatsApp Cloud API webhook](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Twilio WhatsApp Business webhook signature](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- [Vercel AI SDK 6 — provider routing](https://sdk.vercel.ai/docs)
- [Anthropic Claude Vision](https://docs.anthropic.com/en/docs/vision)
- [Groq OpenAI-compatible](https://console.groq.com/docs/openai)
