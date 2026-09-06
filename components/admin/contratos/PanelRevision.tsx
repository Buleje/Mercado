"use client";

import { useState } from "react";
import { Loader2, Scale, AlertTriangle, CheckCircle, Info } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import type { ContractRevisionIa, ContractRiesgo } from "@/lib/types/contracts";

/**
 * El informe del revisor de cláusulas, en criollo.
 *
 * Cada hallazgo se cuenta en tres tiempos: qué dice el contrato, qué te puede
 * pasar, y qué conviene cambiar. Sin ese tercer paso el aviso sólo asusta.
 */

interface Props {
  contratoId: string;
  revision: ContractRevisionIa | null;
  onRevisado?: (revision: ContractRevisionIa) => void;
}

const ESTILO_SEVERIDAD: Record<ContractRiesgo["severidad"], string> = {
  alta: "border-l-[var(--data-error-500)] bg-[var(--data-error-100)]/40 dark:bg-[var(--data-error-500)]/12",
  media: "border-l-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12",
  baja: "border-l-[var(--rule-base)] bg-[var(--surface-alt)] dark:bg-white/5",
};

const TEXTO_SEVERIDAD: Record<ContractRiesgo["severidad"], string> = {
  alta: "Serio",
  media: "Para revisar",
  baja: "Menor",
};

function colorPuntaje(p: number): string {
  if (p >= 80) return "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
  if (p >= 50) return "text-[var(--data-warning-500)]";
  return "text-[var(--data-error-500)]";
}

export default function PanelRevision({ contratoId, revision, onRevisado }: Props) {
  const [revisando, setRevisando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actual, setActual] = useState<ContractRevisionIa | null>(revision);

  const revisar = async () => {
    setRevisando(true);
    setError(null);
    try {
      const res = await fetch(`/api/contratos/${contratoId}/revisar`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "No se pudo revisar");
      setActual(json.revision);
      onRevisado?.(json.revision);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revisar");
    } finally {
      setRevisando(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Scale className="h-4 w-4" /> Qué revisar antes de firmar
        </h4>
        <button
          onClick={revisar}
          disabled={revisando}
          className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline disabled:opacity-60"
        >
          {revisando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {actual ? "Revisar de nuevo" : "Revisar el contrato"}
        </button>
      </div>

      {!actual && !revisando && (
        <p className="text-xs text-[var(--text-secondary)]">
          Buscamos cláusulas riesgosas, plazos fuera de la ley peruana y datos sin llenar.
        </p>
      )}

      {actual && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--surface-alt)] dark:bg-white/5">
            <div className="text-center shrink-0">
              <p className={cn("text-2xl font-bold tabular-nums", colorPuntaje(actual.puntaje))}>
                {actual.puntaje}
              </p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">de 100</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{actual.resumen}</p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1">
                {actual.fuente === "ia" ? "Revisado con IA" : "Revisado con reglas legales"} ·{" "}
                {new Date(actual.revisadoEn).toLocaleString("es-PE")}
              </p>
            </div>
          </div>

          {actual.riesgos.length === 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--data-success-500)]/10">
              <CheckCircle className="h-4 w-4 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] shrink-0" />
              <p className="text-xs text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                No encontramos problemas evidentes.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {actual.riesgos.map((r, i) => (
                <li
                  key={`${r.titulo}-${i}`}
                  className={cn("border-l-[3px] rounded-r-xl p-3 space-y-1", ESTILO_SEVERIDAD[r.severidad])}
                >
                  <div className="flex items-start gap-2">
                    {r.severidad === "alta" ? (
                      <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)] shrink-0 mt-0.5" />
                    ) : (
                      <Info className="h-4 w-4 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--text-primary)]">{r.titulo}</p>
                      <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] uppercase">
                        {TEXTO_SEVERIDAD[r.severidad]}
                        {r.base ? ` · ${r.base}` : ""}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] pl-6">{r.hallazgo}</p>
                  <p className="text-xs text-[var(--text-secondary)] pl-6">
                    <span className="font-semibold">Qué puede pasar: </span>
                    {r.consecuencia}
                  </p>
                  <p className="text-xs text-[var(--text-primary)] pl-6">
                    <span className="font-semibold">Qué hacer: </span>
                    {r.sugerencia}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-xs text-[var(--data-error-500)] mt-2">{error}</p>}
    </div>
  );
}
