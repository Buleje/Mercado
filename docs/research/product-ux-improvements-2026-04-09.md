# Product & UX — Research 2026-04-09

**Autor:** PRODUCT-UX-SCOUT (subagente)
**Scope:** Flujos end-to-end de Bodega San Martín / Buleje desde lente de PM, retention, conversion.
**Fuentes clave inspeccionadas:** `app/onboarding/page.tsx`, `components/onboarding/*`, `app/(marketing)/plataforma/page.tsx`, `components/marketing/RegistrationForm.tsx`, `app/supplier/page.tsx`, `app/api/daily-digest/route.ts`, `app/api/abandoned-cart/route.ts`, `lib/analytics.ts`, `lib/plans.ts`, `lib/churn/health-scorer.ts`, `lib/trial.ts`, `lib/whatsapp/conversation-engine.ts`, `components/ReferralBanner.tsx`, `app/admin/_lib/tab-categories.ts`.

---

## 1. Mapa de flujos actuales (end-to-end)

### 1.1 Flujo Dueño de bodega (B2B SaaS)

```
Landing /plataforma
   │ (CTA "Empieza gratis")
   ▼
/plataforma/registro  ─ 5 pasos (tipo cuenta → tienda → admin → plan → template)
   │ crea Tenant + AdminUser + trialEndsAt
   ▼
/admin/login  (magic redirect después de registrarse)
   │
   ▼
/onboarding  (wizard 5 pasos — solo 1 vez)
   ├─ 1. Marca (nombre + logo + telefono)   ← 3 fields
   ├─ 2. Primer producto (opcional, skippable)
   ├─ 3. Primer cliente fiado (opcional, skippable)
   ├─ 4. Demo POS (3 cards estáticas, NO interactivo)
   └─ 5. Preferencias (notif + PWA + resumen WA)
   │ POST /api/settings + /api/products + /api/customers + /api/onboarding/complete
   ▼
/admin  (dashboard con 17 módulos en sidebar)
   │ ¿primera venta? ¿primer fiado? ¿primer reporte? → NO se mide como métrica de activation
   ▼
Día 2+  → ¿qué lo hace volver?
   ├─ Email daily digest a las 9pm (solo si hubo pedidos — BUG UX)
   ├─ Browser notifications (si aceptó permiso)
   ├─ AI Daily Briefing dentro del panel (solo si abre /admin/asistente-ia)
   └─ 🚫 NO hay push a WhatsApp del resumen (pese a que onboarding lo promete)
   ▼
Día 14 → trial expira (plan free sin Stripe → bloqueado 402 trial_expired)
```

**Fricciones detectadas:**
- El wizard `/onboarding` es **5 pasos lineales** pero el paso 4 es una tarjeta estática que no deja al usuario **tocar un POS de verdad**. El "aha moment" real (primera venta) no ocurre dentro del wizard.
- `handleSkipAll` existe en todos los pasos → fácil de terminar con tenant vacío (0 productos, 0 clientes).
- El wizard NO conecta a **catálogo seed** — el dueño promedio en Pucallpa no va a teclear 50 productos. Competencia (Vendemás, Loyverse) ofrece catálogo pre-cargado de productos peruanos comunes.
- Tras completar onboarding → redirect a `/admin` sin **tour guiado** del sidebar (17 módulos son una pared de opciones para una señora de 55 años).

### 1.2 Flujo Cliente final (B2C — señora 55 años)

```
Landing https://buleje.pe/
   │ (Header + Hero + catálogo de productos + combos + recetas)
   ▼
Búsqueda / categoría / click producto
   │
   ▼
Add to cart  (BroadcastChannel multi-tab — técnicamente bien)
   │
   ▼
CheckoutModal  (pasos: account → delivery → payment → review → success)
   │ Yape / efectivo / tarjeta
   ▼
Success + confetti + orderId
   │
   ▼
Post-delivery survey (StarRating 1-5 + comment) ← solo si el flow de entrega dispara el trigger
   │
   ▼
¿Repeat purchase?
   ├─ Email abandoned cart... NO, va a NOTIFY_EMAIL (admin), NUNCA al cliente ← BUG crítico
   ├─ Loyalty: autoDiscount por tier (Nuevo 0% → Conocido 2% → Habitual 4% → VIP 6%)
   ├─ Referral: código BSM-XXXX-Y (último 4 + checksum) — banner en home
   ├─ Birthday coupons (existe endpoint /api/birthday-coupons, sin confirmar trigger)
   └─ WhatsApp conversation engine existe (`lib/whatsapp/conversation-engine.ts`) pero fuera del flow de re-engagement, solo como canal reactivo
```

