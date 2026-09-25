# ADR-304 — Dispositivos de confianza (saltar 2FA por 30 días)

**Estado:** Aceptado · 2026-07-19
**Contexto de negocio:** Brandon pidió "recordar dispositivo" para no ingresar el
código 2FA cada vez en su propia PC.

## Contexto

Con 2FA (TOTP) activo (`AdminUser.totpEnabledAt`), cada login exige el código de
la app autenticadora. Para un dueño que entra 10 veces al día desde su misma
máquina, es fricción. El keep-alive (`[[session-keepalive]]`) reduce re-logins
pero no evita el 2FA cuando la sesión sí caduca. Falta un "confiar en este
dispositivo" — pero un bypass de 2FA mal hecho es un agujero de seguridad.

## Decisión

Un dispositivo marcado como de confianza **salta el segundo factor (TOTP)**, no
la contraseña. Modelo:

1. **Emisión** — en `/api/auth/totp/verify` (flujo post-login), si el usuario
   marcó "confiar" y el TOTP fue válido: se genera un secreto aleatorio de 256
   bits, se guarda su **SHA-256** en `PlatformSetting` (`trusted-devices:{tenantId}:{username}`),
   y se setea una cookie httpOnly `buleje-trusted-device = {id}.{secret}` (30 d,
   `secure` en prod, `sameSite=strict`). El secreto en claro vive **solo** en la
   cookie.
2. **Verificación** — en `/api/auth/login`, tras verificar la contraseña, si el
   usuario tiene 2FA y presenta una cookie trusted válida (id existe, no expiró,
   `sha256(secret)` matchea vía `timingSafeEqual`) → se salta el 2FA y se emite
   la sesión completa. Si no → flujo normal `requires2FA`.
3. **Revocación** — `PlatformSetting` permite listar y borrar: la card
   "Dispositivos y accesos" muestra los de confianza con "Revocar"/"Revocar
   todos". **Cambiar la contraseña revoca TODOS** (defensa: clave comprometida
   ⇒ el atacante pierde el skip de 2FA). Expiración dura 30 d + cap de 10.

### Propiedades de seguridad

- La contraseña **siempre** se pide y verifica antes de mirar la confianza →
  cookie robada ≠ bypass total (falta la clave).
- Secreto 256-bit, solo hash en DB, comparación en tiempo constante.
- Cookie httpOnly + secure + sameSite=strict + TTL 30 d.
- Namespaced por `tenantId:username` → una cookie jamás cruza de cuenta.
- Revocable en cualquier momento; el cambio de clave hace revoke-all.

## Consecuencias

- **+** UX: el dueño entra con solo usuario+contraseña en su equipo; el 2FA
  protege equipos nuevos/desconocidos.
- **−** Riesgo residual: en un equipo confiable + con la contraseña, no hay 2FA.
  Mitigado por revocación, expiración y el revoke-all al cambiar clave.
- Sin migración de schema (usa `PlatformSetting` KV). En prod depende de que el
  KV esté respaldado (Redis/DB) para persistir entre instancias.

## Alternativas consideradas

- **JWT stateless (sin storage):** más simple, pero **irrevocable** antes de
  expirar → rechazado (no se puede cortar un equipo robado por 30 d).
- **Columnas en `AdminLoginDevice`:** revocable y listable, pero requiere
  migración (fricción pooler/DIRECT_URL). `PlatformSetting` da lo mismo sin
  migración.
- **OTP WhatsApp en vez de skip:** ofrecido como opción; es otra feature, no
  reemplaza el "recordar dispositivo".

## Referencias

- `lib/db/trusted-devices.db.ts` · `app/api/auth/totp/verify/route.ts` ·
  `app/api/auth/login/route.ts` · `app/api/auth/change-password/route.ts` ·
  `app/api/admin/security/trusted-devices/route.ts` · `app/admin/login/2fa/page.tsx` ·
  `components/admin/security/LoginDevicesCard.tsx`
- Relacionado: `[[login-security-sweep-2026-07-03]]` (#3b quedaba pendiente).
