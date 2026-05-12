# ADR-104: Estrategia mobile — Capacitor placeholder vs export estático vs PWA

**Fecha:** 2026-05-12
**Estado:** Aceptado (decisión: priorizar PWA, Capacitor en pausa)
**Origen:** Auditoría mobile read-only sesión 2026-05-12

## Contexto

El proyecto Buleje tiene archivos `capacitor.config.ts` y `capacitor.config.json`
en root + un directorio `android/` con solo un placeholder. El módulo
`components/admin/ChangelogModule.tsx:87` promete "App móvil nativa con Capacitor"
como feature, pero la realidad técnica es:

| Evidencia | Estado |
|---|---|
| `android/` contiene | solo `android/app/build/.npmkeep` (placeholder vacío) |
| `AndroidManifest.xml` | NO existe |
| `network_security_config.xml` | NO existe |
| Código Java/Kotlin | NO existe |
| `@capacitor/cli`, `@capacitor/android` en package.json | NO instalados |
| Plugins Capacitor instalados | solo `@capacitor/core@^8.3.3` + `@capacitor/geolocation@^8.2.0` |

**Conclusión técnica**: Buleje **NO genera APK hoy**. Promesa de marketing
desalineada con realidad. Score mobile en auditoría: **8/20**.

## Problemas detectados

### HIGH — 2 configs Capacitor en conflicto

- `capacitor.config.ts`: declara `androidScheme: https` + dev URL `localhost:3000`
- `capacitor.config.json`: declara `server.url: https://www.buleje.pe` directo

Capacitor lee `.json` primero. Resultado: WebView en dev cargaría desde prod,
imposibilitando debug local. Bug latente.

### HIGH — Patrón "live-reload mode" en prod

`capacitor.config.json:6` apunta el APK a `https://www.buleje.pe`. El APK
sería un wrapper WebView de la web pública:
- ❌ Requiere internet 100% del tiempo (no offline)
- ❌ MITM con cert pinning roto vería toda la sesión
- ❌ Google Play penaliza apps que son solo WebView a URL
- ❌ Sin valor agregado vs PWA instalable

### MED — `webDir: "out"` pero Next.js sin `output: 'export'`

`cap sync` fallaría porque la carpeta `out/` nunca se genera. Cuando se ejecute
`npm run app:build:android`, romperá silenciosamente.

### MED — `appendUserAgent: "Buleje/Android"` como única señal

Si el backend usa UA para gating de features sensibles (precios mayorista,
descuentos socio), es trivialmente falsificable.

### LOW — `appId: "pe.buleje.app"` no reservado

Squatting risk: cualquiera puede registrar el appId en Play Store antes que
Buleje.

## Decisión

**Triple decisión:**

### 1. Pausar Capacitor formalmente hasta Q3-2026

Eliminar `capacitor.config.json` (deja `.ts` como única fuente). NO instalar
`@capacitor/cli` ni `@capacitor/android` hasta que haya:
- Decisión explícita de Brandon sobre offline-first vs WebView wrapper
- Roadmap claro de features mobile-only
- Recursos para auditoría completa (deep links + cert pinning + permisos)

### 2. Priorizar PWA instalable mientras tanto

Next.js 16 + service worker + manifest.json + iconos. Permite:
- "Instalar app" en home screen Android/iOS
- Push notifications (Web Push API)
- Offline básico con service worker cache
- Cero overhead de Capacitor / nativo
- Una sola build, un solo deploy

### 3. Sacar promesas de "app nativa" del marketing hasta tener APK real

- `components/admin/ChangelogModule.tsx:87` actualizar copy
- Roadmap `lib/roadmap/items.ts:1100` mover a "futuro"
- Landing `app/(marketing)/planes` quitar mención si la hay

## Plan de acción

| # | Acción | Cuándo | Responsable |
|---|---|---|---|
| 1 | Eliminar `capacitor.config.json` (single source of truth) | Esta semana | Dev |
| 2 | Reservar `pe.buleje.app` en Google Play Console (defensa) | Esta semana | Brandon |
| 3 | Quitar promesa "app nativa" del ChangelogModule | Esta semana | Dev |
| 4 | Implementar PWA manifest + service worker | Mes 1 | Dev |
| 5 | Si Capacitor sigue en roadmap: ADR-105 con strategia clara | Q3-2026 | Brandon |
| 6 | Auditoría mobile fase 2 (post `cap add android`) | Cuando exista APK real | Security |

## Consecuencias

### Positivas

- Alinea marketing con realidad técnica (anti-engagement-bait)
- PWA cubre 80% del use case mobile sin complejidad de APK
- Liberación de scope: no hay APK que mantener
- Score mobile sube de 8 a 14 con PWA básica

### Negativas / Riesgos

- Algunas features nativas no disponibles (background sync, FCM nativo, NFC)
- Si Brandon prometió "app nativa" a un cliente, debe gestionarlo
- Pérdida de presencia en Play Store (compensada con PWA install banner)

## Score impact

| Categoría | Antes | Con plan | Con APK real (Q3-2026) |
|---|---:|---:|---:|
| Mobile | 8/20 | 14/20 (PWA) | 18/20 (APK auditado) |

## Referencias

- Auditoría mobile read-only 2026-05-12 (Security Auditor agent)
- [Capacitor 8 docs](https://capacitorjs.com/docs)
- [Next.js PWA con App Router](https://nextjs.org/docs/app/building-your-application/configuring/progressive-web-apps)
- [Google Play Console — Reserve app ID](https://support.google.com/googleplay/android-developer/answer/113469)