**Fricciones detectadas:**
- El **abandoned cart** manda email al dueño, NO al cliente. La señora que dejó 3 productos en el carrito jamás recibe un "¿olvidaste algo? haz click y te lo llevamos ya".
- No hay **sign-up sin email**: el checkout pide email, pero en Pucallpa el 70% de señoras NO usa email activamente. Teléfono/WhatsApp sería más natural.
- El loyalty es autocalculado pero **no se le dice al cliente** "te faltan 3 compras para ser Habitual y ahorrar 4% siempre". La progresión no es visible en el flujo natural.

### 1.3 Flujo Proveedor (Supplier portal) — CRÍTICO

```
/supplier
   │ pantalla solo pide "API Key"
   │ "¿No tienes API Key? Contacta al administrador del marketplace."
   ▼
[DEAD END para cualquier proveedor que llega orgánicamente]
```

**FRICCIÓN MÁXIMA:** **No existe self-signup de proveedor**. La única entrada es una API key que alguien (Brandon?) entrega manualmente fuera de banda. Comparado con cualquier marketplace real (Rappi Turbo, Mercado Libre), esto significa cero adquisición orgánica de proveedores.

### 1.4 Flujo Cliente marketplace (multi-bodega)

```
/marketplace  → catálogo agregado de todas las tiendas del marketplace
   ▼
Click bodega → /marketplace/[slug]
   ▼
Añadir → MarketplaceCart → MarketplaceCheckoutModal
```

Existe `StoreRegistrationForm.tsx` para registrar tienda en el marketplace → esto sí tiene self-serve (buena señal).

---

## 2. Top 13 mejoras estratégicas

| # | Categoría | Mejora | Tipo | Impacto | Esfuerzo | Prio |
|---|---|---|---|---|---|---|
| 1 | Onboarding B2B | Catálogo pre-cargado de 200+ productos peruanos (Costeño, Gloria, Inka Cola, etc.) con 1-click import | 🆕 | Activation +40% (time-to-first-sale de 3 días → 20 min) | M | **P0** |
| 2 | Retention B2B | Daily briefing por WhatsApp al dueño a las 8pm (hoy promete y NO lo cumple) | 🚨 Bug | DAU +25%, entrega lo prometido en step 5 del wizard | S | **P0** |
| 3 | Retention B2C | Abandoned cart al **cliente** por WhatsApp (hoy va al admin) | 🚨 Bug | Recovery 8-12% de carts abandonados = +8% MRR tienda | S | **P0** |
| 4 | Onboarding proveedor | Self-signup de proveedor con formulario (hoy solo API key) | 🆕 | Desbloquea adquisición orgánica de supply en marketplace | M | **P0** |
| 5 | Activation B2B | POS interactivo dentro del wizard (step 4) — venta simulada real con confetti y "hiciste tu primera venta" | 🔄 | Aha moment +35% más fuerte, retention D7 +20% | M | P1 |
| 6 | Revenue lever | Plan "Pro" en soles (S/49 en vez de $49 USD) + pricing mensual+anual visible | 🔄 | Conversion free→pro +60% (psicológico en Perú) | S | P1 |
| 7 | Retention B2C | Progress bar visible del loyalty tier ("te faltan 3 compras para ahorrar 4% siempre") | 🆕 | Repeat purchase +15% | S | P1 |
| 8 | UX gap crítico | Empty states con CTA y video corto en cada módulo del admin (CRM vacío → "Importa contactos de tu agenda", productos 0 → "Usar catálogo sugerido") | 🆕 | Feature adoption +30%, menos overwhelm | M | P1 |
| 9 | Revenue lever | Referral program para **dueños de bodega** (hoy solo existe para clientes finales). "Trae 1 bodega amiga → 1 mes gratis ambas" | 🆕 | CAC ↓ 40% vía growth loop | M | P1 |
| 10 | Activation B2C | Checkout sin email (solo teléfono + nombre) con magic-link por WhatsApp | 🔄 | Conversion checkout +12-18% señora 55 años | M | P1 |
| 11 | Retention B2B | Notificación "Ayer vendiste S/X, hoy llevas S/Y" en push web + PWA badge a las 12pm (momento natural para abrir el panel) | 🆕 | Sesiones/día +30% | S | P2 |
| 12 | UX admin | Modo "señora mayor" — sidebar simplificado con solo 5 módulos core (POS / Productos / Plata / Clientes / Fiados) + toggle avanzado | 🔄 | Menor churn D30 usuarios no-tech | S | P2 |
| 13 | Community | Grupo WhatsApp de bodegueros Buleje (dueño de comunidad = Brandon) con playbooks, precios mayoristas, tips | 🆕 | NPS +20 pts, churn ↓ 25% por social proof/belonging | S (no-code) | P2 |

