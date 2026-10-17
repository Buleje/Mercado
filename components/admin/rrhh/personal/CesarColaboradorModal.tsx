"use client";

/**
 * CesarColaboradorModal — cese y reingreso (ADR-414 §1/§7, «casos límite»).
 *
 * Cesar con marcas posteriores no rechaza de una: el servidor avisa cuántas
 * hay (409 `marcas_despues_del_cese`) y se vuelve a mandar con `confirmar`.
 * Las marcas NO se borran — quedan «fuera de período», no suman.
 */

import { useState, type FormEvent } from "react";
import { AlertTriangle, Ban, Loader2, RotateCcw } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn, limaDateKey } from "@/lib/utils";
import { etiquetaCorta } from "@/lib/rrhh/fechas";
import { AvisoRrhh, BOTON, CLASE_AREA, CLASE_CAMPO, CLASE_CHIP } from "../rrhh-form";
import { COLABORADOR_ESTADO_META, etiquetaModalidad, formatearFecha, iniciales, pluralizar } from "../rrhh-ui";
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

const FORM_ID = "rrhh-form-cese";
type ModalidadPagada = Exclude<Modalidad, "SIN_PAGO">;
const MODALIDADES: ModalidadPagada[] = ["HORA", "DIA", "SEMANA", "MES"];

