/**
 * La torta en barra (ADR-497): qué parte del negocio es de cada socio, en una
 * sola barra apilada con su leyenda. Colores de la paleta de datos del DS en
 * un orden que se distingue en claro y en oscuro (los grises van al final).
 */
import type { ParticipacionSocio } from "@/lib/planificacion/calculos";
import { cn } from "@/lib/utils";

/** Clases literales para que Tailwind las vea. */
const COLORES = [
  "bg-[var(--data-5)]",
  "bg-[var(--data-6)]",
  "bg-[var(--data-7)]",
  "bg-[var(--data-8)]",
  "bg-[var(--data-3)]",
  "bg-[var(--data-4)]",
  "bg-[var(--data-2)]",
] as const;

export function colorSocio(i: number): string {
  return COLORES[i % COLORES.length];
}

/** «50 %», «33.33 %». */
export function porciento(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(2)} %`;
}

export function BarraParticipacion({ socios }: { socios: readonly ParticipacionSocio[] }) {
  const conParte = socios.filter((s) => s.porcentaje > 0);
  const total = conParte.reduce((a, s) => a + s.porcentaje, 0);
  if (conParte.length === 0) return null;
  const escala = Math.max(100, total);

  return (
    <figure className="space-y-2" aria-label="Participación de cada socio">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        {conParte.map((s) => (
          <span
            key={s.id}
            className={cn("h-full border-r-2 border-[var(--surface-raised)] last:border-r-0", colorSocio(socios.indexOf(s)))}
            style={{ width: `${(s.porcentaje / escala) * 100}%` }}
            title={`${s.nombre || "Sin nombre"}: ${porciento(s.porcentaje)}`}
          />
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
        {conParte.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colorSocio(socios.indexOf(s)))} aria-hidden />
            <span className="text-[var(--text-primary)]">{s.nombre || "Sin nombre"}</span>
            <span className="tabular-nums">{porciento(s.porcentaje)}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
