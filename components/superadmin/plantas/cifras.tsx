import { AlertTriangle } from "@buleje/design-system/icons";
import { BadgeStatus } from "@buleje/design-system";
import type { FuenteLectura, Semaforo } from "@/lib/superadmin/plantas-forestales/tipos";
import { FUENTE, NOTA_PT, pies, SEMAFORO } from "./formato";

/** «—» con aviso: esa lectura falló (nunca se muestra como 0). */
export function SinLectura({ fuente }: { fuente: FuenteLectura }) {
  const texto = `No se pudo leer ${FUENTE[fuente]}. Prueba «Recalcular».`;
  return (
    <span className="inline-flex items-center gap-1 text-[var(--text-tertiary)]" title={texto}>
      —
      <AlertTriangle className="h-3.5 w-3.5 text-[var(--data-warning)]" aria-hidden />
      <span className="sr-only">{texto}</span>
    </span>
  );
}

/** «≈ 12,346 PT» con el aviso de que es un derivado al pasar el mouse. */
export function Pt({ valor, nota = NOTA_PT }: { valor: number | null | undefined; nota?: string }) {
  return (
    <span title={nota} className="cursor-help whitespace-nowrap underline decoration-dotted decoration-[var(--rule-strong)] underline-offset-2">
      {pies(valor)}
    </span>
  );
}

export function SemaforoBadge({ semaforo, size = "sm" }: { semaforo: Semaforo; size?: "sm" | "md" }) {
  const s = SEMAFORO[semaforo];
  return <BadgeStatus variant={s.variante} label={s.rotulo} size={size} dot />;
}
