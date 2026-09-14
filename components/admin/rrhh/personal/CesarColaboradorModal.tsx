"use client";

/**
 * CesarColaboradorModal — cese y reingreso (ADR-414 §1/§7, «casos límite»).
 *
 * Cesar con marcas posteriores no rechaza de una: el servidor avisa cuántas
 * hay (409 `marcas_despues_del_cese`) y se vuelve a mandar con `confirmar`.
 * Las marcas NO se borran — quedan «fuera de período», no suman.
 */

import { useState } from "react";
import { AlertTriangle, Ban, Loader2, RotateCcw } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { etiquetaModalidad } from "../rrhh-ui";
import { limaDateKey } from "@/lib/utils";
import type { ColaboradorDTO, Modalidad, NivelRrhh } from "@/lib/rrhh/tipos";

interface Props {
  open: boolean;
  onClose: () => void;
  colaboradorId: string;
  colaborador: ColaboradorDTO;
  nivel: NivelRrhh;
  aboveModals?: boolean;
  onGuardado: () => void;
}

export default function CesarColaboradorModal({ open, onClose, colaboradorId, colaborador, nivel, aboveModals, onGuardado }: Props) {
  const cesando = colaborador.estado !== "CESADO";
  // Poner una tarifa nueva en el reingreso pide nivel completo en el servidor
  // (`app/api/rrhh/colaboradores/[id]/route.ts`: `reingresar` con `tarifa`).
  // Reingresar SIN tarifa es gestion — eso ya lo permite el caller (ficha).
  const puedeTarifa = nivel === "completo";
  const [fecha, setFecha] = useState(() => limaDateKey());
  const [motivo, setMotivo] = useState("");
  const [conTarifa, setConTarifa] = useState(false);
  const [modalidad, setModalidad] = useState<Exclude<Modalidad, "SIN_PAGO">>("DIA");
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ n: number; primera: string } | null>(null);

  const enviarCese = async (confirmar: boolean) => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/rrhh/colaboradores/${colaboradorId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "cesar", fechaCese: fecha, motivo: motivo.trim(), confirmar }),
        credentials: "include",
      });
      if (res.status === 409) {
        const e = (await res.json()) as { error: string; n?: number; primera?: string };
        if (e.error === "marcas_despues_del_cese" && e.n && e.primera) {
          setAviso({ n: e.n, primera: e.primera });
          return;
        }
        setError("No se pudo cesar a la persona");
        return;
      }
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { message?: string };
        setError(e.message ?? "No se pudo cesar a la persona");
        return;
      }
      onGuardado();
    } finally {
      setGuardando(false);
    }
  };

  const enviarReingreso = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/rrhh/colaboradores/${colaboradorId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "reingresar",
          fecha,
          tarifa: conTarifa && monto ? { modalidad, monto: Number(monto) } : null,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { message?: string };
        setError(e.message ?? "No se pudo reingresar a la persona");
        return;
      }
      onGuardado();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={cesando ? `Cesar a ${colaborador.nombre}` : `Reingresar a ${colaborador.nombre}`}
      icon={cesando ? Ban : RotateCcw}
      variant="centered-sm"
      aboveModals={aboveModals}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">Cancelar</button>
          <button
            type="button"
            disabled={guardando || (cesando && motivo.trim().length < 3)}
            onClick={() => (aviso ? enviarCese(true) : cesando ? enviarCese(false) : enviarReingreso())}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50",
              cesando ? "bg-[var(--data-error-700)]" : "bg-primary",
            )}
          >
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            {aviso ? `Cesar igual (${aviso.n} marcas quedan)` : cesando ? "Cesar" : "Reingresar"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="rrhh-cese-fecha" className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">{cesando ? "Fecha de cese" : "Fecha de reingreso"}</label>
          <input id="rrhh-cese-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]" />
        </div>

        {cesando ? (
          <div>
            <label htmlFor="rrhh-cese-motivo" className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Motivo</label>
            <textarea id="rrhh-cese-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300} className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]" placeholder="Por qué se va" />
          </div>
        ) : puedeTarifa ? (
          <div>
            <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
              <input type="checkbox" checked={conTarifa} onChange={(e) => setConTarifa(e.target.checked)} className="h-4 w-4 rounded border-[var(--rule-base)]" />
              Poner una tarifa nueva desde el reingreso
            </label>
            {conTarifa && (
              <div className="mt-2 flex gap-2">
                <label className="sr-only" htmlFor="rrhh-reingreso-modalidad">Modalidad de la tarifa</label>
                <select id="rrhh-reingreso-modalidad" value={modalidad} onChange={(e) => setModalidad(e.target.value as Exclude<Modalidad, "SIN_PAGO">)} className="h-10 w-32 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm">
                  {(["HORA", "DIA", "SEMANA", "MES"] as const).map((m) => <option key={m} value={m}>{etiquetaModalidad(m)}</option>)}
                </select>
                <input type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" aria-label="Monto de la tarifa" className="h-10 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]" />
              </div>
            )}
            {!conTarifa && <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Sin tocar el checkbox, sigue con la última tarifa pagada de antes del cese.</p>}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-tertiary)]">Sigue con la última tarifa pagada de antes del cese. Sólo admin/owner pueden ponerle una nueva acá.</p>
        )}

        {aviso && (
          <div className="flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/5 p-3 text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Tiene {aviso.n} marcas después del {aviso.primera.slice(8, 10)}/{aviso.primera.slice(5, 7)}. Se conservan, pero dejan de sumar en lo ganado.</span>
          </div>
        )}
        {error && <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
      </div>
    </AdminModal>
  );
}
