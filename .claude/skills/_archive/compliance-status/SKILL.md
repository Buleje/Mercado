---
name: compliance-status
description: |
  Dashboard de cumplimiento Ley 29733 — muestra estado de audit log,
  solicitudes pendientes, cobertura de consentimientos, últimas brechas.
  Usar cuando Brandon diga "compliance", "ley 29733", "estado legal",
  "auditoría de datos", "GDPR", "protección de datos".
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "[status|audit|consents|breaches]"
model: sonnet
---

# Compliance Status — Dashboard Ley 29733

## Subcomandos

### `/compliance-status` (default)
Muestra dashboard completo:
- Audit log: total entries, últimas 24h, tablas más accedidas
- Solicitudes: exports pendientes, deletes en gracia (30 días)
- Consentimientos: % de clientes con consentimiento explícito
- Brechas: brechas abiertas, plazo ANPD restante

### `/compliance-status audit`
Detalle del audit log: quién accedió qué, cuándo, integridad hash chain.

### `/compliance-status consents`
Cobertura de consentimientos por tipo (processing, marketing, whatsapp, third_party).

### `/compliance-status breaches`
Brechas reportadas, estado de notificación a ANPD (72 hrs), clientes afectados.

## Formato de salida

```markdown
## 🛡️ Compliance Ley 29733 — [fecha]

### Audit Log
| Métrica | Valor |
|---|---|
| Total entries | N |
| Últimas 24h | N |
| Hash chain | ✅ Íntegro / ❌ Roto en #N |

### Solicitudes activas
| Tipo | Pendientes | Plazo |
|---|---|---|
| Data export | N | 30 días |
| Data delete (gracia) | N | [fecha vencimiento] |

### Consentimientos
| Tipo | Cobertura |
|---|---|
| data_processing | X% |
| marketing | X% |

### Estado general: ✅ Compliant / ⚠️ Acciones pendientes / ❌ Riesgo legal
```
