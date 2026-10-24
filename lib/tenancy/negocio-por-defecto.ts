/**
 * Papeles del negocio `main` (ADR-457 §Excepciones).
 *
 * `main` cumple TRES papeles a la vez: el marketplace (la plataforma), el
 * negocio que ve `localhost` y la bodega de prueba. Antes cada sitio escribía
 * `=== "main"` y nadie sabía cuál de los tres quería decir. Acá cada papel
 * tiene su nombre; hoy los tres devuelven lo mismo, pero el día que se separen
 * se cambia UN lugar.
 *
 * Sin imports a propósito: lo usan el middleware (edge), componentes cliente y
 * rutas. Es un renombre, no un cambio de comportamiento.
 *
 * Esta es la ÚNICA carpeta donde puede aparecer el literal de un negocio
 * (guard: `__tests__/tenant-hardcoded-main-guard.test.ts`).
 */

/** Id/slug del negocio por defecto. Fuente única; `DEFAULT_TENANT_ID` la reexporta. */
export const NEGOCIO_POR_DEFECTO = "main";

type IdOSlug = string | null | undefined;

/** El marketplace / la plataforma (no una bodega con dueño propio). */
export function esMarketplace(tenant: IdOSlug): boolean {
  return tenant === NEGOCIO_POR_DEFECTO;
}

/** El negocio que se resuelve cuando no hay host ni sesión (localhost, legado, fila `Settings` id:1). */
export function esTenantPorDefecto(tenant: IdOSlug): boolean {
  return tenant === NEGOCIO_POR_DEFECTO;
}

/** El negocio que el superadmin NO puede borrar. */
export function esTenantProtegido(tenant: IdOSlug): boolean {
  return tenant === NEGOCIO_POR_DEFECTO;
}
