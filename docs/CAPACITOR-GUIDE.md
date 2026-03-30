# Guía: App nativa con Capacitor

## Requisitos previos
- **Android**: Android Studio instalado
- **iOS**: Xcode instalado (solo Mac)

## Setup inicial (una sola vez)

```bash
# 1. Instalar Capacitor
npm install @capacitor/core @capacitor/cli
npm install @capacitor/splash-screen @capacitor/status-bar @capacitor/keyboard @capacitor/push-notifications

# 2. Agregar plataformas
npm run cap:add:android   # Para Android
npm run cap:add:ios       # Para iOS (solo Mac)
```

## Build y deploy

```bash
# Build completo: genera la web y sincroniza con las plataformas nativas
npm run app:build

# Abrir en Android Studio para compilar el APK/AAB
npm run cap:open:android

# Abrir en Xcode para compilar el IPA
npm run cap:open:ios
```

## Generar APK firmado (Android)

1. `npm run app:build`
2. `npm run cap:open:android`
3. En Android Studio: Build → Generate Signed Bundle / APK
4. Seleccionar "Android App Bundle (AAB)" para Play Store
5. Firmar con tu keystore

## Publicar en Play Store

1. Ir a [Google Play Console](https://play.google.com/console)
2. Crear nueva aplicación
3. Subir el AAB firmado
4. Completar la ficha de la tienda (capturas, descripción)
5. Enviar a revisión

## Notas
- La app carga la web desplegada en `https://www.buleje.pe`
- Funciona como un wrapper nativo — misma funcionalidad que la PWA
- Ventaja: acceso desde Play Store/App Store, push notifications nativas, splash screen
