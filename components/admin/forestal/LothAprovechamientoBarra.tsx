/**
 * La barra apilada del aprovechamiento: despachado · en patio · resto del
 * talado · en pie, sobre la base (registrado o autorizado), con la marca del
 * 100 % y —si hay plazo— la marca de HOY. Lo que se pasó de la base se pinta
 * en rojo detrás de la marca.
 *
 * Sin estado ni efectos: los tramos y sus anchos vienen hechos de
 * `analizarAprovechamiento` (lib/forestal/loth-aprovechamiento).
 */

import { formatNumber } from "@/lib/format";
import type { Aprovechamiento, TramoId } from "@/lib/forestal/loth-aprovechamiento";

/** El color de cada tramo. «En pie» es el riel vacío: lo que falta. */
export const COLOR_TRAMO: Record<TramoId, string> = {
  despachado: "bg-[var(--accent)]",
  patio: "bg-[var(--data-info-500)]",
  talado: "bg-[var(--data-8)]",
  enPie: "bg-[var(--surface-sunken)] ring-1 ring-inset ring-[var(--rule-strong)]/30",
};

const m3 = (v: number) => `${formatNumber(v, 3)} m³`;

/** Lo que lee un lector de pantalla: los tramos en una frase. */
function resumen(a: Aprovechamiento): string {
  const tramos = a.tramos.filter((t) => t.m3 > 0).map((t) => `${t.label.toLowerCase()} ${m3(t.m3)}`);
  const pct = a.pct == null ? "sin base" : `${formatNumber(a.pct, 1)} % ${a.nombreAvance}`;
  return `${pct}. ${tramos.join(", ")}.${a.excesos.length ? ` ${a.excesos.join(". ")}.` : ""}`;
}

export default function LothAprovechamientoBarra({ a, compacta = false }: { a: Aprovechamiento; compacta?: boolean }) {
  const exceso = a.marca100 < 99.9;
  /* La marca de hoy cae sobre la base, no sobre la escala con exceso. */
  const hoy = a.ritmo && a.ritmo.diasDesfase != null ? (a.ritmo.avanceTiempoPct / 100) * a.marca100 : null;
  const alto = compacta ? "h-2" : "h-4";
  return (
    <div className={compacta ? "" : "pt-4"}>
      <div className="relative" role="img" aria-label={resumen(a)} title={compacta ? resumen(a) : undefined}>
        <div className={`flex ${alto} w-full overflow-hidden rounded-full bg-[var(--surface-sunken)] ring-1 ring-inset ring-[var(--rule-base)]`}>
          {a.tramos.filter((t) => t.id !== "enPie" && t.ancho > 0).map((t) => (
            <span key={t.id} data-tramo={t.id} className={`h-full ${COLOR_TRAMO[t.id]}`} style={{ width: `${t.ancho}%` }} />
          ))}
        </div>
        {exceso && (
          <span
            aria-hidden="true"
            data-exceso
            className={`absolute inset-y-0 right-0 ${alto} rounded-r-full bg-[var(--data-error-500)]/45 ring-1 ring-inset ring-[var(--data-error-500)]`}
            style={{ left: `${a.marca100}%` }}
          />
        )}
        <Marca pos={a.marca100} etiqueta={compacta ? null : "100 %"} fuerte />
        {hoy != null && <Marca pos={hoy} etiqueta={compacta ? null : "hoy"} />}
      </div>
    </div>
  );
}

/** Una raya vertical sobre la barra, con su rótulo arriba. */
function Marca({ pos, etiqueta, fuerte = false }: { pos: number; etiqueta: string | null; fuerte?: boolean }) {
  /* Pegada al borde, el rótulo se alinea hacia adentro para no salirse. */
  const alinear = pos > 92 ? "-translate-x-full" : pos < 8 ? "" : "-translate-x-1/2";
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-y-[-3px]" style={{ left: `${Math.min(100, Math.max(0, pos))}%` }}>
      <span className={`absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full ${fuerte ? "bg-[var(--text-primary)]" : "bg-[var(--text-secondary)]"}`} />
      {etiqueta && (
        <span className={`absolute -top-4 whitespace-nowrap text-[length:var(--ts-2xs)] font-bold leading-none ${alinear} ${fuerte ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
          {etiqueta}
        </span>
      )}
    </span>
  );
}
