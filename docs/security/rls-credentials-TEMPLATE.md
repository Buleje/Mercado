# Credenciales DB ADR-114 — TEMPLATE

> Esta es la versión **template** del archivo de credenciales.
> El archivo real con passwords vive en `docs/security/rls-credentials-YYYY-MM-DD.md`
> (gitignored).

## Roles creados en Supabase project `Mercado` (sofkgguriggocouiuamx)

| Rol | LOGIN | BYPASSRLS | Uso |
|---|:-:|:-:|---|
| `app_user` | ✅ | ❌ | Conexión Prisma de la app (Next.js Vercel) |
| `prisma_migrator` | ✅ | ✅ | Conexión `prisma migrate` (DIRECT_URL) |
| `postgres` (existente) | ✅ | ✅ | Admin Supabase (NO usar para la app) |

## Connection strings a configurar en Vercel

### Pooler (DATABASE_URL — runtime de la app)

```
postgresql://app_user.sofkgguriggocouiuamx:<APP_USER_PASSWORD>@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

### Direct (DIRECT_URL — migrations)

```
postgresql://prisma_migrator.sofkgguriggocouiuamx:<PRISMA_MIGRATOR_PASSWORD>@aws-0-us-east-2.pooler.supabase.com:5432/postgres
```

## Plan de aplicación (canary deploy)

1. Backup DATABASE_URL/DIRECT_URL actuales
2. Actualizar Vercel **preview** env
3. Validar /tiendas + login + checkout en preview URL
4. Si OK → actualizar **production** env
5. Monitor Sentry 30 min
6. Aplicar migration RLS via Supabase MCP
7. Smoke test cross-tenant final

## Rotación recomendada

- Inicial: 24h post-aplicación
- Recurrente: 90 días
