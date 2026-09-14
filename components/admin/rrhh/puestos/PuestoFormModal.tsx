"use client";

/**
 * PuestoFormModal — alta/edición de un puesto (ADR-414 §2). La tarifa
 * sugerida sólo la ve/edita nivel completo — para gestión es un catálogo de
 * nombres, sin plata.
 *
 * Gestión NO manda la clave `tarifaSugerida`, ni siquiera como `null`: la ruta
 * responde 403 `tarifa_requiere_admin` a cualquier valor presente, y así un
 * manager no podía crear ni editar ningún puesto (revisión 2026-09-14).
 */

import { useState, type FormEvent } from "react";
import { Briefcase, Loader2, Pencil } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { cn } from "@/lib/utils";
import { BOTON, CLASE_CAMPO } from "../rrhh-form";
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

const FORM_ID = "rrhh-form-puesto";
type ModalidadPagada = Exclude<Modalidad, "SIN_PAGO">;
const MODALIDADES: ModalidadPagada[] = ["HORA", "DIA", "SEMANA", "MES"];

export default function PuestoFormModal({ open, onClose, puesto, nivel, onGuardado }: Props) {
  const { crear, actualizar } = useRrhhPuestos();
  const puedeTarifa = nivel === "completo";
  const [nombre, setNombre] = useState(puesto?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(puesto?.descripcion ?? "");
  const [conTarifa, setConTarifa] = useState(Boolean(puesto?.tarifaSugerida));
  const [modalidad, setModalidad] = useState<ModalidadPagada>(puesto?.tarifaSugerida?.modalidad ?? "DIA");
  const [monto, setMonto] = useState(puesto?.tarifaSugerida ? String(puesto.tarifaSugerida.monto) : "");
  const [horas, setHoras] = useState(String(puesto?.horasJornada ?? 8));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (guardando) return;
    if (nombre.trim().length < 2) {
      setError("Escribe el nombre del puesto (mínimo 2 letras).");
      return;
    }
    const montoNum = Number(monto);
    if (puedeTarifa && conTarifa && !(montoNum > 0)) {
      setError("Pon un monto mayor a 0 o desmarca la tarifa sugerida.");
      return;
    }
    const horasNum = Number(horas);
    if (!(horasNum > 0 && horasNum <= 24)) {
      setError("La jornada tiene que ser de más de 0 y hasta 24 horas.");
      return;
    }
    setGuardando(true);
    setError(null);
    const input: PuestoInput = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      // No tiene guard de nivel en la ruta (sólo `tarifaSugerida` lo tiene): un manager también la ajusta.
      horasJornada: horasNum,
      ...(puedeTarifa ? { tarifaSugerida: conTarifa ? { modalidad, monto: montoNum } : null } : {}),
    };
    const res = puesto ? await actualizar(puesto.id, input) : await crear(input);
    setGuardando(false);
    if (!res.ok) {
      setError(
        res.error.error === "nombre_duplicado"
          ? "Ya existe un puesto con ese nombre."
          : res.error.error === "tarifa_requiere_admin"
            ? "Sólo un administrador puede poner la tarifa sugerida."
            : (res.error.message ?? "No se pudo guardar el puesto."),
      );
      return;
    }
    onGuardado();
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={puesto ? `Editar «${puesto.nombre}»` : "Nuevo puesto"}
      icon={puesto ? Pencil : Briefcase}
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={onClose} className={BOTON.fantasma}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} disabled={guardando} className={BOTON.primario}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            {puesto ? "Guardar cambios" : "Crear puesto"}
          </button>
        </ModalFooter>
      }
    >
      <form id={FORM_ID} onSubmit={guardar} noValidate className={cn(MODAL_BODY, "space-y-5")}>
        <Field label="Nombre del puesto" required>
          {(id) => (
            <input id={id} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} autoComplete="off" className={CLASE_CAMPO} placeholder="Ej. Motosierrista" />
          )}
        </Field>
        <Field label="Descripción" hint="Opcional: qué hace, en una línea.">
          {(id) => (
            <input id={id} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} autoComplete="off" className={CLASE_CAMPO} />
          )}
        </Field>
        {/* Hasta hoy todos los puestos quedaban en 8 h: el servidor aceptaba otra jornada pero ningún formulario la pedía. */}
        <Field label="Horas de la jornada" hint="Prellena la jornada de las tarifas por hora de quien entra a este puesto.">
          {(id) => (
            <input id={id} type="number" inputMode="decimal" min={1} max={24} step="0.5" value={horas} onChange={(e) => setHoras(e.target.value)} className={cn(CLASE_CAMPO, "w-32 tabular-nums")} />
          )}
        </Field>

        {puedeTarifa && (
          <div className="space-y-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
            <label className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3">
              <input
                type="checkbox"
                checked={conTarifa}
                onChange={(e) => setConTarifa(e.target.checked)}
                className="row-span-2 mt-0.5 h-4 w-4 accent-[var(--accent)]"
              />
              <span className="text-sm font-semibold text-[var(--text-primary)]">Tarifa sugerida</span>
              <span className="mt-0.5 text-xs leading-relaxed text-[var(--text-tertiary)]">
                Sólo prellena la tarifa de quien entra a este puesto. Cambiarla acá no toca a nadie.
              </span>
            </label>
            {conTarifa && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Se paga">
                  {(id) => (
                    <select id={id} value={modalidad} onChange={(e) => setModalidad(e.target.value as ModalidadPagada)} className={CLASE_CAMPO}>
                      {MODALIDADES.map((m) => (
                        <option key={m} value={m}>
                          {etiquetaModalidad(m)}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Monto (S/)">
                  {(id) => (
                    <input
                      id={id}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      placeholder="0.00"
                      className={cn(CLASE_CAMPO, "tabular-nums")}
                    />
                  )}
                </Field>
              </div>
            )}
          </div>
        )}
      </form>
    </AdminModal>
  );
}
