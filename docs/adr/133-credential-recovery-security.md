# ADR-133 — Recuperación de credenciales + refuerzo de seguridad del admin

> **Fecha:** 2026-06-14 · **Estado:** aceptado · **Zona de peligro:** auth + schema

## Contexto

Cuando un negocio pierde sus credenciales, el superadmin necesita "devolverle el
acceso". Conceptualmente importante: **las contraseñas están hasheadas (bcrypt) —
nadie puede leerlas**, ni el superadmin. No se "recuperan", se **resetean**. El
endpoint `reset-password` existente era un **stub** (no generaba nada, devolvía un
"note"). Además faltaban candados al estilo de las grandes plataformas.

## Decisión

1. **Reset real** (`/api/superadmin/tenants/[slug]/reset-password`): genera una
   contraseña temporal FUERTE (12+ chars, sin ambiguos, cumple policy), la hashea
   con bcrypt, la setea al admin principal del tenant (owner > admin > primero),
   marca `mustChangePassword=true` y la devuelve **una sola vez** al superadmin.
   TOTP step-up + CSRF + rate-limit + audit log obligatorios.
2. **Forzar cambio** (`AdminUser.mustChangePassword`): el login devuelve el flag;
   el panel redirige a `/admin/cambiar-clave` (pantalla dedicada) hasta que el
   usuario setea su propia clave. La temporal es de **un solo uso**.
3. **Entrega segura**: en el modal del tenant, botón "Enviar al dueño por
   WhatsApp" (al `ownerPhone` registrado) con usuario + temporal + instrucción.
   En vez de pegar la clave en un chat cualquiera, va al canal verificado.
4. **Policy de claves** (`newPasswordSchema`): mín 10 + letra + número/símbolo +
   blocklist de comunes (123456, password, buleje, etc.).
5. **Panel de seguridad por tenant** (`/api/superadmin/tenants/[slug]/security` +
   tab "Seguridad" en el modal): estado de 2FA, último ingreso (IP), y acciones
   TOTP-gated "Forzar cambio de contraseña" y "Resetear 2FA" (re-enrolar).

`mustChangePassword` se lee/escribe vía raw SQL en los endpoints (campo nuevo,
evita depender de regenerar el cliente Prisma en runtime).

## Lo que YA existía (no se tocó)
bcrypt · lockout por usuario + rate-limit en login · 2FA/TOTP para admins
(login → `/login/2fa`) · CSRF + cookies HttpOnly + revocación de sesión por jti ·
superadmin con 2FA opcional, honeypot, timing-safe compare, audit log.

## Consecuencias
- (+) Recuperación de acceso real, segura y auditable; clave temporal de un solo uso.
- (+) Refuerzos tipo Google sin guardar contraseñas en claro (imposible "verlas").
- (+) Cambio forzado cubre AMBOS flujos: login directo y 2FA (`totp/verify`
  devuelve `mustChangePassword` y `/admin/login/2fa` redirige a `/admin/cambiar-clave`).
- (+) "Cerrar todas las sesiones" (`logout-all`) sin token-epoch ni cambio de
  minteo: el `jti` ya codifica su hora de emisión, así que un "corte" por admin en
  `cacheStore` (mismo alcance que la blacklist de jti de logout) revoca todo token
  —access y refresh— emitido antes del corte. Chequeado en `require-admin` y
  `/api/auth/refresh`. Fail-open: sin corte o sin timestamp en el jti, no bloquea.
- Migración: `ALTER TABLE "AdminUser" ADD "mustChangePassword" BOOLEAN DEFAULT false`
  aplicada vía Supabase. RLS-off consistente con el aislamiento app-level.

## Follow-ups implementados (2026-06-14)
1. **2FA force-change** — `app/api/auth/totp/verify/route.ts` + `app/admin/login/2fa/page.tsx`.
2. **logout-all** — `lib/auth/session-revocation.ts` (helper) cableado en
   `lib/require-admin.ts`, `app/api/auth/refresh/route.ts`, y acción TOTP-gated en
   `security/route.ts` + botón "Cerrar todas las sesiones" en el tab Seguridad.
   Tests: `__tests__/session-revocation.test.ts` (6/6). Limitación: best-effort por
   instancia (cacheStore) — misma que la revocación de jti ya existente.

## Referencias
- `reset-password/route.ts`, `security/route.ts`, `auth/change-password`, `auth/login`
- `lib/auth/password-schema.ts`, `app/admin/cambiar-clave/page.tsx`
- ADR-043 (2FA TOTP), ADR-132 (Messenger), Ley 29733 PE (audit Art. 16/18)