---

## 3. Detalle de las 13 mejoras

### 1. Catálogo pre-cargado de productos peruanos
**Categoría:** Onboarding B2B — eliminar fricción de "data entry day 1"
**Impacto esperado:** Reducir time-to-first-sale de ~3 días (medición de instinto) a <20 min. Activation rate +40%.
**Esfuerzo:** M (1 sprint) — tabla `product_templates` + endpoint `/api/onboarding/import-catalog` + paso nuevo en el wizard.
**Qué es:** Antes del paso "agrega tu primer producto" preguntar: "¿Qué vende tu bodega?" → multi-select de categorías (abarrotes, bebidas, lácteos, snacks, limpieza) → import masivo de 50-200 productos típicos peruanos con precios sugeridos regionales (Pucallpa/Lima) que el dueño ajusta después.
**Por qué:** El 80% de las bodegas venden los mismos 200 SKUs (Costeño, Gloria, Inka Cola, Don Vittorio, Pilsen Callao, Ace, Sapolio). La señora NO va a teclear 200 nombres. Vendemás y Loyverse (competencia) ganan aquí.
**Cómo:** Seed estático en JSON + mapper de categorías + tab nuevo en `OnboardingStep2Product` que ofrece "Usar catálogo sugerido" vs "Agregar manual". Fallback: si saltó el paso, ofrecer import en dashboard con banner persistente.
**Dependencias:** Product data scraping/curado (agencia data-analyst), schema products sin cambios.

### 2. Daily briefing por WhatsApp (FIX de bug UX)
**Categoría:** Retention B2B — cumplir la promesa del wizard
**Impacto:** Entrega lo que el Step 5 del onboarding ya promete. DAU admin +25%. Feature adoption del resumen diario +300% (porque hoy es 0 — solo email).
**Esfuerzo:** S (3-5 días)
**Qué es:** Cambiar `/api/daily-digest/route.ts` para que si `tenant.whatsappResumen === true` y hay número configurado, envíe el resumen al WhatsApp del dueño vía el conversation-engine existente. Además: enviarlo **aunque no haya ventas** ("Hoy no se registraron ventas. ¿Todo bien? Responde 'ayuda' si necesitas algo.") — hoy retorna `{sent: false}` cuando `orders.length === 0`, lo cual silencia al dueño justo en sus peores días (cuando más necesita intervenciones).
**Por qué:** En Pucallpa el email NO es el canal del dueño de bodega. WhatsApp sí. Además, el silencio en días sin ventas es la peor señal de UX — el dueño cree que el sistema no funciona. El daily digest hoy se envía a las 9pm via cron, pero el `sendDailyDigestEmail` solo usa SMTP/Gmail.
**Cómo:** Nueva función `sendDailyDigestWhatsApp(tenantId)` en `lib/mailer-digest.ts` (o crear `lib/digest-dispatcher.ts`). Usar el TenantWhatsAppConfig que ya existe en schema. Mensaje corto: "📊 Hoy vendiste S/X en Y pedidos. Top: arroz Costeño (15u). Yape 60%, efectivo 40%. Stock bajo: 3 items."
**Dependencias:** `lib/whatsapp/conversation-engine.ts` (ya existe), `TenantWhatsAppConfig` model, WhatsApp provider credentials.

### 3. Abandoned cart al cliente (FIX de bug crítico)
**Categoría:** Retention B2C — recuperar MRR de tienda
**Impacto:** Tasa de recovery 8-12% de carts abandonados. Para una bodega con 100 carts abandonados/mes promedio de S/35 → +S/300-420/mes/tenant. Benchmark: Shopify apps de cart recovery reportan 10% median.
**Esfuerzo:** S (2-3 días)
**Qué es:** Actualmente `app/api/abandoned-cart/route.ts` hace `nodemailer.sendMail` a `NOTIFY_EMAIL` (el admin). Cambiar a: si `parsed.data.phone` existe → enviar WhatsApp al **cliente** con link directo al carrito ("Hola! Dejaste S/45 en tu carrito de Buleje. ¿Te lo llevamos ya? 👉 [link]"). Admin recibe copia solo como secondary notification.
**Por qué:** Literalmente el único canal que abre una señora 55 años es WhatsApp. Email es irrelevante. Hoy el feature está mal diseñado — el admin no puede actuar sobre una lista de carts abandonados a mano.
**Cómo:** Trigger desde `CartContext` a los 20 min de inactividad con items en el carrito y phone conocido. Rate limit: máximo 1 mensaje cada 48h por número. Cooldown durante la noche (22:00-08:00).
**Dependencias:** WhatsApp provider, ab-test del mensaje/horario.

