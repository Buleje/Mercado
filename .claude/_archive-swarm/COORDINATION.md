# COORDINATION.md — Plan de trabajo del Orquestador

> Este archivo es la **pizarra central** del sistema multi-worktree.
> El orchestrator escribe aqui la descomposicion de cada tarea.
> Los frentes leen su seccion antes de empezar.

---

## Estado actual

| Campo | Valor |
|-------|-------|
| Fecha | 2026-04-10 |
| Ola activa | **Ola 2 — LANZADA 2026-04-10 17:15** |
| Ola 1 resultado | 8/15 Tier S completados |
| TSC global | 0 errores |
| Bloqueados | #3 Rate limit Upstash (env vars), #8 Checkout multi-vendor (L effort) |
| Orquestador turno | Sesion opus main (coordinador) |

---

## 📣 Mensaje a los frentes Warp (2026-04-10 17:25) — TAKEOVER

**Para:** frente-back, frente-front, frente-qa (terminales Warp paralelas)
**De:** orchestrator (sesion opus main)
**Asunto:** 🟡 STANDBY — Agent Teams internas tomaron control de Ola 2

⚠️ Brandon autorizo ejecucion ambiciosa. El orchestrator disparo 4 Agent subagentes internos
(architect + back + front + qa) que ejecutan Ola 2 en paralelo dentro de los 3 worktrees.

**Terminales Warp = STANDBY** hasta que `REPORTS/ola-2-final.md` exista.
Si una Warp ya empezo a tocar archivos de Ola 2 → PARAR, escribir aviso en BIDDING.md.

Main repo esta en `feature/td018-float-to-decimal` con 95 files dirty — WIP separado.
Los agentes operan SOLO en worktree-1/2/3, nunca en main.

---

## 📣 Mensaje original (archivado 17:15)

**Para:** frente-back, frente-front, frente-qa (terminales Warp paralelas)
**De:** orchestrator
**Asunto:** Ola 2 lanzada — leer contrato y arrancar

1. El contrato esta en `.claude/CONTRACTS/ola-2.md` — LEER ANTES DE TOCAR CODIGO.
2. Cada frente toma SOLO los archivos declarados en LOCKS.md seccion "Ola 2 ACTIVA".
3. Si encuentran un archivo bloqueado por otro frente → PARAR y escribir bid en BIDDING.md.
4. Al terminar cada item → marcar `[done]` en LOCKS.md + push a su branch.
5. NO hacer merge ustedes mismos — el orquestador centraliza via smoke-test.sh.
6. Reporte final por frente en `REPORTS/ola-2-{frente}.md` antes de salir.
7. TSC global debe quedar en 0 al terminar su slot — usar `npx tsc --noEmit` en su worktree.

---

## Worktrees activos

| Worktree | Branch | Frente | Estado | Items asignados |
|----------|--------|--------|--------|-----------------|
| `worktree-1-roadmap-bugs` | `wt/roadmap-bugs` | `frente-back` | 🟢 ASIGNADO | #9 schema+API, #11 endpoint, #15 API |
| `worktree-2-roadmap-features` | `wt/roadmap-features` | `frente-front` | 🟢 ASIGNADO | #9 toggle UI, #11 CashFlow UI, #13 Recetas UI, #15 form |
| `worktree-3-roadmap-tier-a` | `wt/roadmap-tier-a` | `frente-qa` | 🟢 ASIGNADO | 4 test files (unit + isolation + e2e hooks) |

---

## Ola 1 — COMPLETADA

### Resultados

| # | Item | Frente | Status |
|---|------|--------|--------|
| 1 | Fix PlatformSettings MRR | back | done |
| 2 | Fix tenants fantasma | - | pre-existente |
| 4 | Abandoned cart WhatsApp cliente | back | done |
| 5 | Daily briefing WhatsApp dueno | back | done |
| 6 | Churn engine cron | - | pre-existente |
| 7 | CRM + RFM integration | front | done |
| 10 | Catalogo 201 productos | back | done |
| 12 | FEFO enforceado POS | back | done |

---

## Ola 2 — PLANIFICADA

### Objetivo
Completar items #9, #11, #13, #15 del Tier S + iniciar Tier A.

### Descomposicion por frente

#### frente-back (worktree-1)
- [ ] #9 Cupones por tienda (TD-032) — ALTER TABLE Coupon ADD storeId, API update
- [ ] #11 Flujo de caja 13 semanas — endpoint /api/finance/cashflow-rolling
- [ ] #15 Self-signup proveedor — /supplier/registrar + queue aprobacion

