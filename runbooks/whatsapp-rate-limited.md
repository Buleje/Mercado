# Runbook: WhatsApp Rate Limited

## Detección
- **Patrón Sentry:** `TwilioRestException` AND `429 Too Many Requests`
- **Severidad:** P2 — Notificaciones degradadas, cobranza fiados afectada
- **SLO afectado:** `whatsapp_delivery` (target 98%)
- **MTTR objetivo:** <1 hora

## Diagnóstico
```bash
# 1. Verificar rate limit status de Twilio
# Revisar Twilio console: https://console.twilio.com/

# 2. Contar mensajes enviados últimas 24h
# Via MCP Bodega: count de NotificationLog WHERE channel='whatsapp' AND createdAt > now()-24h

# 3. Verificar si es por tenant específico (spam)
# SELECT "tenantId", COUNT(*) FROM "NotificationLog" WHERE "createdAt" > NOW()-'1 hour' GROUP BY "tenantId" ORDER BY 2 DESC LIMIT 5

# 4. Verificar cola de mensajes pendientes
vercel logs --output json --limit 20 | grep -i "twilio\|whatsapp\|429"
```

## Mitigación inmediata
```bash
# 1. Apagar notificaciones WhatsApp temporalmente
# /flag whatsapp_notifications off

# 2. Los mensajes se guardan en DB (fallback del MCP) para reenviar después

# 3. Esperar reset del rate limit (generalmente 1 hora)

# 4. Verificar que no hay loop de reenvíos
```

## Resolución
1. Si es volumen legítimo → upgrade plan Twilio
2. Si es spam/loop → identificar tenant y bloquear
3. Implementar backoff exponencial en reenvíos
4. Procesar cola de mensajes pendientes con throttling

## Prevención
- Rate limit interno por tenant (100 msg/día)
- Queue con backoff exponencial para reenvíos
- Alerta cuando se acerca al 80% del límite diario

## Owner
- **Principal:** integration-specialist
- **Fallback:** sre-observability
- **Escalación:** Brandon (WhatsApp... por otro canal)
