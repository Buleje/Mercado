"use client";

import { ArrowLeft, ArrowRight, Loader2, Save } from "@buleje/design-system/icons";
import type { EstadoContratos } from "./use-contratos";
export default function WizardNavegacion({ arch }: { arch: EstadoContratos }) {
  const { wizardStep, setWizardStep, setSelectedTemplate, handleCreate, creating } = arch;
  return (
    <>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => wizardStep > 0 ? setWizardStep(s => s - 1) : setSelectedTemplate(null)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        {wizardStep === 0 ? "Cancelar" : "Anterior"}
                      </button>
                      <div className="flex gap-2">
                        {wizardStep < 4 && (
                          <button
                            onClick={() => setWizardStep(s => s + 1)}
                            className="flex items-center gap-2 px-4 min-h-10 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors"
                          >
                            Siguiente
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        )}
                        {wizardStep === 4 && (
                          <button
                            onClick={handleCreate}
                            disabled={creating}
                            className="flex items-center gap-2 px-6 min-h-11 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors"
                          >
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Guardar Contrato
                          </button>
                        )}
                      </div>
                    </div>
    </>
  );
}