"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, DollarSign, PackageCheck, TrendingUp, type LucideIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { button } from "@/components/ui-system/button-variants";
import { diaCorto } from "@/lib/compras/ciclo-oc";
import type { ClaveMetrica, EvaluacionProveedor, MetricaEvaluacion } from "@/lib/compras/evaluacion-proveedor";
import { cn } from "@/lib/utils";

type Meses = "3" | "6" | "12";

const PERIODOS: { value: Meses; label: string }[] = [
  { value: "3", label: "3 meses" },
  { value: "6", label: "6 meses" },
  { value: "12", label: "12 meses" },
];

const ICONO: Record<ClaveMetrica, LucideIcon> = {
  puntualidad: Clock,
  completas: PackageCheck,
  precio: DollarSign,
  rapidez: TrendingUp,
};

const NOTA_COLOR: Record<string, string> = {
  A: "bg-[var(--data-success-100)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15",
  B: "bg-[var(--data-success-100)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15",
  C: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15",
  D: "bg-[var(--data-error-100)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15",
};

type Tono = "success" | "warning" | "error";
/** «viernes 17/10» si es de este año; «17/10/2025» si no (12 meses atrás se leía como hoy). */
const desdeConAnio = (desde: string, hasta: string): string =>
  desde.slice(0, 4) === hasta.slice(0, 4) ? diaCorto(desde) : `${desde.slice(8, 10)}/${desde.slice(5, 7)}/${desde.slice(0, 4)}`;

const tono = (v: number): Tono => (v >= 70 ? "success" : v >= 55 ? "warning" : "error");
// Clases enteras (Tailwind no ve las que se arman con `${}`).
const BARRA: Record<Tono, string> = { success: "bg-[var(--data-success-500)]", warning: "bg-[var(--data-warning-500)]", error: "bg-[var(--data-error-500)]" };
const ARO: Record<Tono, string> = { success: "stroke-[var(--data-success-500)]", warning: "stroke-[var(--data-warning-500)]", error: "stroke-[var(--data-error-500)]" };

function Barra({ m }: { m: MetricaEvaluacion }) {
  const Icono = ICONO[m.clave];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)]">
          <Icono className="h-3.5 w-3.5" aria-hidden /> {m.etiqueta}
          <span className="text-[var(--text-tertiary)]">· pesa {m.peso} %</span>
        </span>
        <span className={cn("font-bold tabular-nums", m.valor === null ? "font-medium text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")}>
          {m.valor === null ? "Sin medir" : `${m.valor} %`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--rule-base)]">
        {m.valor !== null && (
          <div className={cn("h-full rounded-full", BARRA[tono(m.valor)])} style={{ width: `${Math.min(100, Math.max(0, m.valor))}%` }} />
        )}
      </div>
      <p className="text-sm text-[var(--text-tertiary)]">{m.detalle}</p>
    </div>
  );
}

/**
 * Cómo te entrega un proveedor en los últimos 3, 6 o 12 meses (C36): período,
 * muestra y fórmula a la vista. Con menos órdenes que llegaron que el mínimo
 * sigue «sin evaluar»; una orden sin fecha prometida no cuenta como puntual.
 */
