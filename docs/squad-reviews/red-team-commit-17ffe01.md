# Red Team Chaos Monkey — commit 17ffe01

**Auditor:** Red Team Chaos Monkey (single run)
**Date:** 2026-04-09
**Commit:** `17ffe01` — feat(squad): autonomous Alpha/Beta/Gamma squad + TASK-002 dashboard aggregates
**Scope:** files added in 17ffe01 only

Files under audit:
- `app/api/admin/dashboard/aggregates/route.ts`
- `lib/db/analytics.db.ts`
- `app/api/squad/status/route.ts`
- `components/admin/DashboardKpis.tsx`
- `__tests__/analytics-db-dashboard.test.ts`

Support file read for context (not in scope for patching): `lib/require-admin.ts`.

---

## Findings summary

| # | Attack | Severity | Verdict |
|---|---|---|---|
| 1 | Multi-tenant leak via `x-tenant-id` header on dashboard | **CRITICAL** | EXPLOITABLE |
| 2 | Cache poisoning via in-cache error fallback | **HIGH** | EXPLOITABLE |
| 5 | Cross-tenant information disclosure on squad status | **HIGH** | EXPLOITABLE |
| 7 | JSON parse DoS (no size limit on `orchestrator.json`) | **MEDIUM** | PARTIAL |
| 6 | Path traversal in squad status | LOW | CONFIRMED-SAFE (with caveat) |
| 3 | SQL injection in parameterized raw query | — | CONFIRMED-SAFE |
| 4 | Auth bypass on squad status | — | CONFIRMED-SAFE |
| 8 | Missing rate limit on dashboard endpoint | LOW | CONFIRMED-SAFE (cache absorbs) |

---

## Attack 1 — Multi-tenant leak via `x-tenant-id` header — **CRITICAL**

**Target:** `app/api/admin/dashboard/aggregates/route.ts:34-40` → `lib/require-admin.ts:49-65`

**Vector.** The dashboard route delegates tenant resolution to `requireAdmin(req, ["admin", "cajero"])` and passes `auth.tenantId` to `AnalyticsDB.getDashboardAggregates(auth.tenantId)`. `requireAdmin` resolves tenant as follows:

```
lib/require-admin.ts:49   const headerTenantId = req.headers.get("x-tenant-id");
lib/require-admin.ts:50   const effectiveTenantId = headerTenantId || payload.tenantId;
...
lib/require-admin.ts:55   if (payload.role === "admin") {
lib/require-admin.ts:64     return { ...payload, tenantId: headerTenantId };
```

Any caller whose JWT role is `admin` is allowed to override the JWT tenant with whatever `x-tenant-id` header they choose. The comment claims "Only admin/superadmin may cross-tenant (e.g. superadmin managing another store)" — but the code checks `payload.role === "admin"`, which matches the **ordinary per-tenant admin role**, not just a superadmin. There is no cross-tenant ACL, no allow-list, and no verification that the JWT subject has any relationship with the target tenant.

**Exploit payload:**
```
GET /api/admin/dashboard/aggregates HTTP/1.1
Cookie: <valid admin cookie for tenant-A>
x-tenant-id: tenant-B
```

**Expected outcome.** `requireAdmin` returns `{...payload, tenantId: "tenant-B"}`. `AnalyticsDB.getDashboardAggregates("tenant-B")` returns tenant B's aggregated revenue, sales count, active carts, and low-stock count to an admin of tenant A. The unit tests in `__tests__/analytics-db-dashboard.test.ts:82-134` prove the DB layer faithfully honors whatever `tenantId` it is handed — the bug is upstream in the auth layer, but it is reachable through the new route.

**Blast radius.** Every tenant-admin in the SaaS can exfiltrate every other tenant's daily revenue, weekly revenue, in-flight order count, and low-stock count. That is direct competitive intelligence in a multi-tenant ERP.

**Trust boundary on the header.** Even if `proxy.ts` / middleware strips client-sent `x-tenant-id` before re-setting it from the subdomain, the defense-in-depth is absent here: the route trusts whatever arrives. And any skipped middleware path (internal fetch, direct function URL on Vercel, bypassed middleware matcher) goes straight to the vulnerable code.

**HOTFIX proposal.**
1. In `lib/require-admin.ts:52-65`, do not allow tenant override based solely on `role === "admin"`. Require `role === "superadmin"` **and** a membership check against the target tenant.
2. Alternatively, in the dashboard route, ignore `auth.tenantId` when it came from the header override and always use `payload.tenantId` (the JWT claim).
3. Add an e2e test: admin of tenant A sending `x-tenant-id: tenant-B` must receive 403, not tenant B's KPIs.

---

## Attack 2 — Cache poisoning via in-cache error fallback — **HIGH**

