# ADR 058 — WhatsApp Webhook AI-First Routing

**Estado:** Aceptado
**Fecha:** 2026-04-16
**Autor:** Claude (orquestador) — sesión `/luis` Sprint 2 wave final
**Sprint:** 2 (AI + WhatsApp + Growth)
**Tier S item:** #6 — activación en producción del AI Concierge entregado en ADR-046
**Cierra:** ADR-046 (engine implementado pero desconectado del webhook que Meta conoce)

---

## Contexto

ADR-043 entregó el clasificador AI (`lib/whatsapp/ai-intent.ts`).
ADR-046 entregó el Concierge engine completo (`lib/whatsapp/concierge/*` con 13 archivos, state machine, 7 handlers, 30+ tests).

Sin embargo, en producción Meta solo conoce un webhook — el que se configuró originalmente en `WHATSAPP_VERIFY_TOKEN`: `app/api/whatsapp/webhook/route.ts`. Ese endpoint sigue llamando al motor keyword-based legacy (`processMessage` de `conversation-engine.ts`), por lo que el Concierge AI **nunca se ejecutaba en producción** aunque estuviera implementado y testeado.

| Endpoint | Llama a | Estado en Meta | Resultado |
|---|---|---|---|
| `/api/whatsapp/webhook` | `processMessage` (keyword) | ✅ Conectado a Meta | Procesa todo el tráfico real |
| `/api/whatsapp/concierge` | `handleIncomingMessage` (AI) | ❌ Desconocido por Meta | Cero tráfico real |

El gap: el item #6 del Tier S del Sprint 2 ("WhatsApp AI Concierge buyers — doblar GMV teórico") estaba 100% codificado pero 0% activado en producción.

## Decisión

Implementar **AI-first routing dentro del webhook existente** que Meta ya conoce. El handler de mensajes entrantes:

1. Llama primero a `handleIncomingMessage` (Concierge AI — ADR-046).
2. Si el flag `WHATSAPP_AI_FIRST=false` está activo, salta el AI directamente al legacy (kill-switch operacional).
3. Si el AI lanza una excepción inesperada (no debería — captura todo internamente), cae al motor keyword legacy.
4. Si el legacy también falla, responde un mensaje genérico de error.

```
mensaje entrante
  ├─ flag ON (default)
  │    ├─ Concierge AI exitoso → reply Concierge
  │    └─ Concierge AI crashea → fallback al engine legacy
  │           ├─ Legacy exitoso → reply legacy
  │           └─ Legacy crashea → reply error genérico
  └─ flag OFF → engine legacy directo (mismo flujo de error)
```

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `app/api/whatsapp/webhook/route.ts` | Agregado import del Concierge + helper `isAiFirstEnabled()` + reescrito `handleIncomingMessage` interno con bifurcación AI-first → legacy |
| `__tests__/whatsapp-webhook-ai-first.test.ts` | 6 casos: AI primero por defecto, AI éxito, AI crash → legacy, flag OFF → legacy directo, ambos crashean → error genérico, sendReply fallido se loguea |
| `docs/adr/058-whatsapp-webhook-ai-first.md` | Este ADR |

### Variables de entorno

| Variable | Default | Comportamiento |
|---|---|---|
| `WHATSAPP_AI_FIRST` | (no set) → `true` | AI Concierge primero, fallback legacy si crashea |
| `WHATSAPP_AI_FIRST=false` | — | Bypass total del AI: ruteo directo al engine keyword legacy |
| `WHATSAPP_AI_FIRST=0` | — | Equivalente a `false` |

### Why no es una migración destructiva

- **Cero modificación a `conversation-engine.ts`** — el motor legacy queda intacto como fallback.
- **Cero modificación a `lib/whatsapp/concierge/*`** — el Concierge ya tiene su contrato testeado.
- **Cero modificación a Meta config** — el endpoint y verify token siguen iguales.
- **Kill-switch instantáneo** vía variable de entorno sin redeploy de código (Vercel env update + restart).
- **Mismo `sendReply()`** para ambos caminos — no se duplica ni se cambia el formato del payload Meta.

