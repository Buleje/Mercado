# Plan — [Nombre corto de la tarea]

**Fecha creación:** YYYY-MM-DD
**Autor:** [humano / agente Claude]
**Estado:** ☐ DRAFT · ⏳ APPROVED · 🚧 IN PROGRESS · ✅ DONE · ❌ STALLED
**Nivel de ambición (ref `principal_ambitious_evolution`):** 1 / 2 / 3 / **4 (default)**

---

## 1. Objetivo de negocio (por qué)

> Una frase: qué problema del dueño / cajero / cliente resuelve.
> Una frase: qué métrica mueve y cuánto (ej: "reduce pasos de checkout de 5 a 2").

---

## 2. Contexto (qué ya sé)

### Archivos / módulos afectados
- `ruta/al/archivo-1.ts` — por qué
- `ruta/al/archivo-2.tsx` — por qué

### ADRs / docs relacionados
- ADR 00X — título
- `docs/XXX.md` — razón

### Decisiones ya tomadas
- [ ] Decisión 1 (fuente: conversación con usuario / ADR X / commit Y)
- [ ] Decisión 2

### Restricciones / cosas que NO puedo romper
- Multi-tenant: cada query lleva `tenantId`
- Zona de peligro X: leer skill antes de tocar
- Tests existentes: N specs que cubren esto

---

## 3. Plan de ejecución (bloques numerados)

### Bloque 1 — [Preparación]
- **Teammate (si agent team):** `director-orchestrator` o directo
- **Input:** [qué lee]
- **Output:** [qué produce]
- **Gate:** `npx tsc --noEmit` + lint
- **Estado:** ☐ TODO

### Bloque 2 — [Implementación core]
- **Teammate:** `backend-platform-engineer` o el que aplique
- **Input:** archivos de capa DB
- **Output:** DB class + endpoint + Zod schema
- **Gate:** tests unitarios verdes
- **Estado:** ☐ TODO

### Bloque 3 — [Integración UI]
- **Teammate:** `frontend-engineer`
- **Input:** contrato del endpoint
- **Output:** componente + estado + accesibilidad
- **Gate:** Storybook visual OK + lint
- **Estado:** ☐ TODO

### Bloque 4 — [Tests e2e]
- **Teammate:** `qa-reliability-engineer`
- **Input:** flujo completo del usuario
- **Output:** Playwright spec
- **Gate:** `npm run test:e2e -- nombre.spec`
- **Estado:** ☐ TODO

### Bloque 5 — [Docs + cierre]
- **Teammate:** directo
- **Input:** lo que cambió
- **Output:** ADR si aplica + update de CLAUDE.md + TECH-DEBT si quedó deuda
- **Gate:** revisión humana
- **Estado:** ☐ TODO

---

## 4. Definition of Done (checklist)

- [ ] Funciona en happy path manual
- [ ] `npm run lint` limpio
- [ ] `npx tsc --noEmit` 0 errores
- [ ] `npm run test` verde
- [ ] `npm run build` exitoso
- [ ] Tests unitarios cubren edge cases + multi-tenant isolation
- [ ] Tests e2e del flujo crítico si aplica
- [ ] Cache invalidado después de writes
- [ ] `requireAdmin()` con roles correctos
- [ ] Feature flag si es riesgoso
- [ ] ADR nuevo si cambia arquitectura
- [ ] Update de `CLAUDE.md` si cambia convención
- [ ] Update de `TECH-DEBT.md` si quedó deuda
- [ ] Commit Conventional Commits + Co-Authored-By si aplica

---

## 5. Riesgos + mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Ejemplo: migración Prisma falla en Supabase pooler | Media | Alto | Usar DIRECT_URL + `reference_prisma_pgbouncer_workaround` |
| Ejemplo: rompe el BroadcastChannel del carrito | Baja | Crítico | Probar multi-tab antes de mergear |

---

## 6. Rollback plan

Si algo explota en producción:

1. Paso 1 concreto (ej: "feature flag `x-feature` → off via `/admin/feature-flags`")
2. Paso 2 concreto (ej: "revert commit `abc123`")
3. Paso 3 concreto (ej: "rollback migration con `prisma migrate resolve --rolled-back`")

SLO de rollback: < 5 min para un usuario afectado.

---

## 7. Log de ejecución (bitácora)

Se completa mientras ejecutás. Una línea por bloque / hallazgo.

- YYYY-MM-DD HH:MM — Bloque 1 cerrado. Nota:…
- YYYY-MM-DD HH:MM — Bloque 2 bloqueado por X. Decisión:…
- YYYY-MM-DD HH:MM — Bloque 3 completado. Nota:…
