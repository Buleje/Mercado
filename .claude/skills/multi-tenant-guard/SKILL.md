---
name: multi-tenant-guard
description: "Checklist de aislamiento por tenant (en la app, sin RLS): tenantId como 1.er parámetro, auth.tenantId del JWT, doble filtro en update/delete. Usar cuando vayas a crear o revisar un endpoint, una DB class o una query, o a buscar una fuga entre tenants."
user-invocable: true
model: sonnet
allowed-tools: Read, Grep, Glob
argument-hint: "[check|audit|new-endpoint|new-db-class]"
---

# Multi-tenant guard

Aislamiento en la app: `proxy.ts` resuelve el tenant, `requireAdmin()` lo saca del JWT y `lib/db/*.db.ts` filtra por `tenantId`; la extensión de `lib/tenant.ts` (`TENANT_MODELS`) lo inyecta como red de seguridad.

- [ ] `tenantId` = 1.er parámetro de toda función DB, sin default ni `"main"`.
- [ ] Ruta: `auth.tenantId` del JWT con `requireAdmin(req, roles)` (roles en `lib/auth/roles-rutas-panel.ts`); nunca el header ni el slug.
- [ ] Lecturas con `where: { tenantId }`; creates con `data: { tenantId, ... }`.
- [ ] update/delete con doble filtro: `where: { id, tenantId }`.
- [ ] Items que se leen por su padre (`OrderItem`, `SaleItem`): fuera de `TENANT_MODELS` a propósito; se consultan siempre vía el padre.
- [ ] Públicas sin auth: `getTenantIdFromRequest(req)`.
- [ ] `logActivity()` con tenantId; nunca `prisma.*` directo, solo la DB class.
