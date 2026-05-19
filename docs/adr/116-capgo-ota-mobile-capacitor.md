# ADR-116 · Capgo OTA — Hotfixes mobile sin esperar review Play Store

**Fecha:** 2026-05-18
**Estado:** Propuesto · pendiente cuenta Capgo
**Autores:** Brandon Buleje + audit profundo arquitectura Sprint 4

## Contexto

Buleje tiene 2 apps Capacitor:
- **Customer app** (cliente B2C — marketplace mobile)
- **Delivery app** (repartidor)

Hoy:
- Cada bug fix mobile requiere release a Google Play Store / App Store
- Review Google Play: 1-7 días
- Review Apple App Store: 1-3 días
- Adopción de updates: solo cuando el usuario activa "actualizar" → ~70% en 1 semana, 95% en 3 semanas

**Problema:** un bug crítico en el cliente mobile (ej. checkout roto) queda
en producción 24-72h hasta que Google apruebe el fix. Pérdida de conversión
directa + reputacional.

## Decisión

Integrar **Capgo** (alternativa CodePush para Capacitor — Microsoft retiró
CodePush en 2024). Permite empujar updates JS/CSS directos al app instalado
sin pasar por la review de la store.

### Por qué Capgo vs alternativas

| Opción | Pros | Contras |
|---|---|---|
| **Capgo** ✅ | Open source + cloud hosted, $14/mes start, integración Capacitor directa, CDN global | Vendor lock-in marginal |
| Self-hosted CDN + custom updater | Sin vendor lock-in | Tiempo dev: 1 mes para llegar a paridad Capgo |
| EAS Update (Expo) | Maduro | Solo funciona con Expo, no Capacitor — no aplica |
| Microsoft CodePush | Familiar histórico | **Retirado 2024**, no aplica |

### Límites

OTA **solo puede actualizar JS + CSS bundle** (assets web). NO puede:
- Cambiar Capacitor plugins nativos (requiere release nuevo)
- Modificar AndroidManifest.xml / Info.plist
- Bypass de policies de las stores sobre cambios de funcionalidad mayor

→ Esto cubre el 90% de los hotfixes (bugs JS, UI, business logic).

## Setup técnico

### 1. Cuenta Capgo

- https://capgo.app → Sign up (free tier 1000 MAU)
- Para Buleje (4 free trial → 50+ pagos): plan **Start $14/mes** (5K MAU)
- Crear 2 apps:
  - `buleje.customer` (com.buleje.app)
  - `buleje.delivery` (com.buleje.delivery)

### 2. Instalar plugin Capacitor

```bash
npm install @capgo/capacitor-updater
npx cap sync
```

### 3. Configurar `capacitor.config.ts`

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.buleje.app",
  appName: "Buleje",
  webDir: ".next/standalone/public", // o el dir donde Capacitor toma assets
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true,
      autoUpdateUrl: "https://api.capgo.app/updates",
      // Update channels: production, beta, alpha
      defaultChannel: "production",
      // Verificación: SHA256 del bundle firmado con private key
      publicKey: process.env.CAPGO_PUBLIC_KEY,
    },
  },
};
export default config;
```

### 4. Build + Upload pipeline

```bash
# Build de la app web
npm run build

# Empacar el web dir
npx @capgo/cli bundle zip

# Upload a Capgo (con API key en GH Actions / Vercel env)
npx @capgo/cli bundle upload \
  --apikey $CAPGO_API_KEY \
  --bundle buleje-$(git rev-parse --short HEAD) \
  --path dist.zip \
  --channel production
```

### 5. Rollback en caso de fallo

```bash
# Listar bundles
npx @capgo/cli bundle list --apikey $CAPGO_API_KEY

# Setear el anterior como production (rollback instantáneo)
npx @capgo/cli channel set production --bundle buleje-abc1234
```

## CI/CD GitHub Actions

`.github/workflows/mobile-ota.yml`:

```yaml
name: Mobile OTA Deploy
on:
  push:
    branches: [main]
    paths:
      - 'app/**'
      - 'components/**'
      - 'lib/**'
      - 'public/**'

jobs:
  ota:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - run: npx @capgo/cli bundle upload
        env:
          CAPGO_API_KEY: ${{ secrets.CAPGO_API_KEY }}
```

## Consecuencias

### Pros
- Hotfixes mobile en < 5 min (vs 1-7 días review store)
- Rollback instantáneo si el OTA causa regressions
- Beta channel para early testing antes de producción
- Telemetría: % de devices con bundle actualizado

### Contras
- $14/mes (escalable a $80 con 50K MAU)
- Dependencia adicional (Capgo CDN)
- Limitado a cambios JS/CSS — siguen siendo necesarios releases nativos para cambios estructurales

## TODO bloqueante para Brandon

| # | Tarea | Tiempo | Costo |
|---|---|---|---|
| 1 | Aprobar este ADR + crear cuenta Capgo | 30min | $14/mes |
| 2 | Instalar plugin `@capgo/capacitor-updater` | 15min | $0 |
| 3 | Setear `CAPGO_API_KEY` + `CAPGO_PUBLIC_KEY` en GitHub Secrets + Vercel | 10min | — |
| 4 | Crear workflow `.github/workflows/mobile-ota.yml` | 30min | $0 |
| 5 | Test OTA en device dev (Android beta channel) | 30min | $0 |
| 6 | Documentar procedimiento rollback en docs/incident-response/ | 15min | $0 |

Total: ~2h Brandon + 1d dev hands-on.

**Score arquitectural esperado tras Sprint 4: 9.0/10 → 9.5/10**.

## Referencias

- audit profundo 2026-05-18 (Sprint 4)
- Capgo docs: https://capgo.app/docs
- Capacitor docs: https://capacitorjs.com
- CodePush sunset: https://learn.microsoft.com/en-us/appcenter/distribution/codepush/
