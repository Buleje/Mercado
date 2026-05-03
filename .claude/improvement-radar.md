# Improvement Radar — Buleje

Bandeja de propuestas de mejora detectadas por Claude entre sesiones.
Cada entrada: **status** [pending|approved|applied|blocked|rejected].

Al arrancar sesión, `session-start-context.mjs` muestra las `pending` en el contexto.

---

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

### [blocked] 2026-04-28 — Schema drift ProductAnalytics
- **Razón:** `prisma migrate status` reporta `P1013: invalid port number in database URL`. DIRECT_URL en `.env.local` tiene problema de formato/red.
- **Acción manual:** corregir DIRECT_URL (ver Supabase dashboard → Settings → Database → Connection string → Direct) y luego correr:
  ```
  set -a && . .env.local && set +a && npx prisma migrate deploy
  ```

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

- **Next.js 16 PPR** ✅ ya activo (`cacheComponents: true`)
- **React Compiler** ✅ activo en annotation mode (opt-in) — ojo: `react-hooks/refs` ahora flaggea reads de `ref.current` en `useMemo` (1 caso ya disabled en `SidebarConfigurator.tsx`).
- **Bun runtime**: 3-4x más rápido que Node. Riesgo: incompat con algunos MCPs.
- **Vercel AI SDK 6**: prompt caching automático. Si se usa chat con IA, -70% costo.

---

## Deuda detectada 2026-05-02

### [pending] 410 errors eslint legacy (sprint propio)
- `npm run lint` reporta 410 errors + 6245 warnings sobre proyecto entero.
- **NO bloquea commits**: pre-commit usa `--max-warnings 150` solo en archivos staged.
- Mayoría: reglas nuevas del React Compiler annotation mode + `ds-no-decorative-color-admin` (ADR-075) + `ds-no-direct-lucide-import`.
- Esfuerzo estimado: 4-8h sprint dedicado. Probable estrategia: codemods + reglas selectivas.

---

## Skills sugeridos por compound-learning (auto, 2026-05-03)

Detectados 114 patrones con ≥3 co-edits sin skill creado.
Mostrando top 3. Para crear skill: usá `/luis` o decí "crea skill para X".

### [pending] pat-coedit-1777240582428-zpqt
- **Tipo:** `co_edit_cluster` (3 occurrences)
- **Files:** `app/api/marketplace/subcategories/route.ts`, `app/tiendas/TiendasClient.tsx`
- **Sugerencia:** Files [app/api/marketplace/subcategories/route.ts, app/tiendas/TiendasClient.tsx] are always edited together. Consider creating a skill that pre-loads all 2 files.
- **Last seen:** 2026-04-26T21:56:22.427Z

### [pending] pat-coedit-1777253978825-5eer
- **Tipo:** `co_edit_cluster` (3 occurrences)
- **Files:** `components/marketplace/PromoBannerRenderer.tsx`, `lib/promo-banners.ts`
- **Sugerencia:** Files [components/marketplace/PromoBannerRenderer.tsx, lib/promo-banners.ts] are always edited together. Consider creating a skill that pre-loads all 2 files.
- **Last seen:** 2026-04-27T01:39:38.824Z

### [pending] pat-coedit-1777254228120-pe6r
- **Tipo:** `co_edit_cluster` (3 occurrences)
- **Files:** `components/superadmin/banners/BannerImageAdjuster.tsx`, `components/superadmin/banners/BannerPreviewStudio.tsx`
- **Sugerencia:** Files [components/superadmin/banners/BannerImageAdjuster.tsx, components/superadmin/banners/BannerPreviewStudio.tsx] are always edited together. Consider creating a skill that pre-loads all 2 files.
- **Last seen:** 2026-04-27T01:43:48.118Z