### Diferencia vs `/api/whatsapp/concierge`

El endpoint `/api/whatsapp/concierge/route.ts` queda como **endpoint paralelo de pruebas** — útil para que el equipo configure un segundo número WhatsApp 100% AI sin tocar el flujo principal. No se elimina por now (se evalúa deprecación post-30 días).

## Consecuencias

### Positivas

- **Activa #6 Tier S del Sprint 2** — el AI Concierge empieza a procesar tráfico real.
- **Riesgo mínimo** — fallback automático al legacy si algo crashea.
- **Observabilidad inmediata** — logs etiquetan cada respuesta con `path: ai-concierge | legacy-keyword` para A/B retroactivo.
- **Reversible en segundos** — `WHATSAPP_AI_FIRST=false` + restart vuelve al comportamiento previo.
- **Costo controlado** — el classifier AI usa Vercel AI Gateway con cost cap (ADR-016 Tier S #7).

### Negativas / Riesgos

- **Latencia incremental** — el AI agrega ~200-500ms al pipeline (call al gateway). Mitigación: el webhook responde HTTP 200 inmediatamente; el AI corre en `processWebhookPayload` fire-and-forget.
- **Costo por mensaje** — cada mensaje genera 1 call al AI Gateway (~$0.0001/clasificación). Mitigación: el classifier de ADR-043 ya tiene cache + cost cap configurado.
- **Posibles regresiones de UX** — el AI puede malinterpretar intents que el keyword reconocía bien. Mitigación: el clasificador devuelve `confidence < 0.6` → fallback al welcome menu, no al engine legacy directo (test de integración existente lo cubre).

### Métricas a observar (primera semana post-deploy)

| Métrica | Cómo medir | Alerta si |
|---|---|---|
| % mensajes vía AI vs legacy | Grep en logs `path: ai-concierge` | < 95% AI sin razón clara |
| Latencia p95 webhook | Vercel metrics | > 4.5s (límite Meta = 5s) |
| Tasa de escalada a humano | `escalated=true` en logs | > 15% (engine no entiende) |
| Costo AI Gateway | Dashboard Vercel | > $5/día con < 1k tenants |
| Quejas de usuarios | WhatsApp inbox staff | > 3/día sobre respuestas raras |

## Alternativas consideradas

### A) Cambiar la URL del webhook en Meta a `/api/whatsapp/concierge`

Descartada porque:
- Requiere acceso a Meta Business Manager (Brandon depende de soporte Meta para cambios).
- Si el AI falla, no hay fallback automático — el usuario queda sin respuesta.
- Pierde el `processMessage` legacy como red de seguridad.

### B) Migrar 100% al Concierge y borrar `conversation-engine.ts`

Descartada porque:
- Sin red de seguridad por 30 días post-deploy.
- Tests legacy seguirían rotos (6 fallos no críticos detectados en sesión anterior).
- ADR-046 explícitamente dice "no tocar conversation-engine.ts".

### C) Routing por % (canary 5/25/50/100)

Descartada para ahora porque:
- Sobre-ingeniería para un único webhook con tráfico bajo (1 tenant en producción).
- El kill-switch binary cubre el caso de regresión catastrófica.
- Re-evaluar cuando haya >10 tenants activos.

## Referencias

- [ADR-043 — WhatsApp AI Intent Classifier](./043-whatsapp-ai-intent-classifier.md)
- [ADR-046 — WhatsApp AI Concierge Conversation Engine](./046-whatsapp-concierge-engine.md)
- [Roadmap 24 Weeks — Sprint 2](../ROADMAP-24-WEEKS.md)
- Tests de regresión: `__tests__/whatsapp-concierge-router.test.ts`, `__tests__/whatsapp-concierge-integration.test.ts`, `__tests__/whatsapp-webhook-ai-first.test.ts` (nuevo)
- CLAUDE.md regla #7 — fire-and-forget en tareas no-críticas
- CLAUDE.md zona peligrosa: `proxy.ts`, `lib/middleware/**` (no aplica — esta ruta no es middleware)
