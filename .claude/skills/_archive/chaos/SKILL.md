---
name: chaos
description: |
  Ejecuta chaos experiments manualmente en staging. Simula fallos de
  servicios externos para verificar resiliencia. NUNCA en producción.
  Usar cuando Brandon diga "chaos", "simula fallo", "qué pasa si
  Redis se cae", "test de resiliencia".
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "[redis-slow|twilio-down|db-pool-50|stripe-delay|sunat-timeout|baseline]"
model: sonnet
---

# Chaos — Experiments de resiliencia en staging

## REGLA ABSOLUTA: Solo staging. NUNCA producción.

Verificación obligatoria antes de cada experimento:
```bash
echo $NODE_ENV  # DEBE ser "staging" o "test"
echo $STAGING_URL  # DEBE existir y NO ser la URL de producción
```

## Experimentos disponibles

| Día | Experimento | Qué simula | Esperado |
|-----|------------|------------|----------|
| Lun | redis-slow | +500ms latencia Redis | Cache fallback a DB |
| Mar | twilio-down | Twilio inalcanzable 5 min | WhatsApp falla silencioso |
| Mié | db-pool-50 | Pool al 50% capacidad | Más lento, sin errores |
| Jue | stripe-delay | Webhook 30s delay | Confirmación retrasada |
| Vie | sunat-timeout | SUNAT API timeout | Boletas en cola |
| Sáb | observability-blind | Sentry down | App funciona sin reportar |
| Dom | baseline | Sin inyección | Métricas normales |

## Algoritmo

```
1. Verificar que estamos en staging (NUNCA prod)
2. Capturar métricas baseline (health, latencia, evals)
3. Inyectar fallo (via Toxiproxy si disponible, o simulación)
4. Monitorear durante ventana del experimento
5. Correr evals durante chaos
6. Remover inyección
7. Capturar métricas post-chaos
8. Comparar: baseline vs chaos vs post-chaos
9. Reportar: ¿el sistema degradó gracefully?
10. Si algo se rompió inesperadamente → crear issue + sugerir runbook
```

## Reglas

1. **NUNCA en producción.** Validación dura por env var.
2. **Siempre capturar baseline** antes de inyectar.
3. **Siempre limpiar** después del experimento.
4. **Conectar con runbooks** — si chaos rompe algo, debe existir runbook.
