"use client";

/**
 * MarcarModal — marcar un día a mano con algo más que el clic de «Hecha»:
 * hecha con una nota, «no tocaba» (con el porqué) o posponer a otro día
 * (`PUT /api/admin/agenda/ocurrencias`, ADR-501 §7). La marca manual gana
 * sobre lo que diga la fuente.
 */
import { useId, useState } from "react";
import { Ban, CheckCircle2, SkipForward } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { AREA_TEXTO, CAMPO_ALTO } from "@/components/admin/planificacion/piezas/clases";
import { button } from "@/components/ui-system/button-variants";
import { useAgenda } from "@/hooks/use-agenda";
import { MAX_NOTA_AGENDA } from "@/lib/agenda/schemas";
import type { EstadoManual, FechaKey, OcurrenciaDTO } from "@/lib/agenda/tipos";
import { fechaLarga, hoyKey, sumarDias } from "./fechas";

const COPIA: Record<EstadoManual, { titulo: string; boton: string; icon: typeof Ban; aviso: string; placeholder: string }> = {
  hecha: { titulo: "Marcar como hecha", boton: "Marcar hecha", icon: CheckCircle2, aviso: "Quedó como hecha", placeholder: "Ej.: revisé con Juan, todo cuadra" },
  omitida: { titulo: "Este día no tocaba", boton: "Guardar", icon: Ban, aviso: "Quedó como «no tocaba»", placeholder: "Ej.: feriado, no se abrió" },
  pospuesta: { titulo: "Posponer", boton: "Posponer", icon: SkipForward, aviso: "Quedó pospuesta", placeholder: "Ej.: el contador viene el jueves" },
};

/** Mañana, o el día siguiente al de la actividad si ya es más adelante. */
export function diaParaPosponer(fecha: FechaKey, hoy: FechaKey = hoyKey()): FechaKey {
  return sumarDias(fecha > hoy ? fecha : hoy, 1);
}

interface Props {
  ocurrencia: OcurrenciaDTO;
  modo: EstadoManual;
  onCerrar: () => void;
}

export function MarcarModal({ ocurrencia: o, modo, onCerrar }: Props) {
  const { marcar } = useAgenda();
  const formId = useId();
  const copia = COPIA[modo];
  const [nota, setNota] = useState(o.nota ?? "");
  const [posponerA, setPosponerA] = useState<FechaKey>(() => o.posponerA ?? diaParaPosponer(o.fecha));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (modo === "pospuesta" && !(posponerA > o.fecha)) return setError("Elige un día después del " + fechaLarga(o.fecha) + ".");
    setGuardando(true);
    const ok = await marcar(
      { actividadId: o.actividadId, fecha: o.fecha, estado: modo, posponerA: modo === "pospuesta" ? posponerA : null, nota: nota.trim() || null },
      modo === "pospuesta" ? `${copia.aviso} al ${fechaLarga(posponerA)}` : copia.aviso,
    );
    setGuardando(false);
    if (ok) onCerrar();
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={copia.titulo}
      description={`${o.nombre} · ${fechaLarga(o.fecha)}`}
      icon={copia.icon}
      size="sm"
      footer={
        <ModalFooter error={error}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className={button({ variant: "primary" })} disabled={guardando}>
            {guardando ? "Guardando…" : copia.boton}
          </button>
        </ModalFooter>
      }
    >
      <form
        id={formId}
        className={`${MODAL_BODY} space-y-4`}
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        {modo === "pospuesta" && (
          <Field label="¿Para qué día?" hint="Ese día vuelve a aparecer en Hoy y en el calendario.">
            <input
              type="date"
              className={CAMPO_ALTO}
              value={posponerA}
              min={sumarDias(o.fecha, 1)}
              onChange={(e) => {
                setPosponerA(e.target.value);
                setError(null);
              }}
              required
            />
          </Field>
        )}
        <Field label="Nota (opcional)" hint={`Hasta ${MAX_NOTA_AGENDA} letras. La ve quien abra este día.`}>
          <textarea
            className={AREA_TEXTO}
            value={nota}
            maxLength={MAX_NOTA_AGENDA}
            placeholder={copia.placeholder}
            onChange={(e) => setNota(e.target.value)}
          />
        </Field>
      </form>
    </AdminModal>
  );
}
