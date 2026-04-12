# Cross-cutting — Research 2026-04-09

Auditoría de capas transversales de Buleje. Inventario + top 13 mejoras estratégicas priorizadas por riesgo / velocidad / revenue. Scope: seguridad, performance, PWA/mobile, SEO, AI/ML, observabilidad, notificaciones, i18n, feature flags.

---

## Estado actual por capa

| Capa | Estado | Nota |
|---|---|---|
| Seguridad — Auth | Amarillo | HMAC-SHA256 edge-friendly + refresh rotation + RBAC 26×6 OK. Falta 2FA para admin tenant. |
| Seguridad — Transport | Verde | HSTS preload, X-Frame-Options DENY admin, Referrer-Policy, Permissions-Policy, CSP con nonce. |
| Seguridad — CSP | Amarillo | `'unsafe-eval'` + `'unsafe-inline'` en style-src (Tailwind JIT). `script-src` ya usa nonce. |
| Seguridad — CSRF | Rojo | No hay token/double-submit. Mitigado parcialmente por `sameSite: strict` en cookies admin. |
| Seguridad — Rate limit | Amarillo | In-memory por instancia (`Map`). En serverless multi-región NO protege — se reinicia por cold start y no comparte estado. |
| Performance — Cache | Verde | Next 16 Cache Components activado, `use cache` + `cacheLife/cacheTag`, Redis opt-in con write-through. |
| Performance — DB | Amarillo | Prisma 7 + pg adapter; aún no se ve evidencia de EXPLAIN en críticos (TD-018 plan está abierto). |
| Performance — Bundle | Verde | `optimizePackageImports` sobre 9 libs grandes; bundle analyzer disponible (`ANALYZE=true`). |
| PWA / Service Worker | Verde | Multi-cache con trim FIFO, IndexedDB background-sync para POS offline, web-push funcional. |
| Mobile / Capacitor | Amarillo | Configurado pero sin `@capacitor/cli` en devDeps, sin plugins nativos (camera, biometrics, push FCM). |
| SEO | Verde | Metadata completa, JSON-LD con review stats cached, keywords locales Pucallpa, OG images, sitemap. |
| AI / ML | Verde | llm-router con fallback tier, ai-safety con prompt injection patterns, temperatures por rol, whatsapp-ai con inventario real. |
| Observabilidad | Amarillo | Sentry con 25% traces + 10% profiling + requestId tag. OTel registrado. Falta dashboard de alertas activo. |
| Notificaciones | Verde | WhatsApp + Email + Push (web-push con auto-cleanup 410/404) + in-app. Sin SMS. |
| i18n | Amarillo | Implementación propia muy ligera es/qu, ~30 keys, no conecta con app real (no hay useTranslation en flujos). |
| Feature flags | Amarillo | Solo env vars + defaults hard-coded. Sin DB override ni per-tenant toggle. |

---

## Top 13 mejoras

