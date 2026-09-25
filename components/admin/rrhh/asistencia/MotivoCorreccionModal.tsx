"use client";

/**
 * MotivoCorreccionModal — «¿por qué se corrige?» (ADR-417).
 *
 * Aparece SOLO cuando se cambia una marca que ya estaba guardada en el
 * servidor. La primera marca del día no es una corrección: no pregunta nada.
 * Tampoco pregunta si tocaste dos veces la misma celda antes de que se
 * guardara (el arrepentimiento de dos segundos no es una corrección: para el
 * libro, esa marca todavía no existía).
 *
 * Va con `aboveModals`: el flush del debounce puede caer con el historial de
 * la marca ya abierto, y un AdminModal en z-50 detrás de otro se monta invisible
 * y apaga los clics de la página entera.
 *
 * Se monta UNA vez, en `AsistenciaView`, por encima del día / la semana / el
 * mes: el hook que corrige vive en las tres hojas y pregunta por el buzón de
 * `lib/rrhh/motivo-correccion` sin saber quién le responde.
 *
 * Es obligatorio, pero de un toque: cinco motivos frecuentes guardan solos, y
 * el cuadro de texto queda para lo que no está en la lista. Toda la tanda que
 * se guarda junta comparte un motivo — corregir 20 filas pregunta UNA vez.
 */

import { useCallback, useEffect, useState } from "react";
import { PencilLine } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { cn } from "@/lib/utils";
import { etiquetaCorta } from "@/lib/rrhh/fechas";
import {
  MOTIVOS_FRECUENTES,
  MOTIVO_CORRECCION_MAX,
  responderMotivo,
  revisarMotivoCorreccion,
  suscribirPedidoDeMotivo,
  type CambioACorregir,
} from "@/lib/rrhh/motivo-correccion";
import { AvisoRrhh, BOTON, CLASE_AREA, claseChipFiltro } from "../rrhh-form";
import { ESTADO_ASISTENCIA_META, pluralizar } from "../rrhh-ui";

const FORM_ID = "rrhh-form-motivo-correccion";
/** Más que esto no se lee: se cuentan las que faltan. */
const MAX_FILAS_VISIBLES = 6;

function etiquetaEstado(estado: CambioACorregir["antes"]): string {
  return estado ? ESTADO_ASISTENCIA_META[estado].label : "sin marca";
}

export default function MotivoCorreccionModal() {
  const [cambios, setCambios] = useState<CambioACorregir[] | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return suscribirPedidoDeMotivo((pedido) => {
      setCambios(pedido);
      setTexto("");
      setError(null);
    });
  }, []);

  const cerrar = useCallback(() => {
    setCambios(null);
    responderMotivo({ tipo: "cancelado" });
  }, []);

  const confirmar = useCallback((valor: string) => {
    const revision = revisarMotivoCorreccion(valor);
    if (!revision.ok) {
      setError(revision.message);
      return;
    }
    setCambios(null);
    responderMotivo({ tipo: "motivo", motivo: revision.motivo });
  }, []);

  const abierto = cambios !== null && cambios.length > 0;
  const n = cambios?.length ?? 0;
  const visibles = cambios?.slice(0, MAX_FILAS_VISIBLES) ?? [];
  const ocultas = n - visibles.length;

  return (
    <AdminModal
      open={abierto}
      onClose={cerrar}
      aboveModals
      title="¿Por qué se corrige?"
      description={
        n === 1 && cambios
          ? `${cambios[0].nombre} · ${etiquetaCorta(cambios[0].fecha)} — esta marca ya estaba guardada`
          : pluralizar(n, "marca ya guardada", "marcas que ya estaban guardadas")
      }
      icon={PencilLine}
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={cerrar} className={BOTON.fantasma}>
            No corregir
          </button>
          <button type="submit" form={FORM_ID} className={BOTON.primario}>
            Guardar la corrección
          </button>
        </ModalFooter>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          confirmar(texto);
        }}
        className={cn(MODAL_BODY, "space-y-4")}
      >
        <ul className="space-y-1.5 rounded-xl bg-[var(--surface-sunken)] p-3">
          {visibles.map((c) => (
            <li key={`${c.colaboradorId}|${c.fecha}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-semibold text-[var(--text-primary)]">{c.nombre}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{etiquetaCorta(c.fecha)}</span>
              <span className="text-[var(--text-secondary)]">
                {etiquetaEstado(c.antes)} <span className="sr-only">pasa a</span>
                <span aria-hidden>→</span> {etiquetaEstado(c.despues)}
              </span>
            </li>
          ))}
          {ocultas > 0 && (
            <li className="text-xs text-[var(--text-tertiary)]">y {pluralizar(ocultas, "marca más", "marcas más")}</li>
          )}
        </ul>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Toca el motivo y se guarda</p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_FRECUENTES.map((m) => (
              <button key={m} type="button" onClick={() => confirmar(m)} className={claseChipFiltro(false)}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <Field label="Otro motivo" hint="Queda en el historial de la marca, con tu usuario y la hora.">
          {(id) => (
            <textarea
              id={id}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                if (error) setError(null);
              }}
              rows={3}
              maxLength={MOTIVO_CORRECCION_MAX}
              className={CLASE_AREA}
              placeholder="Ej. El capataz avisó que estuvo en el otro patio"
            />
          )}
        </Field>

        <AvisoRrhh tono="neutro">
          Sin motivo la corrección no se guarda: la marca vuelve a como estaba. Es lo que se mira en una fiscalización.
        </AvisoRrhh>
      </form>
    </AdminModal>
  );
}
