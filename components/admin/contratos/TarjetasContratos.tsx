"use client";

import type { ReactNode } from "react";
import { User } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { activateProps } from "@/components/admin/shared/a11y";
import { cn } from "@/lib/utils";
import { diasParaVencer, ESTADO_VISIBLE_LABELS, estadoVisible, TIPO_LABELS, type DbContract } from "@/lib/types/contracts";
import { enlaceDeContraparte } from "./enlace-contraparte";
import { ESTADO_STYLES, formatDatePeru, formatMoney } from "./formato-contratos";

interface Props {
  /** La página que se dibuja (ya filtrada y ordenada). */
  paginados: readonly DbContract[];
  onAbrir: (c: DbContract) => void;
  menuDe: (c: DbContract) => ReactNode;
}

/** Los contratos como tarjetas (vista «tarjetas» y celular). */
export function TarjetasContratos({ paginados, onAbrir, menuDe }: Props) {
  return (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {paginados.length === 0 && <p className="col-span-full text-center text-[var(--text-tertiary)]">Ningún contrato coincide con los filtros de columna.</p>}
    {paginados.map(c => {
      const estado = estadoVisible(c);
      const dias = diasParaVencer(c.fechaVencimiento);
      const borderColor = estado === "VENCIDO" ? "border-l-[var(--data-error-500)]" : estado === "POR_VENCER" ? "border-l-[var(--data-warning-500)]" : "border-l-[var(--data-success-500)]";
      return (
        <div
          key={c.id}
          {...activateProps(() => onAbrir(c))}
          className={cn("bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-lg hover:shadow-[var(--shadow-lg)] transition-all cursor-pointer border-l-4", borderColor)}
        >
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--text-tertiary)] font-mono">{c.numero}</p>
                <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{TIPO_LABELS[c.tipo] || c.tipo}</p>
              </div>
              <span className={cn("px-2 py-0.5 rounded-full text-sm font-bold shrink-0 ml-2", ESTADO_STYLES[estado])}>
                {ESTADO_VISIBLE_LABELS[estado]}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-secondary/20 flex items-center justify-center shrink-0"><User className="h-3.5 w-3.5 text-secondary" /></div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--text-secondary)] truncate"><EnlacePanel {...enlaceDeContraparte(c)}>{c.clienteNombre}</EnlacePanel></p>
                <p className="text-sm text-[var(--text-tertiary)]">{c.clienteDoc}</p>
              </div>
            </div>
            <div className="text-sm text-[var(--text-secondary)] space-y-0.5">
              <p>Fecha: {formatDatePeru(c.fechaInicio || c.createdAt)}</p>
              {c.fechaVencimiento && <p>Vence: {formatDatePeru(c.fechaVencimiento)} {dias !== null && dias >= 0 ? `(${dias}d)` : dias !== null ? `(hace ${Math.abs(dias)}d)` : ""}</p>}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[var(--rule-soft)] ">
              <p className="text-sm font-bold text-primary">{formatMoney(c.monto, c.moneda)}</p>
              {menuDe(c)}
            </div>
          </div>
        </div>
      );
    })}
  </div>
  );
}