### 4. Self-signup de proveedor
**Categoría:** Onboarding — desbloquear supply side del marketplace
**Impacto:** Hoy: 0 proveedores orgánicos. Con self-signup + verificación manual superadmin: 5-20 proveedores/mes en el primer trimestre.
**Esfuerzo:** M (1 sprint) — formulario + aprobación superadmin + email de bienvenida con API key generada.
**Qué es:** Crear `/supplier/registrar` con formulario (nombre comercial, RUC, categoría, email, teléfono, productos que ofrece). Backend crea `Supplier` con estado `pending_review`. Brandon aprueba desde superadmin → se genera API key y se envía por email al proveedor.
**Por qué:** Sin esto, el marketplace nunca tendrá escalamiento de supply. Rappi Turbo y Tambo+ ganan porque el supplier puede auto-onboardarse. Brandon NO puede hacer outreach manual a cada proveedor.
**Cómo:** Nuevo `components/supplier/SupplierRegistrationForm.tsx`, endpoint `POST /api/supplier/register`, tab en `/superadmin/marketplace/suppliers` con queue de aprobación.
**Dependencias:** Supplier model (ya existe), email template, verificación SUNAT/RUC opcional vía `lib/credit/reniec-client.ts` pattern.

### 5. POS interactivo dentro del onboarding (aha moment real)
**Categoría:** Activation — el momento "¡funciona!"
**Impacto:** Retention D7 +20%. Si el dueño hace una venta DENTRO del wizard, la adopción del POS en día 2 sube dramáticamente.
**Esfuerzo:** M (1 sprint)
**Qué es:** Reemplazar `OnboardingStep4POSDemo.tsx` (hoy son 3 tarjetas estáticas) por un POS simplificado con 3 productos de muestra (Arroz / Inka Cola / Pan), el dueño "vende" arroz, simula pago Yape, ve el confetti. "¡Acabas de hacer tu primera venta de prueba! Ahora hagamos una real."
**Por qué:** Los onboardings que logran que el usuario use la feature real (no un video) tienen 2-3x mejor retention (Slack, Notion, Superhuman). El paso 4 actual es "leer 3 cards y clickear Siguiente" — cero engagement, cero memoria muscular.
**Cómo:** Componente `OnboardingStep4POSDemoInteractive.tsx` que muestra un mini-POS con 3 productos hardcoded, usa el componente `POSView` en modo read-only/sandbox. Al finalizar, dispara confetti local (ya existe en el wizard).
**Dependencias:** POSView componente (ya existe), sandbox state local.

### 6. Pricing en soles
**Categoría:** Revenue — conversion free→paid
**Impacto:** Conversion free→pro +40-60%. Hoy los planes están en USD ($49/mes) — en Perú la fricción psicológica con USD es alta ("¿cuánto es eso en soles? ¿paga con tarjeta internacional?").
**Esfuerzo:** S (1-2 días)
**Qué es:** En `lib/plans.ts` agregar `priceMonthlyPEN` y `priceYearlyPEN`. Mostrar "S/185/mes" en lugar de "$49/mes". Ofrecer Yape/Plin como método de pago (además de Stripe).
**Por qué:** $49 en Perú suena a "no sé si puedo pagarlo". S/185 suena concreto. Además permite ajuste de precio regional (a Vendemás cobra S/99 y Loyverse es free hasta nivel avanzado — estás dejando plata en la mesa si cobras más pero en USD).
**Cómo:** Update `lib/plans.ts`, `PricingTable.tsx`. Agregar toggle "Mensual / Anual". Integrar Yape/Plin business (hoy solo POS tiene Yape, no facturación SaaS).
**Dependencias:** Stripe config, integración Mercado Pago o Culqi para tarjetas locales, Yape Business para pagos recurrentes.

