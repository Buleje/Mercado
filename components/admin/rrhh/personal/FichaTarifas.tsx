"use client";

/**
 * FichaTarifas — línea de tiempo de versiones + «Nueva tarifa» (ADR-414 §3).
 *
 * Las filas no se editan: guardar de nuevo la misma fecha da de baja la
 * anterior y nace una fila nueva (lo hace el servidor). `SIN_PAGO` es «desde
 * acá no gana» — no es un error, es la línea del cese o la suspensión.
 */

import { useState } from "react";
import { Loader2, Plus, Wallet } from "@buleje/design-system/icons";
import { etiquetaModalidad, formatearPEN } from "../rrhh-ui";
import { limaDateKey } from "@/lib/utils";
import type { Modalidad, TarifaDTO } from "@/lib/rrhh/tipos";
import type { RrhhApiError } from "@/hooks/use-rrhh-puestos";

interface Props {
  tarifas: TarifaDTO[];
  guardando: boolean;
  onGuardar: (input: { modalidad: Modalidad; monto: number; horasJornada?: number; vigenteDesde: string; motivo?: string }) => Promise<{ ok: true; tarifas: TarifaDTO[] } | { ok: false; error: RrhhApiError }>;
  onQuitar: (tarifaId: string) => Promise<{ ok: true; tarifas: TarifaDTO[] } | { ok: false; error: RrhhApiError }>;
  onCambio: () => void;
}

export default function FichaTarifas({ tarifas, guardando, onGuardar, onQuitar, onCambio }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [modalidad, setModalidad] = useState<Modalidad>("DIA");
  const [monto, setMonto] = useState("");
  const [vigenteDesde, setVigenteDesde] = useState(() => limaDateKey());
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ordenadas = [...tarifas].sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1));

  const guardar = async () => {
    const montoNum = modalidad === "SIN_PAGO" ? 0 : Number(monto);
    if (modalidad !== "SIN_PAGO" && (!monto || montoNum <= 0)) { setError("El monto tiene que ser mayor a 0"); return; }
    setError(null);
    const res = await onGuardar({ modalidad, monto: montoNum, vigenteDesde, motivo: motivo.trim() || undefined });
    if (!res.ok) { setError(res.error.message ?? "No se pudo guardar la tarifa"); return; }
    setAbierto(false);
    setMonto("");
    setMotivo("");
    onCambio();
  };

  return (
    <div className="space-y-3">
      {!abierto && (
        <button type="button" onClick={() => setAbierto(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--surface-sunken)]">
          <Plus className="h-3.5 w-3.5" /> Nueva tarifa
        </button>
      )}

      {abierto && (
        <div className="space-y-2 rounded-xl border border-[var(--rule-base)] p-3">
          <div className="flex flex-wrap gap-2">
            <select value={modalidad} onChange={(e) => setModalidad(e.target.value as Modalidad)} className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm">
              {(["HORA", "DIA", "SEMANA", "MES", "SIN_PAGO"] as const).map((m) => <option key={m} value={m}>{etiquetaModalidad(m)}</option>)}
            </select>
            {modalidad !== "SIN_PAGO" && (
              <input type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Monto (S/)" className="h-10 w-32 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]" />
            )}
            <input type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]" />
          </div>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" maxLength={300} className="h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs text-[var(--text-primary)]" />
          {error && <p className="text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="button" disabled={guardando} onClick={guardar} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="text-xs font-semibold text-[var(--text-tertiary)]">Cancelar</button>
          </div>
        </div>
      )}

      {ordenadas.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]"><Wallet className="h-4 w-4" /> Sin tarifa registrada todavía.</p>
      ) : (
        <ol className="space-y-2 border-l-2 border-[var(--rule-soft)] pl-4">
          {ordenadas.map((t) => (
            <li key={t.id} className="relative">
              <span className="absolute -left-[1.3rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t.modalidad === "SIN_PAGO" ? "Sin pago" : `${formatearPEN(t.monto)} (${etiquetaModalidad(t.modalidad)})`}
                <span className="ml-1.5 font-normal text-[var(--text-tertiary)]">desde {t.vigenteDesde}</span>
              </p>
              {t.motivo && <p className="text-xs text-[var(--text-tertiary)]">{t.motivo}</p>}
              <button
                type="button"
                onClick={() => onQuitar(t.id).then((r) => { if (r.ok) onCambio(); })}
                className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
              >
                Quitar
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
