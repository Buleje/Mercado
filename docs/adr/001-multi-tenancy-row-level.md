# ADR-001: Multi-Tenancy via Row-Level tenant_id

## Status: Accepted (2024)

## Context
Buleje needs to serve multiple stores (bodegas) from a single deployment. Options: separate databases per tenant, schema-per-tenant, or row-level isolation with tenant_id.

## Decision
Row-level isolation with `tenantId` field on every model. All DB queries filter by tenantId as the first parameter.

## Consequences
- ✅ Simple deployment (single DB, single app)
- ✅ Easy to add new tenants (just insert a row)
- ✅ Shared infrastructure reduces costs
- ⚠️ Must enforce tenantId in EVERY query (enforced by DB classes in lib/db/)
- ⚠️ No database-level isolation (RLS not yet implemented in Prisma)
- ⚠️ Large tenants could affect shared performance
