/**
 * La hoja en chiquito: las columnas como salen impresas (con su unidad y el
 * ancho proporcional al del papel) y el renglón de ejemplo en gris. Lo que
 * calcula el sistema va rayado: se imprime, pero no hace falta llenarlo.
 */
import type { PlanillaCampo } from "@/lib/forestal/planillas/tipos";

const CELDA = "flex min-w-0 flex-col justify-center border-r border-[var(--rule-soft)] px-1.5 py-1 last:border-r-0";

export default function HojaMiniatura({ planilla }: { planilla: PlanillaCampo }) {
  const cols = planilla.columnas;
  const plantilla = ["2.25rem", ...cols.map((c) => `minmax(${Math.max(56, Math.round(c.anchoMm * 2.4))}px, ${c.anchoMm}fr)`)].join(" ");

  return (
    <div
      className="overflow-x-auto rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)]"
      role="img"
      aria-label={`Columnas de la hoja: ${cols.map((c) => `${c.titulo}${c.unidad ? ` en ${c.unidad}` : ""}${c.calculada ? " (la calcula el sistema)" : ""}`).join(", ")}`}
    >
      <div className="grid w-max min-w-full" style={{ gridTemplateColumns: plantilla }} aria-hidden>
        <div className={`${CELDA} bg-[var(--surface-sunken)] text-xs font-semibold text-[var(--text-secondary)]`}>N°</div>
        {cols.map((c) => (
          <div
            key={c.clave}
            className={`${CELDA} bg-[var(--surface-sunken)] ${c.calculada ? "bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--rule-soft)_6px_7px)]" : ""}`}
            title={c.calculada ? "Lo calcula el sistema: no hace falta llenarla" : undefined}
          >
            <span className="truncate text-xs font-semibold text-[var(--text-primary)]">{c.titulo}</span>
            <span className="truncate text-xs text-[var(--text-secondary)]">{c.unidad ?? " "}</span>
          </div>
        ))}
        <div className={`${CELDA} border-t text-xs text-[var(--text-tertiary)]`}>Ej.</div>
        {cols.map((c) => (
          <div key={c.clave} className={`${CELDA} border-t font-mono text-xs text-[var(--text-tertiary)]`}>
            <span className="truncate">{c.ejemplo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
