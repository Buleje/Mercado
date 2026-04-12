# `lib/auth/` — Autenticación, autorización y RBAC

JWT propio (cookie `buleje-admin-sess`) + RBAC con 26 recursos × 6 roles.

## Por qué existe

- Centraliza la lógica de auth para que **ningún route handler** la duplique.
- Define la matriz RBAC en un único archivo (`role-permissions.ts`).
- Provee guards listos para usar (`requireAdmin`, `requireCustomer`).

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `role-permissions.ts` | Matriz RBAC: `26 recursos × 6 roles`. **Zona de peligro** — cambios mal hechos bloquean módulos enteros |
| `customer-session.ts` | Sesión de cliente B2C (storefront) |
| `oauth-google.ts` | OAuth con Google (en migración) |
| `require-customer.ts` | Guard de API para rutas de cliente |

> El guard `requireAdmin()` vive en el directorio padre: `lib/require-admin.ts`. Ver más abajo.

## Roles

| Rol | Resumen |
|---|---|
| `admin` | Acceso total al panel del tenant |
| `cajero` | POS, ventas, devoluciones, caja |
| `almacenero` | Inventario, lotes, mermas, recepciones |
| `proveedor` | Portal de proveedor (catálogo + órdenes recibidas) |
| `delivery` | App móvil de reparto, asignación de pedidos |
| `tienda_owner` | Marketplace seller (multi-tenant onboarding) |

## Patrón de uso (admin)

```typescript
import { requireAdmin } from "@/lib/require-admin";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  // auth.tenantId, auth.role, auth.username están disponibles
}
```

## Patrón de uso (customer storefront)

```typescript
import { requireCustomer } from "@/lib/auth/require-customer";

const session = await requireCustomer(req);
if (session instanceof NextResponse) return session;
```

## Convenciones críticas

- **Cambiar permisos** en `role-permissions.ts` requiere correr `npm run test` completo — un permiso mal puesto bloquea tabs en el admin.
- **JWT secret** (`AUTH_SECRET`) debe tener mín. 32 chars en producción (validado por `lib/env.ts`).
- **Cookies** siempre con `httpOnly`, `secure` en prod, `sameSite=lax`.
- **Refresh tokens** rotan en cada login — el viejo se invalida.

## Tests

`__tests__/lib/auth/role-permissions.test.ts` valida que cada rol tiene exactamente los permisos esperados. **Si fallas un test acá, NO mergear** — significa que rompiste el RBAC.
