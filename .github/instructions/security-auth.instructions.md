---
applyTo: "proxy.ts, lib/middleware/**, lib/auth/**, lib/auth/role-permissions.ts"
---

# security-auth — instrucciones para auth, CSP y tenant isolation

Capa de seguridad. Un bug aquí = bypass de permisos, XSS, cross-tenant leak.

## Archivos cubiertos

| Path | Por qué |
|---|---|
| `proxy.ts` | Middleware central (auth + CSP + tenant + rate limit, 398 líneas) |
| `lib/middleware/**` | Módulos del proxy split (ADR-014) |
| `lib/auth/role-permissions.ts` | RBAC: 26 recursos × 6 roles |
| `lib/auth/customer-session.ts` | Sesión de cliente (cookie buleje-customer-sess) |
| `lib/auth/require-customer.ts` | Gate de auth en routes |

## Invariantes

1. **tenantId NUNCA del body**: solo de session, cookie o header injectado por proxy. Cliente no puede elegir su tenantId — fuente de bug multi-tenant.

2. **`requireAdmin(req, roles[])` en toda route protegida**. El array de roles permite menos privilegio que admin. Si omites → route abierta a cualquier admin autenticado.

3. **CSP con nonce rotativo por request**. Generar en `generateNonce()` y passar via `x-nonce` header. Scripts inline REQUIEREN `nonce={headers().get("x-nonce")}`.

4. **Bearer API keys `sk_` bypass cookies** pero NO bypass rate-limit ni CSRF. Placed AFTER them en el pipeline.

5. **CSRF double-submit**: cookie `csrf-token` + header `X-CSRF-Token` deben coincidir. Solo en mutations (POST/PATCH/PUT/DELETE). API keys + webhooks + cron + health: skip.

6. **Cross-tenant header audit**: si cliente manda `x-tenant-id` != tenant del session/host, log como posible ataque (fire-and-forget).

## Roles y recursos

Ver `lib/auth/role-permissions.ts`. Matriz:
- **admin** → todos los recursos
- **almacenero** → productos, batches, suppliers, inventory
- **vendedor** → orders, customers, chat
- **repartidor** → deliveries, own-profile
- **reviewer** → readonly en reports
- **developer** → API keys, webhooks, observability

Cambiar permisos rompe módulos enteros. Siempre test de integración.

## Cambios que requieren security-squad + ADR

- Nuevo rol.
- Nuevo recurso (agregar al matrix).
- Cambio en CSP (permitir source nuevo).
- Remover rate-limit de algún path.
- Cambiar formato de cookies de sesión.

## Tests obligatorios

- Cross-tenant: user de tenant A NO puede leer datos de tenant B (mismo endpoint).
- CSP: inline script sin nonce → bloqueado en CSP report-only primero.
- Rate limit: 101 requests en 60s → 429.
- CSRF: POST sin header → 403.
- API key: `sk_invalid` → 401.

## Handshake

- [ ] ¿Toca isolation de tenant? (si sí → cross-tenant test)
- [ ] ¿Toca CSP? (si sí → prod staging con report-only primero)
- [ ] ¿Cambio de rol/recurso? (si sí → ADR + full matrix test)
- [ ] ¿Toca rate-limit? (si sí → medición de baseline antes/después)
