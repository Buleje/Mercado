# Rollback Plan — Bloque D1 Delivery vivo

**Iniciativa:** Bloque D1 del Marketplace (tracking en vivo + rutas + endpoint público)
**Aplicada:** 2026-04-08
**SLO de rollback:** < 5 minutos
**Owner de ejecución:** DevOps release engineer / on-call
**Feature flags asociados:** `delivery-live`, `delivery-live-whatsapp`, `delivery-live-public-link`

---

## Cuándo invocar este rollback

Invocar SOLO si alguno de estos síntomas aparece en producción:

- 🔴 **Fallo crítico:** el endpoint público `/api/track/[orderId]` está devolviendo 500 a los clientes que abren el link de WhatsApp
- 🔴 **Fuga de datos:** Sentry reporta que los tenants están viendo tracking de otros tenants (multi-tenant leak)
- 🔴 **Database load:** los índices nuevos del Delivery están causando > 30% de CPU extra en Supabase
- 🔴 **Worker bucle:** el BullMQ worker `delivery-notifications` está haciendo bucle infinito o mandando WhatsApps duplicados
- 🟡 **Warning alto:** errores del DB class superan 1% de requests (umbral soft — evaluar antes de rollback)

Antes de rollback completo, SIEMPRE intentar rollback por feature flag primero (Paso 1 abajo). Si el feature flag no estabiliza, recién ir al rollback de código.

---

## Nivel 1 — Rollback instantáneo por feature flag (< 30 segundos)

Este es el rollback de emergencia. Apaga todo el módulo sin tocar código ni DB.

```bash
# Opción A: en Vercel dashboard (preferido — sobrevive redeploys)
vercel env add FEATURE_DELIVERY_LIVE production
# Cuando pregunte el valor: false

vercel env add FEATURE_DELIVERY_LIVE_WHATSAPP production
# valor: false

vercel env add FEATURE_DELIVERY_LIVE_PUBLIC_LINK production
# valor: false

# Luego redeploy automático (o manual con)
vercel --prod

# Opción B: via API si tenés VERCEL_TOKEN en sesión
curl -X POST "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID/env" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"FEATURE_DELIVERY_LIVE","value":"false","target":["production"]}'
```

**Efecto inmediato:**

- UI `DeliveryTab` se renderiza como "Módulo desactivado — feature flag off"
- Worker `delivery-notifications` de BullMQ ignora eventos entrantes (continua drenando pero no ejecuta)
- Endpoint público `/api/track/[orderId]` devuelve 503 con mensaje "Tracking temporalmente no disponible"
- Los endpoints admin `/api/admin/delivery/*` siguen funcionando (para que un admin pueda investigar)
- Las tablas + datos en Supabase NO se tocan (seguros)

**Tiempo total:** 30 segundos si usás Vercel API, 2 minutos via dashboard UI.

---

## Nivel 2 — Rollback de código (< 3 minutos)

Si el feature flag no alcanza (p. ej. hay un bug en el SQL raw que causa corrupción de datos en cada request), revertir los commits:

```bash
cd bodega-san-martin

# 1. Verificar qué commits revertir
git log --oneline | grep -iE "delivery|bloque d1" | head -10

# 2. Revertir en orden inverso (el más reciente primero)
# Los commits del bloque D1 de la sesión 2026-04-08:
git revert --no-edit 709e744  # feat(agents): initiative-orchestrator
git revert --no-edit 468b55b  # test(delivery): 16 tests + seed
git revert --no-edit a2bfa53  # feat(marketplace): bloque D1 — full stack

# 3. Push del revert
git push origin master
```

**Efecto:**

- Los 4 route handlers quedan removidos (404 en los endpoints)
- `lib/db/delivery.db.ts` y sus 3 DB classes desaparecen
- `schema.prisma` vuelve a los 117 modelos anteriores
- `__tests__/delivery-db.test.ts` se borra
- El deploy automático de Vercel aplica el revert

**Tiempo total:** 2-3 minutos (1 min git + 1-2 min deploy Vercel).

⚠️ **Importante:** git revert crea commits nuevos, NO reescribe historia. Los commits originales siguen en `master` — se puede volver a aplicar con otro `git revert` del revert si el problema era transitorio.

---

## Nivel 3 — Rollback de base de datos (< 5 minutos)

Este es el rollback más invasivo. Solo invocar si hay **corrupción de datos** o el schema está causando problemas activos (p. ej. un índice bloqueando queries del `Order`).

```bash
cd bodega-san-martin

# 1. Conectarse a Supabase
# (usar el formato pooler IPv4 correcto)
export DATABASE_URL='postgresql://postgres.sofkgguriggocouiuamx:PASSWORD@aws-1-us-east-2.pooler.supabase.com:5432/postgres'

# 2. Correr el script de teardown
node scripts/_tmp-rollback-d1.mjs
```

Contenido del script de teardown (crear al ejecutar rollback — NO commitear):