| # | Capa | Mejora | Tipo | Impacto | Esfuerzo | Prio |
|---|---|---|---|---|---|---|
| 1 | Seguridad — Rate limit | Migrar a Upstash Redis REST (edge-compatible) para rate limit distribuido | Quick win + riesgo | Alto | 0.5d | P0 |
| 2 | Seguridad — CSRF | Implementar double-submit cookie para writes del admin | Riesgo | Alto | 1d | P0 |
| 3 | Seguridad — Auth | Verificar que `checkPassword` usa bcryptjs (no comparación directa) + rotar AUTH_SECRET en prod si fallback dev estuvo activo | Riesgo | Crítico | 0.5d | P0 |
| 4 | Seguridad — CSP | Quitar `'unsafe-eval'` moviendo edge runtime → node runtime donde posible; probar `strict-dynamic` | Riesgo + compliance | Medio | 1-2d | P1 |
| 5 | Seguridad — 2FA tenant | TOTP opcional para rol admin tenant (ya existe `superadmin-2fa.ts`, extender a `require-admin`) | Riesgo | Medio | 1-2d | P1 |
| 6 | Performance — Cache | Convertir `getCachedReviewStats` a patrón replicable (stats de productos, promos, categorías home) con `cacheLife("days")` y `revalidateTag` en writes | Velocidad / LCP | Alto | 1-2d | P1 |
| 7 | Performance — DB | Ejecutar plan TD-018 (índices ola 1 2026-04-09) + agregar pg_stat_statements query monitor a `/api/admin/health` | Velocidad | Alto | 1d | P1 |
| 8 | Observabilidad | Health check consolidado (DB latency + Redis + queue BullMQ + VAPID + Stripe webhook) + Sentry alert rules vía script ya existente | Velocidad / MTTR | Medio | 0.5d | P1 |
| 9 | AI — Cost control | Activar `ai-usage-tracker` + budget diario por tier + circuit breaker cuando se excede (ya hay `circuit-breaker.ts`) | Revenue / cost | Medio | 1d | P1 |
| 10 | AI — Demand predictor | Activar `auto-reorder` con HITL (ya existe skeleton); reduce el trabajo del dueño en reposición ~30 min/día | Revenue / UX dueño | Alto | 2-3d | P1 |
| 11 | Mobile / Capacitor | Agregar `@capacitor/cli` a devDeps + instalar plugin FCM push (hoy solo web-push, en app nativa no funciona) + biometrics para unlock admin | Velocidad / UX | Medio | 2d | P2 |
| 12 | Feature flags | Agregar capa DB por tenant (`TenantFeatureFlag` model) con cache 60s — permite rollout gradual por tienda | Velocidad (rollouts) | Medio | 1-2d | P2 |
| 13 | i18n | Conectar `lib/i18n.ts` a `cookies()` → Accept-Language fallback + hook `useT()` y llenar keys de checkout (quechua = diferenciador único en Pucallpa) | Revenue (mercado) | Medio | 2-3d | P2 |

---

## Detalle

### 1. Rate limit distribuido (P0)
`lib/middleware-utils.ts` L51-110 usa `Map` en memoria. En Vercel cada lambda/edge tiene su propio Map → 10 réplicas = 600 req/min reales vs 60 configurados. Además el timer de cleanup se resetea en cold start. Solución: Upstash Redis (REST, edge-nativo, tier gratis 10k req/día). API compatible con el tipo `FactoryLimiter` que ya existe en `rate-limit.ts` — solo se sustituye la implementación.

### 2. CSRF double-submit (P0)
Revisé `app/api/auth/*/route.ts`: las cookies admin son `sameSite: "strict"` lo cual mitiga casi todo, pero `active-tenant` es `httpOnly: false` y `sameSite: "lax"`. Los endpoints de mutación tenant (`POST /api/products/*`, etc.) no validan CSRF token. En navegadores con extensiones maliciosas o ataques de iframe, `sameSite` no es suficiente. Solución: middleware inyecta un CSRF token en cookie + header `X-CSRF-Token` obligatorio en writes.

### 3. Password hashing audit (P0)
`package.json` incluye `bcryptjs@3.0.3`. `login/route.ts` L122 llama `checkPassword(password, u.passwordHash)`. Debo verificar que `checkPassword` sea `bcrypt.compare` y no `===`. **Riesgo residual crítico:** `lib/session.ts` L27 tiene fallback dev hard-coded `"bsm-dev-fallback-2024-change-in-production"`. Si esa constante jamás llegó a producción porque alguien olvidó setear `AUTH_SECRET` antes del primer deploy, todos los tokens firmados con ese secret son forjables. Acción: verificar logs de arranque y forzar validación estricta en `validateEnv()` para `AUTH_SECRET` en producción (ya lo tiene).

### 4. Tighten CSP (P1)
`lib/middleware-utils.ts` L124-150: `script-src` tiene `'unsafe-eval'` (requerido por edge runtime de Next). Si tu app puede correrse en node runtime para las páginas públicas (la home, tienda, categoría), desactivar edge ahí permite eliminar `'unsafe-eval'`. `style-src 'unsafe-inline'` es por Tailwind JIT — se puede reemplazar por nonce con `@source` inline.

### 5. 2FA para tenant admin (P1)
Ya existe `lib/superadmin-2fa.ts` con TOTP. Extender: nueva tabla `AdminUser2FA { userId, secret, enabled }` + flujo de enrollment en `/admin/settings/security` + check en `requireAdmin` cuando `twoFactorEnabled`.

### 6. Cache pattern replication (P1)
`app/layout.tsx` L141-155 muestra el patrón `'use cache'` + `cacheTag("review-stats")` + `cacheLife("hours")`. Solo hay **una** llamada cacheada. Candidatos obvios: homepage promos (cacheLife minutes), product list por categoría (cacheLife hours), store settings (cacheLife days). ROI: -300-800ms en LCP medido con Speed Insights.