#### frente-front (worktree-2)
- [ ] #9 UI vendor dashboard toggle cupon tienda/plataforma
- [ ] #11 Componente CashFlowRolling13Weeks en admin
- [ ] #13 Recetas con costo real — UI de produccion + margen

#### frente-qa (worktree-3)
- [ ] Tests para #9 cupones (storeId isolation)
- [ ] Tests para #11 cashflow (edge cases: 0 ventas, fiados)
- [ ] Tests para #15 signup (rate limit, validation)
- [ ] TSC + coverage gate

### Dependencias

```
#9 back (schema + API) ──→ #9 front (UI) ──→ #9 qa (tests)
#11 back (endpoint)    ──→ #11 front (UI) ──→ #11 qa (tests)
#15 back (API)         ──→ #15 front (form)──→ #15 qa (tests)
#13 no tiene back nuevo ──→ #13 front (UI) ──→ #13 qa (tests)
```

### Regla de merge
1. `frente-back` termina primero (crea APIs/schema)
2. `frente-front` empieza cuando back exporta contratos
3. `frente-qa` valida todo al final
4. Orchestrator hace merge de las 3 branches

---

## Flujo SWARM v2 ELITE — 12 pasos por ola

```
Ola N:
  1. compressor revisa si toca comprimir (cada 5 olas)
  2. optimizer genera PREDICTIONS/ola-N-forecast.md (predictivo)
  3. architect genera CONTRACTS/ola-N.md
  4. orchestrator publica items en BIDDING.md
  5. orchestrator asigna manualmente + actualiza LOCKS.md
  6. PARALELO: back + front + qa-unit (los 3 contra el contrato)
  7. qa-integration arranca cuando back + front entregan
  8. reviewer corre peer review cruzado
  9. Si reviews OK → pre-merge-tag → merge → smoke-test
  10. Si smoke-test falla → healer propone fix en HEALING/
  11. scribe actualiza LESSONS + HISTORY + regenera dashboard
  12. orchestrator entrega tabla sugerencias a Brandon
```

### Detalle por paso

| Paso | Agente | Input | Output |
|------|--------|-------|--------|
| 1 | compressor | REPORTS/ (si ola % 5 == 0) | ARCHIVE/olas-X-Y-summary.md |
| 2 | optimizer | HISTORY, LESSONS, items | PREDICTIONS/ola-N-forecast.md |
| 3 | architect | Roadmap items, codigo | CONTRACTS/ola-N.md |
| 4 | orchestrator | Items del roadmap | BIDDING.md actualizado |
| 5 | orchestrator | Bids (o manual) | LOCKS.md + COORDINATION.md |
| 6 | back+front+qa-unit | CONTRACTS/, LOCKS | Codigo + tests contrato |
| 7 | qa-integration | Codigo real de back+front | Tests integracion + e2e |
| 8 | reviewer | Codigo de todos | REVIEWS/ola-N-{frente}.md |
| 9 | orchestrator | Reviews OK | Tag + merge + smoke test |
| 10 | healer | Logs de smoke-test fallo | HEALING/ola-N-fix.md |
| 11 | scribe | REPORTS/, REVIEWS/ | LESSONS, HISTORY, dashboard |
| 12 | orchestrator | Todo consolidado | Tabla sugerencias a Brandon |

### Scripts del flujo

| Cuando | Script | Que hace |
|--------|--------|----------|
| Pre-commit (worktree) | `.claude/hooks/pre-commit-lock-check.sh` | Valida locks |
| Pre-merge | `scripts/pre-merge-tag.sh` | Tag de rollback |
| Post-merge | `scripts/smoke-test.sh` | TSC + tests + build |
| Post-smoke-fail | healer agent | Propone fix en HEALING/ |
| Post-ola | `scripts/generate-dashboard.sh` | Regenera dashboard HTML |
| Cada 5 olas | compressor agent | Archiva reportes viejos |
| Pre-ola | `scripts/swarm-dry-run.sh` | Valida sistema antes de arrancar |

---

## Historial de olas

| Ola | Fecha | Sistema | Items | Resultado |
|-----|-------|---------|-------|-----------|
| 1 | 2026-04-10 | Waves | #1,#2,#4,#5,#6,#7,#10,#12 | 8/8 done |
| 2 | pendiente | SWARM | #9,#11,#13,#15 | - |
