"use client";

/** La lista de guías: tabla (tarjetas a 400 px por el shell) con vista rápida al pasar el mouse. */
import { DataTable } from "@buleje/design-system";
import { ChevronLeft, ChevronRight, Truck } from "@buleje/design-system/icons";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BOTON_ICONO } from "./estilos";
import { GuiaHoverRow, GuiaPreview } from "./GuiaPreview";
import { MOTIVO_ROTULO, STATUS_META, type GuiaRemision } from "./tipos";

interface Props {
  guias: GuiaRemision[];
  total: number;
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  onAbrir: (g: GuiaRemision) => void;
}

export function GuiasTabla({ guias, total, page, totalPages, onPage, onAbrir }: Props) {
  return (
    <>
      <div className="admin-mobile-cards">
        <DataTable>
          <thead>
            <tr>
              <th>N° GRR</th>
              <th>Fecha de traslado</th>
              <th>Destinatario</th>
              <th>Motivo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {guias.map((g) => {
              const meta = STATUS_META[g.status];
              return (
                <tr
                  key={g.id}
                  onClick={() => onAbrir(g)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver guía ${g.numero} de ${g.destinatarioNombre}`}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(g); }
                  }}
                  className="cursor-pointer"
                >
                  <td data-label="N° GRR" className="font-mono text-[var(--text-secondary)]">
                    <GuiaHoverRow preview={<GuiaPreview guia={g} />}><span>{g.numero}</span></GuiaHoverRow>
                  </td>
                  <td data-label="Fecha de traslado" className="text-[var(--text-secondary)]">{formatDate(g.fechaTraslado)}</td>
                  <td data-label="Destinatario">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] max-sm:hidden">
                        <Truck className="h-4 w-4" aria-hidden />
                      </span>
                      <p className="truncate font-medium text-[var(--text-primary)]">{g.destinatarioNombre}</p>
                    </div>
                  </td>
                  <td data-label="Motivo" className="text-[var(--text-secondary)]">{MOTIVO_ROTULO[g.motivoTraslado] ?? g.motivoTraslado}</td>
                  <td data-label="Estado">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold", meta.bg, meta.color)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden />
                      {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--rule-soft)] px-4 py-2">
          <p className="text-sm text-[var(--text-secondary)]">
            {total} guía{total !== 1 ? "s" : ""} — pág. {page}/{totalPages}
          </p>
          <div className="flex gap-1">
            <button type="button" aria-label="Anterior" disabled={page <= 1} onClick={() => onPage(page - 1)} className={cn(BOTON_ICONO, "disabled:opacity-30")}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" aria-label="Siguiente" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className={cn(BOTON_ICONO, "disabled:opacity-30")}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