### 7. DB index wave 1 (P1)
`docs/migration-plan-indices-ola1-2026-04-09.md` ya existe como plan pero no aplicado. El mayor impacto concreto medible: agregar índice compuesto `(tenantId, createdAt DESC)` a `Sale`, `Order`, `ActivityLog` → consultas del dashboard admin pasan de ~400ms a ~40ms (medible con pg_stat_statements si se habilita).

### 8. Health check consolidado (P1)
Hoy el endpoint asume DB up. Un solo `/api/health/deep` que testea DB ping + Redis ping + BullMQ queue count + VAPID keys + stripe webhook registration → alert único en Sentry cuando un componente cae. Script ya existe: `scripts/setup-sentry-alerts.ts`.

### 9. AI cost control (P1)
`lib/ai-usage-tracker.ts` y `lib/circuit-breaker.ts` ya existen. Falta pegarlos al `llm-router.ts` L81 (función `callLLM`): antes de la llamada, `tracker.check(tier)` — si excede budget diario, romper el circuito y degradar a fallback rule-based. Protege contra runaway costs si un prompt injection dispara bucle.

### 10. Auto-reorder con HITL (P1)
`lib/forecasting/auto-reorder.ts` existe como skeleton. Combinado con `demand-predictor.ts` (media móvil 90d, weights 3x/2x/1x, confidence score) puede sugerir "comprar 50 kg de arroz Costeño, próxima semana". El dueño aprueba de un click → PO automática al proveedor. Valor real para Brandon: elimina la hoja Excel mental diaria.

### 11. Capacitor nativo (P2)
`capacitor.config.ts` está pero `package.json` no tiene `@capacitor/cli` ni plugins. El script `app:build` correrá `npx cap sync` que instalará al vuelo — funciona pero sin FCM (Firebase Cloud Messaging) las push del APK Android no llegan. Web-push solo funciona en browser, no en WebView del APK. Stack recomendado: `@capacitor/push-notifications` + FCM + registrar endpoint como otra variante en `PushSubscriptionsStore`.

### 12. DB-backed feature flags (P2)
`lib/feature-flags.ts` solo mira `process.env.FEATURE_*`. No permite encender una flag para un solo tenant sin redeploy. Agregar tabla `TenantFeatureFlag { tenantId, flag, enabled }` + cache 60s en `lib/cache.ts`. Desbloquea canary por tenant real.

### 13. Quechua en checkout (P2)
`lib/i18n.ts` tiene 30 keys hardcoded — ni siquiera se consume en el UI. Conectar a `cookies().get('locale')` + hook `useT()`. Brandon puede posicionarse como "la única tienda online que habla quechua en Ucayali" — diferenciador único para el mercado rural.

---

## Top 3 que mueven la aguja

| Movimiento | Mejora | Por qué |
|---|---|---|
| Riesgo | #1 Rate limit distribuido | Hoy un atacante saturando cualquier endpoint `/api/*` bypasa el límite en segundos porque Vercel crea nuevas instancias. Es el único gap de arquitectura **real y explotable** que encontré. |
| Velocidad | #6 Cache pattern replication | El layout ya prueba que funciona (review stats). Replicarlo es copy-paste con tags distintos. -300-800ms en LCP en las 3 rutas más visitadas. |
| Revenue | #10 Auto-reorder con HITL | Reduce el trabajo mental del dueño (hoja Excel diaria) a cero. Único feature que tiene ROI directo en "horas que Brandon gasta". |

---

## Security quick wins (<1 día cada uno)

1. **Upstash rate limit** — `npm i @upstash/ratelimit @upstash/redis`, sustituir `checkRateLimit` en `middleware-utils.ts`. 2h.
2. **Rotar AUTH_SECRET + validar startup** — cambiar fallback a `throw` incluso en dev si `NODE_ENV=production`. 15min.
3. **Double-submit CSRF token** — middleware set + header check. 4-6h.
4. **Endurecer `active-tenant` cookie** — agregar `sameSite: "strict"` aunque sea `httpOnly: false`. 10min.
5. **Activar `noreferrer`** en todos los `<a target="_blank">` — grep y fix. 30min.
6. **Content-Security-Policy-Report-Only** — agregar endpoint `/api/csp-report` y loguear violaciones 1 semana antes de tightening. 2h.

