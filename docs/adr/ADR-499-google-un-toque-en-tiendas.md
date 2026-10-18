# ADR-499 — Google «un toque» (One Tap / FedCM) y cuenta recordada en las tiendas

- **Estado:** aceptado (2026-10-17), pendiente de la revisión de `security` (toca la CSP de `lib/middleware-utils.ts`, zona de peligro).
- **Pedido por:** Brandon (17-10): «cuando entra un usuario (con cuenta de Google) quiero que aparezca para loguearse rápido: aparecerán sus cuentas y podrá elegir con qué cuenta loguearse, o si tiene una, aparece una para loguearse rápido, y esa información se guarda al entrar de nuevo».

## Decisión

1. **La identidad sigue siendo la sesión de Supabase** (la misma del botón «Continuar con Google», `useClienteTienda`, `/api/tienda-cliente/yo`). No se usa `/api/auth/google` ni se toca la cookie de cliente de la casa (puntos, descuentos, historial), que se abre sólo con el celular verificado. El pedido de invitado sigue sin firmar sesión.
2. **Globito** (`components/store/cliente/GoogleUnToque.tsx`, montado en `MenuCuenta`): GIS con `use_fedcm_for_prompt`, una vez por carga de página, sin sesión, fuera de carrito/checkout/seguimiento y fuera del iframe del editor. `auto_select` sólo si la cuenta entró antes y no tocó «Salir».
3. **Canje en el servidor** (`/api/tienda-cliente/google`): GET entrega `sha256(nonce)` y guarda el nonce crudo en una cookie httpOnly, SameSite=Strict, de 10 min y sólo para esa ruta; sólo si el negocio (`x-tenant-id`, sin caer a `main`) tiene `pedidosCliente.loginGoogle`. POST (CSRF + 10 intentos/10 min por IP en Redis) revisa el ID token en casa —RS256 con las claves públicas de Google, `iss`, `aud` = `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `exp`/`iat` ±60 s, `nonce`— y recién entonces llama a `signInWithIdToken` con el nonce crudo. El nonce se gasta en toda respuesta del POST.
4. **Cuenta recordada** (`lib/tienda-cliente/cuenta-recordada.ts`, `localStorage["tienda:cuenta-google"]`): nombre, correo enmascarado (`br•••@gmail.com`), foto https y la «pista» (el `sub` de Google, que Google acepta como `login_hint`). Nunca tokens ni el correo entero. «Continuar como …» entra con `login_hint`; «Usar otra cuenta» abre el selector; «Olvidar» y «No soy yo» la borran (Ley 29733); «Salir» la conserva sin entrada automática.
5. **CSP**: sólo fuera del panel (no /admin, /superadmin, /tv ni /t/<slug>/admin) se suman los orígenes que publica Google para GIS: `script-src https://accounts.google.com/gsi/client`, `frame-src` y `connect-src https://accounts.google.com/gsi/`, `style-src https://accounts.google.com/gsi/style`. La CSP de respaldo de `next.config.ts` no cambia (el proxy la pisa).

## Consecuencias

- Sin `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (hoy, en local) el globito no se baja y queda el botón de siempre; la cuenta recordada funciona igual con el botón.
- Desviación del pedido: además de nombre/correo/foto se guarda el `sub` de Google, porque `login_hint` necesita el correo entero o el `sub`; el `sub` no es secreto ni sirve para entrar.
- Configuración pendiente: orígenes de JavaScript autorizados en Google Cloud Console y el mismo client id en el proveedor Google de Supabase (o en sus «Authorized Client IDs»).

## Revisión de security (17-10, sin veto)

- El token exige `email_verified: true` (motivo `correo`); la foto sólo se acepta de `https://*.googleusercontent.com` (al verificar, al recordar y al leer lo guardado).
- El POST también respeta `pedidosCliente.loginGoogle` (404 `apagado`, gasta el nonce); sin `x-tenant-id` → 400.
- Límite del canje por IP + negocio (30 cada 10 min): el nonce no entra en la clave porque cambia en cada intento.
- Claves de Google: una sola bajada compartida y 30 s de pausa si Google no responde.
- Ley 29733: «Recordamos tu cuenta en este equipo · Olvidar» junto a «Continuar como…» y, al Salir, la casilla «Olvidar también esta cuenta en este equipo».