**Target:** `lib/db/analytics.db.ts:86-174`

**Vector.** The `"use cache"` directive, `cacheLife({revalidate:60, stale:30, expire:300})`, and `cacheTag(...)` live at the top of the function (lines 87-89). The `try/catch` block (lines 94-173) is **inside** the cached scope. On any transient DB failure (pool exhaustion, network blip, Prisma timeout), the `catch` branch (lines 159-173) returns:

```ts
return {
  tenantId,
  today: { salesCount: 0, revenue: 0 },
  week:  { salesCount: 0, revenue: 0 },
  activeCarts: 0,
  lowStockCount: 0,
  generatedAt: new Date().toISOString(),
};
```

That all-zero object is the function's return value, so the Next 16 Cache Components layer stores it in the cache entry keyed by `tenantId`. The entry is tagged `tenant:${tenantId}:dashboard` and lives for `expire: 300` seconds. Any write path that calls `revalidateTag(...)` will drop it; any write path that does NOT will let it persist for up to 5 minutes.

**Concrete exploit timeline:**
1. Prisma pool saturates for ~2 seconds under legitimate load.
2. One request for tenant A hits `getDashboardAggregates` during the blip → enters the `catch` → returns zeros.
3. Result is cached under `tenant:A:dashboard`.
4. For the next 60 s (revalidate) / 300 s (expire) window, every admin of tenant A sees a dashboard reporting `Ventas hoy: S/ 0.00`, `Ingresos 7d: S/ 0.00`, `Carritos activos: 0`, `Bajo stock: 0`.
5. Revenue monitoring goes blind; an admin may assume "no sales" and make incorrect operational decisions (e.g. kill a campaign that is actually performing fine).

**Evidence from the tests.** `__tests__/analytics-db-dashboard.test.ts` does not cover the error path — there is no test that rejects a Prisma call and asserts the fallback is NOT cached. Gap in acceptance criterion #6.

**HOTFIX proposal.**
1. Move the `try/catch` OUT of the cached inner function. Wrap the call at the route level (`app/api/admin/dashboard/aggregates/route.ts:38-50` already has its own catch — it can also fall back there).
2. Inside the cached function, let errors throw. Next 16 will not cache a thrown error.
3. Alternatively, on error inside the cached function, call `cacheLife({ revalidate: 0, stale: 0, expire: 0 })` before returning the fallback — though moving the try/catch out is cleaner and less error-prone.
4. Add a unit test that mocks one Prisma call to reject and asserts the function throws (post-fix) or at least that the zero object is not retained across calls.

---

## Attack 3 — SQL injection in parameterized raw query — **CONFIRMED-SAFE**

**Target:** `lib/db/analytics.db.ts:133-142`

```ts
prisma.$queryRaw<{ count: bigint }[]>`
  SELECT COUNT(*)::bigint AS count
  FROM "Product"
  WHERE "tenantId" = ${tenantId}
    AND "deletedAt" IS NULL
    AND "active" = true
    AND "stock" IS NOT NULL
    AND "stockMin" IS NOT NULL
    AND "stock" <= "stockMin"
`
```

**Verification.** This is `prisma.$queryRaw` (not `$queryRawUnsafe`) used with tagged-template syntax. Prisma's tagged-template form converts each `${...}` into a PostgreSQL positional parameter (`$1`, `$2`, ...) and passes the value via the binary protocol. `tenantId` cannot be interpolated into the SQL string; even if an attacker somehow supplied `"; DROP TABLE ..."` as a tenant id, PostgreSQL would bind it as a literal value. The comparison `"stock" <= "stockMin"` is a column-to-column comparison in static SQL — no interpolation.

The unit test at `__tests__/analytics-db-dashboard.test.ts:262-284` explicitly asserts `rawCall?.[1]` contains the tenantId value (confirming tagged-template positional binding, not string concat).

**Verdict.** Safe. Complies with CLAUDE.md rule #11.

---

## Attack 4 — Auth bypass on squad status endpoint — **CONFIRMED-SAFE**

**Target:** `app/api/squad/status/route.ts:105-107`

```ts
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
```

**Verification.** `requireAdmin` returns a `NextResponse` (401 / 403) before the handler can read the file, and the `instanceof NextResponse` guard early-returns. An anonymous request, a cajero, or a user with an expired token cannot reach `readOrchestrator()`. The role allow-list is `["admin"]` only.

**Verdict.** Basic auth bypass is not feasible. (But see Attack 5 for a post-auth info disclosure.)

---

## Attack 5 — Cross-tenant information disclosure from squad status — **HIGH**

**Target:** `app/api/squad/status/route.ts:14-20, 109-163`

**Vector.** The route comment states plainly:

