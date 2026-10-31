"use client";

/**
 * DarAdelantoModal — «a veces piden plata» (Brandon 24-10 → 25-10: «poner
 * adelantos ahí mismo a esa persona … con los detalles y todos los campos bien
 * hechos»). Anota el adelanto en SU cuenta de Mi Plata como descuento por
 * planilla: el pago del sábado lo resta solo. Si todavía no tiene cuenta, el
 * servidor le vincula la persona con su mismo documento o le abre una.
 *
 * Dos columnas en escritorio (la plata | el respaldo), una en el celular. El
 * estado y el guardado viven en `use-dar-adelanto`; al guardar se puede firmar
 * el recibo con la misma ventana de Mi Plata.
 */

import type { FormEvent } from "react";
import { HandCoins, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import FirmarReciboModal from "@/components/admin/adelantos/firma/FirmarReciboModal";
import type { PagoSemanaDTO } from "@/lib/rrhh/pago-semana";
import { BOTON } from "../rrhh-form";
import CamposDarAdelanto from "./CamposDarAdelanto";
import ResumenDelAdelanto from "./ResumenDelAdelanto";
import { useDarAdelanto, type PersonaParaAdelanto } from "./use-dar-adelanto";

export type { PersonaParaAdelanto } from "./use-dar-adelanto";

const FORM_ID = "rrhh-form-dar-adelanto";

interface Props {
  personas: readonly PersonaParaAdelanto[];
  /** La persona ya elegida (desde su ficha o su fila). */
  colaboradorId?: string;
  /** El pago del sábado de esta semana (sólo el dueño lo ve): arma la vista previa. */
  pago?: PagoSemanaDTO | null;
  onClose: () => void;
  onDado: () => void;
  aboveModals?: boolean;
}

export default function DarAdelantoModal({ personas, colaboradorId, pago, onClose, onDado, aboveModals }: Props) {
  const d = useDarAdelanto({ personas, colaboradorId, pago, onDado });

  if (d.aFirmar) {
    // El adelanto ya está anotado: cerrar la firma (firmada o no) cierra todo.
    return <FirmarReciboModal adelantoId={d.aFirmar} onClose={onDado} onGuardado={onDado} />;
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    void d.enviar();
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Dar adelanto"
      description={d.persona?.nombre}
      icon={HandCoins}
      size="lg"
      aboveModals={aboveModals}
      footer={
        <ModalFooter error={d.error}>
          <button type="button" onClick={onClose} className={BOTON.fantasma}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} disabled={d.guardando} className={BOTON.primario}>
            {d.guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            Dar adelanto
          </button>
        </ModalFooter>
      }
    >
      <form id={FORM_ID} onSubmit={enviar} noValidate className={`${MODAL_BODY} grid gap-4 sm:grid-cols-2`}>
        <CamposDarAdelanto
          form={d.form}
          cambiar={d.cambiar}
          personas={personas}
          conPersonaFija={Boolean(colaboradorId)}
          persona={d.persona}
          hoy={d.hoy}
          esHoy={d.esHoy}
          firmar={d.firmar}
          onFirmar={d.setFirmar}
          sinCamara={Boolean(aboveModals)}
        />
        <ResumenDelAdelanto descuento={d.descuento} vista={d.vista} />
      </form>
    </AdminModal>
  );
}
