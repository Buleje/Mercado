"use client";

import { TemplateIcon } from "./ayudas-visuales-contratos";
import { CardTitle } from "@buleje/design-system";
import { X, CheckCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ContractTemplate } from "@/lib/contratos/plantillas";
import type { EstadoContratos } from "./use-contratos";
export default function WizardCabecera({ arch }: { arch: EstadoContratos }) {
  const { setSelectedTemplate, setWizardStep, setWizardData, wizardGroupLabels, wizardStep } = arch;
  /* El asistente sólo se muestra con plantilla elegida (la rama vive en VistaCrear). */
  const selectedTemplate = arch.selectedTemplate as ContractTemplate;
  return (
    <>
                    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-[var(--accent-ink)] dark:text-[var(--accent)]">
                          <TemplateIcon icon={selectedTemplate.icon} className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">{selectedTemplate.name}</CardTitle>
                          <p className="text-xs text-[var(--text-tertiary)]">{selectedTemplate.legalBasis}</p>
                        </div>
                        <button aria-label="Cerrar" onClick={() => { setSelectedTemplate(null); setWizardStep(0); setWizardData({}); }} className="ml-auto text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                          <X className="h-5 w-5" />
                        </button>
                      </div>

                      {/* Step Indicators */}
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {wizardGroupLabels.map((label, i) => (
                          <button
                            key={i}
                            onClick={() => setWizardStep(i)}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
                              wizardStep === i ? "bg-primary text-white" : wizardStep > i ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                            )}
                          >
                            <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-bold",
                              wizardStep === i ? "bg-white/20 text-white" : wizardStep > i ? "bg-primary text-white" : "bg-[var(--rule-soft)] text-[var(--text-secondary)]"
                            )}>
                              {wizardStep > i ? <CheckCircle className="h-3 w-3" /> : i + 1}
                            </span>
                            <span className="hidden sm:inline">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
    </>
  );
}