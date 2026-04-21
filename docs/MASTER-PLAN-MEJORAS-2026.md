# Master Plan de Mejoras — Buleje 2026

**Fecha:** 2026-04-20
**Auditoría base:** 3 exploraciones paralelas (backend/security, frontend/UI/SEO, tests/devops)
**Total hallazgos:** 30 — 4 P0 / 12 P1 / 12 P2 / 2 P3
**Uso del documento:** copia el bloque que querés ejecutar y pegámelo como prompt — ejemplo: *"ejecuta P0 #1 del master plan"*.

---

## Resumen ejecutivo

| Capa | Salud | Acción dominante |
|---|---|---|
| **Seguridad** | 🔴 Crítica | Sacar `.env` del repo + CSRF en 36 endpoints |
| **SEO** | 🟡 85% sólido | Cerrar rutas fantasma + canonical + JSON-LD recetas |
| **UI/UX** | 🟢 70% rediseñada | Estandarizar páginas restantes (mi-cuenta, /tiendas, categoría) |
| **Backend** | 🟢 68 endpoints reales | Cerrar Yape/Plin, rate limit en 28 públicos, abstraer 91 modelos |
| **Tests** | 🟡 232 unit + 28 e2e | Cubrir RBAC, cart context, Mercadopago webhooks |
| **CI/CD** | 🟢 Activo | Branch protection + CRON_SECRET audit |
| **Performance** | 🟡 Buena base | Bundle analyzer + auditar peso framer-motion (161 archivos) |
| **Mobile/PWA** | 🟢 Activo | Capacitor opcional para app nativa |
| **Monitoring** | 🟢 Sentry + OTEL + healthchecks | Webhooks Discord/Slack + cost reports |
| **Data/FinOps** | 🟢 Crons + backups | Cost tracking automático |

---

## 🔴 P0 — BLOQUEANTES PRE-PRODUCCIÓN (4 items)

> **No deployar a clientes reales sin cerrar estos 4.**

### P0 #1 — `.env` versionado con credenciales reales

| Item | Valor |
|---|---|
| Archivo | `.env` (raíz del proyecto) |
| Riesgo | DATABASE_URL, GROQ_API_KEY, Supabase password expuestos en git history |
| Si el repo es público | Compromiso inmediato de DB + APIs de pago |
| Acción | 1) `.env` → `.gitignore`, 2) Rotar TODAS las credenciales (DB, Supabase, Groq, Stripe, MP), 3) `git filter-repo` para limpiar historia, 4) Re-deploy con env vars en Vercel |
| Tiempo | 2-3 h (incluye rotación) |

### P0 #2 — CSRF ausente en 36 POST endpoints marketplace

| Item | Valor |
|---|---|
| Archivos | `app/api/marketplace/**/route.ts` (POST/PATCH/PUT/DELETE) |
| Cobertura actual | 0/36 endpoints marketplace tienen CSRF check explícito |
| Riesgo | Cross-site request forgery: atacante puede crear órdenes/cupones/reviews en nombre de usuarios logueados |
| Acción | Aplicar `requireCsrf(req)` (ya existe en `lib/csrf.ts`) en cada handler. Patrón de migración ya documentado en `docs/CSRF_MIGRATION.md` |
| Tiempo | 4-6 h (script bulk + verificación manual) |

### P0 #3 — Ruta fantasma en sitemap: `/marketplace/recetas/[slug]`

| Item | Valor |
|---|---|
| Archivo | `app/sitemap.ts:207` |
| Síntoma | Sitemap declara URLs de recetas individuales que no tienen `page.tsx` correspondiente → 404 garantizado para Google |
| Riesgo | SEO penalizado por Google por broken links indexados |
| Acción | Crear `app/marketplace/recetas/[slug]/page.tsx` o eliminar las URLs del sitemap |
| Tiempo | 30 min (eliminar) o 2-3 h (crear página) |

### P0 #4 — `/marketplace/registrar` sin canonical (duplicate content)

