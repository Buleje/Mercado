# Sentry Alert Rules — Config dashboard (round 28+)

> **Para Brandon:** este doc completa `docs/SENTRY_ALERTS.md` con tres reglas
> que faltaban (cron stale, error rate spike, latencia p99). No requiere
> tocar código — todo se mete en `https://sentry.io/settings/projects/buleje-web/alerts/rules/`.

Última actualización: 2026-05-09 · Sprint AI/DevOps round 28+
Audiencia: solo Brandon (no requiere on-call adicional aún).

---

## Resumen rápido

| ID | Nombre | Tipo Sentry | Prioridad | Notificación |
|---|---|---|---|---|
| **E** | Cron stale (>24h sin éxito) | Issue Alert + tag custom | P1 | Email + SMS |
| **F** | Error rate spike (>1% en 5 min) | Metric Alert | P0 | Email + SMS |
| **G** | Latency p99 sustained (>2s × 10 min) | Metric Alert | P1 | Email |
| **H** | AI cost daily exceed (>$2/tenant) | Metric Alert custom | P2 | Email digest |
| **I** | AI stream finished con finishReason=error | Issue Alert | P2 | Email |

Las reglas A, B, C, D ya están documentadas en `docs/SENTRY_ALERTS.md` — no se duplican aquí.

---

## Regla E — Cron stale

**Problema:** un cron silencioso es peor que un error ruidoso. Si `daily-insights`
o `health-tracker` no completa en 24h, el dashboard se queda con datos viejos sin
que nadie se entere.

**Sentry NO tiene "no-event" alerts nativos**, pero podemos invertir: emitimos
un breadcrumb por cada éxito y vigilamos su ausencia con un Metric Alert.

### Setup

1. **En código** (ya existe en `lib/cron/health-tracker.ts`): asegurarse de
   que cada cron emita `Sentry.addBreadcrumb({ category: "cron.success", message: "<job>" })`.
   Si no está, agregarlo en el último paso del job.

2. **Sentry → Alerts → Create Alert → Metric Alert**:
   - Dataset: **Errors** (no Performance)
   - Filter: `tags[cron_job]:* AND tags[cron_status]:success`
   - Aggregation: `count()`
   - Trigger: `< 1` over `1440 minutes` (24h)
   - Actions: email Brandon + SMS Twilio
   - Frequency: max 1 notif cada 6h

### HogQL alternativo (si Brandon migra a PostHog en el futuro)
```sql
SELECT cron_job, max(timestamp) AS last_success
FROM events
WHERE event = 'cron_completed'
GROUP BY cron_job
HAVING dateDiff('hour', last_success, now()) > 24
```

---

## Regla F — Error rate spike (>1% en 5 min)

**Reemplaza la regla A "High Error Rate" actual** (que mide en 1h, demasiado lento).

### Setup

1. **Sentry → Alerts → Create Alert → Metric Alert**
2. **Dataset:** `Transactions`
3. **Metric:** `failure_rate()` (built-in, ratio de transacciones con `transaction.status != "ok"`)
4. **Trigger condition:**
   - Critical: `failure_rate() > 0.01` over `5 minutes` window
   - Warning: `failure_rate() > 0.005` over `5 minutes` window
5. **Filters opcionales:**
   - Excluir endpoints conocidamente ruidosos: `transaction:!/api/health`
   - Solo prod: `environment:production`
6. **Actions:**
   - Critical → Email Brandon + Twilio SMS
   - Warning → Email solo
7. **Frequency:** max 1 notif cada 10 min para evitar paging storms.

### Por qué 5 min (no 1h)

Una falla de DB/Stripe/Twilio degrada UX en segundos. Esperar 60 min de muestra
significa que el incidente lleva 60 min antes de que despierte a alguien.
5 min es la ventana mínima razonable con suficiente señal/ruido.

---

## Regla G — Latency p99 sustained (>2s × 10 min)

**Por qué p99 (no p95):** p95 oculta los peores casos (el 5% restante puede ser
20s+). Para un POS donde la cajera espera frente al cliente, los outliers SON
el problema. P99 captura el "peor 1 de 100".

### Setup

1. **Sentry → Alerts → Create Alert → Metric Alert**
2. **Dataset:** `Transactions`
3. **Metric:** `p99(transaction.duration)`
4. **Trigger:**
   - Warning: `p99 > 2000` (ms) sostenido `10 minutes`
   - Critical: `p99 > 5000` (ms) sostenido `5 minutes`
5. **Filters:**
   - `environment:production`
   - Excluir uploads / webhooks lentos legítimos: `transaction:!/api/files/upload AND transaction:!/api/webhooks/*`
6. **Actions:**
   - Warning → Email Brandon
   - Critical → Email + SMS
7. **Frequency:** max 1 notif cada 30 min.

