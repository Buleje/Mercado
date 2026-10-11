import type { ReactNode } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";

interface Props {
  rotulo: string;
  valor: ReactNode;
  icono: React.ElementType;
  /** Una línea chica debajo del valor. */
  detalle?: string;
  ayuda?: ReactNode;
  destacado?: boolean;
}

/** Una cifra de la tira de Indicadores: ícono, rótulo, valor y (opcional) ⓘ. */
export function TarjetaCifra({ rotulo, valor, icono: Icono, detalle, ayuda, destacado }: Props) {
  return (
    <div className={cn("rounded-xl border bg-[var(--surface-raised)] p-3", destacado ? "border-primary/40 ring-1 ring-primary/20" : "border-[var(--rule-base)]")}>
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
          <Icono className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        {ayuda && <InfoTip what={ayuda} />}
      </div>
      <p className={cn("text-lg font-extrabold tabular-nums", destacado ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-primary)]")}>{valor}</p>
      {detalle && <p className="text-sm text-[var(--text-secondary)]">{detalle}</p>}
    </div>
  );
}
