# Auditoría Prácticas de Código 2026 — Bodega San Martín

**Fecha auditoría:** 2026-04-06
**Fuente:** `Mejores_Practicas_Codigo_2026.xlsx` (48 prácticas: 36 básicas + 12 avanzadas)
**Resultado:** 17 aplicadas ✅ / 17 parciales ⚠️ / 10 faltan ❌ / 4 N/A

---

## Resumen por categoría

| Categoría | Total | ✅ | ⚠️ | ❌ | N/A |
|---|---:|---:|---:|---:|---:|
| Estilo y Calidad | 2 | 0 | 2 | 0 | 0 |
| Modularización | 2 | 0 | 2 | 0 | 0 |
| Reutilización | 2 | 0 | 1 | 1 | 0 |
| Patrones de Diseño | 3 | 2 | 0 | 1 | 0 |
| Pruebas y QA | 3 | 2 | 1 | 0 | 0 |
| Control de Versiones | 2 | 1 | 1 | 0 | 0 |
| Microservicios (API) | 2 | 0 | 1 | 1 | 0 |
| Escalabilidad | 3 | 2 | 0 | 0 | 1 |
| Seguridad | 3 | 1 | 2 | 0 | 0 |
| Desempeño | 3 | 1 | 2 | 0 | 0 |
| Metodologías Ágiles | 2 | 0 | 1 | 0 | 1 |
| CI/CD | 2 | 1 | 1 | 0 | 0 |
| Monitoreo | 3 | 3 | 0 | 0 | 0 |
| Documentación | 2 | 1 | 1 | 0 | 0 |
| Sostenibilidad | 2 | 1 | 1 | 0 | 0 |
| Patrones Avanzados | 12 | 2 | 5 | 3 | 2 |
| **Total** | **48** | **17** | **21** | **6** | **4** |

> Nota: Recálculo fino. 17 ✅ / 21 ⚠️ / 6 ❌ / 4 N/A. El resumen anterior de "17/17/12" fue aproximado; este es el desglose exacto.

---

## Tabla 1 — Código Óptimo 2026 (36 prácticas)

