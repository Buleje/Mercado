# ADR-031 — Claude Headless Autonomy 24/7

**Status:** 🟢 Accepted
**Fecha:** 2026-04-10
**Autor:** Brandon (Buleje) + Claude Code
**Relacionado con:** ADR-025 (Phase 2), ADR-026 (Phase 3), ADR-027 (Eval harness)

---

## 1. Contexto

Claude Code trabaja solo cuando Brandon está en la terminal. 8-10 horas/día desperdiciadas mientras duerme. Con GitHub Actions, Claude puede trabajar 24/7 en tareas controladas.

## 2. Decisión

Crear `.github/workflows/claude-autonomous.yml` con 4 jobs:

| Job | Trigger | Qué hace |
|---|---|---|
| `auto-fix-issue` | Issue con label `claude-auto` | Lee issue, crea branch, fix, PR |
| `auto-dependabot` | PR de Dependabot | Corre tests, auto-approve si pasa |
| `nightly-audit` | Cron 3 AM UTC | Audit de seguridad, TODOs, tenantId |
| `manual-task` | workflow_dispatch | Tarea manual vía UI de GitHub |

### Seguridad

- Cada job corre en branch aislada (nunca push a master directo)
- Token limit: 500k por run (200k para nightly audit)
- `--dangerously-skip-permissions` solo en sandbox de GitHub Actions
- Todas las PRs requieren review humano antes de merge
- Nightly audit NO hace cambios, solo reporta

### Requisitos

- Secret `ANTHROPIC_API_KEY` en GitHub repository settings
- Claude Code instalable vía `npm install -g @anthropic-ai/claude-code`

## 3. Consecuencias

✅ 8+ horas de trabajo nocturno en issues, auditorías y Dependabot
✅ Dependabot PRs auto-resueltos si tests pasan
✅ Auditoría de seguridad diaria automática
⚠️ Requiere ANTHROPIC_API_KEY como secret de GitHub
⚠️ Costo: cada run usa tokens (~$1-5 por run)
⚠️ NO activar auto-merge — siempre review humano

## 4. Estado

- [x] Workflow creado con 4 jobs
- [ ] Configurar ANTHROPIC_API_KEY en GitHub Secrets
- [ ] Test del job manual-task con tarea simple
- [ ] Verificar que nightly-audit genera reporte útil
- [ ] Agregar notificación WhatsApp al completar (via MCP Bodega)
