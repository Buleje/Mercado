/**
 * El clic en una fila del detalle lleva a su ORIGEN: la corrida en el Libro,
 * el gasto en Movimientos, la persona en Recursos Humanos.
 *
 * Misma receta que `abrirFichaDelPermiso` (ficha-del-permiso-url.ts):
 *  - a OTRO módulo: `admin:navigate` (historial, recientes, limpia los
 *    parámetros del módulo que se deja) y DESPUÉS se escriben los parámetros
 *    propios con `replaceState` — antes, `navigateTab` los borraría;
 *  - al MISMO módulo (una fila de Gastos desde Resultado, ambos en Mi Plata):
 *    `navigateTab` al tab abierto REEMPLAZA la entrada y el «atrás» ya no
 *    volvería al resultado, así que va un `pushState` propio.
 * En los dos casos, un `popstate` al final: con el módulo montado nada se
 * remonta y `useVistaModulo` sólo relee la URL al montar o con el «atrás».
 */

import { PARAMS_DE_VISTA } from "@/hooks/use-vista-modulo";
import type { EnlaceOrigen } from "@/lib/finance/resultado-del-negocio";

export function irAlOrigen(enlace: EnlaceOrigen): void {
  if (typeof window === "undefined") return;
  const destino = (u: URL) => {
    u.searchParams.set("tab", enlace.tab);
    for (const [k, v] of Object.entries(enlace.params)) u.searchParams.set(k, v);
  };
  try {
    const actual = new URL(window.location.href);
    if (actual.searchParams.get("tab") === enlace.tab) {
      /* Mismo módulo: fuera los parámetros de la vista que se deja (una
         `?seccion=` de otra pantalla no debe viajar), adentro los del destino. */
      for (const p of PARAMS_DE_VISTA) actual.searchParams.delete(p);
      destino(actual);
      window.history.pushState(null, "", actual.toString());
    } else {
      window.dispatchEvent(
        new CustomEvent("admin:navigate", { detail: { tab: enlace.tab, vista: enlace.params.vista } }),
      );
      const despues = new URL(window.location.href);
      destino(despues);
      window.history.replaceState(null, "", despues.toString());
    }
  } catch {
    // Sin history (navegador raro, iframe restringido): el evento ya pidió el cambio de módulo.
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}