export default function SupplierScorecard({ supplierId }: { supplierId: string }) {
  const [meses, setMeses] = useState<Meses>("12");
  const [datos, setDatos] = useState<{ clave: string; ev: EvaluacionProveedor } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const clave = `${supplierId}|${meses}`;

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    fetch(`/api/proveedores/${encodeURIComponent(supplierId)}/scorecard?meses=${meses}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "No encontramos ese proveedor." : "No se pudo calcular cómo te entrega.");
        setDatos({ clave: `${supplierId}|${meses}`, ev: (await r.json()) as EvaluacionProveedor });
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : "No se pudo calcular cómo te entrega.");
      });
    return () => ctrl.abort();
  }, [supplierId, meses, vuelta]);

  const ev = datos?.clave === clave ? datos.ev : null;
  const cargando = !ev && !error;

  return (
    <div className="space-y-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SegmentedControl<Meses> value={meses} onChange={setMeses} options={PERIODOS} size="md" label="Período" />
        <InfoTip
          title="Cómo se calcula"
          what={ev?.formula ?? "Promedio ponderado de lo que se pudo medir en el período."}
          affects={`Hacen falta ${ev?.minimo ?? 3} órdenes que llegaron para dar una nota. Las anuladas no cuentan. Una orden sin fecha prometida no se marca ni a tiempo ni atrasada; una pendiente con la fecha vencida sí está atrasada.`}
          example="Llegó 4 de 5 veces hasta el día prometido = 80 % a tiempo."
        />
        {ev && (
          <span className="text-sm text-[var(--text-secondary)]">
            Desde el {desdeConAnio(ev.periodo.desde, ev.periodo.hasta)}: {ev.muestra.ordenes} {ev.muestra.ordenes === 1 ? "orden" : "órdenes"} · {ev.muestra.llegaron} {ev.muestra.llegaron === 1 ? "llegó" : "llegaron"} · {ev.muestra.pendientes} por llegar
            {ev.muestra.anuladas ? ` · ${ev.muestra.anuladas} anulada${ev.muestra.anuladas === 1 ? "" : "s"} no cuenta${ev.muestra.anuladas === 1 ? "" : "n"}` : ""}
          </span>
        )}
      </div>

      {error ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--data-error-ink)]">{error}</span>
          <button type="button" onClick={() => setVuelta((v) => v + 1)} className={button({ variant: "ghost", className: "rounded-xl" })}>Reintentar</button>
        </div>
      ) : cargando || !ev ? (
        <div className="animate-pulse space-y-3" aria-busy>
          <div className="h-16 w-1/2 rounded-xl bg-[var(--surface-sunken)]" />
          <div className="h-2 w-full rounded bg-[var(--surface-sunken)]" />
          <div className="h-2 w-3/4 rounded bg-[var(--surface-sunken)]" />
        </div>
      ) : (
        <>
          <Puntaje ev={ev} />
          <div className="grid gap-4 md:grid-cols-2">
            {ev.metricas.map((m) => <Barra key={m.clave} m={m} />)}
          </div>
        </>
      )}
    </div>
  );
}

function Puntaje({ ev }: { ev: EvaluacionProveedor }) {
  if (ev.puntaje === null) {
    const hechas = Math.min(ev.muestra.llegaron, ev.minimo);
    const faltan = ev.minimo - hechas;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--surface-sunken)] p-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Sin evaluar: {hechas} de {ev.minimo} órdenes que llegaron</p>
          <p className="text-sm text-[var(--text-secondary)]">
            {faltan === 1 ? "Falta 1 orden recibida" : `Faltan ${faltan} órdenes recibidas`} en este período para darle una nota. Abajo va lo que ya se puede medir.
          </p>
        </div>
        <div
          className="h-2 w-full max-w-[12rem] overflow-hidden rounded-full bg-[var(--rule-base)]"
          role="progressbar" aria-valuenow={hechas} aria-valuemin={0} aria-valuemax={ev.minimo} aria-label="Órdenes recibidas para poder evaluar"
        >
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(hechas / ev.minimo) * 100}%` }} />
        </div>
      </div>
    );
  }

  const t = tono(ev.puntaje);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative h-16 w-16 shrink-0">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64" aria-hidden>
          <circle cx="32" cy="32" r="28" fill="none" strokeWidth="5" className="stroke-[var(--rule-base)]" />
          <circle
            cx="32" cy="32" r="28" fill="none" strokeWidth="5" strokeLinecap="round"
            className={ARO[t]}
            strokeDasharray={`${(ev.puntaje / 100) * 175.93} 175.93`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{ev.puntaje}</span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-lg px-2.5 py-0.5 text-2xl font-extrabold", NOTA_COLOR[ev.nota ?? "D"])}>{ev.nota}</span>
          {ev.puntaje >= 70 ? (
            <span className="flex items-center gap-1 text-sm font-semibold text-[var(--data-success-ink)]"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Te cumple</span>
          ) : ev.puntaje < 55 ? (
            <span className="flex items-center gap-1 text-sm font-semibold text-[var(--data-error-ink)]"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Revisa condiciones</span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {ev.diasPromedioEntrega !== null ? `Tarda ${String(ev.diasPromedioEntrega).replace(".", ",")} días en promedio` : "Sin fechas de recepción"}
          {ev.atrasoPromedioDias !== null ? ` · cuando se atrasa, ${String(ev.atrasoPromedioDias).replace(".", ",")} días tarde` : ""}
          {ev.muestra.sinFechaPrometida ? ` · ${ev.muestra.sinFechaPrometida} sin fecha prometida` : ""}
        </p>
      </div>
    </div>
  );
}
