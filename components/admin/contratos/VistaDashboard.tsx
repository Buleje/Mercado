"use client";

import { ContratosChart } from "./ayudas-visuales-contratos";
import { CardTitle } from "@buleje/design-system";
import { Clock } from "@buleje/design-system/icons";
import { estadoVisible } from "@/lib/types/contracts";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { enlaceDeContraparte } from "./enlace-contraparte";
import { formatDatePeru } from "./formato-contratos";
import type { EstadoContratos } from "./use-contratos";
export default function VistaDashboard({ arch }: { arch: EstadoContratos }) {
  const { stats, contratos, setSelected } = arch;
  return (
    <>
              <div className="space-y-6">
                {/* Las cinco cifras y la plata comprometida viven en «Indicadores»
                    (la cabecera): acá quedan los gráficos y los que vencen. */}
                {/* Charts Row — gráficos sin datos NO se muestran (lo decide ContratosChart) */}
                <ContratosChart typeData={stats.typeData} monthData={stats.monthData} />

                {/* Contratos por vencer */}
                {stats.porVencer > 0 && (
                  <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/50 rounded-xl p-4">
                    <CardTitle className="mb-2 flex items-center gap-2 text-[var(--data-warning-ink)]">
                      <Clock className="h-4 w-4" /> Contratos por vencer (30 días)
                    </CardTitle>
                    <div className="space-y-2">
                      {contratos.filter(c => estadoVisible(c) === "POR_VENCER").slice(0, 5).map(c => (
                        <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-[var(--data-warning-ink)]"><EnlacePanel {...enlaceDeContraparte(c)} apariencia="heredada" className="font-bold underline">{c.clienteNombre}</EnlacePanel> — {c.numero} — vence {formatDatePeru(c.fechaVencimiento!)}</span>
                          <button type="button" onClick={() => { setSelected(c); }} className="h-12 shrink-0 rounded-xl px-4 font-bold text-[var(--data-warning-ink)] transition-colors hover:bg-[var(--data-warning-500)]/15">
                            Ver
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
    </>
  );
}