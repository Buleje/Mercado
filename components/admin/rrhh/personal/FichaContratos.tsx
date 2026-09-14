"use client";

/**
 * FichaContratos — contratos vinculados + «¿Son de esta persona?» (ADR-414 §6).
 *
 * El wizard de crear/editar sigue viviendo en `ContratosModule`: acá sólo se
 * lista y se vincula por id — nunca por nombre (mismo documento normalizado,
 * sugerido, nunca automático).
 */

import { useState } from "react";
import { FileSignature, Link2, Loader2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { ESTADO_VISIBLE_LABELS, type EstadoVisible } from "@/lib/types/contracts";
import type { ContratoDeColaboradorDTO } from "@/lib/rrhh/tipos";

interface Props {
  colaboradorId: string;
  contratos: ContratoDeColaboradorDTO[];
  sugeridos: ContratoDeColaboradorDTO[];
  onCambio: () => void;
}

const CLASE_ESTADO: Partial<Record<EstadoVisible, string>> = {
  VIGENTE: "bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  POR_VENCER: "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  VENCIDO: "bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  PENDIENTE_FIRMA: "bg-[var(--data-info-500)]/10 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
};

function claseDe(estado: string): string {
  return CLASE_ESTADO[estado as EstadoVisible] ?? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]";
}

function etiquetaDe(estado: string): string {
  return ESTADO_VISIBLE_LABELS[estado as EstadoVisible] ?? estado;
}

export default function FichaContratos({ colaboradorId, contratos, sugeridos, onCambio }: Props) {
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vincular = async (contratoId: string) => {
    setVinculando(contratoId);
    setError(null);
    try {
      const res = await fetch(`/api/contratos/${contratoId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ colaboradorId }),
        credentials: "include",
      });
      if (!res.ok) { setError("No se pudo vincular el contrato"); return; }
      onCambio();
    } finally {
      setVinculando(null);
    }
  };

  return (
    <div className="space-y-4">
      {contratos.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]"><FileSignature className="h-4 w-4" /> Sin contratos vinculados.</p>
      ) : (
        <ul className="space-y-2">
          {contratos.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--rule-base)] p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{c.numero} · {c.tipo}</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Desde {c.fechaInicio}
                  {c.fechaVencimiento && <> · vence {c.fechaVencimiento}{c.diasParaVencer != null && c.diasParaVencer >= 0 && ` (en ${c.diasParaVencer}d)`}</>}
                  {c.firmantesPendientes > 0 && ` · ${c.firmantesPendientes} firma(s) pendiente(s)`}
                </p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold", claseDe(c.estadoVisible))}>{etiquetaDe(c.estadoVisible)}</span>
            </li>
          ))}
        </ul>
      )}

      {sugeridos.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-bold text-[var(--text-secondary)]">¿Son de esta persona? (mismo documento, sin vincular)</p>
          <ul className="space-y-2">
            {sugeridos.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-[var(--rule-base)] p-3">
                <p className="min-w-0 truncate text-sm text-[var(--text-primary)]">{c.numero} · {c.tipo}</p>
                <button
                  type="button"
                  disabled={vinculando === c.id}
                  onClick={() => vincular(c.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-primary px-2.5 py-1 text-xs font-bold text-[var(--accent-ink)] hover:bg-primary/10 disabled:opacity-50 dark:text-[var(--accent)]"
                >
                  {vinculando === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Vincular
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
    </div>
  );
}
