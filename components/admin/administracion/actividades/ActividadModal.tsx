"use client";

/**
 * ActividadModal — crear o editar una actividad de la agenda (ADR-501 §3):
 * qué hay que hacer, cuándo se repite y cómo avisa. Tres bloques en una
 * ventana; la frase de la recurrencia se arma mientras eliges.
 */
import { useId } from "react";
import { Repeat } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { CAMPO_ALTO } from "@/components/admin/planificacion/piezas/clases";
import { button } from "@/components/ui-system/button-variants";
import { MAX_NOMBRE_ACTIVIDAD } from "@/lib/agenda/schemas";
import type { ActividadDTO } from "@/lib/agenda/tipos";
import { CamposAviso } from "./CamposAviso";
import { CamposRegla } from "./CamposRegla";
import { EditorRecurrencia } from "./EditorRecurrencia";
import { useActividadForm, type Borrador } from "./use-actividad-form";

interface Props {
  actividad: ActividadDTO | null;
  /** Borrador de una sugerida (la de la cuenta de un tercero). */
  inicial?: Borrador;
  onCerrar: () => void;
  /** Se abre desde otra ventana (el centro «Pendientes y avisos»): va por encima de ella. */
  encima?: boolean;
}

const BLOQUE = "space-y-3 border-t border-[var(--rule-soft)] pt-4";

export function ActividadModal({ actividad, inicial, onCerrar, encima = false }: Props) {
  const formId = useId();
  const { b, cambiar, cambiarRegla, guardar, error, guardando } = useActividadForm(actividad, inicial, onCerrar);

  return (
    <AdminModal
      open
      onClose={onCerrar}
      aboveModals={encima}
      title={actividad ? "Editar actividad" : "Nueva actividad"}
      description={actividad ? actividad.nombre : "Lo que se repite en tu negocio y quieres que te recuerde"}
      icon={Repeat}
      size="lg"
      footer={
        <ModalFooter error={error} atajo={!error}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className={button({ variant: "primary" })} disabled={guardando}>
            {guardando ? "Guardando…" : actividad ? "Guardar cambios" : "Crear actividad"}
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
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void guardar();
          }
        }}
      >
        <CamposRegla b={b} cambiar={cambiar} cambiarRegla={cambiarRegla} />

        <Field label="Nombre" required hint="Así sale en Hoy, en el calendario y en el aviso">
          <input
            type="text"
            className={CAMPO_ALTO}
            value={b.nombre}
            maxLength={MAX_NOMBRE_ACTIVIDAD}
            placeholder="Ej.: pagar la luz"
            onChange={(e) => cambiar("nombre", e.target.value)}
          />
        </Field>

        <section className={BLOQUE} aria-label="Cuándo se repite">
          <CardTitle as="h3">Cuándo</CardTitle>
          <EditorRecurrencia valor={b.recurrencia} hora={b.hora} onCambiar={(r) => cambiar("recurrencia", r)} />
        </section>

        <section className={BLOQUE} aria-label="Cómo avisa">
          <CardTitle as="h3">Aviso</CardTitle>
          <CamposAviso b={b} cambiar={cambiar} />
        </section>
      </form>
    </AdminModal>
  );
}
