"use client";

/**
 * CacaoPreciosRegionales — "A cuánto se vende en soles" por plaza (ADR-128).
 * Traduce la referencia internacional (S//kg seco) a un estimado por eslabón de la
 * cadena: mundo → FOB → Lima → acopio regional → en chacra Ciudad Constitución.
 * Escalera de barras proporcionales (sin recharts) + toggle corriente/fino de aroma.
 * Responde "¿a cuánto se vendería aquí en CC vs Lima vs otros?".
 */
import { useMemo, useState, type ReactNode } from "react";
import { Scale, MapPin, Info, Sparkles } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { estimarPreciosRegionales } from "@/lib/cacao/cacao-precio-regional";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import CacaoChartPresent from "./CacaoChartPresent";

const sol = (v: number, d = 2) => v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function CacaoPreciosRegionales({
  refSolKg,
  usdPen,
  onPresent,
}: {
  refSolKg: number | null;
  usdPen: number | null;
  /** Abre la vista completa (modal de presentación del padre). Sin él no hay botón. */
  onPresent?: () => void;
}) {
  const [fino, setFino] = useState(false);

  const model = useMemo(() => estimarPreciosRegionales(refSolKg, fino), [refSolKg, fino]);
  const maxPct = useMemo(() => (model ? Math.max(...model.plazas.map((p) => p.pctRef)) : 100), [model]);

  /* Título + el cacao corriente o fino (el `SegmentedControl` del panel) + el botón de presentar. */
  const cabecera = (present?: ReactNode) => (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
      <CardTitle className="text-sm font-bold flex items-center gap-2">
        <Scale className="h-4 w-4 text-[var(--accent)]" /> A cuánto se vende
      </CardTitle>
      <div className="flex items-center gap-2">
        <SegmentedControl<"corriente" | "fino">
          size="lg"
          label="Tipo de cacao"
          value={fino ? "fino" : "corriente"}
          onChange={(v) => setFino(v === "fino")}
          options={[
            { value: "corriente", label: "Corriente" },
            { value: "fino", label: "Fino de aroma", icon: <Sparkles className="h-3.5 w-3.5" aria-hidden /> },
          ]}
        />
        {present}
      </div>
    </div>
  );

  if (!model) {
    return (
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        {cabecera()}
        <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">
          Esperando el precio internacional para estimar los precios locales…
        </p>
      </div>
    );
  }

  // Contenido del card como render-función: el modal de presentación pinta una
  // copia viva (mismo toggle fino). presentBtn = null dentro del modal.
  const content = (presentBtn?: ReactNode) => (
    <>
      {cabecera(presentBtn)}
      <p className="mb-3 text-xs text-[var(--text-tertiary)]">
        Estimado en <b className="text-[var(--text-secondary)]">S//kg</b> desde el precio internacional de hoy
        (S/ {sol(model.refSolKg)}/kg{usdPen ? ` · FX S/ ${sol(usdPen)}/USD` : ""}). Pasa el cursor por cada plaza para el detalle.
      </p>

      {/* Una línea por plaza: nombre · barra · precio · % */}
      <ul className="space-y-1">
        {model.plazas.map((p) => {
          const width = Math.max(6, Math.round((p.pctRef / maxPct) * 100));
          return (
            <li
              key={p.id}
              title={`${p.zona} · ${p.nota} · rango S/ ${sol(p.rango[0])}–${sol(p.rango[1])}`}
              className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${
                p.destacar ? "bg-[var(--accent)]/8 ring-1 ring-[var(--accent)]/25" : "hover:bg-[var(--surface-sunken)]"
              }`}
            >
              <span className="flex w-32 min-w-0 shrink-0 items-center gap-1.5 sm:w-40">
                {p.destacar ? <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" /> : <span className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate text-sm font-bold text-[var(--text-primary)]">{p.plaza}</span>
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div className="h-full rounded-full" style={{ width: `${width}%`, background: p.destacar ? "var(--accent)" : "var(--data-info-500)" }} />
              </div>
              <span className="w-[70px] shrink-0 text-right font-mono text-sm font-extrabold tabular-nums text-[var(--text-primary)]">S/ {sol(p.solKg)}</span>
              <span className="hidden w-10 shrink-0 text-right text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] sm:inline">{p.pctRef}%</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-start gap-2 text-[length:var(--ts-2xs)] leading-relaxed text-[var(--text-tertiary)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>{model.disclaimer}</p>
      </div>
    </>
  );

  return (
    <div className="group relative rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      {content(onPresent ? <CacaoChartPresent title="A cuánto se vende · S//kg por plaza" onClick={onPresent} /> : undefined)}
    </div>
  );
}
