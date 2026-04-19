/**
 * Politica de redirect post-login para el marketplace (Ola 7 — A3).
 *
 * Pure function (sin dependencias de React) — testeable en Vitest sin mocks.
 *
 * Prioridad:
 *   1. ?from=<ruta-interna>   -> push a esa ruta (usuario fue bounced a login)
 *   2. isNew=true             -> push a /marketplace/explorar (onboarding)
 *   3. pathname en landing    -> push a /marketplace/explorar
 *   4. cualquier otra ruta    -> refresh (ya esta dentro del marketplace)
 *
 * Safety:
 *   - Solo acepta `from` que empieza con "/" y NO con "//" (evita open-redirect).
 *   - Rechaza URLs absolutas (https://evil.com, //evil.com).
 */

/**
 * Rutas de landing publica — si el user esta aqui al hacer login,
 * redirigimos al marketplace. Mantener en sync con Navbar publico.
 */
export const LANDING_PATHS: ReadonlySet<string> = new Set<string>([
  "/",
  "/about",
  "/nosotros",
  "/vender",
  "/precios",
  "/planes",
  "/como-funciona",
  "/faq",
  "/ayuda",
  "/negocios",
  "/socio-buleje",
  "/guias",
  "/descubri",
  "/terminos",
  "/privacidad",
]);

export const DEFAULT_REDIRECT_AFTER_LOGIN = "/marketplace/explorar";

export type PostLoginDecision =
  | { action: "push"; url: string }
  | { action: "refresh" };

export interface ResolvePostLoginRedirectOpts {
  pathname: string;
  fromParam: string | null;
  redirectAfterLogin?: string;
  isNew?: boolean;
}

/**
 * Decide a donde ir tras un login exitoso. Ver JSDoc del modulo.
 */
export function resolvePostLoginRedirect(
  opts: ResolvePostLoginRedirectOpts,
): PostLoginDecision {
  const { pathname, fromParam, redirectAfterLogin, isNew } = opts;

  // 1. Respetar ?from= si es una ruta interna segura.
  if (fromParam && fromParam.startsWith("/") && !fromParam.startsWith("//")) {
    return { action: "push", url: fromParam };
  }

  // 2. Registro nuevo -> siempre a explorar (o al override manual).
  if (isNew) {
    return {
      action: "push",
      url: redirectAfterLogin ?? DEFAULT_REDIRECT_AFTER_LOGIN,
    };
  }

  // 3. Si estamos en landing -> redirigir a explorar (o al override manual).
  if (LANDING_PATHS.has(pathname)) {
    return {
      action: "push",
      url: redirectAfterLogin ?? DEFAULT_REDIRECT_AFTER_LOGIN,
    };
  }

  // 4. Ya dentro del marketplace/cuenta/tienda -> solo refresh.
  return { action: "refresh" };
}
