# Runbook: SUNAT API Failing

## Detección
- **Patrón Sentry:** `Error` in `lib/sunat` OR `app/api/*/boleta` with status 5xx
- **Severidad:** P1 — Boletas no se generan, riesgo de incumplimiento fiscal
- **SLO afectado:** `boleta_sunat_success` (target 99.9%)
- **MTTR objetivo:** <30 minutos

## Diagnóstico
```bash
# 1. Verificar si SUNAT API responde
curl -s -w "%{http_code} %{time_total}s" https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService 2>/dev/null || echo "SUNAT no responde"

# 2. Verificar último boleta generada
# Via MCP Bodega: get_ventas_hoy para ver si hay boletas recientes

# 3. Verificar credenciales SUNAT
# grep -r "SUNAT" .env.example (verificar que vars están configuradas)

# 4. Logs de errores SUNAT
vercel logs --output json --limit 30 | grep -i "sunat\|boleta\|factura"
```

## Mitigación inmediata
```bash
# 1. Activar modo offline de boletas (guardar en cola, generar después)
# /flag sunat_enabled off

# 2. Las ventas siguen funcionando, solo no generan boleta en tiempo real
# Las boletas se generarán en batch cuando SUNAT vuelva

# 3. Notificar a Brandon
# Via MCP: enviar_whatsapp con template "alerta_sunat"
```

## Resolución
1. Si es caída de SUNAT → esperar + reintentar en batch
2. Si es credenciales → renovar certificado digital
3. Si es formato → revisar XML contra spec UBL 2.1
4. Procesar cola de boletas pendientes cuando API vuelva

## Prevención
- Eval harness SUNAT (5 evals) valida formato antes de enviar
- Cola de boletas pendientes para resiliencia
- Monitoreo de expiración de certificado digital

## Owner
- **Principal:** integration-specialist
- **Fallback:** backend-platform-engineer
- **Escalación:** Brandon (WhatsApp) + contador
