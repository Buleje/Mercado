# ADR-105: PWA Buleje — estado existente al 2026-05-12

**Fecha:** 2026-05-12
**Estado:** Documentación post-descubrimiento
**Contexto:** Auditoría mobile 2026-05-12 reveló que la PWA ya estaba implementada de manera muy completa, sin documentación previa que lo registrara.

## Contexto

El sprint 2026-05-12 incluyó un audit Mobile (ADR-104) que concluyó:
- Capacitor es placeholder (no APK real)
- Score mobile 8/20
- Recomendación: priorizar PWA sobre Capacitor

Al iniciar el "sprint PWA setup" (#11 del backlog semanal, estimado 3-4 hrs),
**se descubrió que la PWA ya estaba implementada** en commits previos sin
ADR que lo documentara. Este ADR registra el estado actual para futuros devs.

## Inventario de componentes PWA existentes

| Componente | Ubicación | Estado |
|---|---|---|
| **Manifest dinámico** | `app/manifest.ts` | ✅ Tenant-aware (lee SettingsDB por tenantId) |
| **Manifest estático fallback** | `public/manifest.json` | ✅ Para crawlers/bot |
| **Manifest delivery app** | `public/delivery-manifest.json` | ✅ App separada para repartidores |
| **Service Worker** | `public/sw.js` | ✅ 346 líneas, multi-cache strategy |
| **SW Registrar (client)** | `components/ServiceWorkerRegistrar.tsx` | ✅ Auto-register, lazy load post-FCP |
| **Install Prompt UI** | `components/InstallPrompt.tsx` | ✅ Sofisticado (post-1ra-compra + cupón) |
| **PWA Install Banner alt** | `components/PWAInstallBanner.tsx` | ✅ Banner alternativo |
| **PWA Shortcuts admin** | `components/admin/PWAShortcuts.tsx` | ✅ Quick actions admin |
| **Iconos dinámicos** | `app/api/pwa-icon/[size]/route.ts` | ✅ Cualquier size on-demand |
| **Icono estático fallback** | `public/icons/icon-192x192.png` | ✅ PNG raster |
| **Offline page** | `public/offline.html` | ✅ Standalone HTML, 26 líneas |
| **Apple touch icons** | `app/layout.tsx:280-284` | ✅ 120/152/167/180 sizes |
| **Viewport meta** | `app/layout.tsx:151` | ✅ Configured |
| **Theme color dinámico** | `app/manifest.ts:28` | ✅ Lee `s.primaryColor` por tenant |

## Service Worker — features implementadas

```
sw.js (346 líneas, version: buleje-v14)
├─ Kill-switch localhost (auto-unregister + cache clear en dev)
├─ Pre-cache estático: / + /tienda + 6 categorías + /offline.html
├─ Cache strategies por tipo:
│  ├─ Imágenes Unsplash/OpenFoodFacts → cache-first + limit 200
│  ├─ APIs read-only (products/promotions/settings) → network-first
│  ├─ /_next/static/* (immutable) → cache-first + limit 100
│  ├─ Google Fonts → cache-first
│  ├─ /tienda/categoria/* → catalog cache (offline browsing)
│  └─ Pages → network-first → cache → offline.html fallback
├─ Web Push notifications (badge, vibrate, click→navigate)
└─ Background Sync — POS sales offline (IndexedDB pendingSales)
```

## Install Prompt — estrategia de conversión

`components/InstallPrompt.tsx` implementa una estrategia sofisticada:

- ❌ NUNCA se muestra en `/admin` ni `/superadmin`
- ✅ Solo se muestra **una vez en la vida** del usuario
- ✅ Trigger: después de **completar primera compra** (localStorage `buleje-first-purchase=1`)
- 🎁 **Incentivo**: cupón `INSTALA10` al instalar
- 💾 Persiste el "ya se mostró" para no fastidiar (`buleje-install-shown=1`)

Esto es **mejor que el promedio de la industria** que muestra el prompt
inmediatamente y termina dismissed por la mayoría.

## Capacidades offline

| Acción del usuario | Funciona offline? |
|---|---|
| Cargar home `/` | ✅ Cache CACHE_NAME |
| Ver categorías `/tienda/categoria/*` | ✅ CATALOG_CACHE |
| Buscar productos `/api/products` | ✅ API_CACHE (último response cacheado) |
| Crear pedido | ❌ Requiere red — diseño intencional para evitar inconsistencia precio/stock |
| **Punto de venta POS offline** | ✅ IndexedDB pendingSales + Background Sync |
| Ver tienda admin `/admin` | ❌ Excluida del SW (siempre fresh) |
| Repartidor app `/delivery-app` | ✅ Pre-cached (señal inestable en moto) |

## Lo que NO está implementado

| Feature | Estado | Por qué |
|---|---|---|
| **iOS Add to Home Screen** mejorado | Parcial — apple-touch-icons OK, falta splash screens iOS específicos | iOS Safari no respeta `display: standalone` igual que Android |
| **Periodic Background Sync** | No | API experimental, soporte limitado |
| **Web Share Target API** | No | Permitiría compartir productos a Buleje desde otra app — feature avanzada |
| **App Badging** | No | iconBadge: count de pedidos pending en home screen |
| **Persistent storage permission** | No | Sin solicitar `navigator.storage.persist()` — cache podría ser purgada |
| **Splash screen Android** | Manifest define theme/bg, sin imagen splash custom | Default Android usa background_color + icon — OK |

## Score Mobile post-descubrimiento

| Métrica | Pre-audit (suposición) | Post-audit (realidad) |
|---|---:|---:|
| Mobile | 8/20 (Capacitor placeholder) | **17/20** (PWA completa) |
| Featured impl | 1 (Capacitor placeholder) | 13 (todo lo del inventario arriba) |

## Decisiones

1. **Mantener PWA como estrategia mobile principal** — Capacitor sigue en pausa indefinida (ADR-104).
2. **NO instalar `next-pwa` ni `@serwist/next`** — la implementación manual ya está optimizada y específica a Buleje (multi-tenant manifest dinámico, install prompt post-purchase, etc.). Migrar a una librería significaría perder customización.
3. **Próximos enhancements opcionales** (no prioritarios):
   - Solicitar persistent storage al 1er install
   - App badging API para count de pedidos pending
   - Web Share Target para compartir productos
4. **Auditoría Lighthouse PWA** — pendiente correr en próxima sesión para validar score.

## Verificación pendiente

```bash
# Cuando se haga deploy a buleje.pe, correr:
npx lighthouse https://buleje.pe \
  --only-categories=pwa \
  --output=json \
  --output-path=reports/lighthouse-pwa-2026-05-12.json
```

Score esperado: **≥85/100** PWA en Lighthouse.

## Referencias

- ADR-104: Estrategia mobile (Capacitor pausado)
- [Web App Manifest MDN](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Workbox strategies](https://developer.chrome.com/docs/workbox/caching-strategies-overview)
- [Lighthouse PWA audit](https://developer.chrome.com/docs/lighthouse/pwa/)
