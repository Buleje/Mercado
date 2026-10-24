"use client";

import { CreditCard } from "@buleje/design-system/icons";
import { WizardProgress } from "@/components/admin/notas-credito/NcWizardPiezas";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";
import NcPasoDocumento from "@/components/admin/notas-credito/NcPasoDocumento";
import NcPasoMotivo from "@/components/admin/notas-credito/NcPasoMotivo";
import NcPasoConfirmar from "@/components/admin/notas-credito/NcPasoConfirmar";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";

/** Ventana «Nueva nota de crédito» (asistente de 3 pasos). Pieza de NotasCreditoModule: recibe `useNotasCredito` entero. */
export default function NcAsistente({ nc }: { nc: NotasCreditoVista }) {
  const { showNew, wizardStep, resetWizard } = nc;
  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── NEW NC WIZARD — Visual Document Picker ────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <AdminModal
        open={showNew}
        onClose={resetWizard}
        title="Nueva nota de crédito"
        icon={CreditCard}
        size="lg"
        claveVentana="notas-credito-nueva"
      >
        <div className={MODAL_BODY}>
          <WizardProgress step={wizardStep} />
          {/* ═══════════════════════════════════════════════════════ */}
          {/* STEP 0: Visual Document Picker Gallery                */}
          {/* ═══════════════════════════════════════════════════════ */}
          <NcPasoDocumento nc={nc} />

          {/* ═══════════════════════════════════════════════════════ */}
          {/* STEP 1: Motivo, Items & Amounts                       */}
          {/* ═══════════════════════════════════════════════════════ */}
          <NcPasoMotivo nc={nc} />

          {/* ═══════════════════════════════════════════════════════ */}
          {/* STEP 2: Confirmation & Summary                        */}
          {/* ═══════════════════════════════════════════════════════ */}
          <NcPasoConfirmar nc={nc} />
        </div>
      </AdminModal>
    </>
  );
}
