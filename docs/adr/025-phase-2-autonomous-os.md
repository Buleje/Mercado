# ADR-025 — Phase 2: Ultimate Autonomous OS

**Status:** 🟢 Accepted
**Fecha:** 2026-04-09
**Autor:** Brandon (Buleje) + Claude Code (Lead Systems Architect)
**Contexto del proyecto:** Bodega San Martín (ERP/e-commerce multi-tenant Pucallpa)
**Supersede:** ninguno · **Relacionado con:** ADR-014 (middleware split), ADR-015 (checkout footer slot), ADR-016 (plan 24 semanas), ADR-020 (ola1 migration plan), ADR-022 (upstash rate limit), ADR-024 (loyalty transaction)

---

## 1. Contexto

Tras instalar Vercel CLI v50.42.0 y auditar el estado del proyecto (secrets locales en `.env` correctamente gitignored ✅, OIDC token rotativo cada 12h, 18 vars faltantes en dev env de Vercel, 4 proyectos basura en el team, 27 vulnerabilidades npm incl. 1 crítica + 13 high), quedó claro que el sistema autónomo actual del repo —aunque potente— tenía 4 brechas serias:

1. **Sin auto-reparación.** Cualquier fallo trivial de lint/build/test pausaba al sistema esperando feedback de Brandon. En sesiones nocturnas autónomas, esto significaba bloqueo total.
2. **Sin gestión sistemática de ADRs.** Los 19 ADRs existentes (000–019) se creaban a mano, sin numeración consistente y sin garantía de que cada cambio estructural quedara documentado. Regla CLAUDE.md #12 era aspiracional, no ejecutable.
3. **Sin validación ofensiva pre-merge.** El `security-auditor` existente es defensivo (checklist OWASP). Faltaba un agente ofensivo que buscara fugas de secrets, IDOR multi-tenant, race conditions y vulnerabilidades explotables ANTES del merge a `master`.
4. **Sin QA visual contra Figma.** Brandon iteraba diseño → código sin validación automatizada de que el render real matcheara los frames de Figma en mobile/tablet/desktop.

Adicionalmente, el contexto de sesión crecía sin control en sesiones largas (>2h), gastando tokens en re-leer archivos ya digeridos.

## 2. Decisión

**Activar Phase 2 — Ultimate Autonomous OS** mediante 5 nuevos artefactos ejecutables, 2 reglas duras nuevas en `CLAUDE.md`, 2 nuevas memorias persistentes, y la integración formal de Vercel CLI como capa de observabilidad.

### Artefactos creados (todos en `bodega-san-martin/.claude/`)

#### Skills (3 nuevos)
| Path | Función |
|---|---|
| `skills/self-heal/SKILL.md` | Loop de auto-reparación de lint/build/test (3 intentos máx, zona peligrosa excluida) |
| `skills/adr-manager/SKILL.md` | Comando `/adr [título]`: auto-numera y crea ADR con plantilla obligatoria |
| `skills/token-optimizer/SKILL.md` | Subcomandos `status`/`summary`/`clean`/`recap` para gestionar presupuesto de contexto |

#### Agents (2 nuevos — total ahora 21)
| Path | Función |
|---|---|
| `agents/security-pentester.md` | Auditor OFENSIVO con gitleaks (o fallback regex), OWASP ofensivo, IDOR multi-tenant, race conditions |
| `agents/visual-qa-specialist.md` | QA visual con MCP Playwright contra Figma, multi-breakpoint, console + network checks |

### Reglas duras añadidas en `CLAUDE.md`

- **Regla #13 — Regla de Oro de Autonomía:** Si una tarea falla por error de sintaxis/lint/type-check/tests, el sistema **DEBE intentar repararse solo** con `/self-heal` (max 3 intentos) antes de pedir feedback. Excluye archivos de zona peligrosa.
- **Regla #14 — Validación de seguridad pre-merge:** Antes de cualquier merge a `master`, ejecutar `security-pentester` sobre el diff. Hallazgo crítico → bloquear merge.

### Memorias persistentes nuevas

