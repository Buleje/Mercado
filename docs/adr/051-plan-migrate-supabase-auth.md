# ADR-051 — Plan: migrar JWT cookie custom → Supabase Auth

**Fecha:** 2026-04-10
**Estado:** 📋 PLANNED (no ejecutado — esfuerzo estimado L)
**Bloque:** Seguridad y Compliance · #02 del backlog 2026-04-10

## Contexto
Hoy hay 2 sistemas de auth caseros:
1. **Admin tenant**: `lib/auth/*` + cookie `admin-session` + bcryptjs
2. **Superadmin platform**: `lib/superadmin-session.ts` + cookie `platform-session` + `ADMIN_PASSWORD` env

Riesgos del custom:
- 546 route handlers leen cookies manualmente. Un olvido = bypass.
- Reset de password = flujo propio con email + tokens temporales (reinventado).
- Sin audit de sesiones activas, sin revocación remota, sin device management.
- TOTP (ADR-048) requiere plomería extra en el flujo de login.

## Decisión tentativa
Migrar a **Supabase Auth** (no Lucia — Lucia es bibliotecario, Supabase es managed):
- `@supabase/ssr` en proxy.ts + route handlers
- JWT emitido por Supabase, verificado con `createServerClient`
- TOTP nativo de Supabase Auth (MFA Factors API)
- Email + password + OAuth (Google/GitHub) out of the box
- Row Level Security (ADR-052) se alinea naturalmente con `auth.uid()`

## Plan de ejecución (estimado 5 sprints · ~40h)

### Sprint 1 — Auditoría (8h)
- [ ] Listar todos los callers de `requireAdmin`, `getPlatformSession`, `lib/auth/*`
- [ ] Mapear cookies actuales → claims Supabase
- [ ] Decidir mapping rol: `AdminUser.role` ↔ `auth.users.raw_user_meta_data.role`
- [ ] Plan de migración de passwords (bcryptjs → Supabase `bcrypt` compatible? o force reset)

### Sprint 2 — Capa de abstracción (8h)
- [ ] Crear `lib/auth/adapter.ts` con interfaz única: `getCurrentUser`, `requireRole`, `signIn`, `signOut`
- [ ] Implementar dos backends: `legacy-adapter.ts` (actual) + `supabase-adapter.ts` (nuevo)
- [ ] Feature flag `USE_SUPABASE_AUTH` en `lib/env.ts`

### Sprint 3 — Piloto en superadmin (8h)
- [ ] Migrar SOLO `/superadmin/*` (14 rutas) primero — menor blast radius
- [ ] Crear `SuperadminUser` en Supabase Auth con TOTP obligatorio
- [ ] Validar con DR drill

### Sprint 4 — Rollout admin tenant (12h)
- [ ] Migrar `/admin/*` + `/api/admin/*` con feature flag por tenant
- [ ] Backfill passwords: forzar reset en primer login con email OTP
- [ ] Monitorear Sentry por 1 semana

### Sprint 5 — Deprecación (4h)
- [ ] Borrar `lib/auth/*` legacy y `lib/superadmin-session.ts`
- [ ] Actualizar 546 route handlers al adapter final
- [ ] ADR-CLOSED

## Riesgos
| Riesgo | Mitigación |
|---|---|
| Usuarios no pueden loguear durante migración | Feature flag por tenant + rollback <5min |
| Supabase Auth rate limits | Plan Pro necesario (>50 auths/hora) |
| Passwords bcryptjs ≠ Supabase bcrypt | Migrar on first login (mismo algoritmo) |
| TOTP re-enrollment | Forzar en primer login post-migración |

## Bloqueadores
- Decisión de Brandon: ¿migramos o nos quedamos con custom + TOTP ADR-048?
- Costo: Supabase Auth free tier = 50K MAU, Pro = $25/mes. Hoy estamos bien.

## Alternativas
- **Lucia Auth** — biblioteca, no servicio. Menos managed pero más control. Descartado por esfuerzo similar sin beneficios.
- **Clerk / Auth0** — vendor lock-in. Caro a escala. Descartado.
- **Quedarse con custom + TOTP** — baja el riesgo pero no resuelve los otros vectores. Es la opción "barata" si no hay bandwidth.

## Referencias
- `lib/auth/*` (a deprecar)
- `lib/superadmin-session.ts` (a deprecar)
- Supabase Auth docs · `@supabase/ssr`
- ADR-048 TOTP 2FA