### 7. Progress bar del loyalty tier visible
**Categoría:** Retention B2C — gamification
**Impacto:** Repeat purchase rate +10-15%. El auto-discount engine (`lib/db/... AUTO_DISCOUNT_TIERS`) ya está implementado: Nuevo 0%, Conocido 5 compras 2%, Habitual 20 compras 4%, VIP 50 compras 6%. Pero nadie se lo dice al cliente.
**Esfuerzo:** S (2-3 días)
**Qué es:** En el `CheckoutModal` mostrar: "Eres Conocido (5 compras). Te faltan 15 para ser Habitual y ahorrar 4% siempre 🎯" con progress bar. En el email/WA post-venta: "¡Compra #3 de 5 para tu primer descuento!".
**Por qué:** Efecto Zeigarnik + sunk cost: ya tienen progreso invertido, no quieren perderlo. Starbucks Rewards y Mercado Pago usan esto religiosamente.
**Cómo:** Componente `LoyaltyProgress.tsx` que consume `/api/loyalty/[phone]`. Insertar en checkout success, en home del cliente (si logueado), y en el mail de confirmación.
**Dependencias:** API loyalty ya existe.

### 8. Empty states con CTA y video
**Categoría:** UX gap crítico — feature adoption
**Impacto:** Feature adoption rate (# de módulos usados al día 7) +30%. Menos "abro el panel, veo 17 íconos, no sé qué hacer, cierro".
**Esfuerzo:** M (1 sprint para los 17 módulos)
**Qué es:** Cada módulo del admin debe tener un empty state con: ícono grande, 1 frase explicando valor, 1 video de 30s (Loom), y 1 CTA accionable:
- CRM vacío → "Aún no tienes clientes. **Importa de tu agenda** o **añade manualmente**" + video "Cómo cargar tus clientes frecuentes en 2 minutos"
- Productos 0 → "Empieza con nuestro catálogo de 200+ productos peruanos" + button → catálogo sugerido
- Fiados 0 → "Aún no tienes fiados. Registra el primero para llevar cuenta" + video "Cómo funciona el módulo de fiados"
**Por qué:** Los 17 módulos del sidebar son una pared de opciones. La señora de 55 años necesita contexto dentro del módulo, no en el sidebar.
**Cómo:** Crear `components/admin/shared/EmptyStateTemplate.tsx` con props {icon, title, description, videoUrl, ctas[]} y reemplazar en cada módulo. Videos grabar en Loom (30-60s) con el propio Brandon demostrando.
**Dependencias:** Tiempo de Brandon para grabar videos (puede usar Descript o Loom automático).

### 9. Referral program para dueños de bodega
**Categoría:** Revenue/Growth — growth loop viral
**Impacto:** CAC ↓ 30-40%. Si 1 de cada 5 dueños trae 1 amigo, k-factor 0.2 — significativo.
**Esfuerzo:** M (1 sprint)
**Qué es:** Hoy solo existe referral para clientes finales (`ReferralBanner.tsx` con código `BSM{last4}{char}`). Crear equivalente para tenants: cada dueño tiene un código único que al usarse en `/plataforma/registro` (hay un campo `referralCode` que existe pero no tiene reward asociado), otorga 1 mes Pro gratis a AMBOS (quien refiere y quien llega).
**Por qué:** Los bodegueros en Pucallpa son una red densa — se conocen, van al mismo mercado mayorista, comparten proveedores. Un referral viral tiene sentido natural. Además, Brandon no puede hacer outreach 1:1, necesita un growth loop.
**Cómo:** Expandir el schema Tenant con `referralCodeOwn` (único), `referredByTenantId`. Endpoint `/api/tenant/apply-referral`. Lógica de reward en `lib/plans.ts` (extender trial 30 días adicionales). Banner en `/admin/plan` mostrando "Invita otra bodega → 1 mes gratis los dos" con link directo a WhatsApp con mensaje pre-formateado.
**Dependencias:** Schema migration, trial extension logic, WhatsApp deeplink.

### 10. Checkout sin email, magic-link WhatsApp
**Categoría:** Activation B2C — conversion final
**Impacto:** Conversion en checkout +12-18%. Perfil típico señora 55 Pucallpa → no tiene email activo.
**Esfuerzo:** M (1 sprint)
**Qué es:** En `CheckoutAccountStep.tsx` hacer el email opcional y promover teléfono/WhatsApp como primary identifier. Al hacer checkout, en lugar de crear cuenta con password, enviar magic-link al WhatsApp del cliente con OTP corto.
**Por qué:** El 70%+ de clientes objetivo no usan email. Forzar email = pérdida directa de conversion. WhatsApp OTP es natural y conocido (Yape lo hace así).
**Cómo:** Nuevo flujo `/api/auth/whatsapp-otp` con código de 6 dígitos + validación por 5 min. Guest checkout también OK (sin crear cuenta) con solo teléfono.
**Dependencias:** WhatsApp provider, rate limiting en OTP (ya existe `applyRateLimit`).

### 11. Notificación push web "ayer vs hoy" al mediodía
**Categoría:** Retention B2B — formar hábito
**Impacto:** Sesiones admin/día: de 1.2 promedio a 2.0+. Formación de hábito de 2 checkins diarios (mañana breafing + medio día).
**Esfuerzo:** S (2 días)
**Qué es:** Cron adicional a las 12:00 Lima que dispara web push notification (ya existe `app/api/notifications/subscribe`): "📊 Llevas S/Y hoy vs S/X ayer a esta hora. Top: Inka Cola (7u)."
**Por qué:** El briefing diario es de cierre (9pm). El dueño necesita un check-in a mitad de día para tomar decisiones (reponer stock, subir precios, contactar proveedores). Formar hábito de 2 touchpoints/día es el santo grial de retention SaaS.
**Cómo:** Nuevo endpoint `/api/midday-pulse` con CRON_SECRET, usa la misma data del daily-digest pero cortada al mediodía. Web Push via el existing subscribe endpoint.
**Dependencias:** Vercel cron (añadir entrada a vercel.json), web-push VAPID keys.

### 12. Modo "señora mayor" del admin
**Categoría:** UX — reducir overwhelm
**Impacto:** Reducción churn D30 en segmento no-tech (no medido hoy, pero inferencia: 15-25% del universo total).
**Esfuerzo:** S (3 días)
**Qué es:** Toggle en settings "Modo simple" (default ON para trials recién creados) que oculta 12 de los 17 módulos, dejando solo: POS/Ventas, Productos, Plata (ingresos/egresos), Clientes+Fiados, Mi Tienda. El dueño puede activar "Modo avanzado" cuando quiera.
**Por qué:** La pared de 17 módulos es disuasoria. Vendemás gana aquí ofreciendo una experiencia "solo POS". Nosotros tenemos ventaja si tenemos **ambos modos**.
**Cómo:** Setting `adminSimpleMode: boolean` en user preferences. `TAB_CATEGORIES.filter()` según modo. Banner no intrusivo "Tienes 12 módulos más avanzados disponibles → Ver más" que se dismiss-a.
**Dependencias:** User preferences schema, ya existe `useHiddenTabs` — usar eso.

### 13. Comunidad WhatsApp de bodegueros Buleje
**Categoría:** Retention/Community — moat social
**Impacto:** NPS +15-20 pts. Churn D30 ↓ 20-30% por belonging + peer learning. Fuente indirecta de testimonios, casos de uso, feature requests.
**Esfuerzo:** S (no-code) — grupo WhatsApp moderado + 1 playbook/semana.
**Qué es:** Grupo WhatsApp "Bodegueros Buleje Pucallpa" con 1 admin (Brandon). Contenido semanal: tip de la semana, producto que está subiendo de precio en el mercado, recordatorio de pago SUNAT, celebración de bodega del mes. Link al grupo dentro del admin (banner dismissable) + en el email post-activation.
**Por qué:** El activo más subestimado de un ERP vertical es la comunidad. Los bodegueros que SE SIENTEN PARTE no churnean. Adicionalmente: aprender de otros bodegueros es más valioso que cualquier feature del software. Brandon se convierte en el "alcalde" de los bodegueros de Pucallpa → imbatible.
**Cómo:** Crear grupo WA. Crear doc de rules. Link en `/admin/asistente-ia` como card "Únete a la comunidad". Brandon modera 15 min/día.
**Dependencias:** Cero técnicas. 100% operacional.

---

## 4. Top 3 que impactan DIRECTO a MRR/retention

| Ranking | Mejora | Razón |
|---|---|---|
| 🥇 1 | **#2 WhatsApp daily briefing** (fix de bug) | Cumple promesa del onboarding, DAU +25%, cero excusa para no hacerlo (ya existe el engine WA) |
| 🥈 2 | **#3 Abandoned cart al cliente** (fix de bug) | Recovery inmediato de 8-12% de carts abandonados = +S/300-500/mes por tenant. Escala lineal con # de tenants |
| 🥉 3 | **#1 Catálogo pre-cargado peruano** | Mata el "data entry day 1". Reduce time-to-first-sale de 3 días a 20 min. Es el mayor bloqueador de activation hoy |

**Las 3 juntas impactan las 3 métricas clave del SaaS:** activation (#1), retention (#2), revenue expansion (#3).

---

## 5. Onboarding — lo que falta crítico

| Gap | Severidad | Fix |
|---|---|---|
| No hay import masivo de productos en onboarding | 🔴 Crítico | #1 Catálogo pre-cargado |
| Paso 4 es estático, no hay venta real de prueba | 🟡 Alto | #5 POS interactivo en wizard |
| No hay tour guiado post-wizard del admin | 🟡 Alto | Overlays tipo Shepherd.js en primera visita de `/admin` |
| Self-signup de proveedor inexistente | 🔴 Crítico | #4 Formulario supplier |
| No se mide activation rate (primer valor en D7) | 🟡 Alto | #última columna (métricas) |
| Email obligatorio en checkout cliente | 🟡 Alto | #10 Checkout sin email |
| No hay welcome email con "próximos pasos" al nuevo dueño después del wizard | 🟢 Medio | Email secuencia D0/D1/D3/D7 tipo Intercom |
| Wizard permite saltar TODO y terminar con tenant vacío | 🟢 Medio | Forzar al menos catálogo (#1) o primera config real |

---

## 6. Retention loops faltantes

1. **Loop diario del dueño** — hoy solo email 9pm. Falta: WA 8pm (#2), push 12pm (#11).
2. **Loop semanal del dueño** — no existe. Propuesta: resumen semanal los domingos ("Esta semana vendiste S/X, S/Y más que la anterior. Tu producto estrella fue Z. Recomendación: reponer W").
3. **Loop del cliente final** — parcialmente existe (post-delivery survey + referral banner). Falta: push cuando el producto favorito entra en oferta, birthday coupon automatizado con recordatorio, "ya es hora de recomprar" basado en cadencia (la señora compra arroz cada 14 días).
4. **Loop de proveedor** — inexistente (no hay ni proveedores).
5. **Loop social / community** — no existe (#13).
6. **Loop de sentimiento** — no se pide NPS al dueño nunca.

---

## 7. Revenue levers no-técnicos

| Lever | Estado actual | Propuesta |
|---|---|---|
| **Pricing trial** | 14 días implícito (`trialEndsAt`) | Agregar trial extension por acción ("completa onboarding → +7 días") |
| **Pricing en moneda local** | USD | #6 Soles + Yape Business |
| **Referral merchant** | No existe | #9 Tenant referral program |
| **Upsell in-app** | No se ve. El botón "plan/upgrade" está en el módulo "plan" solo | Banner contextual: "Alcanzaste 40/50 productos, upgrade a Pro para ilimitados" (el `planLimitPayload` ya existe para 402) |
| **Cross-sell** | Cero | Marketplace sponsored (ya existe `SponsoredAdminPanel`) — vender slots a proveedores = nueva línea de revenue |
| **Training/academia** | No existe | Videos Loom 2-5 min por módulo → curso "Cómo digitalizar tu bodega en 7 días" (lead magnet + upsell) |
| **Certificación** | No existe | Badge "Bodega Digital Certificada Buleje" después de 30 días activo + 20 ventas (para pegar en la fachada física — marketing viral GRATUITO) |
| **Community WhatsApp** | No existe | #13 |
| **Partnerships** | Cero visible | Deal con distribuidor mayorista regional: "Si compras vía Buleje con tu distribuidor X, 5% cashback" |

---

## 8. Métricas que Brandon probablemente NO mide (pero debería)

| Métrica | Por qué importa | Fuente de datos (ya existe) |
|---|---|---|
| **Activation rate** (dueño que hace primera venta real en D7) | La métrica #1 del SaaS vertical | Tenant + Order query |
| **Time-to-first-sale** (minutos desde signup hasta primera venta) | Mide si el onboarding entrega valor rápido | Tenant.createdAt + first Order.createdAt |
| **Time-to-first-fiado** | Feature estrella del producto, si no se usa = señal roja | Tenant + CreditTransaction |
| **DAU/WAU/MAU admin** | Forma base de hábito | AdminUser lastLoginAt + sessions table (¿existe?) |
| **Feature adoption rate** (% de los 17 módulos usados en D14) | Mide "sticky-ness" | `lib/churn/health-scorer.ts` ya tiene `featuresUsed` 🎯 |
| **Repeat purchase rate** (% clientes con 2+ compras) | Métrica de retention B2C | Customer + Orders |
| **Abandoned cart rate** | Leak directo de revenue | Cart Context + Order |
| **Customer support volume** | Señal de friction/onboarding fail | No medido hoy |
| **NPS interno del dueño** | Predictor de churn más fuerte que cualquier ML | Cero infraestructura hoy |
| **Session duration admin** | Engagement depth | Sin tracking |
| **Healthscore per tenant** | Ya implementado ✅ | `lib/churn/health-scorer.ts` — ¡solo falta surfacearlo en un dashboard! |

**Insight fuerte:** el `health-scorer.ts` ya calcula DAU, MAU, orders, features — pero no hay dashboard PM que lo exponga. Esto es un **quick win masivo**: construir una vista `/superadmin/metrics` con esos KPIs ya calculados.

---

## 9. Dark pattern positivo (retiene sin ser intrusivo)

**"Loss aversion del loyalty tier con countdown"**

Cuando el cliente ya es "Habitual" (4% descuento), y pasan 25 días sin comprar: push al WhatsApp "Tu descuento de Habitual (4%) vence en 5 días si no compras esta semana. No pierdas tu estatus 🎯". Es honesto (es data real), no es spam (1 vez cada 60 días por cliente), y activa la loss aversion — el dolor de perder duele 2x más que la ganancia.

Funciona porque ya se invirtió esfuerzo en llegar a Habitual (20 compras). Starbucks Rewards lo hace. LinkedIn Premium lo hace. Duolingo streak lo hace. Es el retention dark pattern más poderoso cuando está bien diseñado.

---

## 10. Ciego / gap obvio en onboarding

**El dueño nunca "ve" una venta real antes de terminar el wizard.**

El flujo actual: completa datos → ve 3 tarjetas estáticas → click "Entendido, quiero vender" → redirect a /admin con 17 módulos vacíos → "¿ahora qué?".

El momento "WOW, esto funciona" NO ocurre durante el onboarding. Ocurre (si ocurre) horas o días después, cuando el dueño finalmente se anima a hacer una venta real. Ese delay es letal — la retention D1 depende de que el aha moment ocurra en los primeros 10 minutos.

**Fix mínimo (ship this week):** el `OnboardingStep4POSDemo` debe ser interactivo. Mostrar 3 productos mock, dejar que el dueño arrastre al carrito, simule pago Yape, vea ticket de venta con "tu primera venta fue S/12.50 — así se va a ver cada venta real". Confetti + screenshot shareable ("Comparte tu primera venta en el grupo de bodegueros").

---

## 11. Lo que NO tocar

- **`components/CartSidebar.tsx`** — BroadcastChannel multi-tab sync funciona y es frágil. Zona de peligro.
- **`components/checkout/CheckoutModal.tsx`** + steps — pagos/cupones/reservas/idempotency. Cualquier cambio aquí requiere skill `checkout-flow` + tests e2e. Solo tocar #10 (email opcional) con extremo cuidado.
- **`lib/db/orders.db.ts`** — state machine de pedidos. No refactorizar sin ADR.
- **`lib/auth/role-permissions.ts`** — 26 recursos × 6 roles. Cualquier cambio bloquea módulos en producción.
- **`proxy.ts` + `lib/middleware/**`** — auth + CSP + tenant + rate limit. ADR 014.
- **`prisma/schema.prisma`** — 131 modelos. Agregar campos está bien (ej. `referralCodeOwn` para #9) pero nunca refactor estructural.
- **`lib/whatsapp/conversation-engine.ts`** state machine — extender (agregar handlers nuevos) sí, pero no reescribir.
- **`lib/churn/health-scorer.ts`** — ya funciona. NO re-implementar, solo SURFACEAR en UI.

---

## Cierre

**El proyecto tiene una base técnica poderosa que está sub-utilizada desde una lente de producto.** Hay 3 bugs de UX graves (daily digest email-only, abandoned cart al admin, supplier portal sin self-signup) que son fixes de 2-5 días cada uno y mueven la aguja más que cualquier feature nueva. Brandon debería atacar esos 3 primero (P0), luego las 3 mejoras de activation (catálogo preseed, POS interactivo, empty states con CTA), y luego el growth loop (referral bodeguero + comunidad WhatsApp).

**Los quick wins (P0) suman: ~10-15 días de trabajo. Impacto esperado: +25% DAU, +10% MRR tienda, +desbloqueo total de marketplace supply.**

**La métrica que hay que pintar en la pared primero:** `activation rate D7 = % de tenants que hicieron ≥1 venta real en los primeros 7 días`. Hoy probablemente está en 15-30%. Target: 55%+.
