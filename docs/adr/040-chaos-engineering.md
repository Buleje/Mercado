# ADR-040 — Chaos Engineering como Práctica Continua

**Status:** 🟢 Accepted
**Fecha:** 2026-04-10
**Autor:** Brandon (Buleje) + Claude Code
**Relacionado con:** ADR-037 (runbooks), ADR-034 (SLOs)

---

## 1. Contexto

Bugs encontrados a las 4 AM en staging son infinitamente mejores que bugs encontrados a las 3 PM en producción con 100 bodegas pagando. Sin chaos engineering, los problemas de resiliencia solo se descubren en incidentes reales.

## 2. Decisión

Chaos engineering nocturno con Toxiproxy en staging:
- 7 experimentos rotativos (uno por noche)
- Lunes: Redis lento, Martes: Twilio down, Miércoles: DB pool 50%, Jueves: Stripe delay, Viernes: SUNAT timeout, Sábado: Sentry down, Domingo: baseline
- Evals corren durante chaos para medir degradación
- Si algo se rompe inesperadamente → issue automático + sugerir runbook

### Infraestructura
- `chaos/docker-compose.chaos.yml` con Toxiproxy
- `.github/workflows/chaos-monkey.yml` con cron diario
- Skill `/chaos [experiment]` para ejecución manual

### Seguridad ABSOLUTA
- SOLO staging, NUNCA producción
- Validación dura por env var + GitHub environment
- Cada experimento tiene duración limitada + auto-cleanup

## 3. Consecuencias

✅ Descubrir problemas de resiliencia antes que los clientes
✅ Conectado a runbooks: si chaos rompe algo → existe/se crea runbook
✅ Baseline semanal para comparar degradación
⚠️ Requiere staging environment configurado
⚠️ Toxiproxy necesita Docker
⚠️ Costo: ~$0 (staging en Vercel preview, Toxiproxy es open source)
