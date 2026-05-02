# Release Notes — 2026-05-02

> Sprint diario — 32 commits, 6 frentes completos, working tree limpio en `origin/prod`. Todo el pipeline para abrir el marketplace cross-tenant a clientes WhatsApp y cerrar el loop de pago Yape end-to-end.

---

## 🎯 Highlights

| Frente | Impacto |
|---|---|
| **WhatsApp Concierge AI multi-vendor** | Un solo número de WhatsApp para todo el marketplace. Cliente busca cross-tenant, arma carrito multi-tienda, recibe recomendaciones IA naturales. |
| **Yape Vision close-loop** | Foto del Yape → Claude Sonnet 4.6 extrae monto/código/last4 → superadmin aprueba/rechaza → orders confirmadas + cliente notificado por WhatsApp. |
| **Delivery Dashboard 2.0** | 5 widgets nuevos para repartidores: ganancias del día, score 0-1000 gamificado, hot zones, streaks + bonos, chat + SOS. |
| **i18n 4 idiomas** | Español · English · Shipibo · **Quechua chanka**. Auto-translator DOM-walker traduce el sitio entero al cambiar locale. |
| **Admin "buleje" theme** | Sidebar branded slate-deep + teal #00B4A6 como default para nuevos tenants. |
| **Security hardening** | Audit OWASP cerró 2 Critical + 4 High + 3 Low + 2 BUG en código de pagos. |

---

## 📦 Por dominio

### WhatsApp Concierge AI (5 commits)

```
ae318f64  feat(whatsapp): multi-vendor concierge + recommend
8f7d4b9d  feat(whatsapp): dev test endpoint + smoke + setup
27ea3cb4  fix(whatsapp): close 2 critical signature vulnerabilities
0cc6f22f  fix(security): atomic approve/reject + bug-2 + pii + force-dynamic
b252b7be  fix(security): close audit #4 idempotency + #7 ghost approval
```

**Qué cambia para el cliente final:**
- Manda "tienen arroz?" → ve productos de TODAS las tiendas con precio + tienda + distancia
- Manda "qué me recomiendas para una parrilla" → IA responde 3 ideas con razón + lista numerada
- Carrito puede tener productos de varias tiendas (multi-vendor checkout)
- Idempotencia robusta: re-enviar la foto del Yape no duplica aprobaciones

**Qué cambia para superadmin:**
- Dashboard `/superadmin/pagos-yape` con polling 30 s + optimistic UI + zoom imagen + comparación esperado vs detectado por IA
- Approve atómico: dos clicks simultáneos no causan doble notificación

**Qué cambia para devs:**
- `npm run dev` → `node scripts/test-whatsapp-concierge.mjs` simula 6 conversaciones contra el motor sin Meta API
- 72 tests vitest cubren el pipeline (`__tests__/whatsapp/`)

### Yape Vision (1 commit grande + fixes)

```
6e9a074b  feat(yape-vision): full pipeline + close-loop completo
fbde42ed  fix(yape-vision): late callback guard
```

- Pipeline completo: Twilio + Meta payloads soportados, Claude Sonnet Vision con cost-control ($1/día budget), DB self-bootstrap, dashboard superadmin pulido (812 líneas).
- BUG-1 cerrado: late callbacks de Vision IA ya no sobrescriben aprobaciones manuales finalizadas.

### Delivery Dashboard 2.0 (1 commit)

```
61160eeb  feat(delivery): rider dashboard 2.0 — earnings hero, hot zones, streaks, score, SOS
```

5 widgets nuevos compuestos en 3 secciones: HOY · OPORTUNIDADES · PROGRESO. Endpoints `/api/delivery/{hot-zones,me/score,me/sos,me/streaks}` + 4 DB classes. 71 tests vitest sobre 3 widgets (`__tests__/delivery/`).

### i18n Quechua + AutoTranslator (2 commits)

```
c4fcef15  feat(i18n): quechua locale + auto-translator dom-walker + scroll progress bar
6f19b3d8  feat(i18n): migrate landing + footer + nav strings to t() keys
```

- Locale type extendido: `es | en | shi | qu`.
- 204 líneas hand-translated en `translations-qu.ts` (chanka — la variedad más neutral del Perú andino).
- `<AutoTranslator>` walker con WeakMap + MutationObserver: traduce nodos no-instrumentados al cambiar locale, preservando whitespace.
- 12 archivos landing/footer/nav migrados a `t("key")`.

### Admin sidebar "buleje" theme (1 commit)

```
1b068971  feat(admin): sidebar "buleje" theme + pagos yape & variant catalog nav
```

