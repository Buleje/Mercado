---
name: dr-drill
description: |
  Ejecuta disaster recovery drill manualmente. Restaura último backup
  a DB temporal, corre 10 validaciones, reporta resultado.
  Usar cuando Brandon diga "dr drill", "probar backup", "disaster recovery",
  "restore test", "verificar backup".
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "[latest|YYYY-MM-DD|status]"
model: opus
---

# DR Drill — Disaster Recovery Manual

## Algoritmo

```
1. /dr-drill status → mostrar último drill exitoso + días transcurridos
2. /dr-drill latest → ejecutar drill con el backup más reciente
3. /dr-drill YYYY-MM-DD → ejecutar drill con backup de fecha específica

Pasos del drill:
  a. Encontrar backup en backups/db/
  b. Crear DB temporal (bodega_dr_test_YYYYMMDD)
  c. Restaurar con pg_restore o psql
  d. Correr 10 validaciones (evals/dr/restore-validation.ts)
  e. Generar reporte en reports/dr-drills/YYYY-MM-DD.md
  f. Limpiar DB temporal (SIEMPRE, incluso si falla)
  g. Notificar resultado vía WhatsApp (MCP Bodega)
```

## 10 validaciones

1. Conteo de tenants >0
2. Productos por tenant >0
3. Ventas último mes coherentes (no negativos)
4. Aislamiento multi-tenant (cross-tenant = null)
5. Integridad referencial (0 FKs huérfanas)
6. Boletas con correlativo válido
7. Fiados con saldos coherentes
8. Sin stocks negativos
9. Hash chain audit_log intacto
10. Restore completo <10 minutos

## Alerta

Si >35 días sin DR drill exitoso → alerta WhatsApp crítica.

## Reglas

1. **NUNCA restaurar en DB de producción.** Solo DBs temporales.
2. **SIEMPRE limpiar** la DB temporal al final.
3. **Reportar TODOS los resultados**, incluso parciales.
