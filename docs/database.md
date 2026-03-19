# Database & Connection Pooling

## Arquitectura

```
App (Vercel Functions)
  └─ PrismaClient (via @prisma/adapter-pg)
       └─ pg Pool (max: 3 per serverless instance)
            └─ Supabase Session Pooler (PgBouncer, port 6543)
                 └─ PostgreSQL (Supabase)
```

## Connection Pooling (ya configurado)

La aplicación usa **dos niveles de pooling**:

### 1. Pool local (`@prisma/adapter-pg` / `pg.Pool`)
- **Archivo**: `lib/prisma.ts`
- **Max connections**: 3 por instancia serverless
- **Idle timeout**: 30s — cierra conexiones inactivas
- **Connection timeout**: 15s — falla rápido si no puede conectar
- **KeepAlive**: habilitado (delay inicial 10s)
- **Lazy init**: PrismaClient se crea en la primera consulta (no al importar el módulo), evitando crashes en build time

### 2. PgBouncer externo (Supabase Session Pooler)
- **Puerto**: 6543 (session pooler, no el 5432 directo)
- **Modo**: `pgbouncer=true` — se auto-append si la URL no lo tiene
- **Beneficio**: reutiliza conexiones entre invocaciones serverless

## Variables de entorno

| Variable | Uso | Requerida |
|----------|-----|-----------|
| `DATABASE_URL` | Connection string con session pooler (port 6543) | ✅ |
| `DIRECT_URL` | Connection string directa (port 5432) — para migraciones Prisma | Solo para `prisma migrate` |

### Configuración en Prisma (`prisma.config.ts`)
```ts
export default defineConfig({
  earlyAccess: true,
  schema: "./prisma/schema/**/*.prisma",
  migrate: {
    async url() {
      return process.env.DATABASE_URL!;
    },
  },
});
```

## Recomendaciones para producción

1. **Pool size (max)**: 3 es correcto para Vercel serverless. Cada función tiene su propia instancia, y Supabase free-tier permite ~60 conexiones directas.
2. **DIRECT_URL**: Configurar en Vercel para que `prisma migrate deploy` use la conexión directa (no PgBouncer), ya que las migraciones requieren prepared statements.
3. **Monitoreo**: Supabase Dashboard → Database → Connection Pooler muestra conexiones activas/idle.
4. **Escalar**: Si necesitas más de 60 conexiones simultáneas:
   - Subir plan Supabase (más conexiones)
   - O usar external PgBouncer (ej. Supavisor en Supabase Pro)

## SSL

- Producción: `ssl: { rejectUnauthorized: false }` (Supabase usa Self-signed cert)
- Local: SSL deshabilitado automáticamente para `localhost`/`127.0.0.1`
