/**
 * El orden de la barra lateral que la persona fijó a mano — UNA sola llave para
 * los dos lugares donde se cambia (Configuración › Orden de la barra lateral y
 * el lápiz de la barra). Hasta el 28-10 eran dos (`admin_category_order` y
 * `admin-sidebar-order`) y el de Configuración no movía la barra de escritorio:
 * el lápiz arrancaba con el orden de fábrica entero y lo tapaba.
 *
 * Vacío = no hay orden a mano: manda el de fábrica con el rubro arriba
 * (`lib/admin/orden-barra.ts`). Cada cambio avisa con `EVENTO_ORDEN_BARRA` para
 * que la barra, el menú del celular y Configuración se enteren sin recargar.
 */

export const LLAVE_ORDEN = "admin_category_order";
/** La llave vieja del lápiz de la barra: se lee si no hay la nueva y se borra al guardar. */
export const LLAVE_ORDEN_VIEJA = "admin-sidebar-order";
export const EVENTO_ORDEN_BARRA = "admin-orden-barra-cambio";

function leerLista(llave: string): string[] | null {
  try {
    const crudo = localStorage.getItem(llave);
    if (crudo === null) return null;
    const v: unknown = JSON.parse(crudo);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** El orden guardado a mano (crudo; si equivale al de fábrica lo decide `hayOrdenManual`). */
export function leerOrdenManual(): string[] {
  if (typeof window === "undefined") return [];
  return leerLista(LLAVE_ORDEN) ?? leerLista(LLAVE_ORDEN_VIEJA) ?? [];
}

function avisar(): void {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_ORDEN_BARRA));
  } catch {
    /* sin window (tests de servidor): nadie escucha */
  }
}

/** Guarda el orden fijado a mano. `[]` = volver al de fábrica. */
export function guardarOrdenManual(orden: readonly string[]): void {
  try {
    if (orden.length === 0) localStorage.removeItem(LLAVE_ORDEN);
    else localStorage.setItem(LLAVE_ORDEN, JSON.stringify(orden));
    localStorage.removeItem(LLAVE_ORDEN_VIEJA);
  } catch {
    /* modo privado: el orden dura lo que dura esta carga */
  }
  avisar();
}

/** «Volver al orden de fábrica»: borra el orden a mano. No toca ocultos ni favoritos. */
export function volverAlOrdenDeFabrica(): void {
  guardarOrdenManual([]);
}

/** Avisa cuando cambia el orden (en esta pestaña o en otra del mismo navegador). Devuelve la baja. */
export function oirOrdenManual(fn: () => void): () => void {
  const deOtraPestana = (e: StorageEvent) => {
    if (e.key === LLAVE_ORDEN || e.key === LLAVE_ORDEN_VIEJA) fn();
  };
  window.addEventListener(EVENTO_ORDEN_BARRA, fn);
  window.addEventListener("storage", deOtraPestana);
  return () => {
    window.removeEventListener(EVENTO_ORDEN_BARRA, fn);
    window.removeEventListener("storage", deOtraPestana);
  };
}