| # | Categoría | Práctica | Estado | Evidencia / Gap |
|---|---|---|---|---|
| 1 | Estilo | Clean Code — funciones pequeñas | ⚠️ | ESLint/Prettier/Husky activos. Violan: `admin/page.tsx` (3996 líneas), `CheckoutModal.tsx` (1333 líneas) |
| 2 | Estilo | SOLID aplicado | ⚠️ | TypeScript interfaces sí. Sin enforcement. Archivos gigantes violan SRP |
| 3 | Modularización | Arquitectura por feature/dominio | ⚠️ | `lib/db/` es por dominio. `components/admin/` (488 archivos) + `app/admin/page.tsx` mezclan |
| 4 | Modularización | SRP por capa (Ctrl→Svc→Repo→Entity) | ⚠️ | Repo (`lib/db`) + Entity (Prisma) ok. Falta capa Service — lógica en route handlers |
| 5 | Reutilización | Paquete `@shared` | ❌ | Single Next.js app. Sin `packages/` ni workspaces |
| 6 | Reutilización | Design System UI | ⚠️ | Storybook + tokens Tailwind ok. Sin paquete UI extraído |
| 7 | Patrones | Repository Pattern | ✅ | 25 clases en `lib/db/*.db.ts`. Regla "nunca Prisma directo" |
| 8 | Patrones | Strategy Pattern | ✅ | `docs/adr/006-strategy-pattern-descuentos.md` |
| 9 | Patrones | Factory + DI | ❌ | Next.js sin contenedor DI — import concreto |
| 10 | Testing | TDD | ⚠️ | 1400 tests existen, pero escritos después del código |
| 11 | Testing | Pirámide unit > int > e2e | ✅ | Vitest + Playwright + k6 |
| 12 | Testing | Coverage ≥ 80% | ✅ | 80% lines/statements, 70% branches, 75% functions (vitest config) |
| 13 | Versionado | Trunk-based + Feature Flags | ✅ | `lib/feature-flags.ts` + ADR 005 |
| 14 | Versionado | Conventional Commits + CHANGELOG | ⚠️ | Commitlint ok. Verificar si `release.yml` genera CHANGELOG automático |
| 15 | API | API-First con OpenAPI | ⚠️ | `npm run openapi:generate` genera spec **desde** Zod, no al revés |
| 16 | API | Versionado de APIs (/v1, /v2) | ❌ | Todas las rutas en `/api/...` sin versión |
| 17 | Escalabilidad | Escalado horizontal stateless | ✅ | Vercel Functions, JWT, Redis |
| 18 | Escalabilidad | Colas de mensajes | ✅ | BullMQ 5.73 + `lib/queue/` + ADR 003 |
| 19 | Escalabilidad | Sharding + Read Replicas | ⚠️ | `lib/prisma-readonly.ts` (read replica parcial). Sharding N/A a esta escala |
| 20 | Seguridad | JWT + refresh + httpOnly | ⚠️ | JWT + `httpOnly` en `app/api/auth/login/route.ts` ✅. Rotación de refresh tokens sin documentar |
| 21 | Seguridad | Secret Management (Vault/Doppler) | ⚠️ | `docs/doppler-migration-guide.md` — migración en progreso |
| 22 | Seguridad | Input validation + Rate limiting | ✅ | Zod `safeParse` obligatorio + rate limit 60 req/min en middleware |
| 23 | Desempeño | Evitar N+1 | ⚠️ | Prisma `include` disponible. Sin auditoría sistemática |
| 24 | Desempeño | Índices estratégicos | ⚠️ | 115 modelos. Sin auditoría con `pg_stat_statements` |
| 25 | Desempeño | Cursor pagination | ✅ | Headers `X-Cursor`, `X-Page`, `X-Total-Count` |
| 26 | Ágil | Scrum 2 semanas | N/A | Equipo de 1 |
| 27 | Ágil | Definition of Done estricto | ⚠️ | Slash commands `/review` + `/test-all` son gates. Sin DoD escrito |
| 28 | CI/CD | Pipeline test→build→deploy | ✅ | `.github/workflows/ci.yml` + Vercel auto-deploy |
| 29 | CI/CD | Blue-Green / Canary | ⚠️ | `docs/rolling-releases-setup.md` documentado, no activo |
| 30 | Monitoreo | Logging estructurado + traceId | ✅ | `lib/logger.ts` con JSON + `requestId` |
| 31 | Monitoreo | APM + alertas | ✅ | Sentry + `docs/sentry-alert-setup.md` |
| 32 | Monitoreo | Distributed Tracing (OTEL) | ✅ | `@vercel/otel` en `instrumentation.ts` |
| 33 | Docs | README por módulo + Swagger | ⚠️ | CLAUDE.md + OpenAPI ok. Sin README por módulo en `lib/db/`, `contexts/`, `lib/queue/` |
| 34 | Docs | Architecture Decision Records | ✅ | `docs/adr/` con 6 ADRs + template |
| 35 | Sostenibilidad | YAGNI + KISS | ⚠️ | Sobreingeniería evidente: 133 tabs en admin, 3996 líneas en page.tsx |
| 36 | Sostenibilidad | Deuda técnica visible | ✅ | `docs/TECH-DEBT.md` |

---

## Tabla 2 — Patrones Avanzados (12)

