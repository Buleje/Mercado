"use client";

import { BlockTitle } from "@buleje/design-system";
import CampoWizard from "./CampoWizard";
import type { EstadoContratos } from "./use-contratos";
export default function WizardCampos({ arch }: { arch: EstadoContratos }) {
  const { wizardGroupLabels, wizardStep, wizardGroups } = arch;
  return (
    <>
                      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6 space-y-4">
                        <BlockTitle>{wizardGroupLabels[wizardStep]}</BlockTitle>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {wizardGroups[wizardStep]?.fields.map(field => <CampoWizard key={field.key} arch={arch} field={field} />)}
                        </div>
                      </div>
    </>
  );
}