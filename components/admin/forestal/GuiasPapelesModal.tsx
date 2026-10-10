"use client";

/**
 * «Papeles» de las guías elegidas para un trámite (ADR-482): antes de armar la
 * Relación de guías u otro formato, ver qué guía tiene su factura, guía de
 * remisión, GTF y lista de trozas firmada, y subir lo que falta ahí mismo.
 *
 * Lo abre la barra de guías elegidas (`GuiasAFormatoBarra`), que es la misma
 * en la vista GTF del Libro TH y en «Guías emitidas» del Libro CTP. Cada guía
 * se despliega con sus casilleros (los del Libro CTP, ADR-438): una a la vez,
 * para que el modal no sea una pared de casilleros.
 */

import { useState } from "react";
import { ChevronDown, Paperclip } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { CasilleroGuia } from "@/lib/forestal/documentos-guia";
import CtpDocumentosGuiaCasilleros from "./CtpDocumentosGuiaCasilleros";
import { PastillaPapeles } from "./ctp-documentos-guia-contexto";

export default function GuiasPapelesModal({
  gtfs,
  faltan,
  onCambio,
  onClose,
}: {
  gtfs: readonly string[];
  /** Papeles de ley que faltan por guía; una guía sin medir no está. */
  faltan: Record<string, CasilleroGuia[]>;
  /** Subió o quitó un papel: la barra vuelve a contar. */
  onCambio: () => void;
  onClose: () => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(gtfs.length === 1 ? (gtfs[0] ?? null) : null);
  const completas = gtfs.filter((g) => faltan[g]?.length === 0).length;

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="wide"
      icon={Paperclip}
      title="Papeles de las guías elegidas"
      description={`Completas: ${completas} de ${gtfs.length} · factura, guía de remisión, GTF y lista de trozas firmada`}
      claveVentana="guias-papeles"
    >
      <div className={MODAL_BODY}>
        <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
          {gtfs.map((g) => {
            const f = faltan[g];
            const esta = abierta === g;
            return (
              <li key={g}>
                <div className="flex min-h-12 items-center gap-3 px-3 py-1.5">
                  <span className="font-mono text-sm font-bold text-[var(--text-primary)]">GTF {g}</span>
                  {f ? (
                    <PastillaPapeles gtf={g} faltan={f} onClick={() => setAbierta(esta ? null : g)} />
                  ) : (
                    <span className="text-xs text-[var(--text-tertiary)]">Contando…</span>
                  )}
                  <button
                    type="button"
                    aria-expanded={esta}
                    onClick={() => setAbierta(esta ? null : g)}
                    className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
                  >
                    {esta ? "Cerrar" : "Subir o ver"}
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${esta ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                </div>
                {esta && (
                  <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
                    <CtpDocumentosGuiaCasilleros gtf={g} onCambio={onCambio} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </AdminModal>
  );
}
