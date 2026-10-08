/**
 * Piezas chicas que comparten las vistas de Rendimiento (por especie, por
 * corrida, simulador): formato, la insignia del estado de una corrida, la
 * «regla» 0-100 con el rango propio y la tendencia en miniatura.
 *
 * La regla no es un chart de librería por la misma razón que
 * `CtpRendimientoLotes`: un eje fijo de 0 a 100 se posiciona por porcentaje,
 * se imprime bien y no queda en blanco si el contenedor mide 0.
 */
import { AlertTriangle, CheckCircle2, Clock, Gauge, Minus, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { fechaConDia } from "@/lib/forestal/loth-plan-costeo";
import type { EstadoCorrida, RangoPropio, Tendencia } from "@/lib/forestal/rendimiento-especie";
import type { RendimientoPlata } from "@/lib/forestal/rendimiento-plata";

export const fmtPct = (v: number | null | undefined, d = 1): string => (v == null ? "—" : `${formatNumber(v, d)} %`);
export const fmtM3 = (v: number): string => formatNumber(v, 3);
export const fmtSol = (v: number | null): string => (v == null ? "—" : `S/ ${formatNumber(v, 2)}`);

/** El Libro CTP en la vista de Producción: ahí está cada corrida con su ficha. */
export const HREF_PRODUCCION = "/admin?tab=ctp-libro-operaciones&vista=produccion";

/** «3 corridas: rango provisional» · «8 corridas» · «sin corridas terminadas». */
export function textoRango(r: RangoPropio | null): string {
  if (!r) return "Sin corridas terminadas";
  const n = `${r.corridas} ${r.corridas === 1 ? "corrida" : "corridas"}`;
  return r.provisional ? `${n}: rango provisional` : n;
}

const ESTADO: Record<EstadoCorrida, { texto: string; clase: string; Icono: typeof Gauge }> = {
  parcial: { texto: "Parcial", clase: "border-dashed border-[var(--rule-strong)] text-[var(--text-secondary)]", Icono: Clock },
  bajo_lo_suyo: {
    texto: "Bajo lo suyo",
    clase: "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
    Icono: TrendingDown,
  },
  sobre_lo_suyo: {
    texto: "Sobre lo suyo",
    clase: "border-[var(--data-info-500)] text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
    Icono: TrendingUp,
  },
  en_rango: {
    texto: "En su rango",
    clase: "border-[var(--data-success-500)] text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    Icono: CheckCircle2,
  },
  sin_rango: { texto: "Sin rango aún", clase: "border-[var(--rule-base)] text-[var(--text-tertiary)]", Icono: Gauge },
  sin_dato: { texto: "Sin dato", clase: "border-[var(--rule-base)] text-[var(--text-tertiary)]", Icono: AlertTriangle },
};

/** La insignia del estado, con el porqué en el ⓘ. */
export function EstadoCorridaBadge({ estado, rango, finProceso, hoy }: { estado: EstadoCorrida; rango: RangoPropio | null; finProceso: string | null; hoy: string }) {
  const e = ESTADO[estado];
  const detalle =
    estado === "parcial"
      ? `Rendimiento parcial · lote en proceso hasta el ${finProceso ? fechaConDia(finProceso, hoy) : "fin de su programación"}. Entró toda la troza programada y salió lo declarado hasta hoy.`
      : rango
        ? `Tu rango con esta especie: ${fmtPct(rango.min)} a ${fmtPct(rango.max)} (${textoRango(rango)}, sin contar esta corrida).`
        : estado === "sin_dato"
          ? "La corrida no declaró en m³ o no tiene troza: no hay rendimiento que medir."
          : "Es la única corrida terminada de esta especie: todavía no hay con qué compararla.";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold ${e.clase}`}>
        <e.Icono className="h-3.5 w-3.5" aria-hidden />
        {e.texto}
      </span>
      <InfoTip title={e.texto} what={detalle} />
    </span>
  );
}

const pos = (pct: number) => `${Math.min(100, Math.max(0, pct))}%`;

/** La regla 0-100: franja del rango propio y un punto por corrida (hueco = en proceso). */
export function ReglaRendimiento({
  rango, puntos, etiqueta,
}: {
  rango: RangoPropio | null;
  puntos: ReadonlyArray<{ pct: number; parcial: boolean; id: string }>;
  etiqueta: string;
}) {
  return (
    <div
      className="relative h-5 w-36 rounded-md bg-[var(--surface-sunken)] sm:w-full sm:min-w-[8rem]"
      role="img"
      aria-label={`${etiqueta}: ${puntos.map((p) => `${formatNumber(p.pct, 1)} por ciento${p.parcial ? " parcial" : ""}`).join(", ")}${rango ? `. Rango propio ${rango.min} a ${rango.max}.` : "."}`}
    >
      {rango && (
        <div
          className={`absolute inset-y-0 rounded-md bg-[var(--accent-muted)] ${rango.provisional ? "ring-1 ring-inset ring-[var(--accent)]/40" : ""}`}
          style={{ left: pos(rango.min), width: `${Math.max(1, rango.max - rango.min)}%` }}
        />
      )}
      {puntos.map((p) => (
        <span
          key={p.id}
          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${p.parcial ? "border-2 border-[var(--text-tertiary)] bg-[var(--surface-raised)]" : "bg-[var(--accent)] ring-2 ring-[var(--surface-raised)]"}`}
          style={{ left: pos(p.pct) }}
        />
      ))}
    </div>
  );
}

