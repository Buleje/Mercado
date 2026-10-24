---
name: flag
description: |
  Controla feature flags en tiempo real. Permite encender/apagar features
  sin redeploy, por tenant, por porcentaje, o globalmente.
  Usar cuando Brandon diga "apaga fiado", "desactiva WhatsApp",
  "flag", "kill switch", "activa checkout v2".
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit
argument-hint: "[flag_name] [on|off|status|list] [--tenant=X]"
model: haiku
---

# Flag — Control de feature flags en tiempo real

## Subcomandos

### `/flag list`
Lista todas las flags con su estado actual y fuente (PostHog/env/default).

### `/flag [name] status`
Muestra estado detallado de una flag específica.

### `/flag [name] on`
Activa la flag. Si PostHog está configurado → API call. Si no → set env var.

### `/flag [name] off`
Desactiva la flag. Audit log automático.

### `/flag [name] percentage [N]`
Activa para N% de los usuarios/tenants (requiere PostHog).

### `/flag [name] tenant [tenantId] [on|off]`
Activa/desactiva solo para un tenant específico.

## Flags conocidas

| Flag | Default | Impacto |
|------|---------|---------|
| `fiado_enabled` | on | Apaga fiado por tenant si hay fraude |
| `sunat_enabled` | on | Apaga si SUNAT API caída |
| `whatsapp_notifications` | on | Kill switch Twilio rate limit |
| `checkout_v2` | off | Canary del nuevo checkout |
| `mcp_bodega_writes` | on | Kill switch MCP propio |
| `marketplace_enabled` | on | Apaga marketplace |
| `loyalty_enabled` | on | Apaga loyalty |
| `multi_payment_split` | off | Habilita split payments |
| `maintenance_mode` | off | Modo mantenimiento global |
| `canary_active` | off | Indicador de canary en curso |
| `chaos_enabled` | off | Habilita chaos experiments |

## Reglas

1. **Cambios en flags P0** (maintenance_mode, fiado_enabled) requieren log WhatsApp.
2. **Audit log obligatorio** para cada cambio.
3. **Modelo Haiku** — no gastar tokens en flip de flags.
