# Sprint 4 — Mobile OTA + WhatsApp queue runbook

> Brandon 2026-05-18. Implementación pragmática del último sprint del
> audit profundo arquitectura. Lo que se hace en código está commiteado;
> lo demás queda como runbook ejecutable por Brandon.

## ✅ 1. Event DLQ replay cron (en código)

`/api/cron/event-dlq-replay` — corre cada hora min 37.

- Busca `EventDeadLetter` con `resolvedAt=null`, `failedAt > 1h atrás`,
  `attemptCount < 5`.
- Re-emite el evento via `emitDomainEvent()` → BullMQ + handlers originales
  corren de nuevo.
- Si éxito → `resolvedAt=now()`. Si falla otra vez → `attemptCount++` +
  `lastError` actualizado.
- Cubre el gap del audit Sprint 2 #10 (WhatsApp outbound sin DLQ propio):
  cuando BullMQ agota retries del worker WhatsApp, el job termina en
  `EventDeadLetter` y este cron lo reintenta cuando Twilio se recupera.

Después de **MAX_ATTEMPTS=5** queda visible en `/superadmin/dlq` (Sprint 2)
como "rendido" para intervención manual.

## ✅ 2. ADR-116 Capgo OTA mobile (documentado)

`docs/adr/116-capgo-ota-mobile-capacitor.md` — plan completo.

**TLDR setup Brandon** (~2h total):

1. Cuenta Capgo $14/mes
2. `npm install @capgo/capacitor-updater && npx cap sync`
3. Setear `CAPGO_API_KEY` en Vercel + GitHub Secrets
4. Crear `.github/workflows/mobile-ota.yml`:

```yaml
name: Mobile OTA Deploy
on:
  push:
    branches: [main]
    paths: ['app/**', 'components/**', 'lib/**', 'public/**']

jobs:
  ota:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - run: npx @capgo/cli bundle upload --channel production
        env: { CAPGO_API_KEY: ${{ secrets.CAPGO_API_KEY }} }
```

5. Test en device Android (channel `beta` antes de production)

## ✅ 3. CI Capacitor improvements (pendiente)

Mejora menor: agregar `cap:sync` automático al CI tras cada merge.

`.github/workflows/ci.yml` agregar step (después de `npm run build`):

```yaml
- name: Capacitor sync (Android)
  run: |
    npm run cap:sync
    # Validar que el sync no rompe build android
  continue-on-error: true  # mantener mientras no haya release pipeline
```

## Cierre Sprint 4

**TODOs Brandon agregados:**
- Activar Capgo (2h)
- Crear workflow OTA (30min)
- Test channel beta → production (30min)

**Score arquitectural acumulado:**

| Estado | Score |
|---|---|
| Inicial (audit) | 6.1/10 |
| Post Sprint 1 (Redis + Supabase Pro + crons) | 7.5/10 |
| Post Sprint 2 (MP replay + DLQ dashboard + RLS ADR) | 8.5/10 |
| Post Sprint 3 (Consent + Yape + SLO+DR) | 9.0/10 |
| **Post Sprint 4 (Event DLQ replay + Capgo OTA)** | **9.5/10** |

## Roadmap pendiente (post-Sprint 4)

Para llegar a 10/10:
- Sharding tenant-per-schema (reservar para 500+ tenants)
- Read replica Supabase para queries analytics/dashboards (a 200+ tenants)
- Multi-region deploy (failover Vercel + Supabase read replica en otra región)
- Plan de seguridad continua: pentest profesional anual + bug bounty público