| Item | Valor |
|---|---|
| Archivo | `app/marketplace/registrar/page.tsx` |
| Síntoma | Probable duplicado con `/marketplace/registro` u otra variante. Sin `metadata.alternates.canonical` |
| Riesgo | Google indexa ambas → penalización por duplicate content |
| Acción | Decidir cuál es la canónica + agregar `alternates: { canonical: '/marketplace/registrar' }` + redirect 301 si hay duplicado |
| Tiempo | 30 min |

---

## 🟠 P1 — CRÍTICOS POST-LANZAMIENTO (12 items)

### Backend & APIs

#### P1 #5 — Yape/Plin solo en enum, sin integración real

| Detalle | Valor |
|---|---|
| Archivo | `app/api/marketplace/orders/route.ts:71` (`z.enum(["efectivo", "yape", "mercado_pago"])`) |
| Síntoma | Cliente puede seleccionar "Yape" en checkout pero no hay flujo real de pago QR Yape ni webhook |
| Acción | a) Implementar generación QR Yape vía API o b) Mostrar mensaje "próximamente" + deshabilitar opción |
| Tiempo | 1 día (mostrar disabled) o 1 semana (integración real) |

#### P1 #6 — 28 endpoints públicos sin rate limit

| Detalle | Valor |
|---|---|
| Endpoints | `/api/marketplace/stores/apply`, `/stores/register`, `/qa/[id]/answer`, `/search`, `/autocomplete`, `/catalog`, etc. (28 totales) |
| Riesgo | Spam en signup, scraping de catálogo, enum attacks |
| Acción | Agregar `applyRateLimit(req, "STRICT|MODERATE|LAX")` a cada uno. Helper ya existe en `lib/rate-limit.ts` |
| Tiempo | 2-3 h (bulk + perfil por endpoint) |

#### P1 #7 — 91 modelos Prisma sin abstracción `lib/db/*.db.ts`

| Detalle | Valor |
|---|---|
| Estado | 158 modelos en schema.prisma vs 67 archivos .db.ts |
| Riesgo | Routes hacen prisma directo → no testeable, sin cache, sin audit, sin tenant isolation enforced |
| Acción | Identificar los 20 modelos más usados sin abstracción y crear sus .db.ts (SecurityIncident.db.ts, Coupon.db.ts, Sponsored.db.ts, etc.) |
| Tiempo | 2 semanas (incremental) |

#### P1 #8 — Live viewers TODO Redis

| Detalle | Valor |
|---|---|
| Archivo | `app/api/marketplace/stores/[slug]/live-viewers/route.ts` |
| Síntoma | Endpoint devuelve array vacío. Comentario `// TODO: connect UPSTASH_REDIS` |
| Acción | Conectar Upstash Redis (ya en .env.example) o eliminar la feature del UI hasta que esté |
| Tiempo | 4 h |

### UX/UI

#### P1 #9 — `/marketplace/mi-cuenta/*` muestra "—" (datos fake)

| Detalle | Valor |
|---|---|
| Archivo | `app/marketplace/mi-cuenta/page.tsx:35` |
| Síntoma | 7 subrutas muestran contadores "—" hardcoded. No hace fetch real de pedidos/cupones |
| Acción | Conectar a `/api/marketplace/mi-cuenta/pedidos` (existe) + `/coupons` user-scoped |
| Tiempo | 1 día |

#### P1 #10 — `alt=""` probable en 150+ imágenes sin auditoría

| Detalle | Valor |
|---|---|
| Detectado | Solo 3 instancias `alt=""` (decorativas legítimas) |
| Sospecha | Componentes que tiran imagen sin alt prop → fallback a string vacío automático |
| Acción | Script de audit `find components/ -name '*.tsx' -exec grep -L 'alt=' {} \;` y remediar |
| Tiempo | 1 día |

#### P1 #11 — JSON-LD Recipe falta en `/marketplace/recetas/[slug]`

