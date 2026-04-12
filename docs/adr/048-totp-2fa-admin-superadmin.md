# ADR-048 — TOTP 2FA para AdminUser y SuperadminUser

**Fecha:** 2026-04-10
**Estado:** ✅ APPLIED (schema) · ⏳ PENDING (UI enrollment + verify endpoint)
**Bloque:** Seguridad y Compliance · #01 del backlog 2026-04-10

## Contexto
La autenticación hoy usa solo `passwordHash` (bcryptjs) + cookie JWT. Un leak de password = takeover inmediato de cualquier cuenta admin o superadmin. `proposed-admin-totp.sql` y `proposed-superadmin-totp.sql` llevaban meses sin aplicar. Regla crítica #14 de CLAUDE.md requiere 2FA pre-merge, pero no había soporte en el schema.

## Decisión
1. Agregar `totpSecret` (Base32, RFC 6238) + `totpEnabledAt` al modelo `AdminUser` existente.
2. Crear un nuevo modelo **`SuperadminUser`** para persistir los usuarios de plataforma (antes solo vivían en ENV `ADMIN_PASSWORD` hardcoded).
3. Mantener TOTP opcional por ahora (`totpSecret` nullable) — flag `REQUIRE_2FA_ADMIN` en `lib/env.ts` lo hará obligatorio cuando Brandon confirme.

## Consecuencias
- ✅ Schema listo para enrollment con `otpauth` / `speakeasy`
- ✅ Índice parcial `@@index([totpEnabledAt])` para consultas "¿quién NO tiene 2FA?"
- ⚠️ Migración requiere `npx prisma migrate dev --name add_totp_2fa` (requiere DIRECT_URL)
- ⚠️ Endpoint `/api/auth/totp/enroll` + `/api/auth/totp/verify` pendientes
- ⚠️ UI: `AdminSettings2FA.tsx` + `SuperAdmin2FASetup.tsx` pendientes

## Alternativas consideradas
- **WebAuthn / passkeys** — más moderno pero no está disponible en el entorno de la bodega (iPhone viejos, Android gama baja en Pucallpa). TOTP funciona con Google Authenticator universal.
- **SMS OTP** — caro y susceptible a SIM swap. Descartado.

## Comando para aplicar
```bash
cd bodega-san-martin
npx prisma format
npx prisma migrate dev --name add_totp_2fa_admin_superadmin
```

## Referencias
- `prisma/schema.prisma` AdminUser + SuperadminUser (modificado esta sesión)
- `prisma/migrations/proposed-admin-totp.sql` (obsoleto tras este ADR)
- `prisma/migrations/proposed-superadmin-totp.sql` (obsoleto tras este ADR)
- RFC 6238 TOTP