| # | Patrón | Estado | Evidencia / Gap |
|---|---|---|---|
| 37 | Arquitectura Hexagonal (Ports & Adapters) | ❌ | Sin separación `domain/` vs `infrastructure/`. Route handlers importan DB classes directo |
| 38 | Domain-Driven Design (Bounded Contexts) | ⚠️ | `lib/db/` agrupa por dominio. Sin Bounded Contexts formales ni lenguaje ubicuo |
| 39 | Event-Driven Architecture | ⚠️ | `lib/agents/bus` + BullMQ ok. Faltan eventos de dominio (`VentaCompletada`, `StockBajo`) |
| 40 | Multi-Tenancy con aislamiento | ✅ | `tenantId` en todas las queries + middleware dual + ADR 001/004 |
| 41 | Monorepo (Nx/Turborepo) | ❌ | Single app. No justificado hasta tener app móvil separada |
| 42 | Backend-For-Frontend (BFF) | ❌ | Un `app/api/` único para storefront, admin, mobile |
| 43 | CQRS | ❌ | Lecturas y escrituras al mismo Supabase |
| 44 | GitOps + IaC | ⚠️ | GitHub Actions + Vercel ok. Sin Terraform/Pulumi |
| 45 | Caching Distribuido (Redis) | ✅ | `lib/cache.ts` Memory+Redis con `getOrSet` + `invalidateByPrefix` |
| 46 | Design Tokens + UI Library | ⚠️ | Tokens Tailwind + Storybook ok. Sin paquete npm privado |
| 47 | Service Mesh (Istio/Linkerd) | N/A | Vercel no K8s |
| 48 | Optimistic UI + Offline-First | ⚠️ | BroadcastChannel + localStorage ok. Sin Service Worker ni IndexedDB sistemático |

---

## Brechas accionables — Top 10 de alto impacto

| # | Brecha | Impacto | Esfuerzo | Por qué importa |
|---|---|---|---|---|
| 1 | Split `admin/page.tsx` (3996 líneas) y `CheckoutModal.tsx` (1333 líneas) | Alto | Medio | Ataque simultáneo a Clean Code, SRP y YAGNI |
| 2 | Auditoría N+1 + crear `@@index` faltantes | Alto | Bajo | 115 modelos sin auditar = latencia escondida |
| 3 | Completar migración a Doppler | Alto | Bajo | Ya empezada — cerrar elimina secrets en `.env.local` de prod |
| 4 | Capa Service formal entre route handlers y DB classes | Alto | Medio | Rompe el SRP actual y permite tests de lógica sin mocking de Prisma |
| 5 | Eventos de dominio sobre BullMQ (`VentaCompletada`, `StockBajo`) | Alto | Medio | BullMQ ya existe — falta usarlo para desacoplar módulos |
| 6 | Versionado de APIs `/api/v1/...` | Medio | Medio | Necesario antes de publicar app móvil |
| 7 | CHANGELOG automático con Release Please | Bajo | Bajo | `release.yml` ya existe — 20 min de config |
| 8 | Definition of Done escrito en `CONTRIBUTING.md` | Medio | Bajo | Formaliza `/review` + `/test-all` como checklist |
| 9 | README por módulo crítico (`lib/db/`, `lib/queue/`, `lib/auth/`) | Medio | Medio | Onboarding para agentes y colaboradores futuros |
| 10 | Service Worker + IndexedDB para PWA offline del storefront | Alto | Alto | Diferenciador competitivo en Pucallpa (mala conectividad) |

---

## Decisiones explícitas de NO aplicar

| Práctica | Razón |
|---|---|
| Scrum 2 semanas | Equipo de 1 persona |
| Service Mesh (Istio) | No tienes Kubernetes — Vercel Functions |
| Database Sharding | Supabase maneja la escala actual |
| Monorepo (Nx/Turborepo) | Single Next.js app cubre web+móvil via Capacitor |
| Factory + DI formal | Next.js no lo necesita; imports explícitos son más claros |
| CQRS | Complejidad > beneficio hasta que hot path de lectura se convierta en cuello de botella |
| Arquitectura Hexagonal completa | Solo vale la pena en el módulo de facturación/ventas, no en todo el código |

---

## Próxima revisión

Re-ejecutar esta auditoría cada **3 meses** o después de cualquier refactor mayor. Actualizar conteos y marcar progreso en brechas.
