# Auditoría FinOps — Buleje 2026-05-23

## 1. Stack IA — Modelos en uso

| Feature | Archivo | Modelo activo | Input $/1M | Output $/1M |
|---|---|---|---|---|
| Chat publico storefront | `app/api/ai/chat/route.ts` | `claude-haiku-4-5-20251001` | $1.00 | $5.00 |
| WhatsApp intent classifier | `lib/whatsapp/ai-intent.ts` | `claude-haiku-4-5-20251001` | $1.00 | $5.00 |
| WhatsApp concierge router | `lib/whatsapp/concierge/` | `claude-haiku-4-5-20251001` | $1.00 | $5.00 |
| Smart features (smartModel) | `lib/ai/provider.ts` | `claude-sonnet-4-6` | $3.00 | $15.00 |
| Fallback provider | `lib/ai/provider.ts` | `gpt-4o-mini` | $0.15 | $0.60 |
| Fallback alternativo | `lib/ai/provider.ts` | `llama-3.3-70b` (Groq) | $0.59 | $0.79 |

## 2. Presupuestos AI configurados

```
free:       $0.50/mes/tenant
pro:        $5.00/mes/tenant
business:  $20.00/mes/tenant
enterprise: $100.00/mes/tenant
```

**4 clientes free trial = $2/mes techo IA** (protegido por aiCostGuard).

## 3. Estimación costo mensual — 4 tenants

### Costos IA (4 tenants)

| Feature | Llamadas/mes | Tokens in | Tokens out | Costo |
|---|---|---|---|---|
| Chat publico (Haiku) | 200 | ~40k | ~80k | $0.44 |
| WA intent (Haiku) | 400 | ~80k | ~120k | $0.68 |
| WA concierge | 400 | ~120k | ~160k | $0.92 |
| smartModel (Sonnet) | ~50 | ~25k | ~50k | $0.83 |
| **Total IA** | | ~265k | ~410k | **$2.87/mes** |

### Vercel (Fluid Compute)

| Recurso | Estimación | Costo |
|---|---|---|
| Invocations | ~500k/mes | $0 (Pro incluye) |
| Compute hours | ~10 GB-h | ~$1.80 |
| Edge requests | ~1M/mes | ~$0.65 |
| Bandwidth | ~20 GB | $0 |
| **Total** | | **~$22.45** (Pro $20 + extra) |

### Supabase

| Recurso | Costo |
|---|---|
| DB compute | $0-$10 |
| Storage 5 GB | $0 |
| Bandwidth 10 GB | $0.72 |
| **Total** | **~$10.72** |

### Otros

| Servicio | Costo/mes |
|---|---|
| Twilio WhatsApp 800 msg | $4.00 |
| Upstash Redis | $0.20 |
| Sentry (free tier 5k) | $0 |
| PostHog (1M events free) | $0 |
| Resend (3k free) | $0 |

## 4. Costo total consolidado

### Escenario actual: 4 tenants free trial

| Servicio | Costo |
|---|---|
| Vercel Pro + compute | $22.45 |
| Supabase | $10.72 |
| Twilio | $4.00 |
| IA Anthropic | $2.87 |
| Upstash | $0.20 |
| **TOTAL** | **~$40.24/mes** |
| **Por tenant** | **~$10.06** |

### Escenario 50 tenants (mayoría Starter $89)

| Servicio | Costo |
|---|---|
| Vercel | ~$80 |
| Supabase Pro | ~$50 |
| Twilio | ~$100 |
| IA Anthropic (capped) | ~$250 |
| Upstash | ~$10 |
| Sentry Team | ~$26 |
| **TOTAL** | **~$516/mes** |
| **MRR mínimo** (50 × $89) | **$4,450** |
| **Margen** | **~88%** |

### Escenario 200 tenants

| Servicio | Costo |
|---|---|
| Vercel multi-region | ~$200 |
| Supabase + replicas | ~$200 |
| Twilio | ~$1,000 |
| IA (capped) | ~$1,500 |
| Upstash | ~$80 |
| Sentry Business | ~$80 |
| PostHog Scale | ~$200 |
| **TOTAL** | **~$3,260/mes** |
| **MRR** ($130 avg) | **$26,000** |
| **Margen** | **~87%** |

## 5. Top 10 Quick Wins ahorro

| # | Acción | Ahorro est | Esfuerzo |
|---|---|---|---|
| 1 | Groq fallback primario WA intent | $0.68→$50/mes a 50 | Bajo |
| 2 | Cache intent classifier (hash mensaje, TTL 1h) | -30% costo WA AI | Medio |
| 3 | Keyword shortcircuit antes de LLM | -20% llamadas WA | Bajo |
| 4 | maxOutputTokens=150 en intent | -50% output | Bajo |
| 5 | WHATSAPP_AI_FIRST off en free, on en pro+ | Protege budget $0.50 | Medio |
| 6 | Upstash tier free (4 tenants no llega a 300k cmds) | $0-$29 | Bajo |
| 7 | Speed Insights tier check | Variable | Bajo |
| 8 | Sentry tracesSampleRate 0.1 prod | Previene $26+ | Bajo |
| 9 | BullMQ workers on-demand vs perpetuo | $5-15 Vercel | Medio |
| 10 | Consolidar tenants en 1 DB Supabase | $25-100 si multi-instancia | Alto |

## 6. Eficiencia modelo por feature

| Feature | Modelo actual | Modelo óptimo | Estado |
|---|---|---|---|
| Chat publico | Haiku 4.5 | Haiku 4.5 | ✅ |
| WA intent | Haiku 4.5 | Haiku 4.5 o Groq | ✅ (Groq sería $0) |
| WA concierge | Haiku 4.5 | Haiku 4.5 | ✅ |
| Smart recommendations | Sonnet 4.6 | Sonnet 4.6 | ✅ |
| Opus en prod | NO | NO | ✅ Correcto |

**Arquitectura FinOps sana**: Haiku en alto volumen, Sonnet en features inteligentes, Opus nunca en prod. `aiCostGuard` con Upstash Redis es la pieza correcta.