| Detalle | Valor |
|---|---|
| Archivo | (cuando se cree, ver P0 #3) |
| Acción | Agregar schema `Recipe` con ingredientes, tiempo, autor, rating |
| Tiempo | 2 h (junto con P0 #3) |

### Tests

#### P1 #12 — RBAC sin unit tests

| Detalle | Valor |
|---|---|
| Archivo | `lib/auth/role-permissions.ts` (26 recursos × 6 roles = 156 combinaciones) |
| Riesgo | Cambios silenciosos en permisos pueden abrir endpoints admin a roles inferiores |
| Acción | Crear `__tests__/lib/auth/role-permissions.test.ts` con matriz completa grants/denies |
| Tiempo | 1 día |

#### P1 #13 — Mercadopago webhooks + create-preference sin E2E

| Detalle | Valor |
|---|---|
| Archivo | `app/api/marketplace/payment/mercadopago/{webhook,create-preference}/route.ts` |
| Riesgo | Bug en webhook puede dejar órdenes pagadas sin confirmar |
| Acción | `e2e/payment-mercadopago.spec.ts` con mock de signature + payment intent |
| Tiempo | 1 día |

#### P1 #14 — Cart context multi-tab sin tests

| Detalle | Valor |
|---|---|
| Archivo | `contexts/cart-context.tsx` (BroadcastChannel) |
| Riesgo | Bug en sync multi-tab → carrito desaparece o duplica |
| Acción | Unit test mock BroadcastChannel + scenarios add/remove/clear |
| Tiempo | 4 h |

### CI/CD

#### P1 #15 — Branch protection NO activa en master

| Detalle | Valor |
|---|---|
| Estado | CI corre pero no es bloqueante (sin required status checks) |
| Acción | Settings → Branches → Add rule: required PR review, required status checks (lint, tsc, test, build) |
| Tiempo | 15 min (configuración GitHub UI) |

#### P1 #16 — CRON_SECRET validation no auditado en 47 crons

| Detalle | Valor |
|---|---|
| Archivos | `vercel.json` declara 47 crons → revisar cada `app/api/cron/**/route.ts` |
| Riesgo | Cron endpoint sin auth = atacante puede dispararlos manualmente (DoS, data corruption) |
| Acción | Audit script: `grep -L "CRON_SECRET\|x-vercel-cron" app/api/cron/**/route.ts` |
| Tiempo | 3 h |

---

## 🟡 P2 — IMPORTANTES (12 items)

### Performance & Bundle

#### P2 #17 — Bundle analyzer no configurado en root

| Acción | Mover `.size-limit.json` desde worktrees a root + agregar a CI |
| Beneficio | Detectar regresiones de peso por commit |

#### P2 #18 — Auditar peso de framer-motion (161 archivos)

| Acción | Migrar componentes con animación trivial a `RevealOnScroll` (custom CSS), reservar framer-motion solo para layout animations complejas |
| Beneficio | Bundle -15-25% potencial |

### SEO

#### P2 #19 — `/marketplace/categoria/[slug]` metadata genérica

| Acción | `generateMetadata` dinámico por slug con title + description + keywords + canonical |
| Beneficio | 8 categorías con SEO único |

#### P2 #20 — `/zona/[ciudad]/producto/[slug]` sin metadata

| Acción | `generateMetadata` por ciudad+producto |

### Tests

#### P2 #21 — Tests a11y automatizados

| Acción | Integrar `axe-core` en Playwright e2e specs (`page.evaluate(() => axe.run())`) |
| Beneficio | Detectar regresiones a11y por PR |

#### P2 #22 — Visual regression de pasivo a CI gate

| Acción | Activar Chromatic como required status check en branch protection |

### UI/UX restantes

#### P2 #23 — `/tiendas` necesita hero + secciones editoriales

| Acción | Aplicar mismo patrón de `/explorar` y `/ofertas` |

#### P2 #24 — `/marketplace/categoria/[slug]` rediseño básico

| Acción | Hero + filtros sticky + grid con UnifiedProductCard + paginación |

#### P2 #25 — `/marketplace/recetas` hero asimétrico

| Acción | Aplicar bento o split hero estilo `EditorialFeature` |

### Monitoring & FinOps

#### P2 #26 — Sentry alerts sin webhooks Discord/Slack

| Acción | Sentry → Settings → Alerts → New Rule → Action: Webhook URL |

#### P2 #27 — Cost tracking sin reportes automáticos

| Acción | Cron `/api/cron/finops-report` semanal con totales por categoría |

#### P2 #28 — Docker-compose dev local

| Acción | Crear `docker-compose.yml` con Postgres + Redis para onboarding más fácil |

---

## 🟢 P3 — NICE-TO-HAVE (2 items)

#### P3 #29 — Capacitor para app nativa iOS/Android

| Estado | Documentado en `docs/CAPACITOR-GUIDE.md` pero sin config activa |
| Cuándo | Cuando tengas tracción web sólida (>1000 users activos) |

#### P3 #30 — OpenTelemetry en dev local

| Acción | Documentar setup Jaeger local opcional |

---

## Roadmap por sprints (5 semanas)

### Sprint S1 — Seguridad crítica (semana 1)

| Día | Tareas | Items |
|---|---|---|
| Lun-Mar | `.env` rotation + git history clean + CSRF script bulk | P0 #1, P0 #2 |
| Mié | Rate limit a 28 endpoints públicos + CRON_SECRET audit | P1 #6, P1 #16 |
| Jue | Branch protection + RBAC tests | P1 #15, P1 #12 |
| Vie | Verificación end-to-end + smoke tests | — |

### Sprint S2 — SEO + páginas fantasma (semana 2)

| Día | Tareas | Items |
|---|---|---|
| Lun | `/recetas/[slug]` página + JSON-LD Recipe | P0 #3, P1 #11 |
| Mar | `/registrar` canonical + audit duplicados | P0 #4 |
| Mié-Jue | Metadata dinámico `/categoria/[slug]` y `/zona/[ciudad]` | P2 #19, P2 #20 |
| Vie | Audit `alt=""` masivo + remediación | P1 #10 |

### Sprint S3 — Backend completar (semana 3)

| Día | Tareas | Items |
|---|---|---|
| Lun-Mar | Yape/Plin: disabled UI + roadmap real | P1 #5 |
| Mié | Live viewers Redis | P1 #8 |
| Jue-Vie | Mi-cuenta fetch real (pedidos + cupones) | P1 #9 |

### Sprint S4 — Tests críticos (semana 4)

| Día | Tareas | Items |
|---|---|---|
| Lun | Cart context multi-tab tests | P1 #14 |
| Mar-Mié | Mercadopago webhooks E2E | P1 #13 |
| Jue | Tests a11y axe-core en Playwright | P2 #21 |
| Vie | Visual regression como required check | P2 #22 |

### Sprint S5 — UI estandarización + perf (semana 5)

| Día | Tareas | Items |
|---|---|---|
| Lun | `/tiendas` rediseño con patrón `/explorar` | P2 #23 |
| Mar | `/marketplace/categoria/[slug]` rediseño | P2 #24 |
| Mié | `/marketplace/recetas` hero | P2 #25 |
| Jue | Bundle analyzer + framer-motion audit | P2 #17, P2 #18 |
| Vie | Sentry webhooks + FinOps cron | P2 #26, P2 #27 |

---

## Cómo usar este plan

| Acción | Prompt sugerido |
|---|---|
| Ejecutar 1 item | *"ejecuta P0 #2 del master plan (CSRF en POST endpoints)"* |
| Ejecutar un sprint completo | *"ejecuta Sprint S1 del master plan"* |
| Ejecutar por categoría | *"ejecuta todas las P0 + P1 de seguridad del master plan"* |
| Pedir más detalle de un item | *"detallame técnicamente cómo hacés P1 #13"* |
| Estimar costo de un sprint | *"cuántas horas de trabajo agente sería el Sprint S2?"* |

---

## Anexo — Items abandonados o no aplicables

| Item | Razón |
|---|---|
| Memory MCP | Redundante con auto-memory existente |
| Sequential-thinking MCP | Redundante con Opus 4.7 + plan mode |
| Filesystem MCP en `/` | Limitamos a `C:/dev` por seguridad |

---

## Referencias

- `docs/CSRF_MIGRATION.md` — patrón de migración CSRF
- `docs/PERF-AUDIT-2026-04-10.md` — auditoría performance previa
- `docs/CAPACITOR-GUIDE.md` — mobile nativa
- `docs/MERCADO-PAGO-SANDBOX.md` — pagos
- `lib/rate-limit.ts` — helper rate limit
- `lib/csrf.ts` — helper CSRF
- `lib/logger.ts` — logging estructurado
- `app/sitemap.ts` — generación sitemap (verificar línea 207)
