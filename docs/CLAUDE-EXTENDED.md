# CLAUDE-EXTENDED.md — Contenido on-demand del proyecto Bodega San Martín

Este archivo contiene **todo el contenido del antiguo CLAUDE.md que NO era una regla siempre-on**. Vive en `docs/` como documentación extendida, no como contrato de reglas.

El CLAUDE.md principal (en el workspace root) solo contiene reglas siempre-aplicables. Todo lo narrativo, glosarios, explicaciones de módulos específicos y convenciones on-demand viven acá.

**Consulta on-demand:** cuando necesites entender el módulo delivery, chat, directorios, middleware, o el glosario Feynman, leé este archivo. No hace falta tenerlo cargado en contexto permanente.

---

## 📚 Tabla de contenidos

1. [Stack técnico completo](#stack-técnico-completo)
2. [Directorios del proyecto](#directorios-del-proyecto)
3. [Arquitectura — Admin tabs y code splitting](#arquitectura--admin-tabs-y-code-splitting)
4. [Auth — requireAdmin](#auth--requireadmin)
5. [Resolución de tenant (dual server+client)](#resolución-de-tenant)
6. [DB classes — convenciones](#db-classes--convenciones)
7. [Cache híbrido Memory+Redis](#cache-híbrido-memoryredis)
8. [Contexts React — tenant-scoped state](#contexts-react--tenant-scoped-state)
9. [Observabilidad (Sentry + OTEL + Clarity)](#observabilidad)
10. [Middleware proxy.ts + lib/middleware](#middleware-proxyts--libmiddleware)
11. [Módulo Delivery — Bloque D1](#módulo-delivery--bloque-d1)
12. [Módulo Chat — Bloque D2](#módulo-chat--bloque-d2)
13. [Módulo Reviews — Bloque D3](#módulo-reviews--bloque-d3)
14. [Patrón estándar de route handler](#patrón-estándar-de-route-handler)
15. [Glosario visual Feynman](#glosario-visual-feynman)
16. [Variables de entorno completas](#variables-de-entorno-completas)

---

## Stack técnico completo

- **Framework:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript 5
- **Styling:** Tailwind CSS 4 + brand `primary #00B4A6` / `secondary #f97316` + dark mode completo
- **ORM + DB:** Prisma 7 + Supabase PostgreSQL (131 modelos)
- **Validación:** Zod 4 con `safeParse()` en todos los boundaries
- **Animación:** Framer Motion 12 (usar `m` + `LazyMotion` para bundle) + GSAP 3
- **Mapas:** Leaflet · **PDFs:** jsPDF · **Excel:** xlsx · **Rich text:** TipTap · **Drag-and-drop:** dnd-kit
- **Pagos:** MercadoPago + Stripe + Yape (manual hoy → Culqi/Izipay en Sprint 3 del Plan Maestro)
- **Email:** Nodemailer + templates
- **Page builder:** Craft.js
- **Queues:** BullMQ 5.73 + Redis (ADR 003)
- **LLM:** Vercel AI Gateway (con failover Groq → Anthropic → OpenAI, migrado 2026-04-08)
- **Monitoring:** Sentry (3 capas client/server/edge) + Vercel OTEL + Vercel Speed Insights + Microsoft Clarity + GTM-ready
- **Mobile:** Capacitor (app ID `pe.buleje.app`, web-dir `out`) — iOS/Android nativo desde la misma web

## Directorios del proyecto

```
app/              → Páginas y API routes (~485 route.ts files)
  (store)/        → Storefront (layout agrupado) — / redirige a /marketplace
  admin/          → Panel ERP — ~1256 líneas post-refactor, ~30 módulos en dynamic imports
    _lib/         → tabs.types.ts, tab-migration.ts, tab-spinner.tsx
  api/            → Route handlers REST
    v1/           → API versionada (migración gradual en curso)
components/admin/ → ~512 archivos de admin (un componente por tab + subcomponentes)
  OrdersTab/      → Extraído de admin/page.tsx en refactor 2026-04
components/checkout/ → Implementación real del CheckoutModal en steps + hooks + useReducer
components/CheckoutModal.tsx → Re-export de 16 líneas hacia components/checkout/CheckoutModal
contexts/         → 10 context providers (cart, customer, settings, theme, toast, tenant, favorites, compare, reviews, promotions)
hooks/            → 27 custom hooks
lib/db/           → 37 DB classes — SIEMPRE usar estos, nunca Prisma directo
  index.ts        → Barrel export de todas las DB classes
lib/domain-events/ → Domain events server-side (VentaCompletada, StockBajo, FacturaEmitida) sobre BullMQ
lib/events.ts     → Client-side DOM CustomEvents (storefront, NO confundir con domain-events)
lib/queue/        → BullMQ 5.73 — connection, workers, queues, dashboard (ADR 003)
lib/agents/       → Orquestador, bus, registro, persistencia (6 módulos de dominio)
lib/auth/         → RBAC: role-permissions.ts (26 recursos × 6 roles) + require-admin.ts (guard de API)
lib/cache.ts      → Capa híbrida Memory+Redis — getOrSet(), invalidate(), invalidateByPrefix()
lib/feature-flags.ts → Sistema de feature flags (ADR 005, 22 flags activas)
lib/logger.ts     → Logger estructurado JSON con requestId
lib/prisma-readonly.ts → Read replica para queries pesadas de analytics
lib/tenant-fetch.ts → Wrapper de fetch que inyecta x-tenant-id automáticamente (client-side)
lib/middleware/   → 6 módulos del proxy.ts split (ADR 014)
lib/middleware-utils.ts → Request ID, CSP, rate limiting, nonce (sin tenant resolution)
lib/env.ts        → Validación de env vars al startup (llamado desde instrumentation.ts)
lib/prisma.ts     → Singleton de Prisma
prisma/           → Schema (131 modelos), migrations, seed
__tests__/        → Vitest unit tests (jsdom, alias @/ = raíz, mock server-only en __mocks__/)
  checkout/       → Tests del CheckoutModal (red de seguridad para refactor)
e2e/              → Playwright e2e
docs/adr/         → 17 ADRs activos (001-016 + templates) + próximos 017/018/019
docs/ARCHITECTURE.md → Ancla arquitectónica — capas, flujo multi-tenant, módulos, flujos e2e
docs/ONBOARDING.md   → Guía de primer día para humanos y agentes Claude
docs/plans/       → Explore-Plan-Execute: un plan por feature grande
docs/CLAUDE-EXTENDED.md → Este archivo — contenido on-demand del antiguo CLAUDE.md
docs/ROADMAP-24-WEEKS.md → Plan maestro 24 semanas (ADR 016)
.claude/agents/   → 19 agentes invocables del proyecto
.claude/skills/   → 14 skills locales del proyecto
.claude/hooks/    → 5 hooks de Claude Code locales
.claude-plugin/plugin.json → Manifest del plugin `bodega-claude-pack` v0.1.0
.github/PULL_REQUEST_TEMPLATE.md → Definition of Done checklist
```

## Arquitectura — Admin tabs y code splitting

Cada tab en `app/admin/page.tsx` usa `next/dynamic(() => import(...), { loading: () => <TabSpinner /> })`.
**Nunca importar módulos admin directamente** — siempre dynamic import con loading skeleton.

## Auth — `requireAdmin`

`requireAdmin()` retorna `SessionPayload | NextResponse`:

```typescript
const auth = await requireAdmin(req, ["admin", "cajero"]);
if (auth instanceof NextResponse) return auth; // Auth falló — retornar la respuesta de error
// auth.tenantId, auth.role, auth.username disponibles
```

`SessionPayload`: `{ role: AdminRole, username: string, tenantId: string }`
Roles: `admin | cajero | almacenero | proveedor | delivery | tienda_owner`

## Resolución de tenant

Dual: **server-side** (`proxy.ts` middleware) + **client-side** (`lib/tenant-fetch.ts`).

**Server-side** (`proxy.ts`, orquestador de 117 líneas + módulos en `lib/middleware/`):
1. Hostname (`slug.localhost:3000`, `slug.bodegasaas.com`) — producción
2. Path `/t/{slug}/` — rewrite a ruta real + inyecta header + cookie
3. Referer header (`/t/{slug}/admin`) — seguro per-request/per-tab
4. Cookie `active-tenant` — compartida entre tabs, puede estar stale
5. JWT de sesión (`bsm-admin-sess`) — decode base64 del payload
6. Default: `"main"`

**Client-side** (`lib/tenant-fetch.ts`):
1. `sessionStorage("active-tenant-slug")` — override por tab
2. Path URL `/t/{slug}/`
3. Subdominio (`demo.buleje.com` → "demo")
4. `localStorage("active-tenant-slug")` — fallback cross-tab
5. Default: `"main"`

**Seguridad:** el middleware ignora `x-tenant-id` enviado por el cliente y audita discrepancias como posible inyección.

## DB classes — convenciones

Cada clase exporta un objeto `NameDB` con métodos que **siempre reciben `tenantId` como primer parámetro**:

```typescript
const result = await BatchesDB.getAll(tenantId, filters);
const item = await ProductsDB.getById(tenantId, id);
const events = await DeliveryTrackingDB.listByOrder(tenantId, orderId);
```

Convenciones de tipos: `DbBatch`, `DbBatchCreateInput`, `DbBatchUpdateInput`, `DbBatchFilters`.
Fechas siempre como ISO strings con helpers `toISO()`, `toDateOnly()`.

**Patrones válidos:**
- **Prisma tipado** — default (la mayoría de DB classes usan `prisma.model.findMany/create/...`)
- **Raw SQL via `prisma.$queryRawUnsafe` / `$executeRawUnsafe`** — para módulos donde la SQL fue aplicada manualmente contra Supabase (ej. `delivery.db.ts`, `chat.db.ts`, patrón bloque D del marketplace). Siempre con parámetros posicionales `$1 $2 $3` para prevenir injection, nunca string interpolation.

## Cache híbrido Memory+Redis

- **Sin `REDIS_URL`**: cache en memoria del proceso (MemoryStore)
- **Con `REDIS_URL`**: write-through a Redis (lecturas síncronas de memoria local, escrituras fire-and-forget a Redis)
- `getOrSet<T>(key, ttlSec, fn)` — compute si no existe en cache
- `invalidate(key)` / `invalidateByPrefix(prefix)` — invalidación después de writes
- Redis se importa con `globalThis.Function("return require")()` para evitar bundling por Turbopack

**Bug conocido:** el warm-up de Redis primera-vez devuelve `null` en el primer hit de cada instancia — anulando el cache distribuido temporalmente. Ver perf audit Sprint 1 del plan maestro.

## Contexts React — tenant-scoped state

10 context providers, todos `"use client"`. Convenciones:

- localStorage con claves tenant-scoped: `bsm-{slug}-{key}`
- `BroadcastChannel` para sync en tiempo real entre tabs (mismo tenant)
- `useReducer` para estado complejo (cart, settings)
- `TAB_ID = crypto.randomUUID()` para identificar instancia de tab

## Observabilidad

- `instrumentation.ts` registra OpenTelemetry via `@vercel/otel` (service name: `bodega-san-martin`)
- `lib/env.ts` valida env vars requeridas al startup — falla ruidosamente si faltan en producción
- Sentry configurado en 3 capas: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Vercel Speed Insights + Microsoft Clarity activos

## Middleware `proxy.ts` + `lib/middleware/`

`proxy.ts` es el Routing Middleware de Next.js 16 (rebrand de Vercel — antes `middleware.ts`). Ejecuta en CADA request excepto estáticos. Desde 2026-04-08 (ADR 014, TD-013 cerrada) es un orquestador delgado de **117 líneas** con 12 pasos numerados que compone módulos focalizados bajo `lib/middleware/`:

- `lib/middleware/constants.ts` — `ROOT_DOMAIN`, prefix arrays, public-write allow-list
- `lib/middleware/tenant.ts` — `resolveTenantFromHost` + `resolveTenantMultiSource` (Referer → cookie → JWT)
- `lib/middleware/security-headers.ts` — `applySecurityHeaders` wrapper sobre `buildCSP`
- `lib/middleware/slug-routes.ts` — rewrites `/t/{slug}/*` (3 casos)
- `lib/middleware/auth-guards.ts` — 5 guards async (admin, superadmin API/pages, write-protected)
- `lib/middleware/cross-tenant-audit.ts` — logger fire-and-forget de intentos de inyección

`lib/middleware-utils.ts` queda como pure helpers reutilizables entre `proxy.ts`, route handlers y tests.
`lib/tenant-fetch.ts` es el wrapper de fetch client-side que inyecta `x-tenant-id`.

Desde Sprint 1 2026-04-08 el matcher excluye `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, `llms.txt`, `og-image*`, assets estáticos `.avif/.js/.css/.map` — -20-40% invocaciones.

## Módulo Delivery — Bloque D1

**Objetivo de negocio:** el cliente ve EN VIVO dónde está su pedido (como Rappi). El repartidor arma su ruta del día. El dueño del tenant ve todo en un mapa.

**Arquitectura por capas:**

```
app/api/track/[orderId]/route.ts          ← endpoint PÚBLICO (sin login) — link WhatsApp
app/api/admin/delivery/
  ├── tracking/route.ts                    ← POST eventos + GET timeline/feed vivo
  ├── routes/route.ts                      ← POST/GET/PATCH rutas del día
  └── routes/[routeId]/stops/route.ts      ← POST/GET/PATCH paradas de ruta
lib/db/delivery.db.ts                      ← 3 DB classes (797 líneas)
prisma/schema.prisma                       ← 3 modelos + 8 campos nuevos en Order
prisma/migrations/MANUAL-marketplace-bloque-d1.sql  ← SQL raw aplicado a Supabase
__tests__/delivery-db.test.ts              ← 16 tests unitarios (prisma mockeado)
scripts/seed-delivery-demo.ts              ← seed con coordenadas reales de Pucallpa
```

**3 DB classes:** `DeliveryTrackingDB`, `DeliveryRoutesDB`, `DeliveryRouteStopsDB`.

**Patrón raw-SQL documentado:** este módulo usa `prisma.$executeRawUnsafe` / `$queryRawUnsafe` porque la SQL del bloque D1 fue aplicada manualmente contra Supabase. Ver ADR 011.

**Auto-cascada crítica:** al llegar un evento `DeliveryTrackingDB.add({ status: 'delivered' })`, el código propaga automáticamente `deliveryStatus` y `deliveredAt` al `Order` asociado en la misma transacción implícita.

**Endpoint público `GET /api/track/[orderId]`:** expone campos seguros solamente (primer nombre del cliente, NO apellidos; NO tenantId; NO notas internas). Cache 15s + `noindex, nofollow`. Es el link que viaja por WhatsApp al cliente final.

## Módulo Chat — Bloque D2

**Objetivo de negocio:** el buyer y el seller chatean 1-a-1 dentro de la plataforma — soporte post-venta, consultas de precio, atención al cliente — sin depender de WhatsApp como canal primario.

**2 DB classes:** `ChatThreadsDB` (openOrGet idempotente, listByTenant, close) · `ChatMessagesDB` (send transaccional, listByThread, markAsRead).

**Patrón clave:** unique index parcial en `ConversationThread` garantiza "un solo hilo abierto por (storeId, customerPhone, orderId)". Permite N hilos cerrados con los mismos identificadores pero solo 1 abierto.

**Auto-cascada crítica:** `ChatMessagesDB.send()` es transaccional e incrementa el unread counter del **otro lado** en la misma transacción. Si `senderType = 'buyer'`, bump `unreadForSeller`; si es `seller`, bump `unreadForBuyer`.

**Polling vs Realtime:** Fase 2 usa polling HTTP (5s messages, 8s threads) porque es más simple. Ver ADR 012 para path a Supabase Realtime.

**Feature flags:**
- `marketplace-chat` — habilita el tab admin
- `marketplace-chat-public` — habilita el endpoint público del buyer
- `marketplace-chat-whatsapp` — habilita el worker de notificaciones
- `marketplace-chat-realtime` — reservado para Fase 3

## Módulo Reviews — Bloque D3

Reviews verificadas con moderación admin + widget storefront. Ver ADR 013 y feature flags `marketplace-reviews`, `marketplace-reviews-public`, `marketplace-reviews-widget`.

## Patrón estándar de route handler

```typescript
export const dynamic = "force-dynamic";

const BodySchema = z.object({ ... });

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });

  const result = await SomeDB.create({ ...parsed.data, tenantId: auth.tenantId });
  logActivity({ ... }).catch(() => {});

  return NextResponse.json({ data: result });
}
```

Headers de paginación: `X-Total-Count`, `X-Page`, `X-Cursor`.

## Glosario visual Feynman

> Si vas a explicarle algo del código a Brandon, usá la columna derecha. Si en el código aparece la columna izquierda, en tu respuesta poné la derecha entre paréntesis.

| Término técnico | Qué significa en simple |
|---|---|
| **Tenant / `tenantId`** | Cada bodega cliente del sistema. Como un departamento en un edificio: comparten las paredes pero cada uno tiene su llave. |
| **Multi-tenant SaaS** | Un solo sistema que sirve a varias bodegas a la vez sin que se mezclen los datos. Como un Netflix donde cada familia ve su propio perfil. |
| **`requireAdmin()`** | Portero del sistema: chequea si quien entra tiene credenciales de admin antes de dejarlo pasar. |
| **DB classes (`lib/db/*.db.ts`)** | "Cajas registradoras" del sistema: cada una sabe sumar/restar/guardar lo suyo. Nunca tocar Prisma directo, usar siempre estas cajas. |
| **Prisma** | El traductor entre el código y la base de datos. Como un mesero que lleva tu pedido a la cocina. |
| **`safeParse()` de Zod** | Verificar que lo que llega del cliente NO esté roto, sin que el sistema explote. Como revisar un billete antes de aceptarlo. |
| **`proxy.ts` / middleware** | Filtro de seguridad que revisa CADA visita antes de dejarla entrar al sistema. Como el guardia de un edificio con cámara y lista de invitados. |
| **Cache híbrido** | Memoria rápida: en vez de ir a la base de datos cada vez, recuerda las cosas que ya consultó. Como anotar el pedido del cliente habitual en un papelito al lado de la caja. |
| **Invalidar caché** | Borrar la memoria rápida cuando algo cambió, para que la próxima vez se vuelva a consultar real. |
| **BullMQ / colas** | Una fila de tareas que se hacen solas en el fondo. Como dejar la ropa en la lavadora mientras hacés otra cosa. |
| **Workers** | Los empleados invisibles que ejecutan las tareas de la fila. Trabajan 24/7. |
| **N+1 query** | Bug clásico: en vez de pedir 100 cosas en 1 viaje, el sistema hace 100 viajes a la base. Como ir 100 veces al mercado en vez de 1 con lista. |
| **Idempotencia** | Si la misma operación se ejecuta 2 veces sin querer, NO causa daño. Como apretar el botón del ascensor 5 veces — sigue siendo 1 viaje. |
| **Rate limiting** | Limitar cuántas veces alguien puede pegarle al sistema por minuto. Como un baño con candado que solo deja entrar una persona cada 30 segundos. |
| **JWT / cookie de sesión** | Una pulserita digital que el sistema te pone cuando entrás, para reconocerte sin pedirte la contraseña en cada página. |
| **Route handler** | Las "puertas" del sistema por donde el cliente pide cosas (ver productos, comprar, etc.). |
| **`force-dynamic`** | Cartel en la puerta del route handler que dice "no me cachees, siempre vivo". |
| **Domain event** | Aviso interno del sistema cuando algo importante pasa, para que otros módulos reaccionen. Como un timbre en la cocina del restaurante. |
| **BroadcastChannel** | Sistema para que dos pestañas del navegador del MISMO usuario se sincronicen. Como walkie-talkies entre las pestañas. |
| **`useReducer`** | Forma ordenada de manejar estado complejo en React. Como tener un libro contable en vez de papelitos sueltos. |
| **Dynamic import** | Cargar partes del sistema solo cuando se necesitan, no todo al inicio. Como ir al supermercado solo cuando te falta algo. |
| **Capacitor** | Lo que convierte el código web en app de iOS/Android nativa. Como meter una página web dentro de un envase de app. |
| **Sentry** | Cámara de seguridad del sistema: cuando algo se rompe en producción, manda alerta con foto del problema. |
| **OTEL / OpenTelemetry** | Sistema de monitoreo que mide cuánto tarda cada parte del código. Como un cronómetro pegado a cada empleado. |
| **Fire-and-forget** | Disparar una tarea y olvidarse del resultado. Como tirar una carta al buzón y nunca chequear si llegó. |
| **Read replica** | Copia de la base de datos solo para LEER (consultas pesadas no molestan al original). Como tener una fotocopia del libro contable para que el contador trabaje sin interrumpir al cajero. |
| **Feature flag** | Interruptor para encender/apagar una feature sin tocar código. Como una llave de luz para cada cuarto del sistema. |
| **ADR (Architecture Decision Record)** | Documento que dice "decidimos hacer esto así porque...". Como las actas de una reunión importante. |
| **Husky pre-commit** | Robot que revisa el código antes de dejarte hacer commit. Como un editor que te corrige antes de mandar la carta. |
| **Conventional Commits** | Forma estándar de escribir mensajes de commit para que un robot los entienda. |

## Variables de entorno completas

Ver `.env.example` del proyecto — está documentado con todas las secciones (Base de datos, Auth, SMTP, Sentry, SUNAT/Nubefact, Tests E2E, LLM/AI Gateway, WhatsApp Business Cloud, Stripe Connect, MercadoPago, RENIEC, Google Maps, VAPID Push, Redis, CRON, Analytics, y nota del roadmap).

Producción requiere mínimo: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET` (validados por `lib/env.ts`).

---

**Última actualización:** 2026-04-08 — archivo creado en el refactor de CLAUDE.md a versión delgada (FASE D Sprint 1 Plan Maestro).
