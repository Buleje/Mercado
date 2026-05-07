# Sentry Alerts — Buleje (Sprint 1 OPS)

> **Para Brandon (dueño / on-call):** este documento te dice (a) qué eventos
> disparan alerta automática, (b) cómo conectarlas a tu WhatsApp / email para
> recibir el ping en el celular, y (c) cómo probar que funcionen sin tener que
> romper producción.

Última actualización: 2026-05-06 · Sprint OPS-1

---

## 1. Cómo se reportan los eventos (lado código)

Toda alerta crítica debe usar uno de los helpers de `lib/critical-alerts.ts`.
Eso garantiza que los **tags** estén en orden y las reglas del dashboard
puedan filtrar correctamente.

| Helper | Cuándo usarlo | Severidad / Ruta |
|---|---|---|
| `alertHighSeverity(ctx, err)` | Cualquier error grave sin helper específico | P0 |
| `alertCrossTenantLeak(a, b, ctx)` | Una query devolvió datos de otro tenant | **P0 — máxima** |
| `alertPaymentFailure(ctx, err)` | Yape / Stripe / MP / efectivo falló | P0 |
| `alertPaymentProofUploadFailure(ctx, err)` | Comprobante Yape no se subió | P0 |
| `alertSchemaDrift(missingCols, ctx)` | Columna esperada no existe en BD | P0 |
| `alertInvalidOrderTransition(ctx)` | State-machine de pedidos violada | P1 |
| `alertEndpointDown(ep, status, ctx)` | Endpoint devolviendo 5xx | P1 |

### Tags estandarizados

| Tag | Valores | Para qué |
|---|---|---|
| `severity` | `critical`, `high`, `warning` | Nivel general |
| `alert_route` | `p0`, `p1`, `p2` | Routing a destinos diferentes |
| `domain` | `payments`, `orders`, `auth`, `db-drift`, `delivery`, `infra` | Filtrar por dominio |
| `cross_tenant` | `true` | Solo en leaks |
| `tenant_id` | slug del tenant | Filtrar incidentes por tenant |
| `module` | nombre del módulo | Para diagnóstico |

### Severidades

| Nivel | Tiempo de respuesta | Canal recomendado |
|---|---|---|
| **P0** | Notificación inmediata | WhatsApp + Email + Push |
| **P1** | Dentro de 30 min | Email + Slack/Discord |
| **P2** | Digest diario | Solo email (resumen) |

---

## 2. Variables de entorno necesarias

```bash
# Ya configuradas en prod (si no, agregarlas):
SENTRY_DSN=https://xxx@oNNNNNN.ingest.sentry.io/PPPPPP
NEXT_PUBLIC_SENTRY_DSN=$SENTRY_DSN          # mismo valor (lado cliente)

# Solo para CI (subir source maps + crear releases):
SENTRY_AUTH_TOKEN=sntrys_...
SENTRY_ORG=buleje
SENTRY_PROJECT=buleje-web
```

`SENTRY_AUTH_TOKEN` se saca de **Sentry → Settings → Account → API → Auth Tokens**
con el scope `project:releases`.

---

## 3. Acciones manuales que debe hacer Brandon en Sentry dashboard

Sentry **no** permite crear reglas de notificación 100% por código. Estos pasos
son one-time:

### Paso 1 — Conectar tu celular y email (perfil personal)

1. Entra a `https://sentry.io/settings/account/notifications/`.
2. En **Email Routing**: confirma tu email principal.
3. En **Personal Notifications**: marca **Issue Alerts** → "Always".

### Paso 2 — Conectar WhatsApp (vía integración)

> Sentry no tiene WhatsApp nativo. Dos opciones:
>
> - **Opción A (rápido):** usa **Twilio SMS** (ya tienes Twilio configurado para
>   WhatsApp). En el panel: **Settings → Integrations → Twilio** → conecta tu
>   número. Esto te da SMS, no WhatsApp directo, pero llega al mismo celular.
> - **Opción B (correcta):** crea un webhook en `app/api/webhooks/sentry/route.ts`
>   que reciba el payload de Sentry y dispare un WhatsApp via Twilio. Pendiente
>   para Sprint 2.

### Paso 3 — Crear las 4 reglas críticas (3-5 clicks cada una)

Ve a `https://sentry.io/settings/projects/buleje-web/alerts/rules/` → **Create Alert Rule** → **Issue Alert**.

#### Regla A — "P0 inmediato"
- **When**: `An issue is first seen` OR `event.tags.alert_route equals p0`
- **If**: `severity equals critical`
- **Then**: Send notification to **Email (Brandon) + Twilio SMS (+51 9xx xxx xxx)**
- **Frequency**: Send a notification at most once every `1 minute`

