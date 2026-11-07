"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Pause, Play } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import {
  ACCION_LABEL,
  SENAL_LABEL,
  SEVERIDAD_LABEL,
  etiquetaPlantilla,
  type Accion,
  type Senal,
  type Severidad,
} from "@/lib/churn/playbook-catalog";
import { ReglaForm, type ValoresRegla } from "./ReglaForm";
import type { CambiosRegla, Regla } from "./use-reglas-retencion";

function queHace(r: Regla): string {
  const canal = ACCION_LABEL[r.action as Accion] ?? r.action;
  if (r.action === "discount") return `${canal} de ${r.discountPercent ?? 0} % por ${r.discountDays ?? 7} días`;
  const plantilla = etiquetaPlantilla(r.action, r.templateId);
  return plantilla ? `${canal}: «${plantilla}»` : canal;
}

export function ReglaFila({
  regla,
  leTocan,
  guardando,
  onGuardar,
}: {
  regla: Regla;
  /** Alertas abiertas hoy que esta regla atendería. */
  leTocan: number;
  guardando: boolean;
  onGuardar: (cambios: CambiosRegla) => Promise<string | null>;
}) {
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alternar = async () => {
    setError(await onGuardar({ isActive: !regla.isActive }));
  };
  const guardarForm = async (v: ValoresRegla) => {
    const err = await onGuardar({
      triggerSeverity: v.triggerSeverity,
      action: v.action,
      templateId: v.templateId,
      discountPercent: v.discountPercent,
      discountDays: v.discountDays,
    });
    setError(err);
    if (!err) setEditando(false);
  };

  return (
    <li className={`rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 ${regla.isActive ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {SENAL_LABEL[regla.triggerSignal as Senal] ?? regla.triggerSignal}
            <span className="font-normal text-[var(--text-tertiary)]">
              {" "}· desde riesgo {SEVERIDAD_LABEL[regla.triggerSeverity as Severidad] ?? regla.triggerSeverity}
            </span>
          </p>
          <p className="truncate text-xs text-[var(--text-secondary)]">{queHace(regla)}</p>
        </div>
        <div className="w-24 text-right">
          <p className="text-base font-bold tabular-nums text-[var(--text-primary)]">{leTocan}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{leTocan === 1 ? "alerta hoy" : "alertas hoy"}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={regla.isActive}
          aria-label={regla.isActive ? "Pausar regla" : "Activar regla"}
          disabled={guardando}
          onClick={() => void alternar()}
          className={`inline-flex h-8 min-w-24 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors disabled:opacity-50 ${
            regla.isActive
              ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-600,var(--data-success-500))]"
              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
          }`}
        >
          {regla.isActive ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
          {regla.isActive ? "Activa" : "Pausada"}
        </button>
        <ActionMenu
          label="Más acciones"
          icon={MoreHorizontal}
          soloIcono
          actions={[
            { id: "editar", label: "Editar umbral y canal", icon: Pencil, onSelect: () => setEditando(true) },
            {
              id: "alternar",
              label: regla.isActive ? "Pausar regla" : "Activar regla",
              icon: regla.isActive ? Pause : Play,
              onSelect: () => void alternar(),
            },
          ]}
        />
      </div>
      {error && !editando && <p role="alert" className="mt-2 text-xs font-bold text-[var(--data-error-600,var(--data-error-500))]">{error}</p>}
      {editando && (
        <ReglaForm
          inicial={regla}
          conSenal={false}
          guardando={guardando}
          error={error}
          onGuardar={(v) => void guardarForm(v)}
          onCancelar={() => {
            setEditando(false);
            setError(null);
          }}
        />
      )}
    </li>
  );
}
