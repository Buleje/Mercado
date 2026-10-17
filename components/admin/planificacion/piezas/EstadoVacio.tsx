/**
 * EstadoVacio — una frase y la acción (ley de Brandon: estado vacío = una frase).
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EstadoVacio({ frase, children, className }: { frase: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-6 text-center",
        className,
      )}
    >
      <p className="text-sm text-[var(--text-secondary)]">{frase}</p>
      {children}
    </div>
  );
}