### Comparación con A/B existentes

| Regla | Métrica | Ventana | Threshold |
|---|---|---|---|
| B (existente) | `p95(transaction.duration)` | 5 min | 500ms |
| **G (nueva)** | `p99(transaction.duration)` | 10 min | 2000ms |

Las dos coexisten: B detecta degradación general, G detecta outliers severos.

---

## Regla H — AI cost daily exceed (>$2/tenant)

**Origen:** memoria del proyecto `Costos visibles — Log tokens consumidos. Alert
si tenant > $2/día.`

Sentry no es la mejor herramienta para esto (no es errors), pero podemos
emitirlo como Custom Event hasta que haya un dashboard FinOps dedicado.

### Setup

1. **En código** (helper existe vía `lib/sentry-alerts.ts → reportPerformanceAnomaly`):
   ```ts
   // Pseudo: invocar desde un cron diario que lea Upstash aispend:*
   const dailySpend = await aiCostGuard.getDailySpend(tenantId);
   if (dailySpend > 2.0) {
     reportPerformanceAnomaly("ai_daily_cost_usd", dailySpend, 2.0, {
       tenantId,
       tags: { metric_type: "finops", category: "ai_cost" },
     });
   }
   ```
2. **Sentry → Alerts → Create Alert → Issue Alert**
   - Filter: `tags[category]:ai_cost AND tags[metric_type]:finops`
   - Action: Email digest 1x/día (no SMS, no es urgente operacional)
   - Frequency: 1 notif por tenant por día.

### Pendiente

Crear `app/api/cron/ai-cost-audit/route.ts` que itere tenants activos y
reporte el ratio. Está en backlog del próximo round.

---

## Regla I — AI stream finished con error/length

**Nuevo en round 28+:** ahora `makeStreamUsageHandler` registra `finishReason`
en cada stream. Si es `"error"` o `"length"` (truncado por maxOutputTokens), es
señal de que (a) el provider falló, o (b) la respuesta se cortó y el cliente vio
algo incompleto.

### Setup

1. **En código:** ya implementado — `logger.info("[ai-track] stream finished", { finishReason })`
2. **Sentry → Alerts → Create Alert → Issue Alert**
   - **When:** `An issue is seen` con mensaje conteniendo `[ai-track] stream finished`
   - **If:**
     - `event.tags.finish_reason equals error` → P0
     - `event.tags.finish_reason equals length` → P2 (digest)
   - **Then:** según severidad
   - **Frequency:** max 1 cada 15 min

### Mejora: convertir log a tag

Para que `event.tags.finish_reason` exista, se necesita que `logger.info` con
ese contexto pase como tag a Sentry. Actualmente `logger` no lo hace
automáticamente. Acción para Brandon:

- **Opción A (rápida):** ajustar `lib/logger.ts → forwardToSentry()` para que
  `extra.finishReason` se promueva a `tags.finish_reason` cuando exista.
- **Opción B (correcta):** invocar `Sentry.captureMessage` directo en
  `makeStreamUsageHandler` cuando `finishReason !== "stop"`, con el tag.

Recomendación: B, una sola línea, pegada al fact (sin acoplar logger).

---

## Cómo verificar que todas funcionen

| Regla | Test manual |
|---|---|
| E (cron stale) | Pausar cron 25h en staging → debe llegar email |
| F (error rate) | Simular 50 requests, 1 falla forzada en `/api/_debug/throw` repetida |
| G (latency p99) | Endpoint que duerma 3s 10 veces seguidas |
| H (AI cost) | Setear `aispend:test:2026-05-09` a 250 (centavos = $2.50) y correr el cron audit |
| I (stream error) | Mockear chatModel para lanzar error → verificar finishReason="error" |

---

## Checklist Brandon (15 min)

- [ ] Reglas E, F, G creadas y enlazadas a email + SMS donde corresponde
- [ ] Regla H aplazada hasta que `app/api/cron/ai-cost-audit/route.ts` exista
- [ ] Regla I aplazada hasta migrar `finishReason` a Sentry tag (Opción B arriba)
- [ ] Hacer un dry-run de la regla F con `/api/_debug/throw` y confirmar email recibido
- [ ] Documentar en `MEMORIA-PROYECTO.md` que las 5 reglas están activas

---

## Apéndice — queries Sentry Discover útiles

### Top tenants por error rate (últimas 24h)
```
tags[tenant_id]:* AND event.type:error
| count() by tenant_id
| sort desc
| limit 10
```

### AI tokens consumidos por tenant (necesita el tag de la opción B arriba)
```
message:"[ai-track] stream finished"
| sum(extra[totalTokens]) by tenant_id
| sort desc
```

### Endpoints más lentos (p99)
```
transaction.op:http.server
| p99(transaction.duration) by transaction
| sort desc
| limit 20
```
