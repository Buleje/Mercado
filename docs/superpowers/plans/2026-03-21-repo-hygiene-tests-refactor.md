# Repo Hygiene, Critical Tests & jsondb.ts Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up git state, add a root .gitignore, verify .env security, add tests for critical API handlers, and split jsondb.ts into domain-focused modules without breaking the 68 files that currently import from it.

**Architecture:** Three independent phases — (1) git hygiene with no code changes, (2) test coverage for auth/orders/products API handlers using the existing Vitest + msw setup, (3) non-breaking refactor of lib/jsondb.ts into lib/db/ modules with a barrel re-export in jsondb.ts for backwards compatibility.

**Tech Stack:** Git, Next.js 16 App Router, Vitest 4, TypeScript 5.7, Prisma 7 + Supabase PostgreSQL, Zod 4

---

## File Map

### Phase 1 — Git Hygiene
- Stage & commit: `../ING SOTFWARE/APP WE4B/Probando 2/` (52 deleted files, commit the removal)
- Create: `C:\Users\Usuario\OneDrive\Documentos\Escritorio\Prueba 2\.gitignore` (root-level)
- Verify (no change needed): `bodega-san-martin/.gitignore` already excludes `.env*`

### Phase 2 — Critical API Tests
- Create: `bodega-san-martin/__tests__/api-auth-login.test.ts`
- Create: `bodega-san-martin/__tests__/api-orders.test.ts`
- Create: `bodega-san-martin/__tests__/api-products.test.ts`

### Phase 3 — jsondb.ts Split
- Create: `bodega-san-martin/lib/db/products.db.ts` — ProductsDB, PriceHistoryDB, BundlesDB
- Create: `bodega-san-martin/lib/db/customers.db.ts` — CustomersDB, LoyaltyDB, ReviewsDB, ShoppingListsDB
- Create: `bodega-san-martin/lib/db/orders.db.ts` — OrdersDB, DeliverySlotsDB, ReturnsDB
- Create: `bodega-san-martin/lib/db/inventory.db.ts` — InventoryMovementsDB, WarehousesDB, AutoReorderDB
- Create: `bodega-san-martin/lib/db/purchases.db.ts` — SuppliersDB, PurchasesDB, SupplierEvaluationsDB
- Create: `bodega-san-martin/lib/db/sales.db.ts` — SalesDB, CashRegistersDB
- Create: `bodega-san-martin/lib/db/finance.db.ts` — PayablesDB, ExpensesDB
- Create: `bodega-san-martin/lib/db/promotions.db.ts` — PromotionsDB, CouponsDB
- Create: `bodega-san-martin/lib/db/settings.db.ts` — SettingsDB
- Create: `bodega-san-martin/lib/db/notifications.db.ts` — NotificationLogsDB, AdminChatDB, ChatDB
- Create: `bodega-san-martin/lib/db/misc.db.ts` — SurveyDB, normalizePhone
- Create: `bodega-san-martin/lib/db/index.ts` — barrel re-export of all db modules
- Modify: `bodega-san-martin/lib/jsondb.ts` → re-export barrel pointing to `lib/db/index.ts` (no breaking change for 68 importers)

---

## PHASE 1 — Git Hygiene

### Task 1: Commit the deletion of the old APP WE4B project

**Context:** 52 files from `../ING SOTFWARE/APP WE4B/Probando 2/` were deleted from disk but not staged. These belong to an old Firebase-based project that has been superseded. This commits the removal from git history cleanly.

**Files:**
- Stage & commit deletions of `../ING SOTFWARE/APP WE4B/Probando 2/**`

- [ ] **Step 1: Verify the deleted files are the old Firebase project (not accidentally deleted)**

```bash
cd "C:/Users/Usuario/OneDrive/Documentos/Escritorio/Prueba 2"
git status --short | grep "^ D" | head -10
```
Expected output: paths all under `../ING SOTFWARE/APP WE4B/Probando 2/` with Firebase, ingresos, cubicacion files. If anything unexpected appears, stop and investigate.

- [ ] **Step 2: Stage all deletions**

