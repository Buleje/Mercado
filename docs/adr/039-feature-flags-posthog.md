# ADR-039 — Feature Flags Runtime con PostHog

**Status:** 🟢 Accepted
**Fecha:** 2026-04-10
**Autor:** Brandon (Buleje) + Claude Code
**Relacionado con:** ADR-005 (env var flags), ADR-038 (canary)

---

## 1. Contexto

ADR-005 definió feature flags via env vars. Funciona pero requiere redeploy para cambiar. Para canary efectivo y kill switches instantáneos, necesitamos flags runtime.

## 2. Decisión

Implementar `lib/flags/index.ts` con PostHog como backend principal y env vars como fallback:
- `isEnabled(flag, context)` con cache 30s
- `getVariant(flag, context)` para A/B tests
- Fallback automático a env vars si PostHog caído (defense in depth)
- 12 flags iniciales migradas desde env vars
- Skill `/flag` para flips instantáneos desde Claude

### Flags críticas
fiado_enabled, sunat_enabled, whatsapp_notifications, checkout_v2, mcp_bodega_writes, marketplace_enabled, loyalty_enabled, multi_payment_split, maintenance_mode, checkout_stripe_bypass, canary_active, chaos_enabled.

## 3. Consecuencias

✅ Kill switches en 1 segundo sin redeploy
✅ Canary más granular (por tenant, por %)
✅ Defense in depth: PostHog caído → env vars funcionan
⚠️ Requiere cuenta PostHog (free tier: 1M events/mes)
⚠️ Cache 30s = cambios tardan hasta 30s en propagarse
