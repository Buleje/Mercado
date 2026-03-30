---
applyTo: "**/auth/**,**/session*,**/require-admin*"
---

# Security & Auth — Buleje

## Sistema de autenticación

- **Mecanismo:** Cookies firmadas con HMAC-SHA256 (`AUTH_SECRET` mínimo 32 chars)
- **No JWT** — tokens de sesión personalizados
- **3 roles:** `admin`, `cajero`, `almacenero`
- **Multi-tenant:** `tenantId` en cada sesión — aislamiento de datos completo

## Archivos clave

```
lib/auth/role-permissions.ts  — Matriz RBAC completa (leer antes de cambiar permisos)
lib/require-admin.ts          — Middleware de auth para route handlers
lib/session.ts                — Firma/verificación de cookies HMAC-SHA256
```

## Patrón requireAdmin

```typescript
// En cualquier route handler:
const auth = await requireAdmin(req, ["admin", "cajero"]);
if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
// auth.userId, auth.role, auth.tenantId disponibles
```

## Matriz de roles (resumen)

| Recurso | admin | cajero | almacenero |
|---------|-------|--------|------------|
| orders | r/w/d | r/w | r |
| products | r/w/d | r | r/w |
| inventory | r/w/d | r | r/w/d |
| sales | r/w/d | r/w | ✗ |
| purchases | r/w/d | ✗ | r/w |
| suppliers | r/w/d | ✗ | r/w |
| settings | r/w/d | r | r |
| admin-users | r/w/d | ✗ | ✗ |
| cash-registers | r/w/d | r/w | ✗ |

## ALLOWED_ROLES — usar en lugar de strings hardcodeados

```typescript
import { ALLOWED_ROLES } from "@/lib/auth/role-permissions";

ALLOWED_ROLES.SALES              // ["admin", "cajero"]
ALLOWED_ROLES.INVENTORY_WRITE    // ["admin", "almacenero"]
ALLOWED_ROLES.SUPPLIERS          // ["admin", "almacenero"]
ALLOWED_ROLES.PURCHASES          // ["admin", "almacenero"]
ALLOWED_ROLES.ANALYTICS          // ["admin"]
ALLOWED_ROLES.ADMIN_USERS        // ["admin"]
ALLOWED_ROLES.SETTINGS_WRITE     // ["admin"]
ALLOWED_ROLES.INVENTORY_READ     // ["admin", "cajero", "almacenero"]
```

## API_RESOURCE_MAP — mapeo de rutas a recursos

```typescript
import { API_RESOURCE_MAP } from "@/lib/auth/role-permissions";
// "/api/orders" → "orders", "/api/products" → "products", etc.
```

## Variables de entorno de seguridad

```bash
AUTH_SECRET=<min 32 chars — usado para HMAC-SHA256>
```

## Aislamiento multi-tenant

- `tenantId` extraído de la sesión en `requireAdmin()`
- TODAS las queries de DB deben incluir `{ tenantId: auth.tenantId }`
- Nunca hacer queries sin tenantId — riesgo de data leak entre tenants

## Headers de seguridad (vercel.json)

```json
{ "source": "/api/(.*)", "headers": [
  { "key": "X-Content-Type-Options", "value": "nosniff" },
  { "key": "X-Frame-Options", "value": "DENY" }
]}
```

## OWASP Top 10 en este proyecto

- **Injection:** Zod valida todos los inputs — nunca SQL raw en route handlers
- **Broken Auth:** `requireAdmin` en TODO endpoint admin
- **Sensitive Data:** No loguear tokens, contraseñas, ni números de tarjeta
- **IDOR:** `tenantId` en queries previene acceso cross-tenant
- **Security Misconfiguration:** `AUTH_SECRET` en env var, no hardcodeado

## Proxy (middleware.ts renombrado a proxy.ts en Next.js 16)

```typescript
// proxy.ts — al mismo nivel que app/
// Verifica sesión ANTES de llegar al route handler
// Resuelve tenantId del hostname para multi-tenant routing
```

## Gotchas

- **`AUTH_SECRET` < 32 chars** → sesiones débiles o error de inicio
- **Olvidar `requireAdmin` en un endpoint** → endpoint público sin querer
- **Query sin `tenantId`** → posible leak cross-tenant (bug crítico de seguridad)
- **Cambiar role-permissions.ts** → puede bloquear acceso de cajeros o almaceneros a módulos enteros
- **Modificar proxy.ts sin test** → puede redirigir auth loop infinito
