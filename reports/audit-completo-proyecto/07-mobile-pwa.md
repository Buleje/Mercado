# Audit Mobile / PWA — Buleje

**Fecha:** 2026-05-17 · **Branch:** `feat/checkout-payment-proof` · **Ámbito:** `app/delivery-app/**`, `capacitor.config.{ts,json}`, `app/manifest.ts`, `public/manifest.json`, `public/sw.js`, `components/admin/MobilePOS.tsx`, ADR-104/105.

## Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Score Mobile/PWA | **9 / 20** (ligera mejora vs 8/20 de ADR-104) |
| Hallazgos P0 (críticos) | **4** |
| Hallazgos P1 (altos) | **5** |
| Hallazgos P2 (medios) | **4** |
| APK Android nativo | **NO genera** (placeholder vacío en `android/app/build/.npmkeep`) |
| PWA instalable | **Sí**, pero con bugs de manifest y theme-color rotos |

ADR-104 declaró Capacitor "en pausa" → realidad: 2 configs en conflicto (`.ts` + `.json`) **siguen versionados**. ADR-104 punto #1 ("eliminar `capacitor.config.json`") **no se ejecutó**.

---

## P0 — Críticos

| # | Hallazgo | Archivo:línea | Evidencia | Fix sugerido |
|---|---|---|---|---|
| P0-1 | **`MobilePOS.handlePay()` es un mock — NUNCA llama `/api/sales`** | `components/admin/MobilePOS.tsx:271-279` | `handlePay` solo hace `vibrate()` + `setPaySuccess(true)` + `setCart([])`. No fetch, no IndexedDB, no offline queue. Ruta `/admin/pos-mobile` shipea esto en prod. | Reemplazar el cuerpo de `handlePay` por la lógica real de `POSView.tsx:1350-1416` (POST `/api/sales` con `csrfHeaders`, fallback a `posOffline.addToQueue`). |
| P0-2 | **Dos `capacitor.config.*` en conflicto — bug latente APK live-reload prod** | `capacitor.config.ts` + `capacitor.config.json` | `.json` gana por orden de lectura de Capacitor. Apunta server.url → `https://www.buleje.pe`, convirtiendo el APK en wrapper WebView de prod (sin offline, MITM-prone, Google Play penaliza). ADR-104 ordenó eliminar el `.json`; sigue en repo. | Borrar `capacitor.config.json`. Mantener solo `.ts` con dev URL condicional. |
| P0-3 | **`themeColor: "var(--accent)"` no resuelve — meta-tag inválido en prod** | `app/layout.tsx:151` + `app/manifest.ts:13,28` | Next.js serializa `Viewport.themeColor` a HTML estático en build; `var(--accent)` no existe en `<head>`. Chrome / iOS Safari ignoran el valor → status bar/PWA splash usan defaults grises. `app/delivery-app/layout.tsx:24` ya lo corrigió a `#00B4A6`. | Reemplazar por hex literal `#00B4A6` en `app/layout.tsx:151`. En `app/manifest.ts:13` resolver desde `SettingsDB.primaryColor` con fallback hex. |
| P0-4 | **Dynamic `app/manifest.ts` nunca se sirve — `<link rel="manifest" href="/manifest.json">` lo override** | `app/layout.tsx:276` + `proxy.ts:139` | `app/manifest.ts` se sirve en `/manifest.webmanifest` y es tenant-aware (lee `x-tenant-id`). Layout enlaza al estático `/manifest.json` (no tenant). Además, `proxy.ts` excluye `manifest.webmanifest` del middleware → `x-tenant-id` jamás llega; el `headers().get("x-tenant-id") ?? "main"` siempre devuelve `"main"`. Multi-tenant manifest **roto**. | Cambiar enlace a `<link rel="manifest" href="/manifest.webmanifest">`. Remover `manifest\\.webmanifest` del exclude regex de `proxy.ts:139` (necesita resolver tenant). |

---

## P1 — Altos

| # | Hallazgo | Archivo:línea | Fix sugerido |
|---|---|---|---|
| P1-1 | **CSRF inconsistente en sync offline POS** — `lib/pos-offline-queue.ts:92-96` POST `/api/sales` sin `csrfHeaders()`. `hooks usePOSOffline.ts:65-68` sí lo incluye. Hay **dos colas offline paralelas**: SW (`sw.js:296-321`) usa IndexedDB `buleje-offline.pendingSales` + `lib/pos-offline-queue.ts` usa IndexedDB `buleje-pos-offline.pending-sales` + `usePOSOffline` usa `localStorage.pos-offline-queue`. **Tres stores distintos**. | Unificar en una sola fuente (`usePOSOffline` con IndexedDB) y siempre enviar CSRF. Background Sync del SW debe leer el mismo store. |
| P1-2 | **`<input type="file">` sin `capture="environment"` para comprobante Yape** — `components/checkout/PaymentProofModal.tsx:451`. En Android/iOS abre file picker en vez de cámara directa; rider/cliente debe navegar Galería. Fricción alta. | Agregar `capture="environment"` para que, en mobile, el botón "Captura del pago" abra la cámara trasera de inmediato. Dejar el clic alternativo en otro botón para galería. |
| P1-3 | **APK no construye — `webDir: "out"` pero Next sin `output: 'export'`** — `capacitor.config.ts:15`. `next.config.ts` no exporta. `npm run app:build:android` (línea 56 `package.json`) ejecuta `next build && npx cap sync android`; `cap sync` exige `out/` que no existe → falla silenciosa. ADR-104 lo flagueó como MED, sigue sin resolver. | Documentar como `chore: NOT supported until ADR-104 review`, o configurar PWA path con `server.url: https://buleje.pe` y borrar `webDir`. |
| P1-4 | **`@capacitor/cli` y `@capacitor/android` NO instalados** — `package.json:72-73` solo trae `@capacitor/core` + `@capacitor/geolocation`. Sin `cli`, `npx cap sync` falla. `lib/geo-utils.ts:36` hace `await import("@capacitor/geolocation")` que en runtime web también puede romper builds Turbopack si `Capacitor.isNativePlatform` se evalúa mal. | Instalar `@capacitor/cli @capacitor/android` (devDeps) o eliminar script `app:build:android` hasta Q3-2026. |
| P1-5 | **Service Worker sirve respuestas vacías como exitosas en offline-by-network-failure** — `public/sw.js:139` devuelve `new Response("[]", ...)` cuando fetch falla para `/api/products` sin cache previa. Cliente recibe lista vacía y cree que **no hay productos**, no que está offline. | Devolver `503` con header `x-offline: 1` y dejar al cliente mostrar empty-state correcto. |

