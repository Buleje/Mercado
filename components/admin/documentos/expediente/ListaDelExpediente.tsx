import { FileText, Image as ImageIcon, FileWarning } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { PapelDelPlan } from "@/lib/documents/expediente-indice";

/**
 * Lo que entra al expediente, en el orden en que va a salir. Los que no se
 * pueden unir (Word, Excel) se marcan: igual figuran en el índice del PDF para
 * pedir el original. Lo vencido se avisa acá, antes de entregarlo.
 */

const PASTILLA = "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)]";

function Icono({ tipo }: { tipo: PapelDelPlan["tipo"] }) {
  const clase = "h-4 w-4 shrink-0";
  if (tipo === "imagen") return <ImageIcon className={cn(clase, "text-[var(--text-tertiary)]")} aria-hidden />;
  if (tipo === "pdf") return <FileText className={cn(clase, "text-[var(--text-tertiary)]")} aria-hidden />;
  return <FileWarning className={cn(clase, "text-[var(--data-warning-ink)]")} aria-hidden />;
}

export function ListaDelExpediente({ papeles }: { papeles: readonly PapelDelPlan[] }) {
  return (
    <ol className="max-h-[min(20rem,40vh)] divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-xl border border-[var(--rule-base)]">
      {papeles.map((p, i) => (
        <li key={p.id} className="flex items-center gap-2.5 px-3 py-2">
          <span className="w-6 shrink-0 text-right text-xs tabular-nums text-[var(--text-tertiary)]">{i + 1}</span>
          <Icono tipo={p.tipo} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]" title={p.nombre}>
              {p.nombre}
            </p>
            <p className="truncate text-xs text-[var(--text-tertiary)]">{p.carpeta}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {p.tipo === "no-imprimible" && (
              <span className={cn(PASTILLA, "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10")} title="No se puede unir al PDF: queda en el índice para pedir el original">
                No imprimible
              </span>
            )}
            {p.vencido ? (
              <span className={cn(PASTILLA, "border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10")} title={`Venció el ${p.vence}`}>
                Vencido
              </span>
            ) : p.vence ? (
              <span className="hidden text-xs tabular-nums text-[var(--text-tertiary)] sm:inline">Vence {p.vence}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
