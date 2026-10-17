"use client";

/**
 * Los grupos de especies, en su propia ventana (ADR-430).
 *
 * Se abre desde el precio de un cliente, que vive dentro de la ficha del
 * Directorio —otro modal—: por eso `aboveModals`. Sin él se montaba detrás y
 * Radix apagaba los clics de la página (memoria `modales-anidados-z-index-radix`).
 * El mismo editor vive también en «Especies del aserradero».
 */

import { Layers } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { especiesDisponibles } from "@/lib/forestal/especies-catalogo";
import { Btn, ModalBody } from "./ctp-shared";
import CtpEspeciesGrupos from "./CtpEspeciesGrupos";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";

export default function CtpEspeciesGruposModal({
  onClose,
  onCambio,
}: {
  onClose: () => void;
  onCambio?: () => void;
}) {
  const cat = useEspeciesCatalogo();
  return (
    <AdminModal
      open
      onClose={onClose}
      aboveModals
      icon={Layers}
      title="Grupos de especies"
      description="Son de la planta: los usan su tarifa y el precio de cada cliente. Cada especie va en un solo grupo."
      footer={
        <div className="flex w-full justify-end">
          <Btn variant="primary" onClick={onClose}>
            Listo
          </Btn>
        </div>
      }
    >
      <ModalBody>
        <CtpEspeciesGrupos
          grupos={cat.grupos}
          especies={especiesDisponibles(cat.catalogo)}
          guardando={cat.guardando}
          error={cat.error}
          onGuardar={async (input) => {
            const r = await cat.guardarGrupos(input);
            if (r) onCambio?.();
            return r;
          }}
        />
      </ModalBody>
    </AdminModal>
  );
}
