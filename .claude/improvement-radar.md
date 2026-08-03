# Improvement Radar — Buleje

Bandeja de propuestas de mejora detectadas por Claude entre sesiones.
Cada entrada: **status** [pending|approved|applied|blocked|rejected].

Al arrancar sesión, `session-start-context.mjs` muestra las `pending` en el contexto.

---

## Aplicadas en sesión 2026-07-06 (tune PC + harness)

### [applied] 2026-07-06 — Edge AutoLaunch bloqueado PERMANENTE
- Se había re-agregado solo tras quitarlo el 07-04 (Edge lo re-crea al actualizar).
- Fix durable: Run key removido + policy HKCU `StartupBoostEnabled=0` + `BackgroundModeEnabled=0` → Edge ya no puede re-registrarse.

### [applied] 2026-07-06 — Scheduled tasks bloat Windows disabled (sin admin)
- ASUS Update Checker + AsusSystemAnalysis (telemetría), OneDrive Reporting ×3 (todos los SIDs), GoogleUserPEH ×3 (Platform Experience Helper).
- `ASUS Optimization` se DEJÓ (puede manejar Fn keys). Updaters de Edge/Google se dejaron (seguridad).

### [applied] 2026-07-06 — WSL slim: servicios inútiles disabled
- tailscaled (túnel en "stopped", solo quemaba 72MB + red) · cloud-init ×4 (+ `/etc/cloud/cloud-init.disabled`) · landscape-client · apport · motd-news.timer.
- Revertir: `sudo systemctl enable --now <svc>`.

### [applied] 2026-07-06 — Telemetría de agentes reparada
- `subagent-cost-log.mjs`: payloads con `agent_type:""` generaban líneas basura (95 en jsonl + bucket `""` en agregados). Fix: fallback que trata `""` como ausente + descarte de payloads fantasma con muestra en errors.log. Datos históricos purgados.

### [applied] 2026-07-06 — RAG re-indexado (estaba stale desde ~mayo)
- `node ~/.local/qdrant/rag/index.mjs` re-corrido. Nota: client 1.13 vs server 1.18 warnea versión pero funciona.

