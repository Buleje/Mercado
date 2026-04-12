# Configuracion de Alertas en Sentry -- Buleje

Guia paso a paso para configurar las 4 reglas de alerta recomendadas en el dashboard de Sentry.
Estas reglas complementan los helpers programaticos de `lib/sentry-alerts.ts` (`reportCriticalError()`, `reportPerformanceAnomaly()`, `setupAlertRules()`).

## Prerequisitos

- Cuenta en [sentry.io](https://sentry.io) con proyecto configurado
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` configurados en las variables de entorno (`.env.local` y Vercel)
- SDK de Sentry inicializado en las 3 capas: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Integracion de Slack configurada en Sentry (Settings > Integrations > Slack) para recibir notificaciones

## Alert Rule 1: Error Rate > 1%

Detecta cuando la tasa de errores supera el 1% del total de transacciones en una hora.

1. Ir a **Alerts** > **Create Alert Rule** > **Issue Alert**
2. **Condicion:** "Number of events is more than 10 in 1 hour"
3. **Filtro:** `is:unresolved`
4. **Accion:** Enviar email + Slack notification al canal `#alertas-bsm`
5. **Nombre:** `Buleje -- Error Rate Alto`
6. **Frecuencia:** No mas de una alerta cada 60 minutos

### Por que importa

Un spike de errores puede indicar un deploy roto, una dependencia caida (Supabase, MercadoPago, Stripe), o un bug introducido en produccion. 10 eventos en 1 hora es un umbral conservador que evita falsos positivos pero detecta problemas reales.

## Alert Rule 2: P95 Latency > 500ms

Detecta degradacion de rendimiento en las transacciones (API routes, page loads).

1. Ir a **Alerts** > **Create Alert Rule** > **Metric Alert**
2. **Metrica:** `transaction.duration` > **P95**
3. **Threshold:**
   - Warning: > 500ms
   - Critical: > 1000ms
4. **Ventana:** 5 minutos
5. **Nombre:** `Buleje -- Latencia Alta (P95)`
6. **Filtro de transaccion (opcional):** `transaction:/api/*` para enfocarse en API routes

### Por que importa

Latencias altas en API routes afectan directamente la experiencia del usuario en el POS (cajeros) y el storefront (clientes). Un P95 > 500ms sostenido indica problemas de base de datos, N+1 queries, o conexiones agotadas en el pool de Supabase.

## Alert Rule 3: New Unhandled Exception

Detecta excepciones no capturadas que aparecen por primera vez (bugs nuevos).

1. Ir a **Alerts** > **Create Alert Rule** > **Issue Alert**
2. **Condicion:** "A new issue is created"
3. **Filtro:** `handled:no`
4. **Accion:** Notificacion inmediata (email + Slack al canal `#alertas-bsm`)
5. **Nombre:** `Buleje -- Excepcion No Manejada`
6. **Frecuencia:** Cada vez que ocurra (sin limite)

### Por que importa

Una excepcion no manejada nueva generalmente indica un bug recien introducido. La notificacion inmediata permite actuar antes de que afecte a mas usuarios. El filtro `handled:no` evita ruido de errores ya capturados por try/catch.

## Alert Rule 4: Transaction Failure Rate > 5%

Detecta cuando mas del 5% de las transacciones fallan (HTTP 5xx, timeouts).

1. Ir a **Alerts** > **Create Alert Rule** > **Metric Alert**
2. **Metrica:** `transaction.failure_rate`
3. **Threshold:**
   - Warning: > 5%
   - Critical: > 10%
4. **Ventana:** 10 minutos
5. **Nombre:** `Buleje -- Tasa de Fallos Critica`
6. **Filtro de transaccion (opcional):** `transaction:/api/billing/*` para monitorear pagos especificamente

### Por que importa

Una tasa de fallos > 5% en billing routes significa perdida potencial de ingresos. En rutas de checkout y webhooks, cada fallo puede representar un pago no procesado o una suscripcion no activada. Este alert complementa el `reportCriticalError()` que se invoca en los catch blocks de los endpoints de billing.

## Recomendaciones

- **Canal de Slack:** Configurar `#alertas-bsm` como canal dedicado para alertas de Sentry. Separar de los canales de desarrollo general para evitar que las alertas se pierdan en el ruido.
- **Webhook de WhatsApp:** Agregar un webhook de WhatsApp (via la integracion de Sentry o un middleware custom) para alertas criticas (Rule 3 y Rule 4) que necesiten atencion inmediata fuera de horario.
- **Revision semanal:** Revisar alertas cada lunes y ajustar thresholds segun el volumen real de trafico. Los valores iniciales son conservadores y pueden necesitar calibracion.
- **Ownership:** Asignar ownership por modulo en Sentry (Settings > Ownership Rules) para que las alertas de billing vayan al equipo de pagos y las de storefront al equipo de frontend.
- **Mute rules:** Si una alerta conocida genera ruido mientras se trabaja en el fix, usar "Mute" temporal en lugar de eliminar la regla.

## Referencia de codigo

| Archivo | Funcion | Uso |
|---------|---------|-----|
| `lib/sentry-alerts.ts` | `reportCriticalError()` | Reporta errores fatales con contexto (module, tenantId) |
| `lib/sentry-alerts.ts` | `reportPerformanceAnomaly()` | Reporta metricas que exceden umbrales |
| `lib/sentry-alerts.ts` | `setupAlertRules()` | Imprime las reglas recomendadas en consola (dev) |
| `sentry.client.config.ts` | SDK init | Configuracion del SDK en el browser |
| `sentry.server.config.ts` | SDK init | Configuracion del SDK en Node.js |
| `sentry.edge.config.ts` | SDK init | Configuracion del SDK en Edge Runtime |
