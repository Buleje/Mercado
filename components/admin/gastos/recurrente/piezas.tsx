import type { ReactNode } from "react";
import { Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";

/** Un bloque del modal de gasto recurrente: rótulo con ícono + contenido. */
export function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <Kicker as="h3" className="libro-kicker inline-flex items-center gap-2">
        <span className="text-[var(--text-tertiary)]">{icon}</span>
        {title}
      </Kicker>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** El rótulo de un campo. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <label className={cn("block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]", className)}>
      {children}
    </label>
  );
}