export default function CesarColaboradorModal({ open, onClose, colaboradorId, colaborador, nivel, aboveModals, onGuardado }: Props) {
  const cesando = colaborador.estado !== "CESADO";
  // Poner una tarifa nueva en el reingreso pide nivel completo en el servidor
  // (`app/api/rrhh/colaboradores/[id]/route.ts`: `reingresar` con `tarifa`).
  // Reingresar SIN tarifa es gestion — eso ya lo permite el caller (ficha).
  const puedeTarifa = nivel === "completo";
  const [fecha, setFecha] = useState(() => limaDateKey());
  const [motivo, setMotivo] = useState("");
  const [conTarifa, setConTarifa] = useState(false);
  const [modalidad, setModalidad] = useState<ModalidadPagada>("DIA");
  const [monto, setMonto] = useState("");
  const [horas, setHoras] = useState("8");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ n: number; primera: string } | null>(null);

  const cambiarFecha = (valor: string) => {
    setFecha(valor);
    // El aviso contaba las marcas de la fecha ANTERIOR. Si quedaba, «Cesar
    // igual» mandaba `confirmar: true` con la fecha nueva y el servidor ya no
    // volvía a avisar (revisión 2026-09-14).
    setAviso(null);
  };

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
        const e = (await res.json().catch(() => ({}))) as { error?: string; n?: number; primera?: string };
        if (e.error === "marcas_despues_del_cese" && e.n && e.primera) {
          setAviso({ n: e.n, primera: e.primera });
          return;
        }
        setError("No se pudo cesar a la persona.");
        return;
      }
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { message?: string };
        setError(e.message ?? "No se pudo cesar a la persona.");
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
          // `vigenteDesde` es obligatorio en `tarifaInput`: sin él, reingresar con tarifa nueva daba 422.
          tarifa:
            puedeTarifa && conTarifa
              ? { modalidad, monto: Number(monto), vigenteDesde: fecha, ...(modalidad === "HORA" ? { horasJornada: Number(horas) } : {}) }
              : null,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { message?: string };
        setError(e.message ?? "No se pudo reingresar a la persona.");
        return;
      }
      onGuardado();
    } finally {
      setGuardando(false);
    }
  };

  const enviar = (e?: FormEvent) => {
    e?.preventDefault();
    if (guardando) return;
    if (!fecha) {
      setError(cesando ? "Elige el último día de trabajo." : "Elige el día en que vuelve.");
      return;
    }
    if (cesando) {
      if (motivo.trim().length < 3) {
        setError("Escribe el motivo (mínimo 3 letras).");
        return;
      }
      void enviarCese(Boolean(aviso));
      return;
    }
    if (puedeTarifa && conTarifa && !(Number(monto) > 0)) {
      setError("Pon un monto mayor a 0 o desmarca la tarifa nueva.");
      return;
    }
    if (puedeTarifa && conTarifa && modalidad === "HORA" && !(Number(horas) > 0 && Number(horas) <= 24)) {
      setError("La jornada tiene que ser de más de 0 y hasta 24 horas.");
      return;
    }
    void enviarReingreso();
  };

  const estado = COLABORADOR_ESTADO_META[colaborador.estado];
  const detalle = [
    colaborador.puesto?.nombre,
    colaborador.fechaIngreso && `ingresó el ${formatearFecha(colaborador.fechaIngreso)}`,
    !cesando && colaborador.fechaCese && `cesó el ${formatearFecha(colaborador.fechaCese)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={cesando ? "Cesar a una persona" : "Reingresar a una persona"}
      icon={cesando ? Ban : RotateCcw}
      aboveModals={aboveModals}
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={onClose} className={BOTON.fantasma}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} disabled={guardando} className={cesando ? BOTON.peligro : BOTON.primario}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            {cesando ? (aviso ? "Cesar igual" : "Cesar") : "Reingresar"}
          </button>
        </ModalFooter>
      }
    >
      <form id={FORM_ID} onSubmit={enviar} noValidate className={cn(MODAL_BODY, "space-y-4")}>
        <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-sunken)] p-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
          >
            {iniciales(colaborador.nombre)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{colaborador.nombre}</p>
            {detalle && <p className="truncate text-xs text-[var(--text-tertiary)]">{detalle}</p>}
          </div>
          <span className={cn(CLASE_CHIP, estado.claseChip)}>{estado.label}</span>
        </div>

        <Field
          label={cesando ? "Último día de trabajo" : "Día en que vuelve"}
          required
          hint={cesando ? "Desde el día siguiente ya no entra en la asistencia ni suma en lo ganado." : "Desde ese día vuelve a entrar en la asistencia."}
        >
          {(id) => <input id={id} type="date" value={fecha} onChange={(e) => cambiarFecha(e.target.value)} className={CLASE_CAMPO} />}
        </Field>

        {cesando ? (
          <Field label="Motivo" required hint="Queda anotado en su ficha.">
            {(id) => (
              <textarea
                id={id}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={300}
                className={CLASE_AREA}
                placeholder="Ej. Terminó la temporada de aserrío"
              />
            )}
          </Field>
        ) : puedeTarifa ? (
          <div className="space-y-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
            <label className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3">
              <input
                type="checkbox"
                checked={conTarifa}
                onChange={(e) => setConTarifa(e.target.checked)}
                className="row-span-2 mt-0.5 h-4 w-4 accent-[var(--accent)]"
              />
              <span className="text-sm font-semibold text-[var(--text-primary)]">Vuelve con otra tarifa</span>
              <span className="mt-0.5 text-xs leading-relaxed text-[var(--text-tertiary)]">Sin marcar, sigue con la última tarifa que tenía antes del cese.</span>
            </label>
            {conTarifa && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Se le paga">
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
                {modalidad === "HORA" && (
                  <Field label="Horas de la jornada" className="col-span-2">
                    {(id) => (
                      <input id={id} type="number" inputMode="decimal" min={1} max={24} step="0.5" value={horas} onChange={(e) => setHoras(e.target.value)} className={cn(CLASE_CAMPO, "tabular-nums")} />
                    )}
                  </Field>
                )}
              </div>
            )}
          </div>
        ) : (
          <AvisoRrhh tono="neutro">Sigue con la última tarifa que tenía antes del cese. Sólo un administrador puede ponerle una nueva.</AvisoRrhh>
        )}

        {aviso && (
          <AvisoRrhh tono="aviso" icono={AlertTriangle}>
            Tiene {pluralizar(aviso.n, "marca", "marcas")} de asistencia desde el {etiquetaCorta(aviso.primera)}. Se conservan, pero dejan de sumar en lo
            ganado. Si está bien, confirma con «Cesar igual».
          </AvisoRrhh>
        )}
      </form>
    </AdminModal>
  );
}
