"use client";

/**
 * LothMapaRegistrarTala — el botón «Registrar tala» de un árbol del censo, con
 * su guarda: un semillero, un talado o un descartado no lo ofrecen (dicen por
 * qué), y bajo el DMC lo ofrece avisando que el libro pedirá la justificación.
 *
 * Es un BOTÓN y no un enlace: con `<a href>`, la barra de navegación global
 * (`NavProgress`) atrapa el clic en captura —antes de que el `preventDefault`
 * llegue— y, como la ruta no cambia (sólo la búsqueda), dejaba el panel tapado
 * con «Un toque… ya viene» (medido 28-09 en el navegador).
 */

import { Axe, Info } from "@buleje/design-system/icons";
import { talaDesdeElMapa } from "@/lib/forestal/loth-mapa-arboles";
import { irARegistrarTala } from "./loth-mapa-tala-url";
import type { CensoTree } from "./loth-mapa-shared";

/** El CTA oscuro del mapa (mismo que «Guardar» de la barra de dibujo), con 44 px para el dedo. */
export const BTN_MAPA_PRIMARIO =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--data-info-500)] dark:ring-1 dark:ring-[var(--rule-strong)] disabled:opacity-40";

export default function LothMapaRegistrarTala({ arbol, className = "" }: { arbol: CensoTree; className?: string }) {
  const tala = talaDesdeElMapa(arbol);
  const nota = tala.nota && (
    <p className="flex items-start gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
      <Info className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden="true" />
      {tala.nota}
    </p>
  );
  if (!tala.puede) return nota || null;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <button type="button" onClick={() => irARegistrarTala(arbol.code)} data-registrar-tala={arbol.code} className={`${BTN_MAPA_PRIMARIO} w-full`}>
        <Axe className="h-4 w-4" aria-hidden="true" />
        Registrar tala
      </button>
      {nota}
    </div>
  );
}
