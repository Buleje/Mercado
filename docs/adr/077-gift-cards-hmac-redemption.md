# ADR-077 — Gift Cards: HMAC code storage + redemption ledger

**Estado:** Aceptado
**Fecha:** 2026-04-18
**Contexto:** Extiende ADR-036 (compliance Ley 29733), ADR-045 (SUNAT full-stack),
ADR-050 (XState order state machine), ADR-059 (Ola 1 marketplace retention).

---

## Contexto

"Gift Cards Buleje" es un producto virtual que vendemos al cliente A para que
un cliente B consuma ese saldo en la bodega. Hasta hoy (2026-04-18) el módulo
vivía con:

| Pieza | Estado |
|---|---|
| Hub `/marketplace/gift-cards` | 6 denominaciones + 8 diseños (UI sólida) |
| Wizard compra 4 pasos `/marketplace/gift-cards/comprar` | UI + transición funcional |
| Dashboard `/cuenta/gift-cards` | Tabs recibidas/enviadas/historial |
| `lib/db/gift-cards.db.ts` | **Mock en memoria** — se borra con cada reinicio |
| `/api/gift-cards/purchase` + `/redeem` | Stubs que escriben el mock |
| Admin module `GiftCardsAdminModule.tsx` | Mock local, no toca DB |

Este ADR describe cómo lo convertimos en producto **real**, persistido, seguro
y auditable sin romper la UX existente.

### Requisitos no-negociables

1. **Compliance SUNAT** — toda gift card vendida es un pasivo contable que
   debe figurar en reportes (ingreso diferido hasta el canje).
2. **Compliance Ley 29733** — el destinatario puede pedir sus datos y saber
   quién canjeó qué. Audit log completo.
3. **Security** — un atacante que lee la DB **no debe** poder canjear tarjetas.
4. **Partial redemption** — el cliente puede canjear en varias compras.
5. **Multi-tenant** — cada bodega opera su propio inventario de gift cards.

### Problema central

Si guardamos el código plano en la DB, **cualquier breach = robo de saldo**.
Incluso con RLS, un dump accidental o un backup mal manejado expone dinero
real. Tampoco podemos guardar solo un hash sin sal porque precomputar una
rainbow table de 16 chars alfanuméricos es tractable.

## Decisión

### 1. Almacenamiento stateless HMAC-SHA256

El **código plano nunca se guarda**. Al generar una gift card:

```
plainCode = generateCode()                    // 16 chars alfanuméricos
codeHash  = HMAC-SHA256(plainCode, AUTH_SECRET)
codeLast4 = plainCode.slice(-4)               // para UI masked
```

El `codeHash` es único indexado (`@unique`). El `plainCode` se devuelve **una
sola vez** al comprador (sender) — después sólo queda el hash en DB y los
últimos 4 chars para mostrar al destinatario. Si el usuario pierde el código,
**no se puede recuperar** desde la DB: hay que cancelar la tarjeta y emitir
una nueva (flujo admin `issueManual`).

`AUTH_SECRET` ya es requerido (ver `lib/env.ts`), así que no agregamos
dependencias nuevas. Cambiar `AUTH_SECRET` invalida todos los codes activos
(ojo con el rotation — documentado abajo).

### 2. Modelo de datos

Dos tablas nuevas:

| Tabla | Rol |
|---|---|
| `GiftCard` | Una fila por tarjeta emitida. Saldo vivo, status, timestamps |
| `GiftCardRedemption` | Ledger append-only: cada canje (parcial o total) |

`GiftCard.balanceSoles` decrementa en cada canje dentro de la misma
transacción que inserta la fila en `GiftCardRedemption`. `status` transiciona
`pending_delivery → active → partially_redeemed → fully_redeemed`.

Ver `prisma/migrations/2026XXXXXX_add_gift_cards_hmac/migration.sql`.

### 3. Transaction-safe redeem

El canje usa `prisma.$transaction` con `SELECT ... FOR UPDATE` para
prevenir double-spend en escenarios concurrentes (dos tabs, retries, etc):

```ts
await prisma.$transaction(async (tx) => {
  const card = await tx.$queryRaw`
    SELECT id, "balanceSoles", status FROM "gift_cards"
    WHERE "codeHash" = $1 AND "tenantId" = $2
    FOR UPDATE`;
  if (!card || card.balance < amount) throw error;
  await tx.giftCardRedemption.create({ ... });
  await tx.giftCard.update({
    data: {
      balanceSoles: card.balance - amount,
      status: (card.balance - amount === 0) ? "fully_redeemed" : "partially_redeemed",
    },
  });
});
```

### 4. Alternativas consideradas

