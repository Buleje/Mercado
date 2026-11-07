"use client";

/**
 * CompletarFichaModal — lo que le falta a la ficha de una persona, sin salir de
 * Asistencia (Brandon 20-10, «Completar la ficha»: en Blas 5 de 10 no tenían
 * puesto y 8 de 10 no tenían fecha de ingreso). Sin puesto no hay horario y la
 * tardanza no se juzga sola (ADR-417); sin ingreso no se sabe desde cuándo
 * marca. Guarda sólo lo que cambió (`action: "editar"`, nivel gestión).
 */
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ClipboardList, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { csrfHeaders } from "@/lib/csrf-client";
import type { ColaboradorMinDTO, FechaKey, PuestoDTO } from "@/lib/rrhh/tipos";
import { limaDateKey } from "@/lib/utils";
import { BOTON, CLASE_CAMPO } from "../rrhh-form";
import { Casilla } from "@/components/ui-system/Casilla";

const FORM_ID = "rrhh-form-completar";

interface Props {
  colaborador: ColaboradorMinDTO;
  puestos: readonly PuestoDTO[];
  onClose: () => void;
  onGuardado: () => void;
}

export default function CompletarFichaModal({ colaborador: c, puestos, onClose, onGuardado }: Props) {
  const [puestoId, setPuestoId] = useState(c.puesto?.id ?? "");
  const [fechaIngreso, setFechaIngreso] = useState<FechaKey>(c.fechaIngreso ?? "");
  const [eventual, setEventual] = useState(c.eventual);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const cambios: { puestoId?: string | null; fechaIngreso?: FechaKey | null; eventual?: boolean } = {};
    if (eventual !== c.eventual) cambios.eventual = eventual;
    if (puestoId !== (c.puesto?.id ?? "")) cambios.puestoId = puestoId || null;
    if (fechaIngreso !== (c.fechaIngreso ?? "")) cambios.fechaIngreso = fechaIngreso || null;
    if (Object.keys(cambios).length === 0) return onClose();
    if (fechaIngreso && fechaIngreso > limaDateKey()) return setError("La fecha de ingreso no puede ser después de hoy.");
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/rrhh/colaboradores/${c.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "editar", ...cambios }),
        credentials: "include",
      });
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => ({}))) as { message?: string };
        setError(cuerpo.message ?? (res.status === 403 ? "Tu usuario no puede editar la ficha." : "No se pudo guardar. Intenta de nuevo."));
        return;
      }
      toast.success(`La ficha de ${c.nombre} quedó completa`);
      onGuardado();
    } catch {
      setError("Sin conexión: revisa tu internet e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Completar la ficha"
      description={c.nombre}
      icon={ClipboardList}
      size="sm"
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={onClose} className={BOTON.fantasma}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} disabled={guardando} className={BOTON.primario}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </button>
        </ModalFooter>
      }
    >
      <form id={FORM_ID} onSubmit={(e) => void enviar(e)} noValidate className={`${MODAL_BODY} space-y-4`}>
        <Field label="Puesto" hint="Con puesto tiene horario: la tardanza se marca sola.">
          {(id) => (
            <select id={id} value={puestoId} onChange={(e) => setPuestoId(e.target.value)} className={CLASE_CAMPO}>
              <option value="">Sin puesto</option>
              {puestos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Fecha de ingreso" hint="Antes de esa fecha no se le pide asistencia.">
          {(id) => <input id={id} type="date" value={fechaIngreso} max={limaDateKey()} onChange={(e) => setFechaIngreso(e.target.value)} className={CLASE_CAMPO} />}
        </Field>
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm text-[var(--text-primary)]">
          <Casilla checked={eventual} onChange={(e) => setEventual(e.target.checked)} />
          <span className="min-w-0">
            <span className="block font-semibold">Eventual (viene por día)</span>
            <span className="block text-[var(--text-tertiary)]">Sale en Asistencia sólo el día que viene; «Todos presentes» no lo marca.</span>
          </span>
        </label>
      </form>
    </AdminModal>
  );
}
