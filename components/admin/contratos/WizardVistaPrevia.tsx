"use client";

import { Scale } from "@buleje/design-system/icons";
import { BlockTitle, SectionTitle } from "@buleje/design-system";
import type { ContractTemplate } from "@/lib/contratos/plantillas";
import type { EstadoContratos } from "./use-contratos";
export default function WizardVistaPrevia({ arch }: { arch: EstadoContratos }) {
  const { generateSummary, printRef, wizardData } = arch;
  /* El asistente sólo se muestra con plantilla elegida (la rama vive en VistaCrear). */
  const selectedTemplate = arch.selectedTemplate as ContractTemplate;
  return (
    <>
                      <div className="space-y-6">
                        {/* Summary Card */}
                        <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Scale className="h-4 w-4 text-primary" />
                            <BlockTitle className="text-primary">Resumen en Lenguaje Simple</BlockTitle>
                          </div>
                          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{generateSummary()}</p>
                        </div>

                        {/* Full Document Preview — with highlighted filled fields */}
                        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6 sm:p-8 max-h-[60vh] overflow-y-auto">
                          <div className="max-w-[680px] mx-auto font-serif" ref={printRef}>
                            <SectionTitle className="text-center text-sm font-bold mb-1">
                              CONTRATO DE {selectedTemplate.name.toUpperCase()}
                            </SectionTitle>
                            <p className="text-center text-xs text-[var(--text-tertiary)] mb-6">{selectedTemplate.legalBasis}</p>
                            <div className="border-t-2 border-double border-[var(--rule-strong)] mb-6" />
                            {selectedTemplate.clausulas.map((clause, i) => {
                              // Replace {{KEY}} with highlighted spans for filled data
                              const parts = clause.split(/(\{\{\w+\}\})/g);
                              return (
                                <p key={i} className="text-sm text-[var(--text-secondary)] mb-4 text-justify leading-relaxed">
                                  {parts.map((part, j) => {
                                    const match = part.match(/^\{\{(\w+)\}\}$/);
                                    if (match) {
                                      const key = match[1];
                                      const val = wizardData[key];
                                      if (val) {
                                        return <span key={j} className="bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] px-0.5 rounded font-semibold">{val}</span>;
                                      }
                                      return <span key={j} className="bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] px-0.5 rounded">[{key}]</span>;
                                    }
                                    return <span key={j}>{part}</span>;
                                  })}
                                </p>
                              );
                            })}
                            <div className="mt-12 flex justify-between gap-8">
                              <div className="flex-1 text-center">
                                <div className="border-t border-[var(--rule-strong)] mt-16 pt-2 text-xs text-[var(--text-secondary)]">PRIMERA PARTE</div>
                              </div>
                              <div className="flex-1 text-center">
                                <div className="border-t border-[var(--rule-strong)] mt-16 pt-2 text-xs text-[var(--text-secondary)]">SEGUNDA PARTE</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Preview legend */}
                        <div className="flex items-center gap-4 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
                          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 border border-[var(--data-warning-500)]" /> Campos completados</span>
                          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 border border-[var(--data-error-500)]" /> Campos pendientes</span>
                        </div>
                      </div>
    </>
  );
}