```javascript
// scripts/_tmp-rollback-d1.mjs — USAR SOLO EN EMERGENCIA
import pg from "pg";
const { Client } = pg;

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await c.connect();

// Orden de drops: tablas dependientes primero
await c.query('DROP TABLE IF EXISTS "DeliveryRouteStop" CASCADE');
await c.query('DROP TABLE IF EXISTS "DeliveryRoute" CASCADE');
await c.query('DROP TABLE IF EXISTS "DeliveryTracking" CASCADE');

// Drop los 8 campos nuevos de Order (no drop de la tabla entera)
await c.query('ALTER TABLE "Order" DROP COLUMN IF EXISTS "deliveryStatus"');
await c.query('ALTER TABLE "Order" DROP COLUMN IF EXISTS "driverId"');
await c.query('ALTER TABLE "Order" DROP COLUMN IF EXISTS "estimatedDeliveryAt"');
await c.query('ALTER TABLE "Order" DROP COLUMN IF EXISTS "deliveredAt"');
await c.query('ALTER TABLE "Order" DROP COLUMN IF EXISTS "pickupLat"');
await c.query('ALTER TABLE "Order" DROP COLUMN IF EXISTS "pickupLng"');
await c.query('ALTER TABLE "Order" DROP COLUMN IF EXISTS "dropoffLat"');
await c.query('ALTER TABLE "Order" DROP COLUMN IF EXISTS "dropoffLng"');

// Drop de índices que quedaron huérfanos (si las tablas se borraron con CASCADE no deberían quedar)
await c.query('DROP INDEX IF EXISTS "Order_deliveryStatus_idx"');
await c.query('DROP INDEX IF EXISTS "Order_driverId_idx"');

console.log("✅ Rollback de DB completado");
await c.end();
```

**Después:**

```bash
# Borrar el script temporal
rm scripts/_tmp-rollback-d1.mjs

# Regenerar el cliente Prisma sin los modelos delivery
npx prisma generate

# Correr tests para verificar que nada del resto se rompió
npm run test
```

⚠️ **ATENCIÓN — pérdida de datos:** este nivel BORRA todos los datos de tracking, rutas y paradas que se hayan generado. Si hay rows importantes, hacer backup primero:

```bash
# Backup pre-teardown (opcional — solo si hay datos que salvar)
pg_dump "$DATABASE_URL" \
  --table='public."DeliveryTracking"' \
  --table='public."DeliveryRoute"' \
  --table='public."DeliveryRouteStop"' \
  > backup-delivery-$(date +%Y%m%d-%H%M%S).sql
```

**Tiempo total:** 3-5 minutos (1 min conexión + 1 min drops + 2 min regenerate + 1 min tests).

---

## Verificación post-rollback

Después de cualquier nivel de rollback, verificar:

```bash
# 1. Los endpoints del core (checkout, pos, admin dashboard) siguen funcionando
curl -f https://bodegasaas.com/api/admin/health

# 2. El checkout sigue procesando órdenes
# (probar manualmente con un pedido de prueba)

# 3. Los logs de Sentry no tienen errores nuevos relacionados al rollback
# (revisar dashboard de Sentry)

# 4. Los tests existentes siguen pasando
cd bodega-san-martin && npm run test

# 5. Si fue rollback nivel 3, verificar que el resto del schema esté ok
npx prisma validate
```

---

## Comunicación

Al ejecutar un rollback:

1. **Anunciar en Slack/WhatsApp del equipo** antes de iniciar (para evitar que otro dev commitee encima)
2. **Marcar incidente en Sentry** como "Rollback ejecutado — investigación en curso"
3. **Documentar el post-mortem** en `docs/incidents/YYYY-MM-DD-rollback-delivery-d1.md` dentro de las 24h siguientes

Template de post-mortem:

```markdown
# Incidente: Rollback Delivery D1 — YYYY-MM-DD

## Timeline
- HH:MM — Síntoma detectado
- HH:MM — Rollback nivel X iniciado
- HH:MM — Estabilización confirmada

## Impacto
- Usuarios afectados: N tenants · M clientes finales
- Duración del outage: X minutos
- Datos perdidos: [si hubo]

## Causa raíz
- [1-2 párrafos técnicos]

## Qué funcionó
- [1-3 puntos]

## Qué falló
- [1-3 puntos]

## Acciones correctivas
- [ ] Fix del bug que causó el síntoma
- [ ] Test de regresión en el e2e
- [ ] Añadir alerta de Sentry para este caso
- [ ] Re-habilitar feature flag cuando fix mergeado
```

---

## Contactos

- **Owner del módulo Delivery:** Brandon (Buleje)
- **On-call DevOps:** Brandon (equipo de uno por ahora)
- **Vercel deployments:** https://vercel.com/bodega-san-martin
- **Supabase dashboard:** https://supabase.com/dashboard/project/sofkgguriggocouiuamx
- **Sentry:** https://sentry.io/organizations/bodega-san-martin

---

## Checklist de ensayo (probar este plan en seco cada 30 días)

- [ ] Nivel 1 (feature flag) — probado en preview: SÍ / NO · última vez: YYYY-MM-DD
- [ ] Nivel 2 (git revert) — probado en branch desechable: SÍ / NO · última vez: YYYY-MM-DD
- [ ] Nivel 3 (DB teardown) — probado en una copia staging: SÍ / NO · última vez: YYYY-MM-DD
- [ ] Tiempo real medido en último ensayo: X minutos (objetivo: < 5)
- [ ] Script de teardown actualizado si el schema cambió: SÍ / NO
