"use client";

/**
 * Los lotes con su vencimiento, en tabla (antes: una tarjeta de 3 líneas por
 * lote con dos botones de 36 px). Por fila: la acción principal a 48 px —«Dar
 * de baja» si venció o vence esta semana, si no «Revisado»— y lo demás en «⋯».
 */
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, CheckCircle, Clock, MoreHorizontal, PackageX, ShieldCheck, Trash2 } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { soles } from "./use-indicadores";
import { diaConNombre } from "./tipos";
import { fraseDeDias, type LoteConDias, type Urgencia } from "./vencimientos";
import { button } from "@/components/ui-system/button-variants";

export const URGENCIA: Record<Urgencia, { label: string; chip: string; Icon: typeof AlertTriangle }> = {
  vencido: { label: "Vencidos", chip: "bg-[var(--data-error-100)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/20 dark:text-[var(--data-error-500)]", Icon: AlertTriangle },
  critico: { label: "Esta semana", chip: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/20 dark:text-[var(--data-warning-500)]", Icon: AlertTriangle },
  pronto: { label: "En 30 días", chip: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/20 dark:text-[var(--data-warning-500)]", Icon: Clock },
  bien: { label: "Vigentes", chip: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]", Icon: CheckCircle },
  agotado: { label: "Sin stock", chip: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", Icon: PackageX },
};

const BOTON = button({ variant: "secondary", className: "shrink-0 rounded-xl" });

interface Props {
  lotes: readonly LoteConDias[];
  revisados: ReadonlySet<string>;
  confirmando: string | null;
  onConfirmar: (id: string | null) => void;
  onBaja: (l: LoteConDias) => void;
  onRevisado: (id: string) => void;
}

export function TablaLotes({ lotes, revisados, confirmando, onConfirmar, onBaja, onRevisado }: Props) {
  return (
    <DataTable className="min-w-[680px] [&_tbody_td]:py-1.5! [&_tbody_td]:align-middle">
      <thead>
        <tr>
          <th>Producto</th>
          <th className="text-right">Cantidad</th>
          <th>Vence</th>
          <th className="text-right">Valor</th>
          <th className="text-right"><span className="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {lotes.map((b) => {
          const u = URGENCIA[b.urgencia];
          const revisado = revisados.has(b.id);
          const atender = b.urgencia === "vencido" || b.urgencia === "critico";
          return (
            <tr key={b.id} className={cn(revisado && "opacity-60")}>
              <td data-label="Producto" className="max-w-[18rem]">
                <div className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                    <span className="truncate">{b.productName}</span>
                    {revisado && <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-label="Revisado" />}
                  </span>
                  <span className="block truncate text-[var(--text-secondary)]">Lote {b.lote}{b.supplierName ? ` · ${b.supplierName}` : ""}</span>
                </div>
              </td>
              <td data-label="Cantidad" className="whitespace-nowrap text-right tabular-nums">{b.quantity} {b.unit}</td>
              <td data-label="Vence">
                <div className="min-w-0">
                  <span className="block whitespace-nowrap text-[var(--text-primary)]">{diaConNombre(b.expiryDate)}</span>
                  <span className={cn("mt-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-semibold", u.chip)}>
                    <u.Icon className="h-3.5 w-3.5" aria-hidden /> {b.urgencia === "agotado" ? "Sin stock" : fraseDeDias(b.dias)}
                  </span>
                </div>
              </td>
              <td data-label="Valor" className="whitespace-nowrap text-right tabular-nums text-[var(--text-secondary)]">{b.costUnit > 0 ? soles(b.quantity * b.costUnit) : "—"}</td>
              <td data-label="Acciones" className="text-right">
                {confirmando === b.id ? (
                  <span className="inline-flex flex-wrap items-center justify-end gap-2">
                    <span className="text-sm font-semibold text-[var(--text-secondary)]">¿Baja de {b.quantity} {b.unit}?</span>
                    <button type="button" onClick={() => onBaja(b)} className={cn(BOTON, "border-transparent bg-[var(--data-error-500)] text-white hover:brightness-110")}>Sí, dar de baja</button>
                    <button type="button" onClick={() => onConfirmar(null)} className={cn(BOTON, "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}>No</button>
                  </span>
                ) : atender ? (
                  <span className="inline-flex items-center justify-end gap-1">
                    <button type="button" onClick={() => onConfirmar(b.id)} title="Registra la pérdida «Vencimiento» y quita el lote" className={cn(BOTON, "border-[var(--data-error-500)]/40 text-[var(--data-error-ink)] hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:hover:bg-[var(--data-error-500)]/10")}>
                      <Trash2 className="h-4 w-4" aria-hidden /> Dar de baja
                    </button>
                    <ActionMenu
                      label="Más acciones del lote"
                      icon={MoreHorizontal}
                      soloIcono
                      size="md"
                      className="w-12 shrink-0"
                      actions={[{ id: "revisado", label: revisado ? "Quitar «revisado»" : "Marcar revisado", hint: "Sólo en este equipo", icon: ShieldCheck, onSelect: () => onRevisado(b.id) }]}
                    />
                  </span>
                ) : (
                  <button type="button" aria-pressed={revisado} onClick={() => onRevisado(b.id)} className={cn(BOTON, revisado ? "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]" : "border-[var(--accent)]/40 text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]")}>
                    <ShieldCheck className="h-4 w-4" aria-hidden /> {revisado ? "Revisado" : "Marcar revisado"}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
