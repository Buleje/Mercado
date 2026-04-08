# Rollback Plan — Bloque D2 Marketplace Chat

**Iniciativa:** Bloque D2 del Marketplace (chat buyer ↔ seller)
**Aplicada:** 2026-04-08 (Sprint 1 + Sprint 2)
**SLO de rollback:** < 5 minutos
**Feature flags asociados:** `marketplace-chat`, `marketplace-chat-public`, `marketplace-chat-whatsapp`, `marketplace-chat-realtime`

---

## Cuándo invocar

Invocar SOLO si:

- 🔴 Mensajes cruzando tenants (fuga multi-tenant) — **crítico inmediato**
- 🔴 Worker `chat-notifications` en bucle — WhatsApp spam
- 🔴 UI ChatTab rompiendo el admin completo
- 🔴 Endpoint `/api/chat/public` expone datos sensibles del seller (ownership check roto)
- 🟡 Latencia DB > 30% por queries del chat
- 🟡 Cost overrun por polls vacíos (cache hit rate < 80%)

---

## Nivel 1 — Feature flags (< 30 segundos)

```bash
vercel env add FEATURE_MARKETPLACE_CHAT production          # false
vercel env add FEATURE_MARKETPLACE_CHAT_PUBLIC production   # false
vercel env add FEATURE_MARKETPLACE_CHAT_WHATSAPP production # false
vercel --prod
```

**Efecto:**

- Tab `Chat Clientes` en admin se oculta (branch del TabRouter retorna null)
- `POST /api/chat/public` → 503 con `Retry-After: 300`
- Worker `chat-notifications` ignora jobs entrantes (verifica el flag en cada job)
- API admin `/api/admin/chat/*` sigue respondiendo (para que un admin pueda investigar con tools)
- Las tablas y datos en Supabase NO se tocan

---

## Nivel 2 — Rollback de código (< 3 minutos)

```bash
cd bodega-san-martin

# Identificar los commits del D2
git log --oneline | grep -iE "marketplace.*bloque d2|chat.*sprint" | head -10

# Revertir en orden inverso (Sprint 2 → Sprint 1)
git revert --no-edit <commit-sprint-2>
git revert --no-edit <commit-sprint-1>
git push origin master
```

**Efecto:**

- Los 11+ archivos del D2 desaparecen: `lib/db/chat.db.ts`, `components/admin/ChatTab/*`, `app/api/admin/chat/*`, `app/api/chat/public`, `lib/queue/chat-notifications-worker.ts`, `lib/integrations/whatsapp-chat-templates.ts`
- `schema.prisma` vuelve a 120 modelos (sin ConversationThread, ConversationMessage)
- Deploy automático en Vercel aplica el revert

---

## Nivel 3 — Rollback de DB (< 5 minutos)

Solo invocar si hay **corrupción de datos** o el schema está causando problemas al `Order`/`Store`.

```bash
cd bodega-san-martin
export DATABASE_URL='postgresql://postgres.sofkgguriggocouiuamx:PASSWORD@aws-1-us-east-2.pooler.supabase.com:5432/postgres'
node scripts/_tmp-rollback-d2.mjs
```

Contenido del script de teardown:

```javascript
// scripts/_tmp-rollback-d2.mjs — EMERGENCIA, NO COMMITEAR
import pg from "pg";
const { Client } = pg;

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await c.connect();

// Orden: tabla hija primero
await c.query('DROP TABLE IF EXISTS "ConversationMessage" CASCADE');
await c.query('DROP TABLE IF EXISTS "ConversationThread" CASCADE');

console.log("✅ Rollback D2 DB completado");
await c.end();
```

Después:

```bash
rm scripts/_tmp-rollback-d2.mjs
npx prisma generate
npm run test
```

⚠️ **ATENCIÓN — pérdida de datos:** este nivel BORRA todos los hilos y mensajes. Backup previo si hay algo que salvar:

```bash
pg_dump "$DATABASE_URL" \
  --table='public."ConversationThread"' \
  --table='public."ConversationMessage"' \
  > backup-chat-$(date +%Y%m%d-%H%M%S).sql
```

---

## Verificación post-rollback

```bash
# Core sigue funcionando
curl -f https://bodegasaas.com/api/admin/health

# No hay errores nuevos en Sentry
# (revisar dashboard)

# Tests del resto del proyecto siguen pasando
cd bodega-san-martin && npm run test

# Prisma ok
npx prisma validate
```

---

## Contactos y checklist de ensayo

Mismo que `rollback-delivery-d1.md`:
- Anunciar en Slack antes de iniciar
- Post-mortem en `docs/incidents/YYYY-MM-DD-rollback-chat-d2.md` dentro de 24h
- Probar este plan en seco cada 30 días en branch desechable