```
app/api/squad/status/route.ts:15  Access: admin + superadmin only. Not tenant-scoped because the orchestrator
app/api/squad/status/route.ts:16  is a global engineering artifact, not per-tenant data.
```

The handler is `requireAdmin(req, ["admin"])` — so **any admin from any tenant** in the multi-tenant SaaS can hit it and receive:

- `project` (line 149) — hard-coded "bodega-san-martin" engineering project name
- `agents` object (line 157) — internal role/status/owns dict for Alpha/Beta/Gamma
- `locked_files` (line 158) — an array of `{ path, agent, since }` — **absolute/relative file paths of the source code currently under edit** by the engineering squad
- `tasks` (line 161) — each task's `task_id`, `module`, `title`, `priority`, `status`, `assigned_agent`, `allowed_agents`, timestamps, reviewer
- `recent_events` (line 162) — **last 20 raw lines of `.claude/squad/events.log`**, whatever the agents wrote there

The mitigation the code applies (dropping `description`, `files_to_modify`, `acceptance_criteria` from the `tasksSummary` map at lines 134-145) is incomplete — `title` is still there, and critically `locked_files` and `recent_events` pass through unredacted.

**What leaks in practice:**
- **File paths of in-flight source files** (`locked_files[i].path`) to tenant admins who are customers, not engineers.
- **Internal module names and task titles** of a roadmap not yet public (e.g. "TASK-005 Loyalty transaction ledger" before the feature ships).
- **Raw `events.log` content** — whatever the squad logged, potentially including error messages with stack traces, environment details, or commit hashes.

A customer admin at `bodega-a.bodegasanmartin.com` should never see internal engineering state of the platform.

Additionally, this endpoint has **no reason to exist in production at all**. `.claude/squad/orchestrator.json` is a dev-time coordination file not bundled in Vercel deployments — in prod, the endpoint will always return 503 (`orchestrator.json not found or unparseable`), which itself signals the presence of the endpoint to attackers doing reconnaissance.

**HOTFIX proposal.**
1. Restrict access to **a single hardcoded allowlist of engineering superadmins** (by `payload.sub` / user id), not the generic `["admin"]` role.
2. Gate the whole route behind `process.env.NODE_ENV !== "production"` or a dedicated `SQUAD_DASHBOARD_ENABLED` env flag.
3. Drop `locked_files` and `recent_events` from the response, or redact file paths to just basenames.
4. Return 404 (not 503) when the file is missing, to avoid revealing endpoint existence.

---

## Attack 6 — Path traversal on squad status file read — **CONFIRMED-SAFE (with caveat)**

**Target:** `app/api/squad/status/route.ts:62-73`

```ts
const ORCHESTRATOR_PATH = path.join(process.cwd(), ".claude", "squad", "orchestrator.json");
const EVENTS_PATH       = path.join(process.cwd(), ".claude", "squad", "events.log");
```

**Verification.** Both paths are module-level constants built from `process.cwd()` + fixed segments. No request body, query param, header, or URL segment feeds into them. `readFile(ORCHESTRATOR_PATH, "utf8")` at line 77 and `readFile(EVENTS_PATH, ...)` at line 86 both consume only the constant. No traversal vector.

**Caveat.** `process.cwd()` is trust-inherited from whoever launched the Node process. On Vercel Fluid Compute this is typically `/var/task`, and the `.claude/` directory is unlikely to be bundled — meaning the endpoint effectively cannot read anything in production. In dev, the cwd is the repo root and the paths resolve as intended.

**Verdict.** No traversal. Safe.

---

## Attack 7 — JSON parse DoS (no size limit on orchestrator.json) — **MEDIUM (PARTIAL)**

**Target:** `app/api/squad/status/route.ts:75-82`

```ts
async function readOrchestrator(): Promise<OrchestratorFile | null> {
  try {
    const raw = await readFile(ORCHESTRATOR_PATH, "utf8");
    return JSON.parse(raw) as OrchestratorFile;
  } catch {
    return null;
  }
}
```

**Vector.** `readFile(..., "utf8")` loads the entire file into memory in one allocation, then `JSON.parse` expands it to a JS object graph. There is no:
- `stat()` size check before reading
- streaming parse
- memory cap
- per-request timeout beyond the default function timeout

**Current exposure.** The file on disk is currently 20,312 bytes (`wc -c` = 20312), so no live exploit. But the squad itself writes to this file under the control of the Beta/Alpha/Gamma agents (see `.claude/squad/README.md`). A misbehaving agent, a write loop bug, or an attacker who has obtained write access to the repo (which admittedly already implies RCE) can fill it until function memory is exhausted — at which point the Vercel function OOMs on every squad status request. Not high-severity on its own, but a hardening gap in an endpoint that already has other problems.

