# Director Routing Benchmark — 20 Scenarios

Test these scenarios to verify the Director routes correctly.

## Simple tasks (should use SUBAGENT DIRECT)

| # | Input | Expected agent | Expected model |
|---|-------|---------------|---------------|
| 1 | "Fix typo in ProductCard.tsx" | frontend | Sonnet |
| 2 | "Add rate limit to /api/orders" | backend | Sonnet |
| 3 | "Add index to orders table on tenant_id" | database | Sonnet |
| 4 | "Update JSON-LD for product pages" | integrator | Sonnet |
| 5 | "Review PR #123 for security issues" | reviewer (mode: review) | Sonnet |

## Medium tasks (should use PARTIAL TEAMMATES)

| # | Input | Expected teammates | Expected Hub |
|---|-------|-------------------|-------------|
| 6 | "Add new field to Product schema + endpoint" | database + backend | BUILD (partial) |
| 7 | "Add SUNAT RUC validation to checkout" | backend + integrator | BUILD (partial) |
| 8 | "Fix bug in cart sync across tabs" | frontend (+ skill state-management) | BUILD (partial) |

## Complex tasks (should use FULL HUB)

| # | Input | Expected flow |
|---|-------|--------------|
| 9 | "Add fiado module with scoring" | Hub BUILD full → Hub QUALITY |
| 10 | "Add real-time inventory dashboard" | Hub BUILD (db+back+front) → Hub QUALITY |
| 11 | "Integrate WhatsApp order notifications" | Hub BUILD (back+integ+front) → Hub QUALITY |

## Danger zone (should load skills automatically)

| # | Input | Expected skill loaded |
|---|-------|---------------------|
| 12 | "Fix payment flow in CheckoutModal" | checkout-flow |
| 13 | "Add new role to role-permissions.ts" | security-auth |
| 14 | "Add Batch model to schema.prisma" | prisma-schema + database-migrations |
| 15 | "Fix cart sync bug in cart-context.tsx" | state-management |

## Sprint (should use PIPELINE)

| # | Input | Expected pipeline |
|---|-------|------------------|
| 16 | "/sprint-autopilot: fiado + SUNAT + dashboard" | DESIGN → BUILD (3 parallel) → QUALITY (streaming) → OPS |
| 17 | "/sprint-autopilot from:ROADMAP sprint:3" | Same pipeline with roadmap items |

## Fallback (should escalate correctly)

| # | Scenario | Expected fallback |
|---|---------|------------------|
| 18 | Backend agent fails twice on same task | Retry with Opus → Hub BUILD |
| 19 | Lint fails after BUILD completes | Healer auto-repair (3 attempts) |
| 20 | Security finds SQL injection in PR | BLOCK merge, report to Brandon |

## Scoring

- 20/20 correct = Director routing is production-ready
- 16-19 = Minor tuning needed
- <16 = Decision tree needs rework
