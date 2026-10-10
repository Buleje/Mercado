"use client";

/**
 * Panel «Lotes» de la Distribución de rolliza (Brandon, 2026-10-03): «podré
 * ahí mismo crear lote (en caso que no tengo o no haya) o usar un lote ya
 * creado; dará sugerencias de lotes … para crear varias de una sola vez; de
 * esos lotes, ahí mismo, en la página de trozas podré escoger e integrarlo».
 *
 * Tres pestañas en un solo modal (no modales anidados):
 *  · «Sugeridos del patio» — crear varios lotes de una vez;
 *  · «Lotes del Libro» — traer un lote como bloque o vincularlo a uno;
 *  · «Trozas del bloque» — elegir piezas e integrarlas en el lote del bloque.
 *
 * Todo lote tiene trozas REALES del patio (T1) y el descuento de volumen es el
 * de siempre: el consumo al registrar la producción. Lógica en
 * `hooks/use-panel-lotes.ts` y `lib/forestal/panel-lotes-reparto.ts`.
 */

import { useState } from "react";
import { Boxes, Check } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { lotesParaUsar } from "@/lib/forestal/panel-lotes-reparto";
import { usePanelLotes, type PanelLotesProps } from "./hooks/use-panel-lotes";
import RepartoLotesPatio from "./reparto-lotes-patio";
import RepartoLotesDelLibro from "./reparto-lotes-del-libro";
import RepartoTrozasDelBloque from "./reparto-trozas-del-bloque";
import { BTN_PRIMARIO } from "./reparto-panel-lotes-ui";

type Vista = "patio" | "libro" | "trozas";

/** El botón de la barra de la Distribución + su modal (se monta sólo abierto). */
export default function RepartoPanelLotes(props: PanelLotesProps) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Crear lotes del patio, usar uno del Libro o elegir las trozas de un bloque"
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <Boxes className="h-3.5 w-3.5" aria-hidden /> Lotes
      </button>
      {abierto && <PanelLotesModal {...props} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function PanelLotesModal({ onCerrar, ...props }: PanelLotesProps & { onCerrar: () => void }) {
  const panel = usePanelLotes(props);
  const { bloques, estadoLotes } = props;
  const [vista, setVista] = useState<Vista>("patio");
  const [bloqueId, setBloqueId] = useState<string | null>(null);
  const irATrozas = (id: string) => {
    setBloqueId(id);
    setVista("trozas");
  };
  const sugeridos = panel.patio?.propuestas.length;
  const delLibro = lotesParaUsar(estadoLotes.lotes, bloques).length;

  return (
    <AdminModal
      open
      onClose={onCerrar}
      icon={Boxes}
      variant="info"
      title="Lotes de la Distribución"
      description="Crea lotes con las trozas del patio, usa uno ya creado o elige las trozas de un bloque."
      footer={
        <button type="button" onClick={onCerrar} className={BTN_PRIMARIO}>
          <Check className="h-4 w-4" aria-hidden /> Listo
        </button>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <SegmentedControl<Vista>
          value={vista}
          onChange={setVista}
          size="md"
          label="Qué hacer con los lotes"
          className="w-full overflow-x-auto"
          options={[
            { value: "patio", label: "Sugeridos", badge: sugeridos || undefined },
            { value: "libro", label: "Lotes del Libro", badge: delLibro || undefined },
            { value: "trozas", label: "Trozas" },
          ]}
        />
        {vista === "patio" && <RepartoLotesPatio panel={panel} />}
        {vista === "libro" && (
          <RepartoLotesDelLibro
            panel={panel}
            lotes={estadoLotes.lotes}
            bloques={bloques}
            cargando={estadoLotes.cargando}
            onElegirTrozas={irATrozas}
          />
        )}
        {vista === "trozas" && (
          <RepartoTrozasDelBloque panel={panel} bloques={bloques} estado={estadoLotes} bloqueId={bloqueId} onBloque={setBloqueId} />
        )}
      </div>
    </AdminModal>
  );
}
