# Plans — Explore · Plan · Execute

> **Regla:** Para cualquier tarea que valga la pena (> 1 día de trabajo, toca > 3 archivos, o cambia arquitectura), **creá un plan acá antes de tocar código**.
>
> Un plan explícito baja el costo de:
> - Cambiar de contexto entre sesiones (el plan es la memoria del trabajo)
> - Onboarding de un Agent Team (los teammates leen el plan, no inventan)
> - Re-planificar si el usuario cambia de opinión a mitad
> - Auditorías y ADRs posteriores (el plan es evidencia)

---

## 📂 Convención

```
docs/plans/
├── README.md                                     ← este archivo
├── TEMPLATE.md                                   ← plantilla a copiar
├── 2026-04-08-marketplace-sidebar-to-modals.md  ← ejemplo (activo)
└── <YYYY-MM-DD>-<slug-corto-descriptivo>.md     ← cada plan nuevo
```

**Nombre del archivo:** `YYYY-MM-DD-<slug>.md` — fecha + slug descriptivo corto.

---

## 🔄 Ciclo de vida de un plan

```
1. EXPLORE  → investigar código, ADRs, memoria persistente
2. PLAN     → escribir este doc con los bloques del TEMPLATE
3. REVIEW   → dejar que el usuario lo apruebe (o ajustarlo)
4. EXECUTE  → ejecutar + checkmarks por bloque cerrado
5. ARCHIVE  → mover a docs/plans/archive/<año>/ cuando esté hecho
```

Si un plan queda abandonado > 2 semanas sin progreso, moverlo a `docs/plans/stalled/` con nota de por qué.

---

## 🚦 Cuándo NO necesitás un plan acá

- Hotfix de 1 línea / typo / rename mecánico
- Commit cosmético (formateo, ordenar imports)
- Pregunta del usuario que se responde en la misma conversación
- Bug chico que se resuelve en el mismo turno

Para esos casos, un commit Conventional es suficiente.

---

## 🔗 Relación con otros artefactos

| Artefacto | Propósito | Vive en |
|---|---|---|
| **Plan** (este directorio) | Cómo voy a hacer X, paso a paso | `docs/plans/` |
| **ADR** | Por qué decidí hacer X así | `docs/adr/` |
| **TECH-DEBT** | Deuda que descubrí mientras hacía X | `docs/TECH-DEBT.md` |
| **Instrucción / skill** | Cómo se hacen cosas de tipo X en este proyecto (reusable) | `.github/instructions/*.instructions.md` |

Un plan puede (y debería) referenciar los 3 otros.

---

## 🏗️ Relación con Agent Teams

Si el plan requiere > 3 áreas (backend + frontend + DB + tests, por ejemplo), el plan mismo es la entrada del `/agent-team`. Cada bloque del plan se convierte en un work item con un teammate responsable.

Formato recomendado para los bloques:

```markdown
### Bloque 3.2 — Refactor de X
- **Teammate:** `frontend-engineer`
- **Input:** archivos `components/X/**`, ADR 006
- **Output:** reducción de líneas, tests verdes, build ok
- **Gate:** `npx tsc --noEmit` + `npm run test -- X`
- **Estado:** ☐ TODO · ⏳ IN PROGRESS · ✅ DONE · ❌ BLOCKED
```