```bash
cd "C:/Users/Usuario/OneDrive/Documentos/Escritorio/Prueba 2"
git rm --cached "../ING SOTFWARE/APP WE4B/Probando 2/.gitignore" \
  "../ING SOTFWARE/APP WE4B/Probando 2/.vscode/settings.json" \
  "../ING SOTFWARE/APP WE4B/Probando 2/.vscode/tasks.json" \
  "../ING SOTFWARE/APP WE4B/Probando 2/firebase-key.json" \
  "../ING SOTFWARE/APP WE4B/Probando 2/firebase/firebase.js"
git rm --cached -r "../ING SOTFWARE/APP WE4B/Probando 2/frontend/" \
  "../ING SOTFWARE/APP WE4B/Probando 2/public/" \
  "../ING SOTFWARE/APP WE4B/Probando 2/"
```
Or use a single command:
```bash
git status --short | grep "^ D" | sed 's/ D //' | xargs git rm --cached
```

- [ ] **Step 3: Verify staging**

```bash
git status --short | grep "^D " | head -10
```
Expected: the 52 files now show `D ` (staged) instead of ` D` (unstaged)

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove old APP WE4B Firebase project (superseded by bodega-san-martin)"
```

---

### Task 2: Create root .gitignore to exclude personal files

**Context:** ~200 personal/untracked files appear in git status (Excel, PDFs, executables, etc.) because there's no `.gitignore` at the root of `Prueba 2/`. The `bodega-san-martin/` subdirectory has its own `.gitignore` but the root does not. This task adds one.

**Files:**
- Create: `C:\Users\Usuario\OneDrive\Documentos\Escritorio\Prueba 2\.gitignore`

- [ ] **Step 1: Create the root .gitignore**

Create file at `C:\Users\Usuario\OneDrive\Documentos\Escritorio\Prueba 2\.gitignore`:

```gitignore
# ── Personal files ─────────────────────────────────────────────────────────────
*.pdf
*.xlsx
*.xlsm
*.xlsb
*.xls
*.docx
*.doc
*.lnk
*.exe
*.zip
*.jpeg
*.jpg
*.png
*.mp4
*.csv

# ── Windows system files ────────────────────────────────────────────────────────
desktop.ini
NTUSER.DAT*
ntuser.dat*
ntuser.ini
*.regtrans-ms
*.blf
Sti_Trace.log
~$*

# ── Lock/temp files (Office) ────────────────────────────────────────────────────
~$*.docx
~$*.xlsx
~$*.xlsm

# ── Certs & keys (non-project) ──────────────────────────────────────────────────
*.pem
*.p12

# ── Dev tool config dirs (personal, not project-specific) ──────────────────────
.android/
.bun/
.cache/
.chocolatey/
.claude/
.cline/
.cloudflared/
.codegpt/
.codeium/
.codex/
.config/
.copilot/
.cursor/
.emulator_console_auth_token
.gemini/
.gitconfig
.gk/
.gradle/
.gsutil/
.lesshst
.local/
.node_repl_history
.redhat/
.rest-client/
.th-client/
.vivaldi_reporting_data
.vscode/
.windsurf/
.bito/
.boto
.antigravity/
.camscanner/

# ── App data ───────────────────────────────────────────────────────────────────
AppData/
Application Data/
Contacts/
CrossDevice/
Documents/
Downloads/
Favorites/
Links/
Music/
Saved Games/
Searches/
Videos/

# ── Misc executables and installers ────────────────────────────────────────────
edb_*.exe
postgresql_*.exe
postgis_*.exe
pemhttpd.exe
iobituninstaller.exe
BraveBrowserSetup*.exe
scrcpy-win64*.zip
Antigravity.exe

# ── One-off files that should never be tracked ─────────────────────────────────
*.log
prev_shell.jsx
```

- [ ] **Step 2: Verify the .gitignore is working**

```bash
cd "C:/Users/Usuario/OneDrive/Documentos/Escritorio/Prueba 2"
git status --short | grep -v "^?? \.\./\|^?? \.\./\.\./\|^?? \.\./\.\./\.\." | grep "^??" | wc -l
```
Expected: drastically fewer untracked entries (mostly just project directories, not personal files).

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/Usuario/OneDrive/Documentos/Escritorio/Prueba 2"
git add .gitignore
git commit -m "chore: add root .gitignore to exclude personal files and system artifacts"
```

