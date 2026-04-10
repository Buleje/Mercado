---
name: auto-dispatch
description: Lee un GitHub issue y automaticamente asigna el agente o squad correcto basado en labels, titulo y descripcion. Puede ejecutar el fix sin intervencion humana.
user-invocable: true
model: opus
---

# /auto-dispatch — Asignacion automatica de agentes a issues

## Cuando usarlo
- Cuando llega un issue nuevo en GitHub
- Cuando Brandon dice "arregla el issue #N"
- Cuando el workflow claude-autonomous.yml detecta label `claude-auto`

## Flujo

### Paso 1: Leer el issue

```bash
gh issue view [NUMBER] --json title,body,labels,assignees
```

### Paso 2: Clasificar por tipo

| Patron en titulo/body/labels | Agente/Squad asignado |
|---|---|
| "bug", "error", "crash", "500", "broken" | `bug-hunter` → si es cross-layer: `full-stack-squad` |
| "security", "vulnerability", "CVE", "XSS", "injection" | `security-squad` |
| "slow", "performance", "lighthouse", "bundle" | `performance-squad` |
| "checkout", "payment", "yape", "cart" | `checkout-squad` (skill existente) |
| "UI", "design", "responsive", "accessibility" | `frontend-engineer` |
| "API", "endpoint", "route", "backend" | `backend-platform-engineer` |
| "database", "migration", "prisma", "query" | `database-engineer` |
| "test", "coverage", "flaky" | `qa-reliability-engineer` + `test-writer` |
| "SEO", "metadata", "sitemap" | `seo-growth-strategist` |
| "WhatsApp", "Stripe", "SUNAT", "integration" | `integration-specialist` |
| "refactor", "cleanup", "tech-debt" | `refactoring-expert` |
| "deploy", "CI", "env", "vercel" | `devops-release-engineer` |

### Paso 3: Evaluar complejidad

| Complejidad | Senales | Accion |
|---|---|---|
| Simple (1 archivo) | titulo corto, 1 label, area clara | Agente solo, directo |
| Moderada (2-5 archivos) | multiples labels, area definida | Agente + qa-reliability |
| Alta (5+ archivos, cross-layer) | "refactor", "migration", multiples areas | Squad completo |
| Enterprise (modulo completo) | "rewrite", "new module", 3+ areas | `/enterprise-initiative-orchestration` |

### Paso 4: Ejecutar

1. Crear branch: `claude-auto-fix/issue-[NUMBER]`
2. Lanzar agente(s) con prompt que incluye:
   - Titulo y body del issue
   - Archivos relevantes (inferidos de la clasificacion)
   - Reglas de CLAUDE.md aplicables
3. Despues del fix: `npm run lint && npx tsc --noEmit && npm run test`
4. Si pasa: commit + push + crear PR
5. Si falla: `/self-heal` (3 intentos) → si no converge, crear issue de follow-up

### Paso 5: Reportar

Comentar en el issue original con:
- Que se hizo
- PR link
- Tests que pasan
- Agente(s) que trabajaron

## Modo headless

Cuando se ejecuta desde `claude-autonomous.yml` (GitHub Actions), todo el flujo es automatico:
1. Lee issue con label `claude-auto`
2. Clasifica → asigna agente
3. Fix → test → PR
4. Comenta resultado en el issue
5. Si CRITICAL: no auto-merge, esperar review humano
