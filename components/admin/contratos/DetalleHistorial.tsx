"use client";

import { BlockTitle } from "@buleje/design-system";
import { Clock } from "@buleje/design-system/icons";
import { EVENTO_LABELS } from "./constantes-contratos";
import { formatDateTime } from "@/lib/format";
import type { DbContract } from "@/lib/types/contracts";
import type { EstadoContratos } from "./use-contratos";
export default function DetalleHistorial({ arch }: { arch: EstadoContratos }) {
  /* La ficha sólo se monta con un contrato abierto (la condición vive en ContratosModule). */
  const detalle = arch.detalle as DbContract;
  return (
    <>
                  <div>
                    <BlockTitle className="mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4" /> Qué pasó con este contrato
                      <span className="text-[length:var(--ts-2xs)] bg-[var(--surface-sunken)] px-2 py-0.5 rounded-full">{detalle.eventos.length}</span>
                    </BlockTitle>
                    <ol className="space-y-1.5 border-l-2 border-[var(--rule-soft)] pl-3">
                      {detalle.eventos.map(ev => (
                        <li key={ev.id} className="text-xs">
                          <p className="font-semibold text-[var(--text-primary)]">{EVENTO_LABELS[ev.tipo] ?? ev.tipo}</p>
                          {ev.detalle && <p className="text-[var(--text-secondary)]">{ev.detalle}</p>}
                          <p className="text-[var(--text-tertiary)]">
                            {formatDateTime(ev.createdAt)}{ev.actor ? ` · ${ev.actor}` : ""}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
    </>
  );
}