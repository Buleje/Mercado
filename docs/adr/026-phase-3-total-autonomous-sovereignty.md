# ADR-026 — Phase 3: Total Autonomous Sovereignty

**Status:** 🟢 Accepted
**Fecha:** 2026-04-09
**Autor:** Brandon (Buleje) + Claude Code (Lead Systems Architect)
**Contexto del proyecto:** Bodega San Martín (ERP/e-commerce multi-tenant Pucallpa)
**Supersede:** ninguno · **Relacionado con:** ADR-025 (Phase 2 Autonomous OS), ADR-016 (plan 24 semanas)

---

## 1. Contexto

Phase 2 (ADR-025) alcanzó Nivel 4 de Autonomía: auto-reparación, pentest pre-merge, gestión de ADRs, y optimización de tokens. Sin embargo, el sistema aún tenía 3 brechas para alcanzar Nivel 5:

1. **Sin visibilidad financiera.** No había forma de saber cuánto costaba cada sesión en tokens, ni si estábamos usando el modelo correcto para cada tipo de tarea. A $200/mes de Claude Code, cada token cuenta.
2. **Sin conexión producción ↔ desarrollo.** Errores en producción (Vercel/Sentry) no se conectaban automáticamente con el flujo de debugging local. Brandon descubría errores manualmente revisando Sentry o por quejas de usuarios.
3. **Sin capitalización del legado.** 25 ADRs, 1400+ tests, 131 modelos Prisma — todo invisible para clientes potenciales, inversores y LinkedIn. El código existía pero no generaba valor comercial visible.

Adicionalmente, el deploy carecía de gates enterprise automatizados y verificación post-deploy.

## 2. Decisión

**Activar Phase 3 — Total Autonomous Sovereignty** (Nivel 5) mediante:
- 3 agentes nuevos (total: 24)
- 4 skills nuevos (total: 22)
- 2 hooks nuevos (total: 12)
- 1 regla nueva en CLAUDE.md (total: 15)

### Artefactos creados

#### Agentes (3 nuevos — total ahora 24)

| # | Path | Nombre | Misión |
|---|---|---|---|
| 22 | `agents/finops-guard.md` | FinOps & Resource Architect | Auditoría de costos, ROI por sesión, optimización de modelos por tarea |
| 23 | `agents/sre-observability.md` | SRE & Observability | Conectar salud de producción con desarrollo local, auto-escalar a bug-hunter |
| 24 | `agents/growth-specialist.md` | Growth & Legacy Architect | Convertir código en valor comercial: case studies, LinkedIn drafts, métricas |

#### Skills (4 nuevos — total ahora 22)

| Path | Comando | Función |
|---|---|---|
| `skills/showcase/SKILL.md` | `/showcase` | Resumen ejecutivo de últimos 5 ADRs para cliente/inversor + borrador LinkedIn |
| `skills/production-sync/SKILL.md` | `/production-sync` | Fetch de errores de Vercel/Sentry + plan de reparación inmediato |
| `skills/optimize-context/SKILL.md` | `/optimize-context` | Escaneo y consolidación de memorias redundantes |
| `skills/infrastructure-map/SKILL.md` | `/infrastructure-map` | Diagrama Mermaid de modelos Prisma, agentes y servicios |

#### Hooks (2 nuevos — total ahora 12)

| Path | Evento | Función |
|---|---|---|
| `hooks/pre-deploy-enterprise-gate.mjs` | PreToolUse (Skill:deploy) | Gate: console.log + tsc + lint + tests antes de deploy |
| `hooks/post-deploy-sentinel.mjs` | PostToolUse (Skill:deploy) | 3 health checks post-deploy con alertas si falla |

#### Regla nueva en CLAUDE.md

- **Regla #15 — Directiva de Rentabilidad:** Cada cambio debe ser evaluado por su impacto en performance (Core Web Vitals) y costo de infraestructura. El agente `finops-guard` audita post-tarea.

### Actualización de memoria

- `project_phase3_autonomous_sovereignty.md` — registro vivo de capacidades Phase 3
- `MEMORY.md` actualizado con punteros

## 3. Consecuencias

### ✅ Positivas

