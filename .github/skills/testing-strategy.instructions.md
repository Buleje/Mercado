---
applyTo: "**/__tests__/**,**/e2e/**,**/vitest*,**/playwright*"
---

# Testing Strategy — Bodega San Martín

## Stack de testing

| Nivel | Framework | Comando | Dónde |
|-------|-----------|---------|-------|
| Unit | Vitest | `npm run test` | `__tests__/` |
| Coverage | Vitest | `npm run test:coverage` | `__tests__/` |
| E2E | Playwright | `npm run test:e2e` | `e2e/` |
| E2E UI | Playwright | `npm run test:e2e:ui` | `e2e/` |
| Load | k6 | `npm run test:load` | `k6/` |

## Unit tests con Vitest

```typescript
// __tests__/api/orders.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/orders/route";

// Mock de auth
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ userId: "1", role: "admin", tenantId: "main" })
}));

// Mock de DB class (no Prisma directo)
vi.mock("@/lib/db/orders.db", () => ({
  OrdersDB: {
    getAll: vi.fn().mockResolvedValue([{ id: "1", total: 100, status: "pending" }])
  }
}));

describe("GET /api/orders", () => {
  it("retorna órdenes del tenant", async () => {
    const req = new Request("http://localhost/api/orders");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
```

## Correr un solo test

```bash
cd bodega-san-martin
npm run test -- --grep "nombre-del-test"
# o
npx vitest run __tests__/api/orders.test.ts
```

## E2E con Playwright

```typescript
// e2e/checkout.spec.ts — 5 casos ya implementados
import { test, expect } from "@playwright/test";

test("checkout flow completo", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await page.click('[data-testid="add-to-cart"]');
  await page.click('[data-testid="checkout-button"]');
  // ... pasos del flujo
  await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible();
});
```

## Configuraciones

```typescript
// vitest.config.ts — configurado con jsdom environment
// playwright.config.ts — apunta a localhost:3000
// vitest.setup.ts — setup global (mocks de next/navigation, etc.)
```

## Qué testear primero (prioridades)

1. **Endpoints críticos** — POST /api/orders, POST /api/checkout, GET /api/products
2. **Auth/RBAC** — requireAdmin con diferentes roles
3. **Checkout flow** — el componente más complejo (e2e)
4. **FEFO** — decrementFEFO() con casos edge (lote vacío, múltiples lotes)
5. **Cache** — getOrSet, invalidate

## Patrones de mock en Vitest

```typescript
// Mock de Prisma (nunca llamar Prisma real en unit tests)
vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "1" })
    }
  }
}));

// Mock de cache
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn((key, ttl, fn) => fn()),
  invalidate: vi.fn()
}));
```

## Checklist de verificación post-cambio

```bash
cd bodega-san-martin
npm run lint          # 1. Sin errores ESLint
npm run build         # 2. Build exitoso (detecta errores TypeScript)
npm run test          # 3. Unit tests pasan
npm run test:e2e      # 4. E2E (si tocaste flujos de usuario)
```

## Gotchas

- **`__mocks__/` directory** — mocks globales que aplican a todos los tests
- **`vitest.setup.ts`** — importado antes de cada test — no duplicar setup aquí
- **Playwright necesita el servidor corriendo** — `npm run dev` antes de `test:e2e`
- **k6 tests** — requieren k6 instalado globalmente (`brew install k6` / `choco install k6`)
- **No mockear `lib/db/*.db.ts` con Prisma** — mockear la DB class directamente
