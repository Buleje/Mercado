"use client";

/**
 * «Imprimir en talonario» de la GTF de SALIDA de un despacho del Libro CTP
 * (Brandon 27-10: «que tenga las funciones parecidas… para la madera que
 * sale, sea aserrada o directa en trozas»). Es el mismo talonario de la guía
 * del Libro TH (`TalonarioModal`): sólo cambia de dónde salen los valores, que
 * los arma el servidor para la guía ENTERA (todos sus productos) —los mismos
 * de la hoja SERFOR—. La forma se ancla en la cabecera de la guía (su menor
 * `lineNo`), se abra desde la línea que sea.
 */

import { useMemo } from "react";
import { Printer, RotateCcw } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { GuiaDelTalonario } from "@/lib/forestal/gtf-matricial-fuente";
import { faltanParaImprimir } from "@/lib/forestal/guia-salida-imprimible";
import { Btn, ModalFooter, PanelSkeleton } from "./ctp-shared";
import { useGuiaSalida } from "./hooks/use-guia-salida";
import TalonarioModal from "./TalonarioModal";

export default function CtpDespachoTalonarioModal({ despachoId, gtfNumber, onClose }: { despachoId: string; gtfNumber: string; onClose: () => void }) {
  const g = useGuiaSalida(despachoId);
  const cabecera = g.datos?.guia.despachoId ?? despachoId;
  const ref = useMemo((): GuiaDelTalonario => ({ tipo: "despacho", id: cabecera }), [cabecera]);

  /* El talonario imprime el original numerado: con datos faltantes se dice qué falta, como la hoja SERFOR. */
  const faltan = g.datos ? faltanParaImprimir(g.datos.guia) : null;
  if (g.datos && !faltan) {
    const { guia, entradas } = g.datos;
    return (
      <TalonarioModal
        fuente={{ ref, numero: guia.gtfNumber, titular: guia.titular || null, entradas, conLista: guia.trozas.length > 0 }}
        onClose={onClose}
      />
    );
  }

  /* Mientras llega la guía (o si no se pudo leer): la misma ventana, sin hoja. */
  return (
    <AdminModal
      open
      onClose={onClose}
      variant="fullscreen"
      icon={Printer}
      title="Imprimir en talonario"
      description={`GTF ${gtfNumber}`}
      footer={
        <ModalFooter error={g.error ?? faltan}>
          {g.error && (
            <Btn variant="secondary" onClick={g.reintentar}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Reintentar
            </Btn>
          )}
          <Btn variant="ghost" onClick={onClose}>
            Cerrar
          </Btn>
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>{g.error || faltan ? null : <PanelSkeleton />}</div>
    </AdminModal>
  );
}