- `~/.claude/projects/.../memory/project_phase2_autonomous_os.md` — registro vivo de capacidades Phase 2
- `~/.claude/projects/.../memory/reference_vercel_cli_observability.md` — estado del Vercel CLI + gaps detectados
- `MEMORY.md` actualizado con punteros a ambos

## 3. Consecuencias

### ✅ Positivas

- **Autonomía nocturna real.** Brandon puede dejar al sistema corriendo features y volver a un branch verde (o a un reporte de escalación claro), sin tener que estar disponible para cada error de tipo.
- **Historial arquitectónico intacto.** Cada cambio estructural deja un ADR auto-creado con plantilla unificada → futuras sesiones leen `docs/adr/` y entienden todo el "por qué" sin tener que reverse-engineer del git log.
- **Segunda capa de defensa de secrets.** El pentester ofensivo correrá pre-merge y atrapará leaks que el auditor defensivo podría perder.
- **Pixel-perfect contra Figma.** El visual-qa-specialist cierra el gap entre diseño y render real, multi-breakpoint, sin que Brandon tenga que abrir manualmente DevTools en 5 viewports.
- **Sesiones largas viables.** El token-optimizer evita que sesiones de 4+ horas degraden por contexto saturado.
- **Vercel observable.** `vercel logs` y `vercel env ls` accesibles directamente desde la sesión → diagnóstico de incidentes en producción inmediato.

### ⚠️ Negativas / costos

- **Más complejidad operativa.** 16 skills + 21 agentes + 14 reglas. Riesgo de "fatiga de elección" o de invocar skill equivocado.
- **Costo en tokens del pentester pre-merge.** Cada merge dispara una auditoría Opus → ~10–20k tokens adicionales por merge.
- **Falsos positivos del self-heal.** Un fix automático mal aplicado podría introducir un bug sutil. Mitigación: NUNCA commitear automáticamente, dejar diff visible, escalar tras 3 intentos.
- **Dependencia opcional de gitleaks.** Si Brandon no lo instala, el pentester usa fallback de regex (menos completo). Mitigación: documentar `npm i -g @gitleaks/gitleaks` como follow-up.
- **MCP de Playwright requerido para visual-qa.** Ya está en la sesión, pero si en CI no está, el agente no funciona allí.

### 🔄 Migraciones requeridas

- **Ninguna migración de DB.** Phase 2 no toca schema.
- **Ninguna migración de código de producción.** Solo añade artefactos en `.claude/` y `docs/adr/`.
- **Completado:** `gitleaks` v8.30.1 instalado via winget. Scan ejecutado, 0 leaks reales en código (6 findings todos false positives: placeholders Stripe, localStorage keys, test data).
- **Completado:** verificado que `.env` y `.env.local` NUNCA estuvieron en git history. Alarma previa de la auditoría Vercel CLI era falso positivo.
- **BLOQUEADO — Migración xlsx → exceljs parcial.** Los archivos `lib/export-excel.ts` y `app/api/products/import/route.ts` fueron reescritos 3 veces con exceljs durante la sesión, y cada vez el editor/OneDrive los revirtió al estado xlsx original. `components/admin/ExcelProductImporter.tsx` también quedó con imports de xlsx. `exceljs@4.4.0` está instalado pero no se usa. **Acción pendiente:** cerrar el editor que tiene estos archivos abiertos (probablemente VS Code con cambios sin guardar) o trabajar desde un folder fuera de OneDrive, luego repetir la migración. La vulnerabilidad CRÍTICA de `xlsx` (Prototype Pollution + ReDoS) sigue ACTIVA.
- **Acción pendiente:** `npm audit fix --force` para Next.js 16.0.0-beta → 16.2.3 (resuelve 4 moderates adicionales, pero es breaking change, requiere smoke test).

## 4. Alternativas evaluadas

