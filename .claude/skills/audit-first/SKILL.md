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

Filosofía irrenunciable de Brandon:

> "No crees nada nuevo sin antes perfeccionar lo que ya existe."

Este skill es la **implementación ejecutable** de esa regla. Si lo invocás
antes de empezar una feature, el agente NO puede escribir código hasta
haber auditado el módulo target.

## Cuándo usarlo

Siempre que vayas a:

- Agregar una feature nueva que toque un módulo existente
- Refactorizar algo con > 2 archivos tocados
- Crear un componente React dentro de una carpeta con 5+ componentes previos
- Escribir un route handler en un directorio con 3+ endpoints existentes
- Modificar una DB class o schema Prisma
- Tocar zona peligrosa (CheckoutModal, proxy.ts, orders.db, role-permissions, etc.)

## Proceso — 6 pasos obligatorios antes de escribir una sola línea

### Paso 1 — Identificar el módulo target

A partir del argumento o del contexto del user, determinar:

- Ruta del módulo (ej: `components/checkout/`, `lib/db/orders.db.ts`, `app/api/admin/dashboard/`)
- Archivos principales + dependencias inmediatas

### Paso 2 — Leer ADRs relacionados

Buscar en `docs/adr/*.md` cualquier ADR que mencione el módulo:

```bash
grep -rl "checkout\|CheckoutModal" docs/adr/
```

Leer los ADRs matcheados COMPLETOS. Son las decisiones pasadas — no reinventar.

### Paso 3 — Leer documentación del módulo

- `docs/ARCHITECTURE.md` — sección relevante
- `CLAUDE.md` — sección "Zona de peligro" si aplica
- Archivo README del módulo si existe
- `docs/TECH-DEBT.md` — items abiertos del área

### Paso 4 — Leer tests existentes del área

```bash
find __tests__ -name "*checkout*"
find e2e -name "*checkout*"
```

Los tests son el contrato real. Si existen, cualquier cambio debe
preservarlos o actualizarlos conscientemente.

### Paso 5 — Leer últimos 10 commits del área

```bash
git log --oneline -10 -- components/checkout/
git log --oneline -10 -- lib/db/orders.db.ts
```

Ver qué se refactorizó recientemente. No deshacer trabajo ajeno.

### Paso 6 — Declarar el reporte de auditoría

Formato obligatorio antes de tocar código:

```markdown
## 🔍 Audit-First — <módulo>

### ADRs relacionados (N)
- ADR 014: [título] — [1 frase clave]
- ADR 015: [título] — [1 frase clave]

### Documentación leída
- ARCHITECTURE.md línea X — [qué dice]
- CLAUDE.md zona peligrosa — [advertencias]
- TECH-DEBT abierto: TD-XXX — [qué pendiente]

### Tests existentes (N unit + N e2e)
- `__tests__/checkout/useCheckoutState.test.ts` — cubre el reducer
- `e2e/checkout-confirmar-step.spec.ts` — cubre flujo final
- Coverage estimado del área: X%

### Últimos 10 commits del área
- abc1234 feat(checkout): ...
- def5678 fix(checkout): ...
- ...

### 🚨 Advertencias detectadas
- Riesgo 1: [si aplica]
- Riesgo 2: [si aplica]

### ✅ Verde para continuar con
- Acción permitida 1
- Acción permitida 2

### 🛑 NO tocar
- Archivo 1 (razón)
- Archivo 2 (razón)
```

**Sin este reporte, el agente no debe proceder a editar.**

## Módulos con reglas especiales (zona peligrosa)

Si el módulo está en esta lista, el audit debe ser **más agresivo**:

| Módulo | Reglas extras |
|---|---|
| `components/checkout/**` | Leer ADR 015 + skill `checkout-flow` + CheckoutModal completo (no solo el archivo a tocar). Probar multi-tab. |
| `proxy.ts` + `lib/middleware/**` | Leer ADR 014 + todos los 6 módulos del middleware split. Probar todas las rutas. |
| `lib/db/orders.db.ts` | State machine: documentar transiciones antes de agregar nuevas. Idempotency key obligatorio. |
| `schema.prisma` | `npx prisma validate` antes. Plan de migración con rollback. |
| `lib/auth/role-permissions.ts` | 26 recursos × 6 roles — cualquier cambio impacta muchos módulos. Tests de RBAC obligatorios. |
| `components/CartSidebar.tsx` | BroadcastChannel multi-tab — probar en 2+ tabs simultáneas. |

## Output final del skill

Después de completar el audit, imprimir:

```
✅ Audit-first completado para <módulo>
📚 ADRs leídos: [lista]
🧪 Tests cubriendo el área: N
📝 Reporte completo arriba
🟢 Verde para proceder con las acciones listadas
🛑 Prohibido tocar: [lista]
```

Y recién entonces el user puede pedir el cambio que quería hacer.

## Regla dura

**Nunca saltarse este skill si el user explícitamente lo invocó.** Si el
módulo resulta más complejo de lo estimado, es mejor gastar 10 minutos
auditando que 2 horas arreglando un refactor mal hecho.

## Referencia

- Filosofía "perfect before new" en `~/.claude/projects/C--Users-Usuario/memory/feedback_architect_mindset.md`
- Zona peligrosa documentada en `CLAUDE.md` del proyecto (después del refactor FASE D, quedará más compacta)
