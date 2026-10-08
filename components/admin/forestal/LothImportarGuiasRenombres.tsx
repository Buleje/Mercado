"use client";

/**
 * ADR-474 (07-10-2026): la confirmación de los códigos únicos en la vista
 * previa de «Importar guías despachadas». Brandon: «en el mismo permiso en
 * plantación los códigos de trozas vienen y son lo mismo pero con diferente
 * guía y eso confunde». Una troza cuyo código ya salió con otra guía del MISMO
 * permiso entra con su código único («12A-0002», ADR-477) sólo si la persona
 * dice que es OTRA troza: si fuera la misma, su volumen se contaría dos veces.
 * El servidor vuelve a revisar y rechaza la guía con un renombre sin confirmar.
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { TrozaImportada } from "@/lib/forestal/loth-importar-guia-tipos";

const MAX_A_LA_VISTA = 4;

export default function LothImportarGuiasRenombres({
  trozas,
  confirmados,
  onConfirmar,
  activa,
}: {
  trozas: readonly TrozaImportada[];
  /** Los códigos únicos ya confirmados para esta guía. */
  confirmados: readonly string[];
  /** Los códigos que se confirman (`null` = retirar la confirmación). */
  onConfirmar: (codigos: string[] | null) => void;
  /** La guía va marcada para importar. */
  activa: boolean;
}) {
  const renombradas = trozas.filter((t) => t.estado === "renombrada");
  if (renombradas.length === 0) return null;
  const codigos = renombradas.map((t) => t.trozaCode);
  const ok = codigos.every((c) => confirmados.includes(c));
  const pares = renombradas
    .slice(0, MAX_A_LA_VISTA)
    .map((t) => `${t.codificacionGuia ?? "—"} → ${t.trozaCode}`)
    .join(" · ");
  const mas = renombradas.length > MAX_A_LA_VISTA ? ` · y ${renombradas.length - MAX_A_LA_VISTA} más` : "";
  return (
    <div
      className={`mx-3 mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
        ok
          ? "border-[var(--rule-base)]"
          : "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10"
      } ${activa ? "" : "opacity-60"}`}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed"
          checked={ok}
          disabled={!activa}
          onChange={(e) => onConfirmar(e.target.checked ? codigos : null)}
        />
        <span className="min-w-0">
          <b className="text-[var(--text-primary)]">
            Son otras trozas: entran con su código único
          </b>
          <span className="block font-mono text-xs text-[var(--text-secondary)]">
            {pares}
            {mas}
          </span>
        </span>
      </label>
      <InfoTip
        title="Código único de la troza"
        what="El código de la guía ya salió con OTRA guía de este mismo permiso (en plantación las guías repiten códigos). Toda troza que entra desde una guía lleva su código único: el de la guía más el correlativo de esa guía."
        affects="La hoja de la guía y la lista de trozas siguen imprimiendo el código de la guía. Si fuera la MISMA troza física, no lo confirmes: entraría dos veces y su volumen se contaría doble."
        example="12A de la GTF 019-001-0000002 → 12A-0002; el árbol sigue siendo el 12."
        side="left"
      />
    </div>
  );
}