| Opción | Pros | Contras | Veredicto |
|---|---|---|---|
| Código plano + RLS | Simple, fácil debug | Breach = robo directo | **Rechazado** |
| bcrypt del code | Slow-hash | No permite `@unique` lookup O(1) | **Rechazado** |
| HMAC sin sal | Rápido, determinista | Precompute rainbow viable | **Rechazado** |
| **HMAC con AUTH_SECRET** | Rápido, único, resistente a rainbow si secret rota | Rotar secret invalida códigos | **Adoptado** |
| Tokenización externa (Stripe/Lambda) | No guardar hash | Dependencia extra, costo, latencia | Descartado por ahora |

### 5. Rate limit agresivo

`/api/gift-cards/redeem` y `/validate` son blanco de brute force (16 chars =
~1e24 combinaciones, pero atacantes iterativos acumulan). Rate limit:

| Endpoint | Límite por IP | Ventana |
|---|---|---|
| `/api/gift-cards/validate` | 5 | 60 s |
| `/api/gift-cards/redeem` | 3 | 60 s |
| `/api/gift-cards/purchase` | 5 | 300 s |

Admin endpoints tienen `requireAdmin` (no necesitan rate limit de anon).

## Fases (expand → migrate → contract)

### Fase 1 — Expand (esta iteración)

1. Crear modelos `GiftCard` + `GiftCardRedemption` en `schema.prisma`
2. Migration SQL aplicable con `CREATE INDEX CONCURRENTLY`
3. Nueva `GiftCardsDB` que pega a Prisma real
4. HMAC helpers en `lib/gift-cards/code-utils.ts`
5. API routes cableadas a la DB real
6. Backfill script `scripts/backfill-gift-cards.ts` — ingesta los mocks con
   códigos nuevos (no preserva códigos mock; se imprimen para testing manual)

### Fase 2 — Migrate (siguiente PR)

1. Flag `giftCards.realBackend` al 100% en dev/staging
2. Smoke tests end-to-end con canje parcial + admin cancel
3. Canary a prod 5% → 25% → 100%

### Fase 3 — Contract (post-GA)

1. Eliminar `MOCK_GIFT_CARDS` y `MOCK_GIFT_CARD_USAGE` de `lib/mocks/`
2. Eliminar branch de código que leía mocks

## Rollback

Si el expand rompe algo:

1. `prisma migrate resolve --rolled-back <nombre>` — la migration es DROP-safe
   (no tocamos `Order` ni `Customer`, solo agregamos tablas nuevas)
2. Rebajar flag `giftCards.realBackend = 0`
3. La UI sigue funcionando con el mock hasta que el rollforward se corrija

## Métricas y observabilidad

| Métrica | Unidad | Alerta |
|---|---|---|
| Unredeemed liability | Suma `balanceSoles WHERE status IN (active, partially_redeemed)` | > S/ 50,000 del tenant |
| Redemption rate (30d) | `count(fully_redeemed) / count(purchased)` | < 15% |
| Avg days to first redeem | `avg(firstRedeemedAt - purchasedAt)` | — |
| Cancel rate (admin) | `count(cancelled) / count(all)` | > 5% dispara investigación |
| Failed validate attempts | Counter | > 100/min/ip → alerta |

Todas las acciones admin (`cancelAndRefund`, `issueManual`) escriben a
`ActivityLog` vía `lib/activity-logger.ts`.

## Política de expiración

`expiresAt` es `null` por defecto. Decisión documentada aquí: **tarjetas de
regalo Buleje no expiran** hasta que regulación peruana lo exija. El schema
soporta expiración por-tarjeta para cuando cambiemos la política a, p.ej.,
"2 años tras emisión" — ese cambio se implementa como un cron que actualiza
`status = expired` donde `expiresAt < now()`.

## Seguridad de AUTH_SECRET

- `AUTH_SECRET` ya vive en `lib/env.ts`. No se loguea ni se expone en
  respuestas HTTP.
- Rotar `AUTH_SECRET` **invalida todos los códigos activos**. Cuando toque
  rotar, ejecutar el script `scripts/rehash-gift-cards.ts` (pendiente; no
  incluido en esta iteración porque no es crítico para MVP).
- El mismo `AUTH_SECRET` se usa para admin session; considerar segregación
  con un `GIFT_CARD_HMAC_SECRET` dedicado si la superficie crece.

## Estado migración

Esta iteración entrega:

- ADR completo (este archivo)
- Schema Prisma editado
- Migration SQL (no aplicada en prod aún — requiere `DIRECT_URL`)
- DB class + helpers + API routes
- UI cableada
- Backfill script

Comando migración:

```bash
DATABASE_URL=$DIRECT_URL npx prisma migrate deploy
# o en dev
DATABASE_URL=$DIRECT_URL npx prisma migrate dev --name add_gift_cards_hmac
```
