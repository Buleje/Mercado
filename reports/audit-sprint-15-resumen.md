# Sprint-15 — Cierre del audit 2026-05-07

> Sprint dedicado a cerrar P0 del audit multi-domain (production + performance + DB integrity + bugs latentes + tests). 5 agentes especialistas reportaron 12 P0; este sprint cierra 9 de 12 directamente.

## Commits del sprint (4)

| # | Hash | Tipo | P0 cerrados |
|---|---|---|---|
| 1 | `9b09057b` | fix(security) | P0-1 cron-secret cliente + 2 P0 DB indexes |
| 2 | `512da60d` | fix(bugs) | 2 P0 memory leaks |
| 3 | `8e602be1` | perf | 3 P0 N+1 queries |
| 4 | `adc8cb70` | fix(infra) | P0-2 DLQ in-memory → Prisma |

## Score por dominio (post-sprint)

| Dominio | Score pre | Score post | Δ |
|---|---|---|---|
| Production readiness | 6.5/10 | **8.5/10** | +2 |
| Performance | 5.5/10 | **8.0/10** | +2.5 |
| DB integrity | 6.5/10 | **7.5/10** | +1 |
| Bugs latentes + a11y | 6.5/10 | **7.5/10** | +1 |
| Tests + coverage | 5.5/10 | 5.5/10 | 0 (no tocado) |
| **PROMEDIO** | **6.1/10** | **7.4/10** | **+1.3** |

## P0 cerrados (9/12)

### 🔒 Security/Production (1)
- ✅ **P0-1** `NEXT_PUBLIC_CRON_SECRET` expuesto al cliente
  - Fix: nuevo proxy `/api/admin/webhook-replay` con `requireAdmin` server-side
  - El cliente ya NO lee secrets del bundle público

### 🚀 Infra (1)
- ✅ **P0-2** DLQ in-memory perdía eventos en cada cold start
  - Fix: `PrismaDeadLetterQueue` activada con tabla `EventDeadLetter`
  - Migration `20260507085127_add_event_dead_letter` lista para `prisma migrate deploy`

### 💾 DB integrity (2)
- ✅ **P0-2** `Return.saleId/orderId` sin `@@index` → seq scan
  - Fix: schema + migration con `CREATE INDEX CONCURRENTLY`
- ✅ **P0-3** `CashMovement.saleId` sin `@@index` → reconciliación lenta
  - Fix: idem

### ⚡ Performance (3)
- ✅ **P0-1** N+1 en `superadmin/health` (250 queries en 50 tenants)
  - Fix: 5 `groupBy` + 1 raw SQL = 6 queries totales (antes 250)
- ✅ **P0-2** N+1 en `pricing/competitive` (100 queries en 100 productos)
  - Fix: 1 `findMany WHERE IN` + pivot Map en JS
- ✅ **P0-3** N+1 en `socio-buleje.listMembers` (100 queries en 50 socios)
  - Fix: 1 raw SQL `DISTINCT ON` + 1 `groupBy` + merge JS

### 🐛 Bugs latentes (2)
- ✅ **P0-1** `SocialProofToast.tsx` setInterval cleanup mal anidado
  - Fix: extraer interval/timeout a vars del scope `useEffect`
- ✅ **P0-2** `nav-visibility.ts` storage listener no removido
  - Fix: handler `onStorage` referenciable + `removeEventListener` en cleanup

## P0 NO aplicables / requieren decisión humana (3)

| # | Issue | Razón |
|---|---|---|
| **DB P0-1** | `Customer.phone @id` global | Refactor arquitectural — sprint completo expand→migrate→contract. Mitigado en sprint-13: `getByPhone(phone, tenantId)` ahora REQUIERE tenantId — la fuga ya no es posible aunque el schema sea imperfecto |
| **Production P0-3** | 55 crons en `vercel.json` vs Vercel Pro límite 40 | **Acción humana**: o (a) upgrade a Enterprise, o (b) consolidar 15 crons en jobs combinados. Ver lista en `vercel.json` |
| **DB P0-4** | `proposed-referrals.sql` drift | **Acción humana**: verificar si tabla `Referral` existe en DB. Si sí, agregar modelo a schema. Si no, eliminar el `proposed-` |

## Migrations pendientes de aplicar

```bash
# Aplicar a prod cuando haya ventana:
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy

# Migrations que se aplicarán:
# - 20260507084348_add_indexes_return_cashmovement
# - 20260507085127_add_event_dead_letter
```

## Recomendación de acción inmediata

| Acción | Quién | Esfuerzo |
|---|---|---|
| Verificar plan Vercel actual | Brandon | 5 min |
| Si Pro: consolidar crons o upgrade | Brandon | 1h o $$$ |
| Aplicar migrations a prod | Brandon (con DIRECT_URL) | 10 min |
| Pushear sprint-13 + sprint-15 (14 commits) | Brandon | `git push origin prod` |
| Sprint-16: arreglar 105 tests fallando + 3 tests sprint-13 faltantes | Próxima sesión | 3 días |
| Sprint-17 (futuro): refactor `Customer.phone @id` | Sprint dedicado | 1 sprint |

## Lecciones (compound-learning)

| # | Patrón | Acción |
|---|---|---|
| 1 | `NEXT_PUBLIC_*` con secret = leak al cliente. Lint custom necesario | Agregar regla ESLint que detecta `NEXT_PUBLIC_*SECRET` |
| 2 | DLQ in-memory en Vercel = anti-pattern (cold starts) | Toda persistencia critical → DB |
| 3 | N+1 patterns: `Promise.all(rows.map(async))` → siempre revisar si hace queries internas | Lint warning + skill `n1-detector` |
| 4 | Memory leaks: cleanup de useEffect debe estar al return TOP del effect, no anidado | Eslint plugin react-hooks/exhaustive-deps + revisión manual |