/** La tendencia: flecha + pendiente, con la serie en miniatura. */
export function TendenciaCelda({ t, serie }: { t: Tendencia | null; serie: ReadonlyArray<{ pct: number; parcial: boolean }> }) {
  const terminadas = serie.filter((s) => !s.parcial);
  if (!t) {
    return <span className="text-xs text-[var(--text-tertiary)]">{terminadas.length < 3 ? "Faltan corridas" : "—"}</span>;
  }
  const Icono = t.sentido === "sube" ? TrendingUp : t.sentido === "baja" ? TrendingDown : Minus;
  const max = Math.max(...terminadas.map((s) => s.pct), 1);
  const min = Math.min(...terminadas.map((s) => s.pct), 0);
  const puntos = terminadas
    .map((s, i) => `${(i / Math.max(1, terminadas.length - 1)) * 56},${18 - ((s.pct - min) / Math.max(1, max - min)) * 16}`)
    .join(" ");
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
      <svg viewBox="0 0 56 20" className="h-5 w-14" aria-hidden>
        <polyline points={puntos} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <Icono className="h-3.5 w-3.5" aria-hidden />
      {t.sentido === "estable" ? "Estable" : `${t.ptsPorCorrida > 0 ? "+" : ""}${formatNumber(t.ptsPorCorrida, 1)} pts/corrida`}
    </span>
  );
}

/** Costo o rendimiento comercial: el número, o «Falta» con la lista en el ⓘ. Nunca S/ 0. */
export function CeldaPlata({ plata, campo }: { plata: RendimientoPlata | null; campo: "comercial" | "costo" }) {
  if (!plata) return <span className="text-[var(--text-tertiary)]">—</span>;
  if (plata.servicio) return <span className="text-xs text-[var(--text-tertiary)]">De servicio</span>;
  if (campo === "comercial") {
    return plata.rendimientoPtPct == null ? (
      <span className="text-[var(--text-tertiary)]">—</span>
    ) : (
      <span className="font-mono tabular-nums" title={plata.ptEntradaEstimado ? "PT pagado estimado del m³ (× 424 × 0,624)" : "PT aserrado ÷ PT pagado"}>
        {plata.ptEntradaEstimado ? "≈ " : ""}
        {fmtPct(plata.rendimientoPtPct)}
      </span>
    );
  }
  if (plata.costoPorPt != null) return <span className="font-mono tabular-nums">{fmtSol(plata.costoPorPt)}</span>;
  const faltan = plata.faltantes.filter((f) => !f.startsWith("el PT") && f !== "el precio de venta");
  if (faltan.length === 0) return <span className="text-[var(--text-tertiary)]">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
      Falta
      <InfoTip title="Qué falta para el costo por PT" what={`Falta ${faltan.join(", ")}.`} affects="Sin eso el costo no se calcula: mostrar S/ 0 fingiría que la madera salió gratis." />
    </span>
  );
}