#### Regla B — "Cross-tenant leak (máxima prioridad)"
- **When**: An event is seen
- **If**: `event.tags.cross_tenant equals true`
- **Then**: Notify Email + SMS **+ tag issue with "P0-IMMEDIATE"**
- **Frequency**: every event, no rate-limit

#### Regla C — "Payment failure (cualquier método)"
- **When**: An event is seen
- **If**: `event.tags.domain equals payments`
- **Then**: Email + SMS
- **Frequency**: every `5 minutes` máximo

#### Regla D — "5xx spike (>3 en 5 min)"
- **When**: The issue is seen `more than 3 times in 5 minutes`
- **If**: `level equals error`
- **Then**: Email
- **Frequency**: every `15 minutes`

### Paso 4 — Activar **Metric Alerts** (opcionales pero útiles)

Sentry → Alerts → **Create Alert** → **Metric Alert**:

1. **Error rate alto**: `events(level:error) / count() > 0.01` over 1h → Email.
2. **Latencia p95 lenta**: `p95(transaction.duration) > 500ms` over 5m → Email.
3. **Failure rate**: `failure_rate() > 0.05` over 10m → Email + SMS.

(Estas son las que `setupAlertRules()` en `lib/sentry-alerts.ts` recomienda.)

---

## 4. Probar que funcione (sin romper prod)

### Prueba A — health-probe contra staging
```bash
BASE_URL=https://staging.buleje.pe npm run health:check
```
Si todo está bien → exit 0. Si algo falla → exit 1 + Sentry recibe evento con tag
`alert_route:p1`.

### Prueba B — disparar evento P0 a propósito
```bash
# Desde un endpoint admin protegido o un script local con SENTRY_DSN seteado:
node -e '
  process.env.NODE_ENV = "production";
  const { alertHighSeverity } = require("./lib/critical-alerts.ts");
  alertHighSeverity(
    { module: "manual-test", description: "smoke test alert P0" },
    new Error("Test alert from Brandon"),
  );
'
```
Brandon debe recibir email + SMS dentro de 1 minuto. Si no llega → revisar
Paso 1 y Paso 3 arriba.

### Prueba C — endpoint 5xx forzado
```bash
# Si tienes una ruta /api/_debug/throw protegida, hazle hit:
curl -X POST https://buleje.pe/api/_debug/throw -H "x-debug-token: $TOKEN"
```

### Prueba D — health probe local
```bash
BASE_URL=http://localhost:3000 npm run health:check
```

---

## 5. Cron de Vercel para `health:check`

Crea (o agrega a) `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/health-probe", "schedule": "*/2 * * * *" }
  ]
}
```

Y en `app/api/cron/health-probe/route.ts` (TODO Sprint 2):
- Verifica `Authorization: Bearer ${CRON_SECRET}`.
- Ejecuta la lógica de `scripts/check-prod-health.mjs` inline.
- Reporta a Sentry si algo falla.

Mientras tanto, Brandon puede correr `npm run health:check` localmente desde
cualquier máquina que tenga `SENTRY_DSN` apuntando al proyecto de prod, y eso
ya dispara alertas reales.

---

## 6. Lista de chequeo final para Brandon (10 min)

- [ ] Confirmé email en `https://sentry.io/settings/account/notifications/`.
- [ ] Conecté Twilio SMS o configuré opción B.
- [ ] Creé las 4 reglas (A, B, C, D) en el dashboard.
- [ ] Probé `npm run health:check` y vi exit 0.
- [ ] Disparé un evento P0 manual y recibí el ping.
- [ ] Configuré `vercel.json` con el cron `*/2 * * * *` (post Sprint 2).

---

## 7. Cómo se conecta esto al código existente

- `lib/sentry-alerts.ts` — base layer (`reportCriticalError`, `reportPerformanceAnomaly`).
- `lib/critical-alerts.ts` — **nuevo, este sprint.** Helpers por dominio.
- `lib/logger.ts` — `logger.error()` ya forwarda a Sentry en prod (línea 69-80).
  Eso significa que cualquier `logger.error` con keyword `cross-tenant` también
  llegará al dashboard, pero **sin el tag `cross_tenant:true`** — por eso para
  leaks reales usa `alertCrossTenantLeak()`.
- `app/api/health/route.ts` — ya reporta a Sentry cuando la BD falla 3x/min.

---

## 8. Próximos pasos (Sprint 2)

1. `app/api/cron/health-probe/route.ts` — endpoint que ejecuta el script inline.
2. `app/api/webhooks/sentry/route.ts` — webhook → WhatsApp via Twilio.
3. Migrar `logger.error` con keyword `cross-tenant` a `alertCrossTenantLeak()` en
   los call-sites existentes (auditoría pendiente).
4. Dashboard de SLOs en `/admin/observability`.
