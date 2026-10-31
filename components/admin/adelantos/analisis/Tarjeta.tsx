/**
 * El bloque de cada gráfico del análisis: título + ⓘ (la explicación va en el
 * ⓘ, no en un párrafo — ley de la vista, regla 9) y el contenido. Es
 * `@container`: los gráficos cambian de forma por el ancho del BLOQUE, no de
 * la ventana (con el panel de la derecha abierto, 1280 px deja ~700 px).
 */
import type { ReactNode } from "react";
import { CardTitle, cn } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

export function Tarjeta({
  titulo,
  icono,
  que,
  ejemplo,
  pie,
  className,
  children,
}: {
  titulo: string;
  icono?: ReactNode;
  /** Qué muestra (va en el ⓘ). */
  que: ReactNode;
  ejemplo?: ReactNode;
  /** Una línea a la derecha del título (totales, leyenda). */
  pie?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("@container min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          {icono}
          <CardTitle>{titulo}</CardTitle>
          <InfoTip title={titulo} what={que} example={ejemplo} />
        </div>
        {pie && <div className="ml-auto flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">{pie}</div>}
      </div>
      {children}
    </section>
  );
}

/** Un cuadrito de color + texto, para la leyenda de un gráfico. */
export function Muestra({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-[var(--text-secondary)]">
      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
      {children}
    </span>
  );
}
