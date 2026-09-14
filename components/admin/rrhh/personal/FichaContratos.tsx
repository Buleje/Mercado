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
import { AvisoRrhh, BOTON, CLASE_CHIP } from "../rrhh-form";
import { formatearFecha, pluralizar } from "../rrhh-ui";
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
  return CLASE_ESTADO[estado as EstadoVisible] ?? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
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
      if (!res.ok) {
        setError("No se pudo vincular el contrato.");
        return;
      }
      onCambio();
    } catch {
      setError("No se pudo vincular el contrato.");
    } finally {
      setVinculando(null);
    }
  };

  return (
    <div className="space-y-5">
      {contratos.length === 0 ? (
        <AvisoRrhh tono="neutro" icono={FileSignature}>
          Sin contratos vinculados. Se crean en Documentos › Contratos.
        </AvisoRrhh>
      ) : (
        <ul className="space-y-2.5">
          {contratos.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {c.numero} <span className="font-normal text-[var(--text-tertiary)]">· {c.tipo}</span>
                </p>
                <p className="mt-0.5 text-xs tabular-nums text-[var(--text-tertiary)]">
                  Desde el {formatearFecha(c.fechaInicio)}
                  {c.fechaVencimiento && (
                    <>
                      {" "}
                      · vence el {formatearFecha(c.fechaVencimiento)}
                      {c.diasParaVencer != null && c.diasParaVencer >= 0 && ` (en ${pluralizar(c.diasParaVencer, "día", "días")})`}
                    </>
                  )}
                  {c.firmantesPendientes > 0 && ` · ${pluralizar(c.firmantesPendientes, "firma pendiente", "firmas pendientes")}`}
                </p>
              </div>
              <span className={cn(CLASE_CHIP, "shrink-0", claseDe(c.estadoVisible))}>{etiquetaDe(c.estadoVisible)}</span>
            </li>
          ))}
        </ul>
      )}

      {sugeridos.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">¿Son de esta persona? Tienen su mismo documento y están sin vincular.</p>
          <ul className="space-y-2.5">
            {sugeridos.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-3">
                <p className="min-w-0 truncate text-sm text-[var(--text-primary)]">
                  {c.numero} <span className="text-[var(--text-tertiary)]">· {c.tipo}</span>
                </p>
                <button type="button" disabled={vinculando === c.id} onClick={() => vincular(c.id)} className={BOTON.chico}>
                  {vinculando === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Vincular
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <AvisoRrhh tono="error">{error}</AvisoRrhh>}
    </div>
  );
}
