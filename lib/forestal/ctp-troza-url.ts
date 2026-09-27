/**
 * ctp-troza-url — las direcciones de la ficha de una troza, sin nada de cliente.
 *
 * Vive aparte de `ctp-troza-etiquetas.ts` (que es `"use client"` porque abre la
 * ventana de impresión) para que la ruta corta `/admin/q/[id]` —desde el
 * 2026-09-26 la tarjeta de la troza, una página que valida el id en el
 * servidor— pueda usarlas sin importar código de navegador.
 *
 * Por qué una ruta corta: el QR de la etiqueta codificaba
 * `/admin?tab=ctp-libro-operaciones&vista=trozas&troza=<id>` (93 caracteres →
 * QR de 41×41 módulos de 0,35 mm en 15 mm). `/admin/q/<id>` baja a 33×33: los
 * módulos crecen y el celular lo lee de más lejos y con la etiqueta sucia.
 */

/** El parámetro de la URL que abre la ficha de una troza (lo lee `CtpTrozasView`). */
export const PARAM_TROZA = "troza";

/**
 * El id de la pestaña del Libro CTP. Es el mismo valor que `CTP_MODULE_TAB_ID`
 * (`components/admin/forestal/ctp-shared.tsx`); no se importa de ahí porque ese
 * módulo arrastra componentes de cliente. Un test los compara.
 */
export const TAB_LIBRO_CTP = "ctp-libro-operaciones";

/** El prefijo de la ruta corta que abre una troza escaneando su etiqueta. */
export const RUTA_CORTA_TROZA = "/admin/q";

/**
 * ¿Parece un id de troza? (cuid: letras y números, 20-40). Lo que no pasa se
 * manda al panel sin más: la ruta corta no es un buscador.
 */
export function esIdDeTroza(id: string | null | undefined): id is string {
  return typeof id === "string" && /^[a-z0-9]{20,40}$/i.test(id);
}

/** La ruta (sin origen) de la ficha de ESA troza dentro del panel. */
export function rutaFichaDeTroza(trozaId: string): string {
  const sp = new URLSearchParams({ tab: TAB_LIBRO_CTP, vista: "trozas", [PARAM_TROZA]: trozaId });
  return `/admin?${sp.toString()}`;
}

/** La URL corta que va en el QR: `https://<tenant>/admin/q/<id>`. */
export function urlCortaDeTroza(origin: string, trozaId: string): string {
  return new URL(`${RUTA_CORTA_TROZA}/${encodeURIComponent(trozaId)}`, origin).toString();
}
