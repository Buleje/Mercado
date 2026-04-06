# Migracion a Doppler -- Bodega San Martin

## Por que Doppler
- Secrets centralizados (no `.env` en produccion)
- Rotacion automatica de secretos
- Audit log de quien accedio a que
- Sincronizacion con Vercel, GitHub Actions, Docker

## Pasos de migracion

### 1. Crear cuenta y proyecto
1. Ir a [doppler.com](https://doppler.com) (free tier para equipos pequenos)
2. Crear proyecto: `bodega-san-martin`
3. Crear configs: `dev`, `stg`, `prd`

### 2. Importar variables actuales
```bash
# Copiar variables desde .env.local
doppler secrets upload .env.local --config dev
```

### 3. Configurar entornos
| Variable | dev | stg | prd |
|----------|-----|-----|-----|
| DATABASE_URL | local/supabase | supabase staging | supabase prod |
| AUTH_SECRET | dev-secret | stg-secret-32chars | prod-secret-64chars |
| STRIPE_SECRET_KEY | sk_test_... | sk_test_... | sk_live_... |
| SENTRY_DSN | - | dsn-stg | dsn-prod |
| REDIS_URL | - | redis://stg | redis://prod |

### 4. Integrar con Vercel
1. En Doppler: Integrations -> Vercel -> Connect
2. Mapear: `prd` -> Production, `stg` -> Preview, `dev` -> Development
3. Las variables se sincronizan automaticamente

### 5. Integrar con GitHub Actions
1. En Doppler: crear Service Token para CI
2. En GitHub: anadir secret `DOPPLER_TOKEN`
3. En workflows usar: `doppler run -- npm run build`

### 6. Eliminar .env de produccion
Una vez verificado que Doppler funciona, eliminar .env files del servidor.
Mantener .env.example como referencia de variables necesarias.
