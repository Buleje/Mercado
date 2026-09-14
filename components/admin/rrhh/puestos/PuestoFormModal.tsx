"use client";

/**
 * PuestoFormModal — alta/edición de un puesto (ADR-414 §2). La tarifa
 * sugerida sólo la ve/edita nivel completo — para gestión es un catálogo de
 * nombres, sin plata.
 */

import { useState } from "react";
import { Briefcase, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { etiquetaModalidad } from "../rrhh-ui";
import { useRrhhPuestos, type PuestoInput } from "@/hooks/use-rrhh-puestos";
import type { Modalidad, NivelRrhh, PuestoDTO } from "@/lib/rrhh/tipos";

interface Props {
  open: boolean;
  onClose: () => void;
  puesto: PuestoDTO | null;
  nivel: NivelRrhh;
  onGuardado: () => void;
}

export default function PuestoFormModal({ open, onClose, puesto, nivel, onGuardado }: Props) {
  const { crear, actualizar } = useRrhhPuestos();
  const [nombre, setNombre] = useState(puesto?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(puesto?.descripcion ?? "");
  const [conTarifa, setConTarifa] = useState(Boolean(puesto?.tarifaSugerida));
  const [modalidad, setModalidad] = useState<Exclude<Modalidad, "SIN_PAGO">>(puesto?.tarifaSugerida?.modalidad ?? "DIA");
  const [monto, setMonto] = useState(puesto?.tarifaSugerida ? String(puesto.tarifaSugerida.monto) : "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (nombre.trim().length < 2) { setError("El nombre es muy corto"); return; }
    setGuardando(true);
    setError(null);
    const input: PuestoInput = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      tarifaSugerida: nivel === "completo" && conTarifa && monto ? { modalidad, monto: Number(monto) } : null,
    };
    const res = puesto ? await actualizar(puesto.id, input) : await crear(input);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error.error === "nombre_duplicado" ? "Ya existe un puesto con ese nombre." : (res.error.message ?? "No se pudo guardar"));
      return;
    }
    onGuardado();
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={puesto ? `Editar «${puesto.nombre}»` : "Nuevo puesto"}
      icon={Briefcase}
      variant="centered-sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">Cancelar</button>
          <button type="button" disabled={guardando || nombre.trim().length < 2} onClick={guardar} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="rrhh-puesto-nombre" className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Nombre</label>
          <input id="rrhh-puesto-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]" placeholder="Ej. Motosierrista" />
        </div>
        <div>
          <label htmlFor="rrhh-puesto-descripcion" className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Descripción</label>
          <input id="rrhh-puesto-descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]" />
        </div>
        {nivel === "completo" && (
          <div>
            <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
              <input type="checkbox" checked={conTarifa} onChange={(e) => setConTarifa(e.target.checked)} className="h-4 w-4 rounded border-[var(--rule-base)]" />
              Tarifa sugerida (sólo prellena, nunca entra al cálculo)
            </label>
            {conTarifa && (
              <div className="mt-2 flex gap-2">
                <label className="sr-only" htmlFor="rrhh-puesto-modalidad">Modalidad de la tarifa sugerida</label>
                <select id="rrhh-puesto-modalidad" value={modalidad} onChange={(e) => setModalidad(e.target.value as Exclude<Modalidad, "SIN_PAGO">)} className="h-10 w-32 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm">
                  {(["HORA", "DIA", "SEMANA", "MES"] as const).map((m) => <option key={m} value={m}>{etiquetaModalidad(m)}</option>)}
                </select>
                <input type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" aria-label="Monto de la tarifa sugerida" className="h-10 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]" />
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
      </div>
    </AdminModal>
  );
}