---

### Task 3: Verify .env security (no code change)

**Context:** Confirm that `.env` files containing Supabase/Groq credentials are NOT tracked in git.

- [ ] **Step 1: Verify .env is not tracked**

```bash
cd "C:/Users/Usuario/OneDrive/Documentos/Escritorio/Prueba 2/bodega-san-martin"
git ls-files .env .env.local .env.development .env.production 2>&1
```
Expected: empty output (no files listed means none are tracked). The `.gitignore` contains `.env*` which covers all of them.

- [ ] **Step 2: Double-check with git log**

```bash
cd "C:/Users/Usuario/OneDrive/Documentos/Escritorio/Prueba 2/bodega-san-martin"
git log --all --full-history -- .env | head -5
```
Expected: no commits reference `.env` (empty output). If output appears, those credentials must be rotated in Supabase and Groq dashboards immediately.

- [ ] **Step 3: Verify .env.example is tracked (required as documentation)**

```bash
git ls-files .env.example
```
Expected: `.env.example` printed (it should be tracked as documentation of required variables).

✅ No commit needed if all checks pass.

---

## PHASE 2 — Critical API Tests

**Setup note:** Before writing tests, read one existing test (e.g. `__tests__/api-batches.test.ts`) to understand the mocking pattern used in this project (Prisma mock strategy, NextRequest construction, etc.).

```bash
cat "bodega-san-martin/__tests__/api-batches.test.ts"
```

### Task 4: Auth API tests

**Files:**
- Read first: `bodega-san-martin/app/api/auth/route.ts` (understand the handler)
- Create: `bodega-san-martin/__tests__/api-auth-login.test.ts`

- [ ] **Step 1: Read the auth handler**

```bash
cat "bodega-san-martin/app/api/auth/route.ts"
```
Note: the expected inputs (phone/password or username/password), the cookie name set, and the error response shapes.

- [ ] **Step 2: Write failing tests**

Create `__tests__/api-auth-login.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/auth/route'
import { NextRequest } from 'next/server'

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    adminUser: {
      findUnique: vi.fn(),
    },
  },
}))

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn() },
  compare: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

const makeRequest = (body: object) =>
  new NextRequest('http://localhost/api/auth', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

describe('POST /api/auth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when credentials are missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 401 when user does not exist', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null)
    const res = await POST(makeRequest({ username: 'admin', password: 'wrong' }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when password is incorrect', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: '1', username: 'admin', passwordHash: 'hash', role: 'admin',
    } as any)
    vi.mocked(bcrypt.compare).mockResolvedValue(false as any)
    const res = await POST(makeRequest({ username: 'admin', password: 'wrong' }))
    expect(res.status).toBe(401)
  })

  it('returns 200 and sets session cookie on valid credentials', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: '1', username: 'admin', passwordHash: 'hash', role: 'admin',
    } as any)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as any)
    const res = await POST(makeRequest({ username: 'admin', password: 'correct' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(/session|auth/i)
  })
})
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
cd bodega-san-martin
npm run test -- __tests__/api-auth-login.test.ts
```
Expected: FAIL — handler not yet mapped, or import errors that guide you to adapt the mock to the real handler.

- [ ] **Step 4: Adjust mocks to match actual handler signature**

Read the actual handler (`app/api/auth/route.ts`) and fix field names, mock targets, and cookie assertions to match. The goal is green tests that reflect real behavior.

- [ ] **Step 5: Run test to confirm pass**

```bash
npm run test -- __tests__/api-auth-login.test.ts
```
Expected: PASS all tests.

- [ ] **Step 6: Commit**

```bash
git add __tests__/api-auth-login.test.ts
git commit -m "test: add auth login API handler tests"
```

---

### Task 5: Orders API tests

**Files:**
- Read first: `bodega-san-martin/app/api/orders/route.ts`
- Create: `bodega-san-martin/__tests__/api-orders-create.test.ts`

- [ ] **Step 1: Read the orders handler**

```bash
cat "bodega-san-martin/app/api/orders/route.ts"
```
Note: required fields for order creation (customer phone, items, delivery slot, payment method), validation schema, and response shape.

