# Team Template: Checkout Squad
# Tier: DANGER (zona peligrosa)
# Agentes: backend + frontend + security + tester
# Gates: FULL pipeline (lint + tsc + test + build + SLO)
# Uso: Cualquier cambio en CheckoutModal, CartSidebar, componentes/checkout/

## Dispatch (secuencial)
1. security: audit-first del cambio propuesto
2. backend + frontend (paralelo): implementar
3. tester: tests exhaustivos + edge cases
4. security: re-audit post-cambio

## Gates
- Pre-impl: audit-first OBLIGATORIO
- Post-impl: npm run lint && npx tsc --noEmit && npm run test
- Post-test: npm run build
- Pre-merge: security re-audit
