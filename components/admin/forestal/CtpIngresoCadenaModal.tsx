"use client";

/**
 * CtpIngresoCadenaModal — vista enfocada de la cadena HACIA ADELANTE de un
 * ingreso, abierta desde el botón "Cadena" de la tabla/cards de Ingresos.
 *
 * Reusa la misma sección que el detalle completo (CtpTrazaForward) — single
 * source: acá el operador llega en 1 clic sin pasar por toda la ficha, igual
 * que el botón "Cadena" de Producción y Despacho.
 */

import AdminModal from "@/components/admin/shared/AdminModal";
import { Share2 } from "@buleje/design-system/icons";
import TrazaForwardSection from "./CtpTrazaForward";
import { MODAL_BODY, type WoodEntry } from "./ctp-shared";

export default function CtpIngresoCadenaModal({ entry, onClose }: { entry: WoodEntry; onClose: () => void }) {
  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      title={`Cadena · ${entry.gtfNumber}`}
      description={`${entry.speciesCommonName} · ${Number(entry.volumeM3).toFixed(4)} m³`}
      icon={Share2}
    >
      <div className={MODAL_BODY}>
        <TrazaForwardSection entryId={entry.id} />
      </div>
    </AdminModal>
  );
}
