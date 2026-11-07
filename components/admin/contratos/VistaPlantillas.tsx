"use client";

import { AvisoContratoParaPersona } from "@/components/admin/contratos/contrato-para-persona";
import { PLANTILLAS } from "@/lib/contratos/plantillas";
import { m } from "@/components/admin/providers";
import { TemplateIcon } from "./ayudas-visuales-contratos";
import { BlockTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { EstadoContratos } from "./use-contratos";
export default function VistaPlantillas({ arch }: { arch: EstadoContratos }) {
  const { paraPersona, startWizard } = arch;
  return (
    <>
              <div className="space-y-6">
                {paraPersona.persona && <AvisoContratoParaPersona persona={paraPersona.persona} onQuitar={paraPersona.quitar} />}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {PLANTILLAS.map(tpl => (
                    <m.div
                      key={tpl.id}
                      whileHover={{ scale: 1.02 }}
                      className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-lg p-4 cursor-pointer hover:border-primary hover:shadow-[var(--shadow-lg)] transition-all group"
                      onClick={() => startWizard(tpl)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors text-[var(--accent-ink)] dark:text-[var(--accent)]">
                          <TemplateIcon icon={tpl.icon} className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <BlockTitle>{tpl.name}</BlockTitle>
                            {/* El texto largo de la plantilla va en el ⓘ; el clic no abre el asistente. */}
                            <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex">
                              <InfoTip title={tpl.name} what={tpl.description} affects={<span>Base legal: {tpl.legalBasis}</span>} ariaLabel={`Qué es ${tpl.name}`} />
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className="text-sm px-2 py-0.5 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] font-bold">{tpl.category}</span>
                            <span className="text-sm text-[var(--text-tertiary)]">{tpl.fields.length} campos · {tpl.clausulas.length} cláusulas</span>
                          </div>
                        </div>
                      </div>
                    </m.div>
                  ))}
                </div>
              </div>
    </>
  );
}