### [applied] 2026-07-06 — Ronda profunda (segunda pasada "sigue profundizando")
- **Windows ronda 2 elevada**: DiagTrack + Xbox ×4 + MapsBroker + RetailDemo + SysMain disabled+stopped · Widgets policy OFF · **SearchHost/Bing web content OFF** (msedgewebview2 362MB→0). Scripts+revert en `C:\Users\Usuario\.claude-tune\`. Windows libre: 8.2→11.4 GB.
- **WSL**: snapd disabled (era lo más lento del boot, 2.9s) · journal cap 100M (-334MB) · playwright browsers viejos purgados (-630MB) · apt autoremove.
- **qdrant a systemd**: `qdrant.service` enabled (sobrevive reinicios de WSL, ya no depende del nohup del boot hook) + `qdrant-reindex.timer` semanal (dom 05:00).
- **MCPs a binarios directos** (mata ~190MB de wrapper npm c/u ≈ 700MB/sesión): lsmcp ya parcheado en `.mcp.json`; firecrawl/context7/playwright requieren tocar `~/.claude.json` → **PENDIENTE post-cierre**: correr `python3 ~/.claude/autonomy-setup/mcp-direct-bin-patch.py` SIN sesiones abiertas. El patch también arregla el `--executable-path` de playwright que apuntaba a chromium-1208 INEXISTENTE (browser habría fallado al lanzar).

### [applied] 2026-07-06 — Ronda 3: DISCO (hallazgo mayor)
- **32.4 GB de swap.vhdx huérfanos de WSL borrados de `%TEMP%`** (C: 45→83 GB libres). Causa raíz: swap sin ruta fija → `.wslconfig swapFile=D:\WSL\swap.vhdx`. Prevención: Storage Sense ON.
- VHDX 69.7GB físicos vs 37GB internos → RunOnce `WSLSetSparse` al próximo logon (verificar: debería bajar a ~40GB). fstrim corrido + timer armado.
- Defender: exclusión D:\WSL + vmmemWSL (menos IO en cada write de la VM) · DODownloadMode=0. Reverts en `.claude-tune\revert-ronda3-*.ps1`.
- Inventario stale detectado: Tor/BlueStacks/PandoraFMS/LastPass/Docker Desktop YA NO están instalados.

### [applied] 2026-07-13 — Verificación post-reboot + fixes derivados
- swap ✅ 8G activo · qdrant.service ✅ active · **fstrim.timer estaba MUERTO en WSL2** (`ConditionVirtualization=!container`) → override en `/etc/systemd/system/fstrim.{timer,service}.d/wsl.conf`, ahora active, próxima corrida dom 05:04.
- vhdx sigue en **70GB** (sparse nunca se aplicó; RunOnce original desapareció sin log) → **RunOnce `WSLSetSparse` re-armado** (`wsl.exe --manage Ubuntu --set-sparse true` al próximo logon de Windows). Verificar tamaño en ~1 semana (sparse+fstrim reclaman gradual).
- **MCP patch ahora auto-ejecutable**: `mcp-patch-oneshot.timer` (systemd user, cada 10min) corre `mcp-direct-bin-patch.py` apenas no haya sesiones claude y se auto-desactiva. Ya no depende de que Brandon lo corra a mano.
- Playwright: chromium-1208 fantasma (0 bytes) purgado; el real es 1223. Hook `session-start-autonomy.mjs` ahora resuelve el chromium dinámicamente (no más "not_installed" falso).

### [applied] 2026-08-03 — qdrant client ya está en ^1.18.0 (verificado en ~/.local/qdrant/rag/package.json; se aplicó en la ronda Ubuntu del 07-13 y la entrada quedó duplicada).

### [pending→nota] Telegram bot: evaluar si el tool nativo `PushNotification` del harness ya cubre el push al móvil antes de armar bot.

## Aplicadas en sesión 2026-04-28

### [applied] 2026-04-28 — OOM cap tsc bajado a 4096 MB
- post-tool-tsc.mjs: `--max-old-space-size=12288 → 4096`. Causaba OOM en WSL (tope 10 GB).

### [applied] 2026-04-28 — stop-alert-sound.mjs neutralizado
- Antes lanzaba explorer.exe (YouTube) + powershell.exe (beeps). Robaba foco al terminal.

### [applied] 2026-04-28 — MCPs no usados desactivados
- `~/.claude.json`: Twilio + Resend movidos a `mcpServers_disabled`. Backup en `~/.claude.json.backup-*`.
- Para reactivar: `python3 -c "import json; d=json.load(open('/home/usuario/.claude.json')); d['mcpServers']['twilio']=d['mcpServers_disabled'].pop('twilio'); json.dump(d, open('/home/usuario/.claude.json','w'), indent=2)"`

### [applied] 2026-04-28 — N+1 en StoreReviewsDB.listByStoreId
- `lib/db/store-reviews.db.ts`: paralelizado top-N reviews + groupBy de ratings (antes era 2 queries seriales con findMany completo). Latencia esperada: ~50% menos. Memoria: ~10× menos en stores con muchas reseñas.

### [applied] 2026-04-28 — DB pool warmup en boot
- `instrumentation.ts`: SELECT 1 fire-and-forget en startup. Elimina cold start de pgBouncer (~720ms en primera request) → primera request real ya tibia.

### [applied] 2026-04-28 — post-edit-ui-screenshot debounce 5s
- Agregado mismo patrón que post-tool-tsc. Evita 5 chromiums paralelos en bursts de edits UI.

### [applied] 2026-04-28 — Sonnet/Haiku routing para subagentes
- Memoria `feedback_model_routing.md` con tabla por tipo de tarea. Usar `model: "sonnet"` en subagentes mecánicos.

### [applied] 2026-04-28 — React Compiler (annotation mode)
- `babel-plugin-react-compiler@1.0.0` instalado.
- `next.config.ts`: `experimental.reactCompiler = { compilationMode: "annotation" }`.
- **Cero impacto** sobre componentes que NO usen `"use memo"`. Para activar en un componente: agregar `"use memo"` arriba.
- Dev server health-check post: ok, 118 ms.

## Bloqueadas

### [applied] Schema drift — RESUELTO TOTAL (2026-06-10, auditoría integral)
- DIRECT_URL funciona (psql directo OK desde esta red). 13 migraciones registradas con `migrate resolve`, phantom reconstruida, drift-fix 1+2 aplicados (9 tablas creadas). `prisma migrate status` → up to date · `db:drift` → 0/0/0 faltantes.

### [blocked] 2026-05-02 — 4 migrations may-2 pending Supabase prod
- **Migrations:** add_delivery_sos_alert / add_delivery_partner_score / add_payment_approval / add_payment_approval_link.
- **Root cause confirmado (3 bugs encadenados):**
  1. `DIRECT_URL` tiene `$` literal en password sin URL-encode (P1013).
  2. Aún encoded, DNS WSL no resuelve `db.<ref>.supabase.co` (P1001 — IPv6 missing).
  3. Pooler (`pgBouncer transaction`) acepta conexión pero timeout en `migrate deploy`.
- **Workaround disponible:** `scripts/apply-may2-migrations.sql` (commit `ff3fecfe`) — pegar en Supabase SQL Editor (idempotente, registra en `_prisma_migrations`).
- **Verificación automática:** routine cloud `trig_016QQYSckqyzQy8wHyDh35K9` corriendo + programado sábado 9-may. Si tablas existen → abre PR para limpiar el raw SQL workaround en `lib/db/order-payment-link.db.ts`.

---

## Aplicadas en sesión 2026-05-02

### [applied] 2026-05-02 — WhatsApp Concierge AI multi-vendor + Recommend handler
- Cross-tenant marketplace search (`lib/whatsapp/concierge/cross-tenant-search.ts`).
- Multi-vendor checkout split por storeId con idempotencia (`multi-vendor-checkout.ts`).
- Handler IA de recomendaciones con `smartModel` natural-Peruvian (`recommend.handler.ts`).
- Intent `recomendar` agregado al clasificador (`ai-intent.ts`).
- Endpoint dev `/api/whatsapp/concierge/test` + smoke E2E `scripts/test-whatsapp-concierge.mjs`.
- Setup guide `WHATSAPP_SETUP.md`.

### [applied] 2026-05-02 — Yape Vision close-loop superadmin
- Vision IA Claude Sonnet 4.6 (`lib/ai/yape-vision.ts`) con cost-control.
- DB class self-bootstrapping `lib/db/payment-approval.db.ts`.
- Webhook Twilio + Meta `/api/whatsapp/yape-capture`.
- UI superadmin `/superadmin/pagos-yape` con polling + optimistic + zoom + reject modal (812 líneas).
- Loop cerrado: approve → `OrdersDB.update` → `notifyYapeApproved` por WhatsApp.
- Helper read-only `lib/db/order-payment-link.db.ts` (raw SQL fuera del danger zone, schema drift workaround).

### [applied] 2026-05-02 — Delivery Dashboard 2.0
- 5 widgets: EarningsTodayHero / RiderScoreCard / HotZonesPanel / StreaksAndBonusCard / ChatAndSOSPanel.
- 4 endpoints `/api/delivery/{hot-zones,me/score,me/sos,me/streaks}`.
- 4 DB classes (delivery-hot-zones / score / sos / streaks).
- `PartnerDashboard.tsx` reorganizado en 3 secciones (HOY · OPORTUNIDADES · PROGRESO).

### [applied] 2026-05-02 — i18n Quechua + AutoTranslator DOM-walker
- Locale type extendido a `es | en | shi | qu` (Runa Simi chanka).
- Overlay `lib/i18n/translations-qu.ts` (204 líneas hand-translated).
- `lib/i18n/auto-translator.ts` con 3 capas (dict / localStorage / MyMemory API).
- `<AutoTranslator>` DOM walker con WeakMap + MutationObserver — traduce nodos no-instrumentados al cambiar locale.
- `<T>` wrapper inline para Server Components.
- Migración `t()` en 12 archivos landing/footer/nav.

### [applied] 2026-05-02 — Provider AI fallback chain
- `lib/ai/provider.ts`: Anthropic Haiku 4.5 > Groq llama-3.3-70b (free 14k req/d) > OpenAI gpt-4o-mini.
- Auto-detect por env vars en startup.
- Groq como OpenAI-compatible via `createOpenAI({ baseURL })`.

### [applied] 2026-05-02 — Admin sidebar "buleje" theme + nav links
- Theme `buleje` (slate-deep + teal #00B4A6) en `SidebarTheme` union.
- Default nuevos tenants en `buleje` (`lib/admin-template.ts`).
- Cristal/shaded auto-rerouted a buleje render.
- Nav: "Pagos Yape" + "Catálogo variaciones" en SuperAdminShell.

### [applied] 2026-05-02 — Polish surface storefront
- Theme: hard-reload siempre en light (sessionStorage en vez de localStorage).
- Lenis smooth-scroll lerp 0.085 (Beast Philanthropy / Apple-style float).
- Keyframe `pulse-subtle` para StreaksAndBonusCard active bonuses.
- ScrollProgressBar 3px teal (estilo Stripe/Notion/Linear).
- RecentlyViewedDrawer redesign (centered + blur-md fuerte).

### [applied] 2026-05-02 — CSRF exempt /api/whatsapp/*
- Meta no envía cookies en webhooks; HMAC X-Hub-Signature-256 ya protege.
- Antes: 403 silencioso bloqueaba cualquier POST de Meta.

### [applied] 2026-05-02 — i18n LocaleToggle qu records
- 3 records faltantes después del upgrade del Locale type. tsc gate desbloqueado.

---

## Pendientes (próximas sesiones)

### [pending] 2026-04-28 — Telegram bot setup (necesita input Brandon)
- **Acción manual:** ver `/setup-autonomy` Bloque 3.
- **Beneficio:** notificación push real al móvil cuando termina trabajo largo.

### [applied] 2026-05-03 — Playwright deps instaladas
- libnss3 + libatk + libcups + libxkb + libgbm + resto del set chromium ya en sistema.
- npx playwright --version → 1.58.2 funcional.

### [applied] 2026-05-03 — Tesseract OCR instalado
- tesseract-ocr 5.3.4 + tesseract-ocr-spa (español + inglés + osd).
- Verificado: `tesseract --version` ok.

### [applied] 2026-05-03 — GitHub CLI autenticado
- `gh auth login` completado vía device code. Token con scopes: gist, read:org, repo, workflow.
- Habilita PRs/issues automáticos desde Claude.

---

## Tecnologías nuevas a evaluar

### [applied] 2026-07-13 — Modernización agéntica (deep-research verificado)
- Investigación con workflow deep-research (24 fuentes, 120 claims) + agente claude-code-guide; 11/12 claims clave re-verificados contra changelog oficial.
- Aplicado: `.claude/rules/agentic-style.md` bullet F (subagentes background default + anidados ×5, additionalContext en Stop hooks, Tool(param:valor), .claude anidados, /doctor, LSP nativo NO existe → lsmcp sigue) + CLAUDE.md regla 15 actualizada a v2.1.205 + memoria `claude-code-novedades-2026-07.md`.
- Ubuntu: fstrim override WSL2 + RunOnce sparse re-armado + mcp-patch-oneshot.timer + qdrant client 1.13→1.18 (RAG verificado OK) + ast-grep 0.44 + symlink `fd`.

### [applied] 2026-07-13 — Ronda 2 "sigue mejorando" (calidad de código + fricción)
- **Bugs reales fijados vía lint:fast**: `state-machine.ts` del concierge WhatsApp tragaba errores de handlers SIN log (ahora `logger.error` con state+intent) · `gift-cards.db.ts` condición duplicada `"cancelled"||"cancelled"` · `predictions/route.ts` filtro redundante · `FinancialResults.tsx` `{sign && sign}` · 2× `delay: 0*0.1`.
- **InicioDashboard.tsx −175 LOC**: 5 cadenas de cálculo muertas que corrían EN CADA RENDER (topCustomers/stockByCategory/sinMov/criticalStock/topProfit) + KPICard/DeltaBadge/COLOR_MAP muertos + imports. 689→514 líneas. Gates: tsgo exit 0 + eslint 0 errores.
- **VRT ampliado a 4 tests** (+ StoreAvatar iniciales + PaymentMethodChip), 4/4 verdes determinísticos.
- **Knip auditado**: de 21 deps "muertas" solo 1 real (`@storybook/test` v8 stale, removido −24 packages). `critters` la exige `optimizeCss` (falso positivo) y el resto SÍ se importa → knip necesita config (entry points next/scripts/storybook) antes de confiar. Fix bonus: `preview.ts` importaba tipo de `@storybook/nextjs` NO instalado (resolvía por hoisting) → `@storybook/react`.
- **Permisos**: +5 patrones (`npx tsc/eslint/oxlint/knip`, `tsgo`) a `permissions.allow` (155→160; backup `.claude/settings.json.bak-perms`). Bash/git/playwright ya estaban cubiertos.
- Nota: BodegueroSpotlight conserva 4 `no-unreachable` INTENCIONALES (UI guardada post-CMS, documentado en el archivo).

### [pending] Correr `/doctor` quincenal (2.1.203+: checkup con auto-fix + propone podar CLAUDE.md). Primera corrida: próxima sesión.
### [applied] 2026-08-03 — knip confiable: `knip.jsonc` con TODOS los falsos positivos documentados con su porqué (storybook webpack loaders, scripts/, critters-por-require-runtime, posthog/embla huérfanos). `npx knip --dependencies` = 0 hallazgos. Borradas 5 deps muertas reales (gsap, vaul, hover-card, select, @types/bcryptjs); `critters` se intentó borrar y se RESTAURÓ (next lo requiere en runtime con optimizeCss — el radar del 07-13 ya lo sabía y el grep de imports no lo ve).

### [applied] 2026-08-03 — RUM de PostHog VIVO por primera vez: el provider huérfano de mayo (nunca montado en toda la historia del repo — `git log -S "<PostHogProvider"` vacío) se reemplazó por `instrumentation-client.ts` (patrón oficial Next 15.3+, pageviews por history_change). Key en .env.local, dominios en la CSP de middleware-utils. Verificado end-to-end: evento en el backend de PostHog vía SQL. Gotcha mayor documentado en memoria: posthog-js descarta eventos de webdriver/headless (`_is_bot()`), la verificación con Playwright exige `opt_out_useragent_filter` (activo solo en dev).

### [pending] 2026-08-03 — `lib/security/csp.ts` está huérfano (nadie lo importa; la CSP real vive en `lib/middleware-utils.ts`). Dos fuentes de CSP = la trampa de siempre. Candidato a borrar tras confirmar que ningún plan lo referencia.
### [pending] Barrer los ~420 `no-unused-vars` restantes de `lint:fast` por lotes (los 490 hallazgos actuales son casi todos código muerto de baja prioridad; los de correctness ya se fijaron).
### [applied] 2026-07-13 — **oxlint** adoptado como pre-check (`npm run lint:fast`)
- Medido en este repo: oxlint **7.6s / 204MB / 506 hallazgos** vs ESLint **98.9s / 1.84GB / 1746 warnings** → 13× más rápido, 9× menos RAM. Instalado como devDep (v1.73).
- Encontró código muerto que el gate no reporta (ej. 6 vars/función sin usar en `InicioDashboard.tsx`). ESLint sigue siendo el gate autoritativo (reglas custom design-tokens + jsx-a11y).
### [applied] 2026-07-13 — **Vitest 4 `toMatchScreenshot`** piloto funcionando (`npm run test:vrt`)
- Deps: `@vitest/browser-playwright` + `vitest-browser-react` + `@tailwindcss/vite`. `vitest.config.ts` ahora usa projects `unit`/`vrt` (unit = suite de siempre, sin cambios; `npm run test` apunta a unit explícito).
- Piloto: 2 single-sources (PaymentMethodIcon custom + ProductPhotoFallback) — baselines ESTILADOS (tokens+Tailwind renderizan vía @tailwindcss/vite) en `__tests__/vrt/__screenshots__/`, 2ª corrida verde en 2.7s, determinístico local.
- Gotchas: 1ª corrida SIEMPRE falla (crea baselines para revisar); yape/plin flaky por onError de logo → usar métodos con arte custom o esperar el load; baselines local ≠ CI (correr solo local o en Docker).
### [pending] **TypeScript 7 GA** (native Go): RC salió jun-2026, GA ~jul-2026. Cuando salga: migrar de tsgo preview a `typescript@7` estable como typechecker principal (mismo motor, sin las divergencias de preview tipo TS2869).

- **Next.js 16 PPR** ✅ ya activo (`cacheComponents: true`)
- **React Compiler** ✅ activo en annotation mode (opt-in) — ojo: `react-hooks/refs` ahora flaggea reads de `ref.current` en `useMemo` (1 caso ya disabled en `SidebarConfigurator.tsx`).
- **Bun runtime**: 3-4x más rápido que Node. Riesgo: incompat con algunos MCPs.
- **Vercel AI SDK 6**: prompt caching automático. Si se usa chat con IA, -70% costo.

---

## Deuda detectada 2026-05-02

### [applied] 410 errors eslint legacy — RESUELTO (re-verificado 2026-06-10)
- `npm run lint` hoy: **0 errores, 0 warnings** (gate de auditoría integral). Los 410 se fueron limpiando en sprints intermedios. Entry stale, cerrado.

## Aplicadas 2026-05-20

### [applied] 2026-05-20 — RLS Postgres híbrido (ADR-114)
- Aplicado via Supabase MCP: Order, Customer, Sale, ActivityLog con FORCE ROW LEVEL SECURITY + 4 policies tenant_isolation_*.
- Payment excluido (sin tenantId → TD-115).
- Tests funcionales 4/4 OK (sin tenant → 0 rows · main → datos propios · __system__ → bypass).
- ⚠️ DATABASE_URL Vercel SIGUE en postgres (BYPASSRLS). NO cambiar a app_user hasta migrar 880 endpoints a withRlsTenant() (TD-116).

### [applied] 2026-05-20 — Suite tests verde (60→0 fallos)
- Mocks marketplace + warehouse-transfers actualizados vs evolución de DB classes.
- Commit 0639a39b · 332 files passed · 4426 tests passed.

### [applied] 2026-05-20 — Q1 perf+SEO+UX (8/8 hechos)
- defer en back-nav-refresh (LCP -20-40ms)
- PromoBanner CLS fix (CLS -0.05-0.12)
- Footer dynamic → import estático (next 16 incompat con ssr:false en server components)
- alt="" reemplazado con descripciones SEO en 2 imágenes featured
- _source.png 884KB movido fuera de public/
- Stats reales debajo del search (X tiendas · Y+ productos · Yape Plin efectivo)
- Subtítulo VISIBLE en mobile con copy "Pedí en 2 min. Pagás cuando llega"
- CTA "Ver todas las tiendas" promovido a botón primario filled verde

### [pending→DESBLOQUEADO 2026-06-10] TD-116 — migrar endpoints a withRlsTx()
- **Infra COMPLETA hoy (commits hasta esta sesión):**
  - Hallazgo: `postgres` tiene `rolbypassrls=true` → `withRlsTenant` viejo era no-op + pitfall SET LOCAL fuera de tx.
  - Fix: `withRlsTx()` en lib/prisma-rls.ts (SET LOCAL + queries en UNA transacción).
  - Políticas fail-open (fase expand) aplicadas — cambiar el rol NO rompe paths sin migrar.
  - Rol `buleje_app` NOBYPASSRLS creado + grants. Credencial: /tmp/buleje_app.env (Brandon la agrega a .env.local/Vercel).
  - Aislamiento VERIFICADO como buleje_app: main=19 · tenant=6 · falso=0 · __system__=80.
- **Lo que queda (orden):** 1) Brandon agrega BULEJE_APP_DATABASE_URL y canary del rol en dev → 2) migrar endpoints a `withRlsTx` por lotes (usar la variante TX, no la vieja) → 3) al 100%, fase contract: políticas fail-closed.

## Deuda detectada 2026-05-20 (post Ola 1/2/3 deps upgrade)

### [applied] 60/4491 tests fallando — RESUELTO (re-verificado 2026-05-26)
- marketplace-tier-discount 8/8, api-marketplace-products + advanced-search + notification-center 57/57 → TODOS PASAN. Fix llegó con 0639a39b (20-may). Entry duplicado/stale, cerrado.

### [historico] 60/4491 tests fallando — sprint dedicado de mocks
- `npx vitest run` reporta 60 tests fallando (1.3% del total).
- **NO causados por upgrade de deps**: `prisma.product.findMany` se llama desde `lib/db/marketplace/orders.db.ts:282` pero el mock del test (`__tests__/lib/db/marketplace-tier-discount.test.ts`) NO incluye `product.findMany`. Fue agregado en `lib/db/marketplace/orders.db.ts` (commit 7eeeb1d0 batch 5) sin actualizar el mock.
- **Distribución de fallas:**
  - 17× `Cannot read properties of undefined (reading '0')` — mock devuelve undefined
  - 14× `Cannot read properties of undefined (reading 'findMany')` — modelo prisma faltante en mock
  - 8× `MarketplaceOrdersDB.getMarketplaceById is not a function` — método renombrado, tests con nombre stale
  - 8× `Cannot read properties of undefined (reading 'catch')` — promise chaining en mock undefined
  - 4× `prisma.product.findMany is not a function` — mismo patrón
  - ~9× misc assertions (cupones, stock, status codes)
- **Tests afectados (sample):** `marketplace-tier-discount.test.ts`, `api-marketplace-products.test.ts`, `api-marketplace-slug.test.ts`, `notification-center.test.ts`, `advanced-search.test.tsx`.
- **Estrategia sugerida:**
  1. Crear helper `__tests__/helpers/prismaMock.ts` con TODOS los modelos × métodos comunes (findMany/findFirst/findUnique/create/update/updateMany/delete/count) devolviendo defaults razonables.
  2. Reemplazar mocks ad-hoc por el helper.
  3. Renombrar `getMarketplaceById` callsites en tests.
- Esfuerzo estimado: 3-5h sprint dedicado.
- **Bypass actual:** `SKIP_VITEST_GATE=1` documentado en commit b26becff.

---

## Skills sugeridos por compound-learning (auto, 2026-05-03)

Detectados 114 patrones con ≥3 co-edits sin skill creado.
Mostrando top 3. Para crear skill: usá `/luis` o decí "crea skill para X".

### [rejected-stale 2026-06-10] pat-coedit-1777240582428-zpqt
- **Tipo:** `co_edit_cluster` (3 occurrences)
- **Files:** `app/api/marketplace/subcategories/route.ts`, `app/tiendas/TiendasClient.tsx`
- **Sugerencia:** Files [app/api/marketplace/subcategories/route.ts, app/tiendas/TiendasClient.tsx] are always edited together. Consider creating a skill that pre-loads all 2 files.
- **Last seen:** 2026-04-26T21:56:22.427Z

### [rejected-stale 2026-06-10] pat-coedit-1777253978825-5eer (TiendasClient ya decompuesto; patrones de abril)
- **Tipo:** `co_edit_cluster` (3 occurrences)
- **Files:** `components/marketplace/PromoBannerRenderer.tsx`, `lib/promo-banners.ts`
- **Sugerencia:** Files [components/marketplace/PromoBannerRenderer.tsx, lib/promo-banners.ts] are always edited together. Consider creating a skill that pre-loads all 2 files.
- **Last seen:** 2026-04-27T01:39:38.824Z

### [pending] pat-coedit-1777254228120-pe6r
- **Tipo:** `co_edit_cluster` (3 occurrences)
- **Files:** `components/superadmin/banners/BannerImageAdjuster.tsx`, `components/superadmin/banners/BannerPreviewStudio.tsx`
- **Sugerencia:** Files [components/superadmin/banners/BannerImageAdjuster.tsx, components/superadmin/banners/BannerPreviewStudio.tsx] are always edited together. Consider creating a skill that pre-loads all 2 files.
- **Last seen:** 2026-04-27T01:43:48.118Z

