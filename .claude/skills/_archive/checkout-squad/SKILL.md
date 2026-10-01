---
name: checkout-squad
description: Dispara el equipo especializado de checkout (frontend + backend + qa + backend) de forma coordinada para cualquier tarea que toque CheckoutModal, CartSidebar, componentes/checkout/** o el flujo de pago. Usar cuando el trabajo tenga riesgo de afectar pagos, cupones, reservas o state machine de order.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Agent, TaskCreate, TaskUpdate
argument-hint: [descripción de la tarea]
model: sonnet
---

# checkout-squad — Preset del equipo de checkout

Este skill orquesta un agent team fijo para cualquier trabajo en la zona peligrosa del checkout. Evita tener que pensar cada vez a qué agente mandar qué.

## Cuándo usarlo

Activar cuando la tarea toque cualquiera de estos:

- `components/checkout/**`
- `components/CheckoutModal.tsx` (el re-export)
- `components/CartSidebar.tsx`
- `components/marketplace/MarketplaceCheckoutModal.tsx`
- `lib/db/orders.db.ts`
- Flujos de pago Yape / efectivo / Stripe / Mercado Pago
- Cupones, puntos de lealtad, reservas de stock
- State machine de `OrderStatus`

## Argumentos

- `$ARGUMENTS` — descripción libre de la tarea (ej. `agregar validación de RUC en StepDatos`).

## Pasos

### 1. Diagnóstico inicial

Antes de dispatchar al squad, responder en voz alta (1 bullet por punto):

1. ¿Qué archivos del checkout se van a tocar?
2. ¿Hay cambio de estado (reducer) o solo UI?
3. ¿Hay side effect server-side (DB class, route handler)?
4. ¿Hay riesgo para multi-tab (BroadcastChannel)?
5. ¿Hay test existente que cubra el área?

### 2. Carga obligatoria de reglas

Leer ANTES de cualquier edit:

- `components/checkout/README.md` si existe
- `docs/ARCHITECTURE.md` sección checkout
- `.github/instructions/checkout-flow.instructions.md` (si existe)
- `__tests__/checkout/` para entender la red de seguridad

### 3. Dispatch del squad (paralelo)

Usar `Agent` tool con estos 4 subagent_types **en paralelo**, una sola respuesta con 4 tool_use blocks:

| Subagent | Rol en el squad | Briefing |
|---|---|---|
| `backend` | Líder técnico — conoce los 2018 LoC del monolito original y el refactor | Describir el cambio + pedir diseño mínimo |
| `frontend` | UI, accesibilidad, animación | Pedir propuesta de componentes + hooks afectados |
| `backend` | Route handlers, DB classes, Zod | Pedir revisión de seguridad multi-tenant + idempotency |
| `tester` | Red de seguridad | Pedir lista de tests nuevos obligatorios (vitest + playwright) |

**Briefing común para los 4:**

> "Trabajamos en el flujo de checkout. Tarea: `$ARGUMENTS`.
> Reglas críticas del proyecto:
> 1. Nunca mutar `submitting` directo — solo via dispatch.
> 2. Nunca recalcular totales en cliente — el backend recompone.
> 3. `tenantId` en toda query — DB classes siempre.
> 4. Zod `safeParse()` — nunca `.parse()`.
> 5. CheckoutModal está refactorizado en steps + hooks + useReducer.
> Reporta: (a) plan de cambio, (b) riesgos, (c) tests obligatorios, (d) checklist de verificación."

### 4. Consolidación

Después de recibir las 4 respuestas:

1. Consolidar el plan — priorizando lo que diga `backend`.
2. Crear TaskList con los pasos.
3. Ejecutar en orden: backend primero, frontend después, tests al final.
4. Correr `npx tsc --noEmit` + `npm run test -- __tests__/checkout` antes de cerrar.
5. Si tocó archivos en `DANGER_ZONES` del hook danger-zone, documentar la excepción.

### 5. Definition of Done del squad

- [ ] `npx tsc --noEmit` limpio
- [ ] `npm run test -- __tests__/checkout` verde (≥75 tests)
- [ ] `npm run lint` sobre los archivos tocados
- [ ] E2E `e2e/checkout*.spec.ts` y `e2e/checkout-confirmar-step.spec.ts` considerados (correr si el cambio es visible)
- [ ] Si hay nuevo step, nuevo state o nueva API → test unitario nuevo
- [ ] Changelog breve en el commit message con scope `checkout`

## Reglas críticas del skill

- **NUNCA** saltar el diagnóstico inicial
- **NUNCA** dispatchar sin leer las reglas del paso 2
- **NUNCA** mergear si `tester` flaggeó un test faltante
- Si el cambio es >5 archivos, proponer split en ≥2 PRs
- Si el cambio toca schema.prisma, delegar también a `database` y `migration-planner`
