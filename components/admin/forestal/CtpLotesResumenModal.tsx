"use client";

/**
 * Resumen de los lotes elegidos (Brandon, 2026-11-03): «un modal de resumen por
 * tipo especie y al lado una tabla de detalles del lote escogido… y en ese
 * detalle poder seleccionar (check) para que me bote otro resumen tipo especie,
 * igual como el otro pero aparte, según lo escogido».
 *
 * A la izquierda, por especie: arriba todos los elegidos en la vista y abajo
 * sólo los marcados en el detalle. A la derecha, el detalle lote por lote. Sólo
 * mira: no escribe nada en el libro.
 */

import { useMemo, useState } from "react";
import { Sigma } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { filaDetalleLote, resumenPorEspecie } from "@/lib/forestal/lotes-resumen-especie";
import { BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import { TablaDetalleLotes, TablaResumenEspecie, type ColumnasOpcionales } from "./ctp-lotes-resumen-tablas";

const TITULO = "text-sm font-bold text-[var(--text-primary)]";
const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`;

export default function CtpLotesResumenModal({
  lotes,
  onClose,
}: {
  lotes: readonly LoteAserrio[];
  onClose: () => void;
}) {
  const filas = useMemo(
    () => lotes.map(filaDetalleLote).sort((a, b) => a.especie.localeCompare(b.especie, "es") || a.code.localeCompare(b.code, "es")),
    [lotes],
  );
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set());

  const todos = useMemo(() => resumenPorEspecie(filas), [filas]);
  const deMarcados = useMemo(() => resumenPorEspecie(filas.filter((f) => marcados.has(f.id))), [filas, marcados]);
  const col: ColumnasOpcionales = {
    salio: filas.some((f) => f.salidoM3 > 1e-4),
    sinAserrar: filas.some((f) => f.sinAserrarM3 > 1e-4),
  };

  const alternar = (id: string) =>
    setMarcados((prev) => {
      const sig = new Set(prev);
      if (sig.has(id)) sig.delete(id);
      else sig.add(id);
      return sig;
    });
  const alternarTodos = () =>
    setMarcados((prev) => (filas.every((f) => prev.has(f.id)) ? new Set() : new Set(filas.map((f) => f.id))));

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Resumen de los lotes elegidos"
      description={`${plural(filas.length, "lote", "lotes")} · ${plural(todos.especies.length, "especie", "especies")}`}
      icon={Sigma}
      ayuda={
        <InfoTip
          title="Cómo se lee"
          what="Las mismas cifras que la tarjeta de cada lote, sumadas por especie. Marca lotes en el detalle para ver su resumen aparte."
          example="Marca 25 y 26: abajo a la izquierda sale solo el tornillo de esos dos."
        />
      }
      size="planilla"
      aboveModals
      claveVentana="ctp-lotes-resumen"
      footer={
        <ModalFooter>
          <button type="button" onClick={onClose} className={BOTON_SECUNDARIO}>
            Cerrar
          </button>
        </ModalFooter>
      }
    >
      <div className="grid gap-5 px-5 py-5 sm:px-6 xl:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]">
        <div className="min-w-0 space-y-5">
          <section className="space-y-2">
            <CardTitle as="h4" className={TITULO}>
              Por especie · {plural(filas.length, "lote elegido", "lotes elegidos")}
            </CardTitle>
            <TablaResumenEspecie resumen={todos} col={col} etiqueta="Resumen por especie de todos los elegidos" />
          </section>

          <section className="space-y-2">
            <CardTitle as="h4" className={TITULO}>
              Por especie · {marcados.size > 0 ? plural(marcados.size, "lote marcado", "lotes marcados") : "los que marques"}
            </CardTitle>
            {marcados.size > 0 ? (
              <TablaResumenEspecie resumen={deMarcados} col={col} etiqueta="Resumen por especie de los lotes marcados" />
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-5 text-center text-sm text-[var(--text-tertiary)]">
                Marca lotes en el detalle para ver su resumen aparte.
              </p>
            )}
          </section>
        </div>

        <section className="min-w-0 space-y-2">
          <CardTitle as="h4" className={TITULO}>
            Detalle de los lotes
          </CardTitle>
          <TablaDetalleLotes
            filas={filas}
            marcados={marcados}
            onAlternar={alternar}
            onAlternarTodos={alternarTodos}
            col={col}
          />
        </section>
      </div>
    </AdminModal>
  );
}
