---
paths:
  - "components/checkout/**"
  - "components/CheckoutModal.tsx"
  - "lib/db/orders.db.ts"
  - "lib/db/marketplace.db.ts"
  - "lib/auth/role-permissions.ts"
  - "lib/middleware/**"
  - "proxy.ts"
  - "prisma/schema.prisma"
  - "contexts/cart-context.tsx"
  - "lib/commissions.ts"
---

# ⚠️ Zona de peligro — pagos, auth, multi-tenant, schema

Antes de tocar: invocar skill `audit-first` (+ `migration-planner` si afecta schema).

- Totales SIEMPRE en backend; client-side solo preview (anti-fraude).
- Idempotency en checkout; state machine de órdenes en `orders.db.ts` — no saltear transiciones.
- `cart-context.tsx` usa BroadcastChannel multi-tab — probar con 2 tabs.
- `role-permissions.ts`: 26 recursos × 6 roles; cambios = revisar matriz completa.
- `schema.prisma` (189 modelos): migración vía SQL idempotente + pg directo (pooler cuelga `prisma migrate`), luego `prisma generate` + reiniciar dev.
- Dinero cross-vendor (`marketplace.db.ts`, `commissions.ts`): commission es Decimal en prod; vendor NO puede fijar su propia comisión.
- Tests de la zona: skill `eval` (checkout, fiado, sunat, multi-tenant) antes de dar por listo.
