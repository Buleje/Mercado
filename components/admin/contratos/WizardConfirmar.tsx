"use client";

import { CheckCircle, Clock } from "@buleje/design-system/icons";
import { BlockTitle } from "@buleje/design-system";
import { vencimientoDelContrato, inicioDelContrato } from "@/lib/contratos/plantillas";
import { formatDatePeru } from "./formato-contratos";
import type { ContractTemplate } from "@/lib/contratos/plantillas";
import type { EstadoContratos } from "./use-contratos";
export default function WizardConfirmar({ arch }: { arch: EstadoContratos }) {
  const { wizardData, generateSummary, vencimientoManual, setVencimientoManual, createError } = arch;
  /* El asistente sólo se muestra con plantilla elegida (la rama vive en VistaCrear). */
  const selectedTemplate = arch.selectedTemplate as ContractTemplate;
  return (
    <>
                      <div className="space-y-6">
                        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6 space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center text-white">
                              <CheckCircle className="h-6 w-6" />
                            </div>
                            <div>
                              <BlockTitle className="text-[var(--text-primary)]">Confirmar Contrato</BlockTitle>
                              <p className="text-xs text-[var(--text-secondary)]">{selectedTemplate.name} — {selectedTemplate.legalBasis}</p>
                            </div>
                          </div>

                          {/* Data Summary */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedTemplate.fields.filter(f => wizardData[f.key]).map(f => (
                              <div key={f.key} className="p-2 bg-[var(--surface-alt)] rounded-lg">
                                <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">{f.label}</p>
                                <p className="text-sm text-[var(--text-secondary)] truncate">{wizardData[f.key]}</p>
                              </div>
                            ))}
                          </div>

                          <div className="bg-primary/5 dark:bg-primary/10 rounded-xl p-4">
                            <p className="text-sm text-[var(--text-secondary)]">{generateSummary()}</p>
                          </div>

                          {/* Cuándo deja de valer. Si la plantilla no lo pide (ni fecha
                              de fin ni plazo), acá se pregunta en vez de guardar el
                              contrato sin vencimiento y que nadie te avise nunca. */}
                          {(() => {
                            const delaPlantilla = vencimientoDelContrato(selectedTemplate, wizardData);
                            if (delaPlantilla) {
                              return (
                                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                  <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
                                  Vence el <strong className="text-[var(--text-primary)]">{formatDatePeru(delaPlantilla)}</strong>.
                                  Te vamos a avisar 30 días antes.
                                </div>
                              );
                            }
                            return (
                              <div className="rounded-xl border border-[var(--rule-base)] p-3 space-y-2">
                                <label className="block text-sm font-semibold text-[var(--text-primary)]" htmlFor="venc-manual">
                                  ¿Hasta cuándo vale este contrato?
                                </label>
                                <p className="text-xs text-[var(--text-secondary)]">
                                  Esta plantilla no pide fecha de término. Si la cargas, te avisamos
                                  30 días antes de que venza; si la dejas vacía, no te avisa nadie.
                                </p>
                                <input
                                  id="venc-manual"
                                  type="date"
                                  value={vencimientoManual}
                                  min={inicioDelContrato(wizardData)}
                                  onChange={e => setVencimientoManual(e.target.value)}
                                  className="w-full sm:w-auto px-3 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)]"
                                />
                              </div>
                            );
                          })()}

                          {createError && <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold bg-[var(--data-error-50)] dark:bg-red-950/20 p-3 rounded-lg">{createError}</p>}
                        </div>
                      </div>
    </>
  );
}