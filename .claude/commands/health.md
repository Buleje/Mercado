---
description: Salud del sistema — smoke del dev server (default) o dashboard de prod (SLOs + crons + Sentry + deploys) con "prod"
allowed-tools: Bash, Read, Grep, WebFetch
argument-hint: "[prod|slo|crons|errors]"
---

**Sin args (dev smoke):** ejecutá `node scripts/dev-helpers/health.mjs` y reportá la salida. Si hay errores o rutas en rojo, propóné el siguiente paso (revisar log completo, reiniciar dev, fixear queries N+1). Si todo verde, una línea: "✅ Healthy" + N+1 count si > 0.

**Con `prod` | `slo` | `crons` | `errors` (dashboard de producción):**

1. **SLOs**: `curl -s localhost:3000/api/superadmin/slo` → tabla SLO / target / current / budget. Si >90% burned → 🔴 y decir "deploy bloqueado".
2. **Crons**: `curl -s localhost:3000/api/superadmin/cron-health` → tracked, neverRun (warning), failed 24h, stale >48h.
3. **Errores**: Sentry MCP (org `buleje-sy`, project `bodega-san-martin`), unresolved últimas 24h. Si 0 → "producción limpia".
4. **Deploys**: `npx vercel ls --limit 3` → último deploy, estado, URL.

Con arg específico (`slo`/`crons`/`errors`) mostrar solo esa sección. Siempre incluir timestamp de la consulta.
