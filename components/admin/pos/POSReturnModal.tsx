"use client";

import AdminModal from "@/components/admin/shared/AdminModal";
import { RotateCcw } from "@buleje/design-system/icons";
import { useDevolucion } from "@/components/admin/pos/devolucion/use-devolucion";
import DevolucionPasoBuscar from "@/components/admin/pos/devolucion/DevolucionPasoBuscar";
import DevolucionPasoItems from "@/components/admin/pos/devolucion/DevolucionPasoItems";
import DevolucionResultado from "@/components/admin/pos/devolucion/DevolucionResultado";

export default function POSReturnModal({
  isOpen,
  onClose,
  onReturnComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  onReturnComplete?: () => void;
}) {
  const dev = useDevolucion({ isOpen, onClose, onReturnComplete });
  const { step, resetAndClose } = dev;

  return (
    <AdminModal
      open={isOpen}
      onClose={resetAndClose}
      title="Devolución"
      description={step < 3 ? `Paso ${step} de 2` : undefined}
      icon={RotateCcw}
      size="lg"
      claveVentana="pos-devolucion"
    >
      {/* Step 1: Search sale */}
      {step === 1 && <DevolucionPasoBuscar dev={dev} />}

      {/* Step 2: Select items to return */}
      {step === 2 && dev.selectedSale && (
        <DevolucionPasoItems dev={dev} selectedSale={dev.selectedSale} />
      )}

      {/* Step 3: Result */}
      {step === 3 && dev.result && <DevolucionResultado dev={dev} result={dev.result} />}
    </AdminModal>
  );
}
