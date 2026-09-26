"use client";

/**
 * «Es de otro, sólo la asierro» (ADR-437 §1): la madera no se compró, se
 * asierra para su dueño. No lleva costo, no cuenta como «sin costo» y no entra
 * al valor del patio. Lo único que se pide es DE QUIÉN es: la misma ficha del
 * Directorio con la que la corrida le cobra el aserrío (ADR-412).
 *
 * Medido en Blas (26-09): 8 guías del permiso de WASACO pedían costo sin serlo.
 */

import { useId } from "react";
import { Sparkles } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Parte } from "@/lib/forestal/directorio";
import type { PlataDeGuiaDTO } from "@/lib/forestal/plata-de-guia";
import { Bloque, CAMPO, ROTULO } from "./comun";

export default function SeccionServicio({
  dto,
  partes,
  duenoId,
  onDueno,
}: {
  dto: PlataDeGuiaDTO;
  partes: readonly Parte[];
  duenoId: string | null;
  onDueno: (id: string | null) => void;
}) {
  const idDueno = useId();
  const sug = dto.duenoSugerido;
  const sugEnDirectorio = sug?.parteId ? partes.some((p) => p.id === sug.parteId) : false;

  return (
    <Bloque
      titulo={
        <>
          <span>¿De quién es la madera?</span>
          <InfoTip
            title="Madera de servicio"
            what="No la compraste: la asierras para su dueño. No lleva costo ni estado de pago, y no cuenta como «sin costo»."
            affects="El aserrío se le cobra en la corrida (Producción), no acá."
            example="Guías de WASACO del permiso 10-HUA-PUE/PER-FMP-2026-007."
          />
        </>
      }
    >
      {sug && (
        <button
          type="button"
          disabled={!sugEnDirectorio || duenoId === sug.parteId}
          onClick={() => sug.parteId && onDueno(sug.parteId)}
          className="mb-3 flex w-full items-start gap-2 rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--accent)]/20 disabled:cursor-default disabled:hover:bg-[var(--accent)]/10"
        >
          <Sparkles
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]"
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block font-bold text-[var(--text-primary)]">
              {duenoId && duenoId === sug.parteId ? `Elegido: ${sug.nombre}` : `Usar ${sug.nombre}`}
            </span>
            <span className="block text-[var(--text-secondary)]">
              {sug.motivo}
              {!sugEnDirectorio && " No está en el Directorio: créalo en Gestión → Directorio."}
            </span>
          </span>
        </button>
      )}

      <label htmlFor={idDueno} className={ROTULO}>
        Dueño de la madera
      </label>
      <select
        id={idDueno}
        value={duenoId ?? ""}
        onChange={(e) => onDueno(e.target.value || null)}
        className={CAMPO}
      >
        <option value="">Elige del Directorio…</option>
        {partes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
    </Bloque>
  );
}
