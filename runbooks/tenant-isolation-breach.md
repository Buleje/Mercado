# Runbook: Tenant Isolation Breach (P0 MÁXIMO)

## Detección
- **Patrón Sentry:** Query returning data where `tenantId != session.tenantId`
- **Patrón eval:** Multi-tenant eval `02-cross-tenant-block` falla
- **Patrón pentest:** security-pentester detecta IDOR
- **Severidad:** P0 MÁXIMO — Brecha de datos, riesgo legal Ley 29733
- **SLO afectado:** TODOS (confianza = 0 si se confirma)
- **MTTR objetivo:** <5 minutos para mitigación, investigación puede tomar días

## Diagnóstico
```bash
# 1. INMEDIATO: Verificar qué endpoint/query filtró datos
# Revisar Sentry event con stack trace completo

# 2. Verificar si es un false positive (test data, admin cross-tenant legítimo)
# grep -rn "tenantId" en el archivo afectado

# 3. Contar cuántos registros se expusieron
# SELECT COUNT(*) FROM [tabla_afectada] WHERE "tenantId" != $1

# 4. Identificar quién accedió (audit_log si existe)
# SELECT * FROM "audit_log" WHERE "entity_type" = $1 AND "timestamp" > NOW()-'1 hour' ORDER BY "timestamp" DESC
```

## Mitigación inmediata (EJECUTAR EN MENOS DE 5 MINUTOS)
```bash
# 1. BLOQUEAR el endpoint afectado inmediatamente
# Si es API route → agregar early return con 503

# 2. Si es generalizado → MODO MANTENIMIENTO
# /flag maintenance_mode on

# 3. Notificar a Brandon INMEDIATAMENTE
# Via MCP: enviar_whatsapp con template "alerta_critica"

# 4. Preservar evidencia — NO borrar logs
# pg_dump del audit_log a archivo separado

# 5. Rollback al último deploy seguro
# vercel rollback
```

## Resolución
1. Root cause analysis completo con security-pentester
2. Fix del código vulnerable (agregar tenantId faltante)
3. Eval harness: agregar nuevo test que detecte este caso
4. Auditar TODOS los endpoints similares
5. Si datos de clientes se expusieron → activar breach-report (Ley 29733, 72 hrs para ANPD)

## Prevención
- Eval multi-tenant (5 evals) en CADA PR
- Regla CLAUDE.md #3: tenantId obligatorio
- Hook danger-zone protege archivos de auth
- Pentest pre-merge obligatorio (regla #14)

## Owner
- **Principal:** security-pentester + security-auditor (ambos)
- **Fallback:** solution-architect
- **Escalación:** Brandon (WhatsApp INMEDIATO) + abogado si hay brecha real
