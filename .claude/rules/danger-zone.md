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

Antes de tocar (1 minuto, sin reporte):
- ADRs del área: `rg -il '<módulo>' docs/adr | tail -5` y leer los que salgan; no reinventar una decisión (middleware: `docs/adr/014-middleware-module-split.md`).
- Último commit del área: `git log -5 --oneline -- <ruta>`; no deshacer trabajo ajeno.
- Tests del área en `__tests__/` y `e2e/`: son el contrato; déjalos en verde o cámbialos a propósito.
- Schema → skill `migrar-esquema`; decisión nueva → skill `adr`.

- Totales SIEMPRE en backend; client-side solo preview (anti-fraude).
- Idempotency en checkout; state machine de órdenes en `orders.db.ts` — no saltear transiciones.
- `cart-context.tsx` usa BroadcastChannel multi-tab — probar con 2 tabs.
- `role-permissions.ts`: 26 recursos × 6 roles; cambios = revisar matriz completa.
- `schema.prisma` (~272 modelos): migración = skill `migrar-esquema` (SQL a mano, nunca `migrate dev`), luego `prisma generate` + reiniciar dev.
- Dinero cross-vendor (`marketplace.db.ts`, `commissions.ts`): commission es Decimal en prod; vendor NO puede fijar su propia comisión.
- Tests de la zona: `npx vitest related <archivos> --run` + `npm run test:guardianes` (checkout, fiado, sunat, multi-tenant) antes de dar por listo.
