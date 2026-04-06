# ADR-004: Dual Tenant Resolution (Server + Client)

## Status: Accepted (2025)

## Context
Multi-tenant routing needs to work for both server-side middleware (edge) and client-side navigation (React).

## Decision
Two independent resolution chains:
- Server: hostname subdomain → path /t/{slug}/ → referer → cookie → JWT → default "main"
- Client: sessionStorage → path → subdomain → localStorage → default "main"

The middleware ignores client-sent x-tenant-id headers and audits discrepancies.

## Consequences
- ✅ Works with subdomains, path-based routing, and mixed scenarios
- ✅ Per-tab tenant context via sessionStorage
- ✅ Security: server never trusts client tenant header
- ⚠️ Complex — 6 resolution steps on each side
- ⚠️ Cookie "active-tenant" can be stale across tabs
