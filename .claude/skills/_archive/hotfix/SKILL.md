---
name: hotfix
description: |
  Fast-path para correcciones mínimas (1 archivo, <20 líneas) — el tier HOTFIX
  del Fast-Path Routing (ADR-058). Aplica el fix directo + gates lint+tsc, sin
  el overhead de squads ni orquestadores. Usar cuando Brandon diga "hotfix",
  "fix rápido", "arregla esto ya", "1 línea", o el cambio es claramente trivial
  y de un solo archivo.
allowed-tools: Read, Edit, Bash, Grep, Glob
model: sonnet
argument-hint: "[archivo o descripción del fix]"
---

# /hotfix — corrección mínima con gates

Tier **HOTFIX** de CLAUDE.md §5: 1 archivo, <20 líneas, sin zona de peligro.

## Flujo
1. **Localizar**: Grep/Glob el síntoma → archivo exacto. Si toca >1 archivo o una
   zona de peligro (`components/checkout/**`, `lib/auth/role-permissions.ts`,
   `prisma/schema.prisma`, `proxy.ts`), **abortar** y escalar a FEATURE/DANGER.
2. **Leer** el archivo y el contexto inmediato (función/bloque afectado).
3. **Aplicar** el fix mínimo con Edit. Respetar las reglas críticas de CLAUDE.md §4
   (nada de `prisma.*` directo, `safeParse`, `tenantId`, no `force-dynamic`).
4. **Gates** (obligatorios antes de declarar listo):
   ```bash
   npm run lint
   NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit
   ```
5. Si verde → reportar diff + resultado. Si rojo → arreglar o revertir.

## Reglas
- NO tocar más de 1 archivo. Si el fix se ramifica, parar y proponer FEATURE.
- NO commitear salvo que Brandon lo pida (CLAUDE.md power rule).
- Verificar el comportamiento real cuando aplique (curl / dev-log / screenshot).
