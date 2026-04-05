# Migración de Secrets a Doppler

## Por qué migrar

Actualmente los secrets están en `.env.local` (desarrollo) y variables de Vercel (producción).
Problemas:
- Sin rotación automática de secrets
- Sin auditoría de acceso
- Sin sincronización entre entornos
- Riesgo de secrets stale o inconsistentes

## Pasos de migración

### 1. Crear cuenta y proyecto en Doppler

```bash
# Instalar CLI
npm install -g @dopplerhq/cli

# Login
doppler login

# Crear proyecto
doppler projects create bodega-san-martin
```

### 2. Configurar entornos

Doppler crea automáticamente: `dev`, `stg`, `prd`.

```bash
# Importar secrets actuales desde .env.local al entorno dev
doppler secrets upload --project bodega-san-martin --config dev .env.local
```

### 3. Agregar todos los secrets de producción

```bash
doppler secrets set --project bodega-san-martin --config prd \
  DATABASE_URL="postgresql://..." \
  DIRECT_URL="postgresql://..." \
  AUTH_SECRET="..." \
  STRIPE_SECRET_KEY="..." \
  STRIPE_WEBHOOK_SECRET="..." \
  CRON_SECRET="..." \
  REDIS_URL="..." \
  SMTP_USER="..." \
  SMTP_PASS="..."
```

### 4. Integrar con Vercel

1. Ir a [Doppler Dashboard](https://dashboard.doppler.com)
2. Proyecto → Integrations → Add → Vercel
3. Conectar la cuenta de Vercel
4. Mapear: `prd` → Production, `stg` → Preview, `dev` → Development
5. Doppler sincroniza automáticamente las variables a Vercel

### 5. Desarrollo local

```bash
# En vez de .env.local, usar Doppler para inyectar variables
doppler run --project bodega-san-martin --config dev -- npm run dev
```

O crear un alias en package.json:
```json
{
  "scripts": {
    "dev:doppler": "doppler run -- npm run dev"
  }
}
```

### 6. Limpiar .env.local de producción

Una vez verificado que Doppler funciona:
1. Eliminar variables de entorno manuales en Vercel Dashboard
2. Mantener `.env.local` solo para desarrollo local (como fallback)
3. Agregar `.env.local` a `.gitignore` (ya debería estar)

## Verificación

```bash
# Ver secrets del entorno actual
doppler secrets --project bodega-san-martin --config dev

# Verificar que la app arranca con Doppler
doppler run -- npm run build
```

## Rotación de secrets

```bash
# Rotar AUTH_SECRET (genera nuevo valor automáticamente)
doppler secrets set AUTH_SECRET="$(openssl rand -base64 32)" \
  --project bodega-san-martin --config prd
```

Doppler sincroniza automáticamente el nuevo valor a Vercel y triggerea un redeploy.