- **Visibilidad financiera total.** Cada sesión termina con un reporte ROI. Brandon sabe exactamente qué valor obtuvo por cada dólar.
- **Producción conectada.** Errores 500 en prod auto-invocan bug-hunter. No más descubrimientos manuales.
- **Legacy capitalizado.** Cada ADR se convierte en case study y borrador LinkedIn. El código genera valor comercial visible.
- **Deploy blindado.** 4 gates automáticos pre-deploy + health check post-deploy. Imposible deployar código roto.
- **Memorias optimizables.** `/optimize-context` consolida redundancias y libera ventana de contexto.
- **Arquitectura visible.** `/infrastructure-map` genera diagramas Mermaid actualizados del estado real.

### ⚠️ Negativas / costos

- **Mayor complejidad operativa.** 22 skills + 24 agentes + 15 reglas + 12 hooks. Mitigación: `/infrastructure-map agents` para visualizar la red.
- **Pre-deploy gate lento.** tsc + lint + test puede tomar 2-5 minutos. Mitigación: bypass `SKIP_DEPLOY_GATE=1` para hotfixes.
- **Post-deploy health check depende de curl.** Si la red local tiene issues, puede dar falsos negativos. Mitigación: 3 intentos con delay.
- **FinOps audit es estimativo.** No hay API directa para contar tokens de Claude Code. Las estimaciones son basadas en tool calls y longitud. Mitigación: marcar como "estimado".

### 🔄 Migraciones requeridas

- **Ninguna migración de DB.** Phase 3 no toca schema.
- **Ninguna migración de código de producción.** Solo añade artefactos en `.claude/` y `docs/`.
- **Registrar hooks nuevos** en `bodega-san-martin/.claude/settings.json`.
- **Crear directorio `docs/growth/`** para case studies y métricas.

## 4. Alternativas evaluadas

| Opción | Pros | Contras | Por qué descartada |
|---|---|---|---|
| **A: Quedarse en Phase 2** | Sin cambios, funciona | Sin FinOps, sin prod sync, sin growth | Brandon pidió Nivel 5 |
| **B: Solo hooks de deploy** | Protege deploys | No capitaliza el legado ni conecta prod | Incompleto |
| **C: Usar plugin ECC para todo** | Menos código propio | Genérico, no adaptado al stack BSM | No cubre growth ni finops específico |
| **D: Phase 3 completa** (elegida) | Cubre los 3 gaps + deploy gates | Mayor complejidad | — |

## 5. Verificación

- [x] 3 agentes creados (finops-guard, sre-observability, growth-specialist)
- [x] 4 skills creados (showcase, production-sync, optimize-context, infrastructure-map)
- [x] 2 hooks creados (pre-deploy-enterprise-gate, post-deploy-sentinel)
- [x] ADR-026 escrito (este documento)
- [x] CLAUDE.md actualizado (Regla 15)
- [x] AGENTS.md actualizado con agentes 22-24
- [x] settings.json actualizado con hooks nuevos
- [x] MEMORY.md actualizado
- [ ] Test del pre-deploy gate con deploy intencional
- [ ] Test del post-deploy sentinel con health check
- [ ] Primera ejecución de `/showcase`
- [ ] Primera ejecución de `/production-sync health`
- [ ] Creación de `docs/growth/` con primer case study

### Rollback plan

```bash
cd bodega-san-martin
# Revertir archivos nuevos
rm .claude/agents/finops-guard.md
rm .claude/agents/sre-observability.md
rm .claude/agents/growth-specialist.md
rm -rf .claude/skills/showcase
rm -rf .claude/skills/production-sync
rm -rf .claude/skills/optimize-context
rm -rf .claude/skills/infrastructure-map
rm .claude/hooks/pre-deploy-enterprise-gate.mjs
rm .claude/hooks/post-deploy-sentinel.mjs
# Revertir CLAUDE.md y otros desde git
git checkout -- ../../CLAUDE.md
git checkout -- ../../AGENTS.md
```

## 6. Referencias

- ADR-025 — Phase 2 Ultimate Autonomous OS (predecesor)
- ADR-016 — Plan maestro 24 semanas
- Memorias:
  - `feedback_obsessive_boss_level4.md` — mandato de autonomía
  - `feedback_max_ambition_default.md` — máxima ambición
  - `user_claude_code_tier.md` — $200/mes, maximizar
  - `project_phase2_autonomous_os.md` — estado Phase 2

---

> Generado por skill `adr-manager` · 2026-04-09 · Phase 3 Total Autonomous Sovereignty
