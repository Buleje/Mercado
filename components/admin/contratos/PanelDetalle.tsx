"use client";

import { CardTitle, BlockTitle } from "@buleje/design-system";
import { TIPO_LABELS, estadoVisible, ESTADO_VISIBLE_LABELS } from "@/lib/types/contracts";
import { X, Scale, User } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { ESTADO_STYLES, formatMoney, formatDatePeru } from "./formato-contratos";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { enlaceDeContraparte } from "./enlace-contraparte";
import VinculoContraparte from "@/components/admin/contratos/VinculoContraparte";
import PanelRevision from "@/components/admin/contratos/PanelRevision";
import PanelFirmantes from "@/components/admin/contratos/PanelFirmantes";
import DetalleHistorial from "./DetalleHistorial";
import DetalleRenovar from "./DetalleRenovar";
import DetalleAcciones from "./DetalleAcciones";
import type { DbContract } from "@/lib/types/contracts";
import type { EstadoContratos } from "./use-contratos";
export default function PanelDetalle({ arch }: { arch: EstadoContratos }) {
  const { panelTitleId, setSelected, getContractContent, detalle, setDetalle, setContratos,
    fetchContratos } = arch;
  /* La ficha sólo se monta con un contrato abierto (la condición vive en ContratosModule). */
  const selected = arch.selected as DbContract;
  return (
    <>
              <div className="p-4 sm:p-6 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle id={panelTitleId} className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)]">Contrato {selected.numero}</CardTitle>
                    <p className="text-xs text-[var(--text-tertiary)]">{TIPO_LABELS[selected.tipo] || selected.tipo}</p>
                  </div>
                  <button aria-label="Cerrar" onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-[var(--surface-sunken)] ">
                    <X className="h-5 w-5 text-[var(--text-secondary)]" />
                  </button>
                </div>

                {/* Summary Card */}
                {(() => {
                  const { summary } = getContractContent(selected);
                  if (!summary) return null;
                  return (
                    <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Scale className="h-4 w-4 text-primary" />
                        <h4 className="text-xs font-bold text-primary uppercase">Resumen</h4>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{summary}</p>
                    </div>
                  );
                })()}

                {/* Estado Badge */}
                <div className="flex items-center gap-2">
                  <span className={cn("px-3 py-1 rounded-lg text-xs font-bold", ESTADO_STYLES[estadoVisible(selected)])}>
                    {ESTADO_VISIBLE_LABELS[estadoVisible(selected)]}
                  </span>
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                    {TIPO_LABELS[selected.tipo] || selected.tipo}
                  </span>
                </div>

                {/* Parties */}
                <div className="bg-[var(--surface-alt)] rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-secondary/20 flex items-center justify-center">
                      <User className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <p className="font-bold text-[var(--text-primary)]"><EnlacePanel {...enlaceDeContraparte(detalle ?? selected)} className="font-bold" title="Abrir su ficha">{selected.clienteNombre}</EnlacePanel></p>
                      <p className="text-xs text-[var(--text-secondary)]">{selected.clienteDoc}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--rule-base)] ">
                    <div><p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Monto</p><p className="text-sm font-bold text-primary">{formatMoney(selected.monto, selected.moneda)}</p></div>
                    <div><p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Fecha</p><p className="text-sm text-[var(--text-secondary)]">{formatDatePeru(selected.fechaInicio || selected.createdAt)}</p></div>
                  </div>

                  {/* Vigencia Timeline */}
                  {selected.fechaVencimiento && (() => {
                    const inicio = new Date(selected.fechaInicio || selected.createdAt).getTime();
                    const vence = new Date(selected.fechaVencimiento).getTime();
                    const hoy = Date.now();
                    const total = vence - inicio;
                    const progreso = total > 0 ? Math.max(0, Math.min(((hoy - inicio) / total) * 100, 100)) : 0;
                    const diasRestantes = Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
                    const barColor = progreso >= 100 ? "bg-[var(--data-error-500)]" : progreso > 80 ? "bg-[var(--data-warning-500)]" : "bg-primary";
                    return (
                      <div className="pt-3 border-t border-[var(--rule-base)] space-y-1.5">
                        <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Vigencia</p>
                        <div className="relative h-2.5 bg-[var(--rule-soft)] rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${progreso}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
                          <span>{formatDatePeru(selected.fechaInicio || selected.createdAt)}</span>
                          <span className="font-bold">{diasRestantes > 0 ? `${diasRestantes} dias restantes` : diasRestantes === 0 ? "Vence hoy" : `Vencido hace ${Math.abs(diasRestantes)}d`}</span>
                          <span>{formatDatePeru(selected.fechaVencimiento)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Clausulas */}
                {selected.clausulas.length > 0 && (
                  <div>
                    <BlockTitle className="mb-3">Clausulas</BlockTitle>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {selected.clausulas.map((c, i) => (
                        <div key={i} className="p-3 bg-[var(--surface-alt)] rounded-xl text-sm text-[var(--text-secondary)] text-justify leading-relaxed">
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Qué pasó con este contrato — historial real, guardado en el servidor */}
                {detalle?.eventos && detalle.eventos.length > 0 && (
                  <DetalleHistorial arch={arch} />
                )}

                {/* Con quién es de verdad: atado a su ficha, no texto suelto */}
                <VinculoContraparte
                  contratoId={selected.id}
                  clienteNombre={selected.clienteNombre}
                  customerId={(detalle ?? selected).customerId}
                  supplierId={(detalle ?? selected).supplierId}
                  colaboradorId={(detalle ?? selected).colaboradorId}
                  onVinculado={(patch) => {
                    setDetalle(d => (d ? { ...d, ...patch } : d));
                    setContratos(prev => prev.map(c => (c.id === selected.id ? { ...c, ...patch } : c)));
                  }}
                />

                {/* Revisor de cláusulas */}
                <PanelRevision
                  contratoId={selected.id}
                  revision={(detalle ?? selected).revisionIa}
                  onRevisado={rev => setDetalle(d => (d ? { ...d, revisionIa: rev } : d))}
                />

                {/* Firmantes y links de firma */}
                <PanelFirmantes contrato={detalle ?? selected} onCambio={fetchContratos} />

                {/* Renovar: sólo tiene sentido cuando el contrato tiene un final a la vista */}
                {["VIGENTE", "POR_VENCER", "VENCIDO"].includes(estadoVisible(selected)) && (
                  <DetalleRenovar arch={arch} />
                )}

                {/* Action Buttons */}
                <DetalleAcciones arch={arch} />
              </div>
    </>
  );
}