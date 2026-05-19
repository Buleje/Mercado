# Audit Auth + Session + RBAC + Multi-Tenant — 2026-05-17

**Alcance:** `lib/session.ts`, `lib/auth/**` (14 archivos), `lib/require-admin.ts`, `lib/middleware/**`, `proxy.ts`, `app/api/auth/**` (15 endpoints), `app/api/superadmin/**`, schema (Tenant, AdminUser, SuperadminUser, Customer).

**Riesgo:** Medio-Alto · 1 P0 + 4 P1 + 3 P2 · Mucho hardening 2026-05 hecho (jti, lockout, replay TOTP, timing-safe, UA binding) pero quedan agujeros estructurales.

## Hallazgos

| # | Sev | OWASP | Archivo:Línea | Hallazgo | Fix |
|---|---|---|---|---|---|
| 1 | **P0** | A02/A07 | `lib/session.ts:90-115`, `customer-session.ts:34-42` | Sin rotación de `AUTH_SECRET` — estático para siempre. Si filtra, TODOS los JWT (admin+customer+platform+pending-totp) son falsificables. No hay `kid` ni multi-secret. | `AUTH_SECRET_CURRENT` + `AUTH_SECRET_PREVIOUS`, firmar con current, verificar con ambos. Rotar trimestralmente. |
| 2 | **P1** | A07 | `lib/session.ts:70-80` | `AdminRole` incluye `"superadmin"`. management-tier bypass lo trata como dios. Atacante que forje role:"superadmin" en JWT admin → bypass total. Sin defensa en profundidad. | Rechazar `role === "superadmin"` en `require-admin`. Superadmins usan PLATFORM_SESSION, no SESSION. Eliminar de AdminRole enum. |
| 3 | **P1** | A01 | `lib/auth/role-permissions.ts:58-263` | RBAC tiene gaps: `owner`/`manager`/`analista` SIN entrada en PERMISSIONS. checkPermission → false. PERO require-admin los pasa por managementTier → acceso TOTAL sin declarar. Inconsistencia. | Declarar permisos explícitos. Eliminar managementTier bypass o limitarlo solo a `superadmin` real. |
| 4 | **P1** | A04 | `app/api/auth/login/route.ts:130-160` | Cuando `tenantId === resolvedSlug` (no resolvió tenant DB), login hace `findMany` SOLO por username. Dos tenants con `qaadmin` + misma password → atacante entra al primer match. | Si `resolvedSlug` no resuelve a tenant DB → 400, NO seguir buscando global. |
| 5 | **P1** | A03/A09 | `lib/db/admin-totp.db.ts:46-110` | `$queryRawUnsafe` con params posicionales (OK contra SQLi). TOTP secrets en **texto plano** en DB. | Regenerar prisma generate + cifrar `totpSecret` con AUTH_SECRET o KMS (AES-GCM). |
| 6 | **P2** | A02/A04 | `lib/auth/customer-session.ts:14-20` | Customer session 365 días con sliding rotation + phone como id. Sin jti ni revocación. Cookie filtrada = 1 año de acceso. | Bajar MAX a 30-90d, jti + blacklist cacheStore, validar customerId contra DB en endpoints sensibles. |
| 7 | **P2** | A05 | `lib/middleware/tenant.ts:96-102` | Source 0 `/t/[slug]/` se acepta SIN validar que slug exista en DB. tenantId queda con string arbitrario. Algunos DB classes pueden no detectar. | Validar slug contra cache antes de aceptarlo (mismo patrón que resolveTenantSlugToId). |
| 8 | **P2** | A09 | `app/api/superadmin/impersonate/route.ts:75-99` | Impersonation usa `username = impersonated-by:<sa>` (prefijo frágil). Audit fire-and-forget sin `await`. | Flag `isImpersonating: true` en SessionPayload. `await logSuperadminAction` ANTES de emitir token (Ley 29733 Art. 16). |

## Lo que SÍ está blindado

| Control | Detalle |
|---|---|
| Access 15min + Refresh 7d | Con rotación + jti blacklist |
| Superadmin session | 8h hard cap + 30min idle + UA binding + force-logout global via iat |
| bcrypt rounds 12 | login + change-password |
| Timing-safe login | Padding a 50 hashes + DUMMY_HASH para usuarios inexistentes |
| TOTP replay protection | Window + last-used-step |
| /api/auth/bypass | Bloqueado en prod con doble guard |
| Header x-tenant-id | Cliente nunca confiado |

## Top 3 prioridades

1. **Implementar rotación AUTH_SECRET** (multi-secret list) — sin esto, leak del .env compromete TODA la plataforma indefinidamente.
2. **Eliminar `"superadmin"` del enum AdminRole** — JWT admin nunca debe llevar ese rol.
3. **Cerrar matriz RBAC** explícitamente para owner/manager/analista + remover management-tier bypass.
