# ADR-120 — Login unificado (la credencial decide la tienda)

**Estado:** Aceptado · **Fecha:** 2026-05-25 · **Autor:** Buleje + Claude

## Contexto

El login (`app/api/auth/login/route.ts`) resolvía la tienda **primero** por el
subdominio/`x-tenant-id` y luego buscaba el usuario *scopeado* a esa tienda
(fail-closed, ADR/audit 05-P1-4). Consecuencias para el operador multi-tienda:

- Desde `localhost:3000/admin/login` (sin subdominio) o con una cookie
  `active-tenant` vieja, el login resolvía la tienda equivocada → **400
  `tenant_invalid`** o credenciales rechazadas, aunque fueran correctas.
- El usuario tenía que recordar y entrar por el subdominio exacto de su tienda.

Brandon pidió: **un solo login** donde tipeás usuario+contraseña y caés en el
admin de TU tienda, sin importar el subdominio.

## Decisión

Invertir la resolución: **la credencial decide la tienda**.

1. **Lookup global** por `username` (sin scope) + verificación bcrypt
   timing-constant (padding a 50, sin cambios).
2. Se recolectan **todas** las coincidencias reales (credencial completa válida):
   - **0** → 401 `incorrect credentials`.
   - **1** → entra a esa tienda (sesión + cookies + `tenantSlug` para redirect).
   - **>1** → `{ requiresTenantChoice: true, options: [{slug,name}] }` (200,
     **sin sesión**). El front muestra un selector y reenvía con `tenantSlug`.
3. **Modo scoped**: si el body trae `tenantSlug` (elección del picker), se scopea
   el lookup a esa tienda. Si el slug no existe → 400 `tenant_invalid`.

### Seguridad — mitigación del riesgo de 05-P1-4

El audit 05-P1-4 evitaba que "primer match gana" metiera al usuario en la tienda
equivocada cuando un `username+password` existía en N tiendas. Esta ADR conserva
ese principio: **nunca se auto-entra en caso ambiguo** — si la credencial matchea
varias tiendas, se exige elección explícita. La lista de opciones solo incluye
tiendas donde la **contraseña** matcheó (no revela mera existencia de username).
La sesión real se emite por el path scoped (re-verifica en la tienda elegida).

## Consecuencias

**+** Un único login para todos los tenants; resuelve los 400 por cookie stale /
subdominio incorrecto. **+** Picker claro en duplicados.
**−** Reintroduce el lookup cross-tenant por username (mitigado: nunca
auto-entra; emite sesión solo con 1 match o tras elección). **−** El subdominio
deja de *forzar* la tienda (la credencial manda) — comportamiento intencional.

## Alternativas

- **Mantener scope por subdominio:** descartado — es justo lo que Brandon quiere
  evitar (un login por tienda).
- **Auto-entrar a la más reciente en duplicados:** descartado por seguridad
  (revive el riesgo de 05-P1-4 sin aviso).
- **Rechazar usernames duplicados:** descartado — `qaadmin`/`luis` ya existen en
  2 tenants; romper su login no es opción.

## Verificación

- 5 casos curl (único→entra, duplicado→picker, scoped→entra, mala→401,
  slug inválido→400) + flujo browser completo (qaadmin → picker → mi-pollo).
- Tests: `__tests__/api-auth-login.test.ts` (25, incluye 5 de esta ADR:
  single-match, multi→picker sin cookie, scoped, slug inválido, password mala).

## Referencias
- `app/api/auth/login/route.ts`, `app/admin/login/page.tsx`
- ADR/audit 05-P1-4 (scope fail-closed — parcialmente revertido aquí con mitigación)
