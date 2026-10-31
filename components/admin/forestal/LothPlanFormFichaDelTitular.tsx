"use client";

/**
 * «Titular del Directorio: X» en el alta del plan (ADR-518): dice que el plan
 * queda atado a esa ficha al guardar —y que deja de estarlo si el titular se
 * cambia a mano—. Lo que se completó desde la ficha, si no vino de un permiso
 * (ese ya lo dice su propia franja).
 */

import { AlertTriangle, UserCheck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { Parte } from "@/lib/forestal/directorio";
import { sigueSiendoElTitular } from "@/lib/forestal/directorio-planes";

export default function LothPlanFormFichaDelTitular({
  titular,
  titularEscrito,
  traidos,
  atarIgual,
  onAtarIgual,
}: {
  titular: Parte;
  titularEscrito: string;
  /** Lo completado desde la ficha; vacío si lo dice la franja del permiso. */
  traidos: readonly string[];
  /** Se tocó «Atar igual» con el titular escrito tal como está. */
  atarIgual: boolean;
  onAtarIgual: () => void;
}) {
  const mismoNombre = sigueSiendoElTitular(titularEscrito, titular);
  const atado = mismoNombre || atarIgual;
  return (
    <div data-ficha-del-titular className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
      {/* Ícono, texto y ⓘ juntos: a 400 px el nombre largo se parte en su sitio y el ícono no queda solo en una fila. */}
      <span className="flex min-w-0 flex-[1_1_14rem] items-center gap-2">
        {atado ? (
          <UserCheck className="h-4 w-4 shrink-0 text-[var(--accent-ink)]" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden="true" />
        )}
        <span className="min-w-0 text-[var(--text-secondary)]">
          {atado ? "Queda en la ficha de" : "Ya no es la ficha de"}{" "}
          <b className="text-[var(--text-primary)]">{titular.nombre}</b>
        </span>
        <InfoTip
          title="El plan y la ficha del titular"
          what="Al guardar, este plan aparece en la ficha del titular en el Directorio, en «Planes de manejo y permisos». Una comunidad tiene una sola ficha y puede tener muchos planes."
          affects="Si cambias el nombre del titular a mano, el plan ya no se ata a esa ficha. Si es la misma comunidad o empresa escrita de otra forma, toca «Atar igual»."
          example={`${titular.nombre} → Plantación 19-SEC/REG-PLT-2026-117, 4,50 ha`}
        />
      </span>
      {!atado && (
        <button type="button" className={button({ variant: "secondary", className: "ml-auto" })} onClick={onAtarIgual}>
          Atar igual
        </button>
      )}
      {traidos.length > 0 && (
        <span className="w-full text-sm text-[var(--text-secondary)]">
          De la ficha se completaron: {traidos.join(", ")}. Lo que ya estaba escrito no se tocó.
        </span>
      )}
    </div>
  );
}
