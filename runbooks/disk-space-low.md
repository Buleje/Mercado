# Runbook: Disk Space Low

## Detección
- **Patrón:** Vercel function timeout due to `/tmp` full OR Supabase storage alerts
- **Severidad:** P2 — Degradación gradual
- **SLO afectado:** `api_p99_latency` (indirecto)
- **MTTR objetivo:** <30 minutos

## Diagnóstico
```bash
# 1. Verificar espacio en Supabase Storage
# supabase storage ls bodega-backups/ 2>/dev/null

# 2. Verificar tamaño de backups locales
du -sh backups/db/ 2>/dev/null

# 3. Verificar logs acumulados
du -sh logs/ 2>/dev/null

# 4. Verificar node_modules y .next cache
du -sh node_modules/ .next/ 2>/dev/null

# 5. Verificar tamaño de DB en Supabase
# Dashboard Supabase → Database → Database size
```

## Mitigación inmediata
```bash
# 1. Limpiar backups viejos (mantener últimos 30)
ls -t backups/db/*.sql* | tail -n +31 | xargs rm -f 2>/dev/null

# 2. Limpiar logs viejos (>30 días)
find logs/ -name "*.log" -mtime +30 -delete 2>/dev/null
find logs/ -name "*.json" -mtime +30 -delete 2>/dev/null

# 3. Limpiar .next cache
rm -rf .next/cache/ 2>/dev/null

# 4. Limpiar reportes viejos
find reports/ -name "*.md" -mtime +90 -delete 2>/dev/null
```

## Resolución
1. Si es Supabase → upgrade plan o limpiar storage
2. Si es backups → ajustar retención (MAX_BACKUPS en hook)
3. Si es DB bloat → VACUUM ANALYZE
4. Configurar alertas de espacio en Supabase dashboard

## Prevención
- Hook pre-deploy-db-snapshot ya limpia backups viejos (30 max)
- Cron semanal de limpieza de logs y reportes
- Monitoreo de tamaño de DB en Grafana

## Owner
- **Principal:** devops-release-engineer
- **Fallback:** database-engineer
- **Escalación:** Brandon (WhatsApp)