- [ ] **Step 2: Write failing tests**

Create `__tests__/api-orders-create.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, GET } from '@/app/api/orders/route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    product: { findUnique: vi.fn() },
  },
}))

// Mock requireAdmin for GET (admin-only)
vi.mock('@/lib/auth/session', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: '1', role: 'admin' }),
}))

import { prisma } from '@/lib/prisma'

const makeRequest = (body: object, method = 'POST') =>
  new NextRequest('http://localhost/api/orders', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

describe('POST /api/orders', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when items array is empty', async () => {
    const res = await POST(makeRequest({
      customerPhone: '999000111',
      items: [],
      deliveryAddress: 'Calle Los Pinos 123',
      paymentMethod: 'cash',
    }))
    expect(res.status).toBe(400)
  })

  it('creates order and returns 201 with valid payload', async () => {
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: 'order-1',
      status: 'pending',
    } as any)
    const res = await POST(makeRequest({
      customerPhone: '999000111',
      items: [{ productId: 'p1', quantity: 2 }],
      deliveryAddress: 'Calle Los Pinos 123',
      paymentMethod: 'cash',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('id')
  })
})
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
npm run test -- __tests__/api-orders-create.test.ts
```

- [ ] **Step 4: Adjust mocks to match actual handler**

Read the route handler and update mock targets, field names, and assertions to match real implementation.

- [ ] **Step 5: Run test to confirm pass**

```bash
npm run test -- __tests__/api-orders-create.test.ts
```
Expected: PASS all tests.

- [ ] **Step 6: Commit**

```bash
git add __tests__/api-orders-create.test.ts
git commit -m "test: add orders creation API handler tests"
```

---

### Task 6: Products API tests

**Files:**
- Read first: `bodega-san-martin/app/api/products/route.ts`
- Create: `bodega-san-martin/__tests__/api-products-list.test.ts`

- [ ] **Step 1: Read the products handler**

```bash
cat "bodega-san-martin/app/api/products/route.ts"
```
Note: query params for filtering (category, search, page, limit), response shape.

- [ ] **Step 2: Write failing tests**

Create `__tests__/api-products-list.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/products/route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'

const makeRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/products')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url)
}

describe('GET /api/products', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 with product list', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'p1', name: 'Arroz', price: 3.5, stock: 100 } as any,
    ])
    vi.mocked(prisma.product.count).mockResolvedValue(1)
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.products ?? body)).toBe(true)
  })

  it('filters by category when provided', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([])
    vi.mocked(prisma.product.count).mockResolvedValue(0)
    await GET(makeRequest({ category: 'abarrotes' }))
    expect(vi.mocked(prisma.product.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: expect.anything() }),
      })
    )
  })

  it('returns empty array when no products match search', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([])
    vi.mocked(prisma.product.count).mockResolvedValue(0)
    const res = await GET(makeRequest({ search: 'xyz_no_match' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const list = body.products ?? body
    expect(list).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
npm run test -- __tests__/api-products-list.test.ts
```

- [ ] **Step 4: Adjust mocks to match actual handler**

- [ ] **Step 5: Run test to confirm pass**

```bash
npm run test -- __tests__/api-products-list.test.ts
```

- [ ] **Step 6: Run all tests to check for regressions**

```bash
npm run test
```
Expected: all tests pass (including pre-existing 35 tests).

- [ ] **Step 7: Commit**

```bash
git add __tests__/api-products-list.test.ts
git commit -m "test: add products list API handler tests"
```

---

## PHASE 3 — jsondb.ts Split

**Context:** `lib/jsondb.ts` has 1,962 lines and 29 exported DB objects. It is imported by 68 files. The strategy is: move the actual implementations into focused modules under `lib/db/`, then replace `lib/jsondb.ts` with a barrel re-export. This means **zero changes required** in any of the 68 importing files.

**Important:** `lib/jsondb.ts` starts with `import "server-only"` — all new modules must also have this at the top.

