# Guía: Publicar Buleje en Google Play Store

## Prerequisitos

1. **Cuenta Google Play Console** — $25 USD de pago único
   - Registrarse en: https://play.google.com/console
2. **Android Studio** instalado — https://developer.android.com/studio
3. **Java JDK 17+** instalado
4. **Node.js 18+** y npm

---

## Paso 1: Preparar el build web

```bash
cd bodega-san-martin

# Build de producción
npm run build

# Sincronizar con Capacitor
npx cap sync android
```

## Paso 2: Abrir en Android Studio

```bash
npx cap open android
```

Esto abre el proyecto en Android Studio. Espera a que Gradle sincronice.

## Paso 3: Crear keystore para firmar la app

Solo se hace UNA VEZ. Guarda el keystore en un lugar seguro.

```bash
keytool -genkey -v -keystore buleje-release.keystore -alias buleje -keyalg RSA -keysize 2048 -validity 10000
```

Te pedirá:
- **Contraseña del keystore** — anótala en un lugar seguro
- **Nombre y apellido** — Brandon
- **Organización** — Buleje
- **Ciudad** — Pucallpa
- **Estado** — Ucayali
- **País** — PE

## Paso 4: Configurar la firma en Gradle

Editar `android/app/build.gradle` y agregar antes de `buildTypes`:

```groovy
signingConfigs {
    release {
        storeFile file("../../buleje-release.keystore")
        storePassword "TU_CONTRASEÑA"
        keyAlias "buleje"
        keyPassword "TU_CONTRASEÑA"
    }
}
```

Y en `buildTypes`:

```groovy
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

## Paso 5: Generar el AAB (Android App Bundle)

Desde Android Studio:
1. **Build** → **Generate Signed Bundle / APK**
2. Seleccionar **Android App Bundle**
3. Seleccionar tu keystore
4. Seleccionar **release**
5. Esperar a que genere el archivo `.aab`

El archivo estará en: `android/app/build/outputs/bundle/release/app-release.aab`

## Paso 6: Crear la ficha en Play Console

1. Ir a https://play.google.com/console
2. **Crear aplicación**
3. Llenar:
   - **Nombre**: Buleje - Tu Bodega Online
   - **Idioma**: Español
   - **Tipo**: Aplicación
   - **Gratis**

### Ficha de la tienda

- **Descripción corta**: Pide a tu bodega favorita desde el celular. Delivery rápido en Pucallpa.
- **Descripción larga**: Buleje es la app para comprar en bodegas, minimarkets y fruterías de tu barrio. Busca productos, compara precios, pide delivery o recoge en tienda. Sin comisiones para el comprador.
- **Categoría**: Compras
- **Email de contacto**: contacto@buleje.pe

### Screenshots necesarios

- 2+ screenshots de celular (1080x1920 px)
- 1 screenshot de tablet 7" (1200x1920 px)
- 1 screenshot de tablet 10" (1920x1200 px)
- Ícono 512x512 px (ya está en `public/icons/icon-512x512.png`)
- Feature graphic 1024x500 px

## Paso 7: Subir el AAB

1. En Play Console → **Producción** → **Crear nueva versión**
2. Subir el archivo `.aab`
3. Escribir las notas de la versión:
   ```
   v1.0.0 — Lanzamiento
   - Marketplace de bodegas en Pucallpa
   - Busca productos de múltiples tiendas
   - Carrito multi-tienda
   - Pago con Yape, efectivo o Mercado Pago
   - Cupones de descuento
   - Programa de referidos
   ```
4. Guardar y enviar a revisión

## Paso 8: Revisión de Google

Google revisa la app (puede tomar 1-7 días). Posibles problemas:
- **Política de privacidad** — necesitas una URL pública (agregar en `/politica-privacidad`)
- **Permisos** — justificar cada permiso que pida la app
- **Contenido** — clasificar la app para edad

---

## Script rápido (todo en un comando)

```bash
# Build completo: web → sync → abrir Android Studio
npm run build && npx cap sync android && npx cap open android
```

## Archivos importantes

| Archivo | Qué es |
|---------|--------|
| `capacitor.config.ts` | Configuración de la app nativa |
| `android/app/build.gradle` | Build config de Android |
| `android/app/src/main/AndroidManifest.xml` | Permisos y configuración |
| `public/icons/` | Íconos de la app |
| `buleje-release.keystore` | Firma digital (NO subir a git) |

## Checklist pre-publicación

- [ ] `npm run build` exitoso sin errores
- [ ] `npx cap sync android` sin errores
- [ ] Keystore creado y guardado en lugar seguro
- [ ] Build firmado (.aab) generado
- [ ] Screenshots de la app (mínimo 2)
- [ ] Feature graphic 1024x500 px
- [ ] Descripción corta y larga
- [ ] Política de privacidad URL
- [ ] Clasificación de contenido completada
- [ ] Ficha de contacto completada
