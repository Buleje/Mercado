---
name: agent-router
description: Router inteligente que analiza la tarea y automaticamente selecciona y lanza el agente o squad optimo. Elimina la necesidad de que Brandon sepa que agente usar.
user-invocable: true
model: opus
---

# /agent-router — Enrutamiento inteligente de agentes

## Cuando usarlo
- AUTOMATICO: el Orquestador Principal usa este mapa mental antes de cada tarea
- MANUAL: `/agent-router [descripcion de la tarea]`
- Cuando Brandon describe algo vago y hay que decidir quien lo ejecuta

## Mapa de enrutamiento

### Por palabras clave en la tarea

| Palabras clave | Agente/Squad | Razon |
|---|---|---|
| "bug", "error", "rompe", "falla", "crash" | `bug-hunter` | Debugging especializado |
| "seguridad", "pentest", "vulnerable", "hack" | `security-squad` | Auditoria multi-capa |
| "checkout", "pago", "yape", "carrito", "cupon" | `checkout-squad` | Zona peligrosa |
| "lento", "performance", "bundle", "lighthouse" | `performance-squad` | Optimizacion CWV |
| "UI", "componente", "boton", "formulario", "pantalla" | `frontend-engineer` | UI pura |
| "API", "endpoint", "ruta", "backend" | `backend-platform-engineer` | Logica server |
| "base de datos", "query", "migracion", "prisma", "indice" | `database-engineer` | DB pura |
| "WhatsApp", "Stripe", "SUNAT", "integracion" | `integration-specialist` | External APIs |
| "test", "cobertura", "vitest", "playwright" | `test-writer` + `qa-reliability-engineer` | Testing |
| "SEO", "Google", "metadata", "sitemap" | `seo-growth-strategist` | Growth |
| "deploy", "CI", "vercel", "env" | `devops-release-engineer` | Infra |
| "refactor", "limpiar", "ordenar", "split" | `refactoring-expert` | Code quality |
| "modulo nuevo", "feature grande", "sprint" | `full-stack-squad` | Cross-layer |
| "arquitectura", "sistema", "diseno", "ADR" | `solution-architect` | Decisiones |

### Por archivos tocados

| Patron de archivo | Agente forzado |
|---|---|
| `components/checkout/**`, `CheckoutModal.tsx` | `checkout-squad` (obligatorio) |
| `prisma/schema.prisma` | `database-engineer` + `migration-planner` |
| `lib/auth/**`, `proxy.ts` | `security-auditor` (review) + agente de la tarea |
| `app/api/**` | `backend-platform-engineer` |
| `components/**` (no checkout) | `frontend-engineer` |
| `lib/db/**` | `database-engineer` |
| `.github/workflows/**` | `devops-release-engineer` |

### Por complejidad detectada

| Archivos estimados | Capas | Accion |
|---|---|---|
| 1-3 | 1 | Agente solo, directo |
| 4-10 | 1-2 | Agente + QA review |
| 10-20 | 2-3 | Squad de 3-4 agentes |
| 20+ | 3+ | `full-stack-squad` o `/enterprise-initiative-orchestration` |

## Formato de decision

Al recibir una tarea, el router emite:

```markdown
## Router Decision

**Tarea:** [descripcion]
**Clasificacion:** [palabras clave detectadas]
**Archivos estimados:** [rango]
**Capas:** [lista]
**Agente/Squad seleccionado:** [nombre]
**Razon:** [1 linea]

Arranco con [agente].
```

## Override manual

Brandon puede decir:
- "usa [agente-especifico]" → override del router
- "usa squad" → fuerza full-stack-squad
- "hazlo tu solo" → Orquestador ejecuta sin delegar

## Regla de oro

Si hay DUDA entre agente solo vs squad → elegir squad.
Es mejor sobre-prepararse que sub-prepararse.
El costo extra de un squad (3-4x tokens) se justifica con calidad.
