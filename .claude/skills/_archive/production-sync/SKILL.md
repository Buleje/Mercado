---
name: production-sync
description: |
  Realiza un fetch de los últimos errores reportados en Vercel/Sentry y
  prepara un plan de reparación inmediato. Conecta producción con desarrollo
  local.
  Usar cuando Brandon diga "qué pasa en prod", "errores de producción",
  "production sync", "sync prod", "health check", "status de prod".
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, WebFetch, Agent
argument-hint: "[health | errors | vitals | full]"
model: opus
---

# Production Sync — Diagnóstico de producción en tiempo real

Conecta la salud de producción con el entorno de desarrollo local.

## Subcomandos

### `/production-sync health` (default)

```
1. Verificar que Vercel CLI está instalado y linkeado
   → vercel whoami && vercel project ls
2. Health check del sitio
   → curl -s -w "%{http_code} %{time_total}s" https://mercado.vercel.app/
   → curl -s -w "%{http_code} %{time_total}s" https://mercado.vercel.app/api/health
3. Últimos deploys
   → vercel ls --limit 5
4. Reportar estado en tabla
```

### `/production-sync errors`

```
1. Obtener logs recientes de Vercel
   → vercel logs --output json --limit 100
2. Filtrar por status >= 400
3. Agrupar por endpoint + status code
4. Para cada error frecuente:
   a. Identificar archivo fuente (app/api/[ruta]/route.ts)
   b. Leer el handler
   c. Proponer diagnóstico
5. Si hay error crítico (500+), invocar agente reviewer
```

### `/production-sync vitals`

```
1. Verificar Vercel Speed Insights
   → vercel inspect --limit 1 (si disponible)
2. Analizar Core Web Vitals:
   - LCP: < 2.5s ✅ | 2.5-4.0s ⚠️ | > 4.0s ❌
   - INP: < 100ms ✅ | 100-300ms ⚠️ | > 300ms ❌
   - CLS: < 0.1 ✅ | 0.1-0.25 ⚠️ | > 0.25 ❌
3. Si alguno en rojo → invocar optimizer
```

### `/production-sync full`

Ejecuta health + errors + vitals en secuencia.

## Formato de salida

```markdown
## 🔄 Production Sync — [fecha HH:MM]

### Estado: 🟢 OK | 🟡 Degradado | 🔴 Incidente

| Check | Result | Detalle |
|---|---|---|
| App responde | ✅ 200 | Xms |
| API health | ✅ 200 | Xms |
| Último deploy | ✅ [hash] | hace Xm |
| Errores recientes | X errores | [resumen] |
| Core Web Vitals | 🟢/🟡/🔴 | LCP=X, INP=X, CLS=X |

### Plan de acción (si hay problemas)
| Prioridad | Problema | Acción | Agente sugerido |
|---|---|---|---|
| 🔴 | Error 500 en /api/X | Invocar reviewer | reviewer |
| 🟡 | LCP > 3s en /tienda | Optimizar images | optimizer |
```

## Reglas

1. **Nunca modificar producción directamente.**
2. **Si Vercel CLI no está disponible, usar curl como fallback.**
3. **Reportar con datos reales, no suposiciones.**
4. **Auto-escalar a agentes especializados si detecta problemas graves.**
5. **Guardar el último reporte en `docs/production-health-latest.md` para referencia.**

## Referencia

- Agente: `observer` — para monitoreo continuo
- Agente: `reviewer` — para diagnóstico de errores
- Memoria: `reference_vercel_cli_observability.md` — estado del Vercel CLI
