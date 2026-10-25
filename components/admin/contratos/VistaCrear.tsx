"use client";

import { AvisoContratoParaPersona } from "@/components/admin/contratos/contrato-para-persona";
import { BookOpen } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import WizardCabecera from "./WizardCabecera";
import WizardProgreso from "./WizardProgreso";
import WizardCampos from "./WizardCampos";
import WizardVistaPrevia from "./WizardVistaPrevia";
import WizardConfirmar from "./WizardConfirmar";
import WizardNavegacion from "./WizardNavegacion";
import type { EstadoContratos } from "./use-contratos";
export default function VistaCrear({ arch }: { arch: EstadoContratos }) {
  const { paraPersona, selectedTemplate, setActiveTab, wizardStep } = arch;
  return (
    <>
              <div className="space-y-6">
                {paraPersona.persona && <AvisoContratoParaPersona persona={paraPersona.persona} onQuitar={paraPersona.quitar} />}
                {!selectedTemplate ? (
                  <div className="text-center py-16">
                    <BookOpen className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-3" />
                    <CardTitle className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)] mb-2">Selecciona una plantilla</CardTitle>
                    <p className="text-sm text-[var(--text-secondary)] mb-6">Elige una plantilla legal para empezar.</p>
                    <button onClick={() => setActiveTab("plantillas")} className="bg-primary text-white px-6 min-h-11 rounded-xl font-medium hover:bg-primary-dark">Ver Plantillas</button>
                  </div>
                ) : (
                  <>
                    {/* Wizard Header */}
                    <WizardCabecera arch={arch} />

                    {/* Progress Bar */}
                    <WizardProgreso arch={arch} />

                    {/* Wizard Steps 0-2: Form Fields */}
                    {wizardStep < 3 && (
                      <WizardCampos arch={arch} />
                    )}

                    {/* Step 3: Preview */}
                    {wizardStep === 3 && (
                      <WizardVistaPrevia arch={arch} />
                    )}

                    {/* Step 4: Confirm */}
                    {wizardStep === 4 && (
                      <WizardConfirmar arch={arch} />
                    )}

                    {/* Navigation Buttons */}
                    <WizardNavegacion arch={arch} />
                  </>
                )}
              </div>
    </>
  );
}