**Split groups:**
| Module | DB Objects |
|--------|------------|
| `lib/db/products.db.ts` | ProductsDB, PriceHistoryDB, BundlesDB |
| `lib/db/customers.db.ts` | CustomersDB, LoyaltyDB, ReviewsDB, ShoppingListsDB |
| `lib/db/orders.db.ts` | OrdersDB, DeliverySlotsDB, ReturnsDB |
| `lib/db/inventory.db.ts` | InventoryMovementsDB, WarehousesDB, AutoReorderDB |
| `lib/db/purchases.db.ts` | SuppliersDB, PurchasesDB, SupplierEvaluationsDB |
| `lib/db/sales.db.ts` | SalesDB, CashRegistersDB |
| `lib/db/finance.db.ts` | PayablesDB, ExpensesDB |
| `lib/db/promotions.db.ts` | PromotionsDB, CouponsDB |
| `lib/db/settings.db.ts` | SettingsDB |
| `lib/db/notifications.db.ts` | NotificationLogsDB, AdminChatDB, ChatDB |
| `lib/db/misc.db.ts` | SurveyDB, normalizePhone, all shared types |

---

### Task 7: Create lib/db/ structure and move shared types

**Files:**
- Create: `bodega-san-martin/lib/db/misc.db.ts` (shared types + normalizePhone first, since other modules depend on them)

- [ ] **Step 1: Read the type definitions in jsondb.ts (lines 1–268)**

```bash
sed -n '1,268p' bodega-san-martin/lib/jsondb.ts
```

- [ ] **Step 2: Create `lib/db/misc.db.ts` with shared types and normalizePhone**

```typescript
import "server-only";
import { prisma } from "@/lib/prisma";
// Copy lines 1-268 from jsondb.ts (all type exports + normalizePhone)
// Include: DbSavedLocation, DbCustomer, DbOrder, DbProduct, etc.
// Include: export function normalizePhone(...)
// Include: SurveyDB, SurveyResponse types
```
Copy the exact content (types section lines ~1–269 + SurveyDB lines ~1707–1785).

- [ ] **Step 3: No tests needed for types, but verify TypeScript compiles**

```bash
cd bodega-san-martin && npx tsc --noEmit 2>&1 | head -20
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/db/misc.db.ts
git commit -m "refactor: extract shared types and normalizePhone into lib/db/misc.db.ts"
```

---

### Task 8: Extract product-related DB modules

**Files:**
- Create: `bodega-san-martin/lib/db/products.db.ts`

- [ ] **Step 1: Read the relevant sections**

```bash
sed -n '469,519p' bodega-san-martin/lib/jsondb.ts  # ProductsDB
sed -n '1515,1547p' bodega-san-martin/lib/jsondb.ts # PriceHistoryDB
sed -n '1828,1866p' bodega-san-martin/lib/jsondb.ts # BundlesDB
```

- [ ] **Step 2: Create `lib/db/products.db.ts`**

```typescript
import "server-only";
import { prisma } from "@/lib/prisma";
// Import only the Prisma types this module needs from generated client
// Paste exact implementations of ProductsDB, PriceHistoryDB, BundlesDB
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add lib/db/products.db.ts
git commit -m "refactor: extract ProductsDB, PriceHistoryDB, BundlesDB into lib/db/products.db.ts"
```

---

### Task 9: Extract customer-related DB modules

**Files:**
- Create: `bodega-san-martin/lib/db/customers.db.ts`

- [ ] **Step 1: Read the relevant sections**

```bash
sed -n '520,614p' bodega-san-martin/lib/jsondb.ts   # CustomersDB
sed -n '615,651p' bodega-san-martin/lib/jsondb.ts   # LoyaltyDB
sed -n '652,688p' bodega-san-martin/lib/jsondb.ts   # ReviewsDB
sed -n '1467,1514p' bodega-san-martin/lib/jsondb.ts # ShoppingListsDB
```

- [ ] **Step 2: Create `lib/db/customers.db.ts`**

```typescript
import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "./misc.db";
// Paste CustomersDB, LoyaltyDB, ReviewsDB, ShoppingListsDB
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add lib/db/customers.db.ts
git commit -m "refactor: extract customer domain DBs into lib/db/customers.db.ts"
```

---

### Task 10: Extract orders, inventory, purchases, sales, finance, promotions, settings, notifications

