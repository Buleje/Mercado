---
name: audit-first
description: |
  Filosofía "perfect before new" — antes de tocar cualquier módulo, audita
  primero. Usar cuando Brandon diga "antes de tocar X, audita", "primero
  perfecciona", "audit-first", "perfect before new", "qué tenés sobre X".
  Este skill FUERZA a leer ADRs relacionados, tests existentes, últimos
  commits del área y documentación del módulo ANTES de escribir código.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Bash, Grep, Glob, TaskCreate
argument-hint: "[módulo | ruta | 'all']"
model: sonnet
---

# Audit-First — perfect before new

> "No crees nada nuevo sin antes perfeccionar lo que ya existe."

## Triggers

- Feature nueva que toca módulo existente
- Refactor >2 archivos o zona peligrosa
- Modificación de DB class / schema Prisma

## Proceso — 6 pasos obligatorios

### 1. Identificar módulo target
- Ruta del módulo + archivos principales + dependencias inmediatas

### 2. Leer ADRs relacionados
- Buscar en `docs/adr/*.md` cualquier ADR que mencione el módulo
- Leer matcheados COMPLETOS — no reinventar decisiones pasadas

### 3. Leer documentación
- `docs/ARCHITECTURE.md` (sección relevante)
- `CLAUDE.md` ("Zona de peligro" si aplica)
- `docs/TECH-DEBT.md` (items abiertos del área)

### 4. Leer tests existentes
- Buscar unit + e2e tests del área — son el contrato real
- Cualquier cambio debe preservarlos o actualizarlos conscientemente

### 5. Leer últimos 10 commits del área
- Ver qué se refactorizó recientemente — no deshacer trabajo ajeno

### 6. Declarar reporte de auditoría

Formato obligatorio antes de tocar código:

```
## Audit-First — <módulo>
- ADRs relacionados (N): [lista con 1 frase clave c/u]
- Documentación leída: [qué dice cada fuente]
- Tests existentes (N unit + N e2e): [archivos + coverage estimado]
- Últimos 10 commits: [resumen]
- Advertencias detectadas: [riesgos]
- Verde para continuar con: [acciones permitidas]
- NO tocar: [archivos + razón]
```

**Sin este reporte, el agente no debe proceder a editar.**

## Módulos zona peligrosa (audit agresivo)

| Módulo | Reglas extras |
|---|---|
| `components/checkout/**` | Leer ADR 015 + skill `checkout-flow` + CheckoutModal completo. Probar multi-tab. |
| `proxy.ts` + `lib/middleware/**` | Leer ADR 014 + todos los 6 módulos del middleware split. |
| `lib/db/orders.db.ts` | Documentar transiciones de state machine antes de agregar nuevas. Idempotency key obligatorio. |
| `schema.prisma` | `npx prisma validate` antes. Plan de migración con rollback. |
| `lib/auth/role-permissions.ts` | 26 recursos x 6 roles — tests de RBAC obligatorios. |
| `components/CartSidebar.tsx` | BroadcastChannel multi-tab — probar en 2+ tabs simultáneas. |

## Output final

```
Audit-first completado para <módulo>
ADRs leídos: [lista] | Tests: N | Verde: [acciones] | Prohibido: [lista]
```

## Regla dura

Nunca saltarse este skill si el user lo invocó. Mejor 10 min auditando que 2h arreglando un refactor mal hecho.