---

## P2 — Medios

| # | Hallazgo | Archivo:línea | Fix sugerido |
|---|---|---|---|
| P2-1 | **23 componentes usan `100vh` (URL bar iOS lo rompe)**; solo `MobilePOS.tsx:288` migró a `100dvh`. | `components/{ProductCatalog,marketplace/*,admin/{WhatsAppInbox,StoreCreativeMode,...}}.tsx`. Migrar a `100dvh` con fallback `@supports`. |
| P2-2 | **Touch targets en `AdminMobileBottomBar`** — `py-1.5` + `h-5 w-5` icon → ~32-36 px alto. WCAG 2.1 AA exige ≥ 44 px. | `components/admin/AdminMobileBottomBar.tsx:64-92`. Subir a `py-3` o `min-h-[48px]`. |
| P2-3 | **`offline.html` con emoji 📡** — `public/offline.html:18` viola regla del proyecto (memoria `feedback_no_generic_emojis.md`). | Reemplazar con `<svg>` inline (Lucide `WifiOff` o `CloudOff`). |
| P2-4 | **Iconos PWA mismo PNG para `192` y `512`** — `public/manifest.json:14-22`. Ambos cargan `buleje-logo.png` 192×192. Android Pie+ se queja por low-res al install. | Generar `icon-512x512.png` real (PNG ≥512px). |

---

## Inventario rápido

| Componente | Estado |
|---|---|
| `capacitor.config.ts` | Existe pero contradice `.json` (P0-2) |
| `capacitor.config.json` | Debería estar borrado por ADR-104 — sigue en repo |
| `app/manifest.ts` (dynamic tenant) | Existe pero NO se sirve (P0-4) |
| `public/manifest.json` (static) | Default activo, sin tenant |
| `public/delivery-manifest.json` | OK — scope `/delivery-app` |
| `public/sw.js` v14 | OK arquitectura multi-cache, P1-1 dual store / P1-5 falsey response |
| `components/InstallPrompt.tsx` | OK (estrategia post-1ra-compra + cupón INSTALA10) |
| `hooks/use-push-notifications.ts` | OK (VAPID + `userVisibleOnly: true`) |
| `lib/geo-utils.ts` | OK (Capacitor branch con dynamic import) |
| `android/` | Solo `.npmkeep` vacío — no compila |
| `ios/` | NO existe directorio |
| `MobilePOS.tsx` mounted en `/admin/pos-mobile` | **No funcional** (P0-1) |

---

## Recomendación de orden

1. **Hoy (≤ 1 día)**: P0-1 (MobilePOS mock), P0-3 (theme-color hex), P0-4 (manifest link).
2. **Esta semana**: P0-2 (eliminar `.json`), P1-1 (unificar offline queue), P1-2 (camera capture).
3. **Sprint próximo**: P1-3/P1-4 (decisión definitiva sobre Capacitor — pausar o invertir), P2-1 (migración masiva `100vh→100dvh`).

---

## Sugerencias para Brandon

| # | Acción | Esfuerzo | Razón |
|---|---|---|---|
| 1 | Aprobar fix de **P0-1** (MobilePOS mock) — la ruta `/admin/pos-mobile` shipea hoy una pantalla que dice "Cobrado" sin registrar venta | 2 h | Riesgo de pérdida de dinero real si un cajero la usa en tablet. |
| 2 | Decidir: ¿matamos Capacitor formalmente o invertimos en APK real? | 30 min | ADR-104 (2026-05-12) dijo "pausar" pero no se ejecutó la limpieza. Hoy ChangelogModule promete "App nativa Capacitor" que no existe. |
| 3 | Aprobar regenerar iconos PWA reales (192 + 512) | 1 h | Android Pie+ degrada install si el 512 es upscaled de 192. |

## Formulario

| Campo | Valor |
|---|---|
| Decisión Capacitor | [ ] Pausar (borrar `.json`, scripts, deps) · [ ] Invertir (instalar `@capacitor/cli`+`android`+ADR nuevo) |
| Fix P0-1 MobilePOS | [ ] Sí, prioridad hoy · [ ] Deshabilitar ruta `/admin/pos-mobile` temporalmente · [ ] Otro: ___ |
| Fix P0-3/P0-4 manifest+theme | [ ] Aprobar bundle de 3 cambios · [ ] Solo theme-color · [ ] Solo manifest |
| Tomar P1-2 (camera capture) | [ ] Sí · [ ] No |
| Migración masiva `100vh→100dvh` (P2-1, 23 archivos) | [ ] Programar sprint · [ ] Solo zonas críticas · [ ] Skip |