- Theme `buleje` (slate-deep + teal #00B4A6) como default para tenants nuevos.
- Tenants previos en `cristal` o `shaded` rerouted automáticamente al render branded.
- "Pagos Yape" + "Catálogo variaciones" en nav superadmin.

### Polish surface (3 commits)

```
a6aceb60  feat(ui-system): RecentlyViewedDrawer redesign — centered + stronger blur
0ccf2f44  feat(motion): tune Lenis smooth-scroll + add pulse-subtle keyframe
f04c46ab  feat(theme): start every page-load in light mode (sessionStorage)
```

### AI provider fallback chain (1 commit)

```
d36de839  feat(ai): multi-provider chat fallback chain (Anthropic > Groq > OpenAI)
```

`lib/ai/provider.ts` auto-detecta key disponible. Groq como OpenAI-compatible via `createOpenAI` baseURL. Sin key → stub que falla → caller fallback a menú welcome.

### Tests + ADR + docs (4 commits)

```
51a1bc3b  test(whatsapp): vitest coverage for yape vision pipeline (72 tests)
6798e603  test(delivery): vitest coverage for 3 dashboard widgets (74 tests)
5f9f5e5b  docs(adr): ADR-088 — whatsapp concierge multi-vendor + yape vision
1a9eced0  docs(readme): surface may-2026 additions — concierge / yape / delivery / i18n
```

---

## 🔒 Security audit (closed in-session)

11 de 13 hallazgos cerrados:

| Sev | # | Issue | Status |
|---|---|---|---|
| 🔴 Critical | #1 | Signature opcional → fail-closed | ✅ |
| 🔴 Critical | #2 | HMAC `===` → timing-safe | ✅ |
| 🟡 High | #4 | Idempotency parcial review_required | ✅ |
| 🟡 High | #5 | Test endpoint env bypass | ✅ |
| 🟡 High | #6 | Race doble-aprobación | ✅ |
| 🟡 High | #7 | createPaymentApproval ignora errores | ✅ |
| 🟢 Low | #11 | PII phone log concierge | ✅ |
| 🟢 Low | #12 | force-dynamic webhooks | ✅ |
| 🟢 Low | #14 | PII phone log create | ✅ |
| Test | BUG-1 | Late Vision callback overwrite | ✅ |
| Test | BUG-2 | Silent skip notify | ✅ |

Pendientes (programados como follow-up cloud agent):
- 🟡 High #3 — Twilio/Meta sig en `/yape-capture`
- 🟡 High #8 — transaccionalidad approve

---

## 🚧 Blockers conocidos (no bloquean dev local)

| Blocker | Workaround | ETA fix |
|---|---|---|
| 4 migraciones may-2 sin aplicar en Supabase | Pegar `scripts/apply-may2-migrations.sql` en SQL Editor (idempotente) | Manual, 1 min |
| `DIRECT_URL` con `$` sin URL-encode + DNS WSL no resuelve direct host | URL-encode local + usar pooler para queries normales | Cambiar password en Supabase (sin caracteres especiales) |
| `Order.paymentApprovalId` en migración pero no en `schema.prisma` | Raw SQL en `lib/db/order-payment-link.db.ts` | Cleanup PR programado vía routine cloud `trig_016QQYSckqyzQy8wHyDh35K9` |
| AI key no pegada en `.env.local` | Provider chain entrega menú welcome (fail-safe) | Pegar `ANTHROPIC_API_KEY` o `GROQ_API_KEY` (free) |

---

## 🎬 Cómo activar todo en producción

```bash
# 1. AI key — opción gratis recomendada para empezar
echo 'GROQ_API_KEY=gsk_xxx' >> .env.local

# 2. Aplicar migraciones (Supabase SQL Editor)
#    https://supabase.com/dashboard/project/<ref>/sql/new
#    Pegar el contenido de scripts/apply-may2-migrations.sql

# 3. En Vercel — setear variable de entorno crítica:
#    WHATSAPP_WEBHOOK_SECRET (activa fail-closed audit fix #1)

# 4. Smoke test local
node scripts/test-whatsapp-concierge.mjs
```

---

## 📊 Métricas de la sesión

| Métrica | Valor |
|---|---|
| Commits | 32 (todos pushed a `origin/prod`) |
| Líneas modificadas | ~12,000 (incluyendo Brandon + agentes) |
| Tests nuevos | 143 (72 whatsapp + 71 delivery) |
| ADRs publicadas | 1 (ADR-088) |
| Audit findings cerrados | 11/13 |
| Frentes completos | 6 |
| Routines cloud creadas | 1 (verificación + cleanup PR) |
| Sin AI key del cliente, todo se construyó con | Groq free tier + lecturas locales |

---

## 🙏 Crédito

Co-construido por Brandon Buleje (visión + decisiones de producto) y Claude Opus 4.7 (1M context) durante una sesión interactiva el 2 de mayo, 2026.

Documentación arquitectural: [ADR-088](./adr/088-whatsapp-concierge-multi-vendor-yape-pipeline.md).
Setup operacional: [WHATSAPP_SETUP.md](../WHATSAPP_SETUP.md).
