# Runbook — `/marketplace` caído o inconsistente

Checklist ordenado para diagnóstico + mitigación. Ejecutar top-to-bottom.

## 1. Triage inicial (30 seg)

```bash
# ¿Prod, staging o dev?
echo $NEXT_PUBLIC_BASE_URL

# ¿El endpoint público responde?
curl -I https://www.buleje.pe/marketplace/explorar

# Recientes deployments de Vercel
vercel ls --limit 5
```

- **200** → problema de UI/client-side → ver §4.
- **5xx** → problema server → ver §2.
- **Timeout** → DB o cold start → ver §3.

## 2. Problema server (5xx)

### 2a. Logs recientes

```bash
# Sentry: últimos 50 errores de /marketplace
# (abrir dashboard si CLI no configurado)
open https://sentry.io/organizations/buleje/issues/?query=url%3A%22%2Fmarketplace%22

# Vercel logs
vercel logs buleje --follow | grep -i "error\|500"
```

### 2b. Causas frecuentes

| Síntoma | Diagnóstico | Fix |
|---|---|---|
| `ENOSPC: no space left on device` | Disco Vercel lleno (dev: `.next/dev` > 45 GB) | Local: `npm run dev:nuke`. Prod: redeploy clean |
| `ReferenceError: X is not defined` | Import roto tras refactor | Revert deploy → fix → redeploy |
| `Prisma schema drift` | Migration pendiente | Correr `DATABASE_URL=$DIRECT_URL npx prisma migrate deploy` |
| `Too many connections` | pgBouncer saturado | Bajar concurrency, revisar pools, redeploy |
| `500 check-exists` | Endpoint nuevo falla | Revisar `app/api/marketplace/products/check-exists/route.ts`; soft-fail debe activarse |
| `500 stores/phone` | Schema o query rota | Soft-fail ya responde `{ phone: null }` — si falla hard, revisar Prisma models `store` + `tenantStorePage` |

## 3. Problema DB / cold start

```bash
# Dev local: ¿conecta la DB?
npx prisma db execute --stdin <<< "SELECT 1"

# Prisma actualizado con schema?
npx prisma validate
npm run db:sanity   # si existe el script
```

### Migration atascada

```bash
# Ver migraciones aplicadas vs pendientes
DATABASE_URL=$DIRECT_URL npx prisma migrate status

# Si hay pendientes:
DATABASE_URL=$DIRECT_URL npx prisma migrate deploy
```

⚠️ **NUNCA** usar `DATABASE_URL` (pgBouncer) para migrate — falla en transaction mode. Siempre `DIRECT_URL`.

## 4. Problema client-side (200 pero roto)

### 4a. Consola del browser

Patrones conocidos:

| Error | Causa | Runbook §§ |
|---|---|---|
| `item.price.toFixed is not a function` | localStorage legacy con price string | LocalStorageDoctor en layout debe curar al mount. Verifica `marketplace:recent-viewed:v1` |
| `Element type is invalid... got: object` | Archivo `.tsx` de 0 bytes (stub vacío) | Revisa último PR; `git log -p` del archivo importado |
| `Uncached data or connection() was accessed outside of <Suspense>` | Server component sin Suspense | Agregar boundary por cada child dinámico en el layout |
| `Blocked aria-hidden on element with focused descendant` | Modal usa `aria-hidden` con focus adentro | Cambiar a `inert` |
| `Failed to flush logs to file: ENOSPC` | Disco lleno local | `npm run dev:nuke` + `npm run dev:zombies` |

### 4b. Bundle inconsistente (HMR)

Turbopack a veces sirve bundle viejo en dev:

```bash
# Matar dev server + procesos node
npm run dev:zombies         # si hay >12h de vida
# O nuclear option:
npm run dev:nuke            # kills + rimraf .next + restart
```

### 4c. Carrito vacío tras agregar

Bug multi-store resuelto 2026-04-19 (ver `contexts/cart-context.tsx` marker `cart-hydration-patch-v1`):

- Endpoint: `/api/marketplace/products/check-exists` (cruza stores).
- Guard: preservar carrito si `validItems.length === 0 && items.length > 0`.

Si vuelve a pasar: verificar que el marker está presente en cart-context y que el endpoint responde 200.

## 5. Rollback

```bash
# Vercel: rollback al deployment anterior
vercel rollback <previous-deployment-url>

# Git: revert el merge commit
git revert -m 1 <merge-sha>
git push
```

## 6. Comunicación

- **Interrupción >5 min**: publicar status en Slack `#ops-buleje` + incident channel.
- **Interrupción >15 min**: paginar on-call.
- **Post-mortem**: obligatorio si hubo usuarios afectados → `docs/adr/<n>-incident-<fecha>.md`.

## 7. Comandos de salud rápida

```bash
npm run dev:health          # si existe: tsc+lint+test+build+SLOs
npm run dev:dangers         # lista zonas críticas con último commit
npm run dev:duplicates      # audit de shadows (RecentlyViewed bug)
npm run dev:monitor         # monitorea .next/dev growth en paralelo
```

## Contactos clave

- **Incident commander**: Brandon / on-call rotating
- **DB owner**: ver `docs/ARCHITECTURE.md`
- **Sentry**: `https://sentry.io/organizations/buleje/`
- **Vercel dashboard**: `https://vercel.com/buleje`