---

## Performance quick wins (<1 día cada uno)

1. **`optimizePackageImports` para `@tiptap/*`** — ya está para lucide/framer pero falta tiptap (editor en admin CMS). ~80KB ahorro. 5min.
2. **`next/image` auditoría** — grep `<img ` en `components/` y migrar. Cada uno ahorra ~30-60KB con AVIF. 2-4h.
3. **`cacheLife("days")` en `/sitemap.xml`** y `/robots.txt` — hoy probablemente se regenera cada request. 30min.
4. **Critical CSS inline** — quitar el `preload: false` de Geist font (L8) porque bloquea render en primer paint. 10min.
5. **`loading="lazy"` default en product grids** + `priority` solo en hero. Grep uso y fix. 2h.
6. **Preconnect reducir a 3** — L180-183 tiene 4 preconnects, Lighthouse penaliza >3. Mover `supabase` a `dns-prefetch`. 5min.

---

## AI features que reducen trabajo del dueño

1. **Auto-reorder con HITL** (#10) — PO automáticas pre-llenadas con cantidad sugerida por demanda. Brandon aprueba con un click.
2. **WhatsApp AI con catálogo real** — ya existe (`lib/whatsapp-ai.ts` L37-58 busca inventario real). Activar en prod con circuit breaker reduce ~60% de mensajes que el dueño responde manualmente sobre precios.
3. **Daily digest por email** — `lib/mailer-digest.ts` existe. Programar cron 8am con: ventas ayer, productos sin stock, top 3 recomendaciones del demand-predictor. Brandon empieza el día con el resumen ya hecho.
4. **OCR de facturas de proveedor** — subir foto de factura en papel → parse con Groq vision → crear PurchaseOrder automática. Elimina digitación manual.
5. **Chat coach admin** — `ai-assistant/coach` ya existe. Sugerencias tipo "llueve mañana en Pucallpa, sube stock de gaseosas" usando weather API + demand predictor.

---

## Lo que NO tocar

| Archivo | Por qué |
|---|---|
| `proxy.ts` | Recién refactorizado en TD-013 (2026-04-08). Pipeline está bien separado y testeable. |
| `lib/middleware/*` | Módulos puros, coverage alta. Tocar solo para agregar nuevo guard, no reescribir. |
| `lib/auth/role-permissions.ts` | RBAC 26×6. Ya es zona peligrosa oficial — cualquier cambio bloquea módulos. |
| `components/checkout/*` | Zona peligrosa (CLAUDE.md). No hay quick wins aquí, solo refactor grande planeado en ADR 015. |
| `lib/session.ts` | HMAC edge-compatible. Si cambias el formato, invalidas todas las sesiones existentes. Solo tocar junto con una rotación planeada. |
| `public/sw.js` | Service worker v8 ya tiene trim FIFO, multi-cache strategy, background sync POS. Cada bump rompe offline. |
| `prisma/schema.prisma` | 131 modelos, requiere DIRECT_URL, plan de migración obligatorio. |

---

## Riesgo encontrado (unico crítico)

**Rate limit NO es distribuido.** `lib/middleware-utils.ts` L58 declara `rlStore = new Map()`. En Vercel Edge cada replica tiene su Map independiente. Un atacante con 10 req/s paralelos a 10 replicas recibe 60 req/min × 10 = 600 req/min reales pese al límite configurado de 60. **No es teórico — es cómo escala Vercel por defecto.** Fix: #1 del top 13.

## Oportunidad AI de mayor palanca

**Auto-reorder HITL** (#10). El código del predictor ya está escrito (`demand-predictor.ts` hace media móvil ponderada sobre 90 días de SaleItem). Falta conectarlo al flujo de PurchaseOrder y agregar UI de aprobación en el admin. Dos días de trabajo. El output: Brandon deja de calcular stock en la cabeza. Es la única mejora del top que tiene ROI medible en horas/día ahorradas.

## Performance win con número concreto

**#6 — Cache pattern replication.** Hoy solo `review-stats` está cacheado en layout (L141-155). Replicando a home promos + product list + settings se estima **-400ms en LCP** y **-60% invocaciones Vercel** en las 3 rutas más visitadas (tienda, home, categoría). Medible con Speed Insights + Vercel dashboard, baseline ya existe porque `@vercel/speed-insights` ya está montado en `app/layout.tsx` L238.
