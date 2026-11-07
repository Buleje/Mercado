"use client";

/**
 * «Completar las guardadas» (Cubicador, 24-10): las cubicaciones guardadas sin
 * comprador del Directorio, una fila cada una, para atarlas a su ficha, CCNN y
 * GTF. La lista se fija al abrir: la que se guarda queda a la vista con su
 * «Guardada» en vez de desaparecer.
 */
import { useState } from "react";
import { UserCheck } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { button } from "@/components/ui-system/button-variants";
import FilaParaAtar from "./cubicador-atar-fila";
import { useLibretaDeLaFicha } from "./hooks/use-libreta-de-la-ficha";

export default function AtarGuardadasModal({ cubicaciones, aboveModals, onGuardada, onRecargar, onClose }: {
  cubicaciones: CubicacionRegistro[];
  aboveModals?: boolean;
  /** Se guardó una: la sección relee la lista. */
  onGuardada: () => void;
  onRecargar: () => void;
  onClose: () => void;
}) {
  const libreta = useLibretaDeLaFicha(true);
  const [hechos, setHechos] = useState<Record<string, string>>({});
  const listas = Object.keys(hechos).length;
  return (
    <AdminModal
      open
      onClose={onClose}
      size="xl"
      title="Completar las guardadas"
      description={`${listas} de ${cubicaciones.length} atadas · el comprador, la CCNN y la GTF salen del Directorio o los escribes`}
      icon={UserCheck}
      claveVentana="cubicador-atar-guardadas"
      aboveModals={aboveModals}
      footer={<div className="flex justify-end"><button type="button" className={button({ variant: "secondary", className: "px-4" })} onClick={onClose}>Cerrar</button></div>}
    >
      <ul className={`${MODAL_BODY} space-y-3`} data-vista="cubicador-atar-guardadas">
        {cubicaciones.map((c) => (
          <FilaParaAtar
            key={`${c.id}:${c.updatedAt}`}
            c={c}
            libreta={libreta}
            hecho={hechos[c.id]}
            alGuardar={(resumen) => { setHechos((h) => ({ ...h, [c.id]: resumen })); onGuardada(); }}
            onRecargar={onRecargar}
          />
        ))}
      </ul>
    </AdminModal>
  );
}