**`readRecentEvents`** (lines 84-94) has the same issue on `events.log`: entire file loaded, split by `\n`, then sliced to last 20 lines. A 1 GB events.log would be loaded entirely to return 20 lines.

**HOTFIX proposal.**
1. Before `readFile`, `stat` the file and bail if `size > 512 KB` (orchestrator.json) or `> 5 MB` (events.log).
2. For `events.log`, use a tail-style reader that reads only the last N bytes from the file descriptor.
3. Or, since this endpoint should not exist in production at all (see Attack 5), gate the whole file-read path behind the dev-only flag and the problem disappears.

---

## Attack 8 — Missing rate limit on dashboard endpoint — **LOW (CONFIRMED-SAFE)**

**Target:** `app/api/admin/dashboard/aggregates/route.ts`

**Analysis.** No rate limiter is wrapped around `GET`. Each request that misses the cache triggers 4 parallel queries (2× `prisma.order.aggregate`, 1× `prisma.order.count`, 1× `prisma.$queryRaw`). An admin crafting N concurrent requests could temporarily spike DB load.

**Mitigating factor.** The `"use cache"` directive with `cacheLife({ revalidate: 60, stale: 30, expire: 300 })` absorbs burst traffic: the first call fills the cache, subsequent calls within 60 s return the cached payload without touching Prisma. Under `stale-while-revalidate`, even revalidation happens once per 60 s per tenant regardless of request rate.

**Verdict.** Safe in the common case. Worth adding a rate limiter for defense in depth (e.g. 30 req/min per admin), but not a priority next to Attacks 1, 2, and 5.

**Note.** If Attack 2 (cache poisoning with zeros) is not fixed, an attacker can reach Attack 8 by flipping the cache between zeros and real values quickly — but that is a derivative of #2, not a standalone bug.

---

## HOTFIX entities (CRITICAL / HIGH only)

### HOTFIX-001 — Block `x-tenant-id` override for plain-admin role (CRITICAL, Attack 1)
- **File:** `lib/require-admin.ts:52-65`
- **Change:** Gate tenant override behind `payload.role === "superadmin"` **and** a membership lookup (`SuperadminTenantMembership` table or equivalent). Reject `role === "admin"` cross-tenant overrides with 403.
- **Test:** e2e — admin of tenant A sending `x-tenant-id: tenant-B` against `/api/admin/dashboard/aggregates` must receive 403.
- **Blast radius of fix:** touches every route that uses `requireAdmin`. High-value regression risk — pair with dedicated audit.

### HOTFIX-002 — Remove error fallback from inside `"use cache"` scope (HIGH, Attack 2)
- **File:** `lib/db/analytics.db.ts:94-173`
- **Change:** Let `getDashboardAggregates` throw on DB error. Move the graceful zero-fallback up to `app/api/admin/dashboard/aggregates/route.ts:41-50` where the `catch` already exists.
- **Test:** unit — mock one `prisma.order.aggregate` to reject; assert `getDashboardAggregates` throws, AND on a subsequent successful call the real numbers are returned (not sticky zeros).

### HOTFIX-003 — Harden squad status endpoint against cross-tenant disclosure (HIGH, Attack 5)
- **File:** `app/api/squad/status/route.ts:105-163`
- **Change:** (a) add `if (process.env.NODE_ENV === "production") return NextResponse.json({error:"not_found"},{status:404});` as the first line of `GET`; (b) add a hardcoded superadmin userId allowlist check; (c) drop `locked_files` and `recent_events` fields from the response, or redact paths to basenames.
- **Test:** unit/e2e — non-superadmin returns 403; production returns 404; response does not include `locked_files` or `recent_events`.

---

## Notes & gaps outside the strict attack list

1. `app/api/squad/status/route.ts` does not use the `tenantId` at all — so it correctly ignores the header path, but that also means the cross-tenant disclosure in Attack 5 has no tenant boundary to lean on.
2. `components/admin/DashboardKpis.tsx` is well-behaved: `safeParse` (rule #2), no client-side math (rule #6), `credentials: "include"`. The only hardening opportunity is handling the 403 response explicitly so a header-spoofing attempt renders a sensible error to the real user, but that is cosmetic and not a security issue.
3. The test file `__tests__/analytics-db-dashboard.test.ts` proves tenant isolation at the DB-layer shape but does NOT test the error-path cache behavior (see Attack 2). Add a test for that.
4. `toNumOrZero` at line 149/153 converts Prisma Decimal to `number` — acceptable for dashboard KPIs at this scale, but flagged for the float-to-decimal work on the current branch (`feature/td018-float-to-decimal`). Not a security issue, just a consistency call-out.

---

**Report status:** complete. Written by Red Team Chaos Monkey, single run, no source modifications performed.
