---
applyTo: "**/capacitor*,**/android*,**/ios*,**/app:build*"
---

# Capacitor Mobile — Buleje

## Build command

```bash
cd buleje
npm run app:build    # = next build + next export + npx cap sync
```

## capacitor.config.json

```json
{
  "appId": "com.buleje.app",
  "appName": "Buleje",
  "webDir": "out",
  "server": {
    "androidScheme": "https"
  }
}
```

## next.config.ts para export (Capacitor requiere output estático)

```typescript
const nextConfig = {
  output: "export",  // Genera carpeta /out
  // ... resto de config
};
```

## Plugins de Capacitor instalados

```bash
@capacitor/core        # Core
@capacitor/cli         # CLI
@capacitor/android     # Android
@capacitor/ios         # iOS
@capacitor/push-notifications  # Push nativo (distinto de web-push)
@capacitor/camera      # Cámara (para fotos de productos)
@capacitor/filesystem  # Sistema de archivos
```

## Push notifications en Capacitor (vs Web Push)

```typescript
// Capacitor usa Firebase Cloud Messaging (Android) y APNs (iOS)
// Web Push (web-push lib) = para navegadores web
// Capacitor Push = para apps nativas instaladas

import { PushNotifications } from "@capacitor/push-notifications";

PushNotifications.addListener("registration", token => {
  // Guardar token en el servidor (distinto de PushSubscription)
});
```

## Deep links (URL routing en la app nativa)

```json
// capacitor.config.json:
"plugins": {
  "Deeplinks": {
    "iosScheme": "buleje",
    "androidScheme": "buleje"
  }
}
```

## Gotchas

- **`output: "export"` en next.config.ts** — requerido para Capacitor; cambia comportamiento del build
- **API routes NO funcionan en modo export** — la app móvil llama a la API web desplegada (Vercel)
- **`webDir: "out"`** — debe coincidir con el output de `next build` en modo export
- **npx cap sync** — debe correr DESPUÉS de `next build` — copia archivos a `android/` e `ios/`
- **iOS requiere Xcode** — builds de iOS solo en Mac
- **Android requiere Android Studio** — builds de Android en cualquier OS

## Comandos útiles

```bash
npx cap open android    # Abre Android Studio
npx cap open ios        # Abre Xcode
npx cap sync            # Sincroniza web files a native
npx cap run android     # Corre en emulador/dispositivo
```

## Anti-patrones

- NO confundir Web Push (web-push) con Capacitor Push Notifications — son diferentes
- NO esperar que los API routes funcionen en la app móvil — son serverless, no están en el bundle
- NO hacer `npx cap sync` antes de `next build` — sincronizará archivos desactualizados
