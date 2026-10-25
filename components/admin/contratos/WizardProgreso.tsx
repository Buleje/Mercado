"use client";

import { cn } from "@/lib/utils";
import type { ContractTemplate } from "@/lib/contratos/plantillas";
import type { EstadoContratos } from "./use-contratos";
export default function WizardProgreso({ arch }: { arch: EstadoContratos }) {
  const { wizardData } = arch;
  /* El asistente sólo se muestra con plantilla elegida (la rama vive en VistaCrear). */
  const selectedTemplate = arch.selectedTemplate as ContractTemplate;
  return (
    <>
                    {(() => {
                      const allFields = selectedTemplate.fields;
                      const totalRequired = allFields.filter(f => f.required).length;
                      const filledRequired = allFields.filter(f => f.required && wizardData[f.key]?.trim()).length;
                      const progress = totalRequired > 0 ? Math.round((filledRequired / totalRequired) * 100) : 0;
                      return (
                        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-[var(--text-secondary)]">Progreso del contrato</span>
                            <span className="text-xs font-bold text-[var(--text-primary)]">{filledRequired} de {totalRequired} campos completados ({progress}%)</span>
                          </div>
                          <div className="relative h-3 bg-[var(--rule-soft)] rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all duration-[var(--dur-slow)]", progress === 100 ? "bg-primary/10" : progress >= 60 ? "bg-primary" : "bg-secondary")}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
    </>
  );
}