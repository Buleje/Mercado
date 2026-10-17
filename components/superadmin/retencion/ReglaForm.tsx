"use client";

import { useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";
import {
  ACCIONES,
  ACCION_LABEL,
  PLANTILLAS,
  SENALES,
  SENAL_LABEL,
  SEVERIDADES,
  SEVERIDAD_LABEL,
  type Accion,
} from "@/lib/churn/playbook-catalog";

export interface ValoresRegla {
  triggerSignal: string;
  triggerSeverity: string;
  action: string;
  templateId: string | null;
  discountPercent: number | null;
  discountDays: number | null;
}

const CAMPO =
  "h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";
const ETIQUETA = "flex min-w-0 flex-col gap-1 text-xs font-bold text-[var(--text-tertiary)]";

/** Ajusta plantilla y descuento al canal elegido (un correo no lleva %, un descuento no lleva plantilla). */
function normalizar(v: ValoresRegla): ValoresRegla {
  const plantillas = PLANTILLAS[v.action as Accion] ?? [];
  const templateId = plantillas.some((p) => p.id === v.templateId) ? v.templateId : (plantillas[0]?.id ?? null);
  const esDescuento = v.action === "discount";
  return {
    ...v,
    templateId,
    discountPercent: esDescuento ? (v.discountPercent ?? 10) : null,
    discountDays: esDescuento ? (v.discountDays ?? 7) : null,
  };
}

export function ReglaForm({
  inicial,
  conSenal,
  guardando,
  error,
  onGuardar,
  onCancelar,
}: {
  inicial: ValoresRegla;
  /** Al crear se elige la señal; al editar queda fija (cambiarla es otra regla). */
  conSenal: boolean;
  guardando: boolean;
  error: string | null;
  onGuardar: (v: ValoresRegla) => void;
  onCancelar: () => void;
}) {
  const [v, setV] = useState<ValoresRegla>(() => normalizar(inicial));
  const set = (cambio: Partial<ValoresRegla>) => setV((prev) => normalizar({ ...prev, ...cambio }));
  const plantillas = PLANTILLAS[v.action as Accion] ?? [];

  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-[var(--surface-sunken)]/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar(v);
      }}
    >
      {conSenal && (
        <label className={`${ETIQUETA} w-full sm:w-48`}>
          Cuándo
          <select className={CAMPO} value={v.triggerSignal} onChange={(e) => set({ triggerSignal: e.target.value })}>
            {SENALES.map((s) => (
              <option key={s} value={s}>{SENAL_LABEL[s]}</option>
            ))}
          </select>
        </label>
      )}
      <label className={`${ETIQUETA} w-full sm:w-36`}>
        Desde el riesgo
        <select className={CAMPO} value={v.triggerSeverity} onChange={(e) => set({ triggerSeverity: e.target.value })}>
          {SEVERIDADES.map((s) => (
            <option key={s} value={s}>{SEVERIDAD_LABEL[s]}</option>
          ))}
        </select>
      </label>
      <label className={`${ETIQUETA} w-full sm:w-40`}>
        Qué hacer
        <select className={CAMPO} value={v.action} onChange={(e) => set({ action: e.target.value })}>
          {ACCIONES.map((a) => (
            <option key={a} value={a}>{ACCION_LABEL[a]}</option>
          ))}
        </select>
      </label>
      {plantillas.length > 0 && (
        <label className={`${ETIQUETA} w-full sm:w-56`}>
          Mensaje
          <select className={CAMPO} value={v.templateId ?? ""} onChange={(e) => set({ templateId: e.target.value })}>
            {plantillas.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
      )}
      {v.action === "discount" && (
        <>
          <label className={`${ETIQUETA} w-24`}>
            % descuento
            <input type="number" min={1} max={100} className={CAMPO} value={v.discountPercent ?? ""}
              onChange={(e) => set({ discountPercent: Number(e.target.value) || null })} />
          </label>
          <label className={`${ETIQUETA} w-24`}>
            Días
            <input type="number" min={1} max={365} className={CAMPO} value={v.discountDays ?? ""}
              onChange={(e) => set({ discountDays: Number(e.target.value) || null })} />
          </label>
        </>
      )}
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <button
          type="submit"
          disabled={guardando}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar
        </button>
        <button type="button" onClick={onCancelar} className="h-9 rounded-lg px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
          Cancelar
        </button>
      </div>
      {error && <p role="alert" className="w-full text-xs font-bold text-[var(--data-error-600,var(--data-error-500))]">{error}</p>}
    </form>
  );
}