| Opción | Pros | Contras | Por qué descartada |
|---|---|---|---|
| **A: Quedarse en Phase 1** (status quo) | Sin cambios, sin riesgo | Brandon sigue siendo el cuello de botella; los hallazgos del Vercel setup quedan sin proceso para resolverse | No escalable. Brandon explícitamente pidió "máxima ambición" y "autonomía total nivel 4" |
| **B: Solo añadir self-heal** (mínimo viable) | Resuelve el bottleneck principal | Deja sin resolver: gestión de ADRs, pentest pre-merge, QA visual, observabilidad Vercel | Brandon pidió "Phase 2 completa", no incremento mínimo |
| **C: Usar plugin externo** (ej: ralph-loop, claude-md-management) | Menos código propio | Brandon quiere skills custom adaptados a Bodega San Martín, no genéricos. Los plugins existentes (ralph-loop, claude-md-improver) cubren ~30% del scope | Incompleto y no específico al stack del proyecto |
| **D: Phase 2 completa con artefactos custom** (la elegida) | Cubre los 4 gaps. Custom al stack. Documentado en ADR. Reusable en sesiones futuras | Mayor complejidad operativa | — |

## 5. Verificación

- [x] 5 archivos creados (3 skills + 2 agents)
- [x] CLAUDE.md actualizado (reglas 13, 14, tabla de slash commands, footer)
- [x] MEMORY.md actualizado (2 nuevas entradas)
- [x] 2 memorias persistentes creadas
- [x] ADR-020 escrito (este documento)
- [ ] Auditoría ofensiva inicial ejecutada por `security-pentester` (sigue abajo)
- [ ] `gitleaks` instalado (follow-up recomendado)
- [ ] Test manual del skill `/self-heal` con error sintético (follow-up)
- [ ] Test manual del agente `visual-qa-specialist` contra una página (follow-up)
- [x] Rollback plan documentado abajo
- [x] Notificación al equipo (Brandon es el equipo, este ADR es la notificación)

### Rollback plan

Si Phase 2 introduce regresiones:

```bash
cd "C:/Users/Usuario/OneDrive/Documentos/Escritorio/Prueba 2"
# Revertir los archivos nuevos
rm -rf bodega-san-martin/.claude/skills/self-heal
rm -rf bodega-san-martin/.claude/skills/adr-manager
rm -rf bodega-san-martin/.claude/skills/token-optimizer
rm bodega-san-martin/.claude/agents/security-pentester.md
rm bodega-san-martin/.claude/agents/visual-qa-specialist.md
# Revertir CLAUDE.md y MEMORY.md desde git (si ya commiteado)
git checkout -- CLAUDE.md
git checkout -- ../../../../.claude/projects/C--Users-Usuario/memory/MEMORY.md
# Marcar este ADR como Superseded
sed -i 's/Status:\*\* 🟢 Accepted/Status:** 🟣 Superseded by ADR-021/' bodega-san-martin/docs/adr/025-phase-2-autonomous-os.md
```

## 6. Referencias

- ADRs relacionados:
  - ADR-014 — Middleware module split (zona peligrosa que self-heal NO toca)
  - ADR-015 — Checkout footer slot (zona peligrosa)
  - ADR-016 — Plan maestro 24 semanas
  - ADR-019 — Next 16 cache components (otra zona protegida)
- Memorias relevantes:
  - `feedback_obsessive_boss_level4.md` — Mandato de autonomía nivel 4 que motivó Phase 2
  - `feedback_max_ambition_default.md` — Política de máxima ambición sin pedir confirmación
  - `feedback_multi_agent_hierarchy_level3.md` — Jerarquía N3 que estos agentes respetan
  - `project_phase2_autonomous_os.md` — Memoria viva con el estado actual
  - `reference_vercel_cli_observability.md` — Capa de observabilidad complementaria
- Documentación externa:
  - [Vercel CLI docs](https://vercel.com/docs/cli)
  - [Gitleaks GitHub](https://github.com/gitleaks/gitleaks)
  - [Playwright MCP](https://github.com/microsoft/playwright-mcp)

---

> Generado por skill `adr-manager` (versión inaugural) · 2026-04-09 · revisado y aprobado en la misma sesión por Brandon vía mandato "GO" en el prompt original