For each of the following, follow the same pattern as Tasks 8–9. Use `grep -n "export const XxxDB"` to find exact line numbers in the current file before extracting. If a module uses `normalizePhone`, add `import { normalizePhone } from "./misc.db"` — run `npx tsc --noEmit` after each module to catch missing imports early.
1. Read the relevant lines from jsondb.ts
2. Create the module file
3. `npx tsc --noEmit` to verify
4. Commit

**Orders** (`lib/db/orders.db.ts`):
- Lines: OrdersDB (~689–885), DeliverySlotsDB (~1548–1578), ReturnsDB (~1427–1466)
- Import: `normalizePhone` from `./misc.db` if used inside the module

**Inventory** (`lib/db/inventory.db.ts`):
- Lines: InventoryMovementsDB (~1258–1331), WarehousesDB (~1929–1961), AutoReorderDB (~1886–1928)

**Purchases** (`lib/db/purchases.db.ts`):
- Lines: SuppliersDB (~920–948), PurchasesDB (~949–985), SupplierEvaluationsDB (~1657–1706)

**Sales** (`lib/db/sales.db.ts`):
- Lines: SalesDB (~986–1011), CashRegistersDB (~1190–1257)

**Finance** (`lib/db/finance.db.ts`):
- Lines: PayablesDB (~1051–1189), ExpensesDB (~1786–1827)

**Promotions** (`lib/db/promotions.db.ts`):
- Lines: PromotionsDB (~1012–1050), CouponsDB (~1332–1426)

**Settings** (`lib/db/settings.db.ts`):
- Lines: SettingsDB (~886–919)

**Notifications** (`lib/db/notifications.db.ts`):
- Lines: NotificationLogsDB (~1867–1885), AdminChatDB (~1579–1606), ChatDB (~1607–1656)

Each module commit message:
```bash
git commit -m "refactor: extract [domain] DBs into lib/db/[domain].db.ts"
```

---

### Task 11: Create barrel index and update jsondb.ts

**Files:**
- Create: `bodega-san-martin/lib/db/index.ts`
- Modify: `bodega-san-martin/lib/jsondb.ts`

- [ ] **Step 1: Create `lib/db/index.ts` barrel**

```typescript
export * from "./misc.db";
export * from "./products.db";
export * from "./customers.db";
export * from "./orders.db";
export * from "./inventory.db";
export * from "./purchases.db";
export * from "./sales.db";
export * from "./finance.db";
export * from "./promotions.db";
export * from "./settings.db";
export * from "./notifications.db";
```

- [ ] **Step 2: Replace jsondb.ts with a re-export barrel**

Replace the entire content of `lib/jsondb.ts` with:

```typescript
/**
 * @deprecated Import directly from '@/lib/db' or from the specific domain module.
 * This file is kept for backwards compatibility with existing imports.
 */
export * from "./db/index";
```

Note: Remove the `import "server-only"` from the barrel — it is already declared in each module.

- [ ] **Step 3: Verify TypeScript compiles with zero new errors**

```bash
cd bodega-san-martin && npx tsc --noEmit 2>&1
```
Expected: zero errors. Any error here means a type was not re-exported from one of the new modules — fix the missing export in the relevant module.

- [ ] **Step 4: Run all tests**

```bash
npm run test
```
Expected: all tests pass. If any test fails due to import resolution, check that the mock path still resolves (`@/lib/jsondb` → re-exports from `@/lib/db/*`).

- [ ] **Step 5: Start dev server and do a smoke test**

```bash
npm run dev
```
Open `http://localhost:3000` and `http://localhost:3000/admin`. Verify pages load without runtime errors.

- [ ] **Step 6: Commit**

```bash
git add lib/db/index.ts lib/jsondb.ts
git commit -m "refactor: replace jsondb.ts with barrel re-export, implementations now in lib/db/*"
```

---

## Final Verification

- [ ] Run full test suite: `npm run test`
- [ ] Run lint: `npm run lint`
- [ ] Run TypeScript check: `npx tsc --noEmit`
- [ ] Verify git status is clean: `git status`
- [ ] Verify no .env files are tracked: `git ls-files .env*`
