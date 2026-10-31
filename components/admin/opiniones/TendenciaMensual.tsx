import { cn } from "@/lib/utils";
import type { MesTendencia } from "./shared";

const signo = (n: number) => (n > 0 ? `+${n}` : String(n));

export function TendenciaMensual({ meses }: { meses: MesTendencia[] }) {
  return (
    <ul className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      {meses.map((m) => {
        const total = m.contentos + m.conformes + m.descontentos || 1;
        return (
          <li key={m.mes} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm font-semibold text-[var(--text-secondary)]">{m.mes}</span>
            <div className="flex h-4 flex-1 overflow-hidden rounded-full bg-[var(--rule-soft)]" role="img" aria-label={`${m.contentos} contentos, ${m.conformes} conformes, ${m.descontentos} descontentos`}>
              <div className="bg-[var(--data-success-500)]" style={{ width: `${(m.contentos / total) * 100}%` }} />
              <div className="bg-[var(--data-warning-500)]" style={{ width: `${(m.conformes / total) * 100}%` }} />
              <div className="bg-[var(--data-error-500)]" style={{ width: `${(m.descontentos / total) * 100}%` }} />
            </div>
            <span className={cn("w-12 shrink-0 text-right text-sm font-extrabold tabular-nums", m.indice >= 50 ? "text-[var(--data-success-ink)]" : m.indice >= 0 ? "text-[var(--data-warning-ink)]" : "text-[var(--data-error-ink)]")}>{signo(m.indice)}</span>
          </li>
        );
      })}
    </ul>
  );
}
