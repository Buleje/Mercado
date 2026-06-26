"use client";

/**
 * CacaoPreciosRegionales — "A cuánto se vende en soles" por plaza (ADR-128).
 * Traduce la referencia internacional (S//kg seco) a un estimado por eslabón de la
 * cadena: mundo → FOB → Lima → acopio regional → en chacra Ciudad Constitución.
 * Escalera de barras proporcionales (sin recharts) + toggle corriente/fino de aroma.
 * Responde "¿a cuánto se vendería aquí en CC vs Lima vs otros?".
 */
import { useMemo, useState } from "react";
import { Scale, MapPin, Info, Sparkles } from "@buleje/design-system/icons";
import { estimarPreciosRegionales } from "@/lib/cacao/cacao-precio-regional";

const sol = (v: number, d = 2) => v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function CacaoPreciosRegionales({
  refSolKg,
  usdPen,
}: {
  refSolKg: number | null;
  usdPen: number | null;
}) {
  const [fino, setFino] = useState(false);

  const model = useMemo(() => estimarPreciosRegionales(refSolKg, fino), [refSolKg, fino]);
  const maxPct = useMemo(() => (model ? Math.max(...model.plazas.map((p) => p.pctRef)) : 100), [model]);

  if (!model) {
    return (
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <Header fino={fino} setFino={setFino} />
        <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">
          Esperando el precio internacional para estimar los precios locales…
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <Header fino={fino} setFino={setFino} />
      <p className="mb-4 text-xs text-[var(--text-tertiary)]">
        Estimado en <b className="text-[var(--text-secondary)]">soles por kilo</b> a partir del precio internacional de hoy
        (S/ {sol(model.refSolKg)}/kg{usdPen ? ` · FX S/ ${sol(usdPen)}/USD` : ""}).
      </p>

      <ul className="space-y-2.5">
        {model.plazas.map((p) => {
          const width = Math.max(6, Math.round((p.pctRef / maxPct) * 100));
          return (
            <li
              key={p.id}
              className={`rounded-xl border-2 p-3 transition ${
                p.destacar
                  ? "border-[var(--accent)] bg-[var(--accent)]/8"
                  : "border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {p.destacar && <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
                  <span className="truncate text-sm font-bold text-[var(--text-primary)]">{p.plaza}</span>
                  <span className="hidden shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] sm:inline">
                    {p.zona}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-mono text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                    S/ {sol(p.solKg)}
                  </span>
                  <span className="ml-1 text-xs text-[var(--text-tertiary)]">/kg {p.estado === "baba" ? "baba" : ""}</span>
                </div>
              </div>

              {/* barra proporcional */}
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${width}%`, background: p.destacar ? "var(--accent)" : "var(--data-info-500)" }}
                />
              </div>

              <div className="mt-1.5 flex items-start justify-between gap-3">
                <span className="text-xs text-[var(--text-tertiary)]">{p.nota}</span>
                <span className="shrink-0 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                  {p.pctRef}% del mundial · rango S/ {sol(p.rango[0])}–{sol(p.rango[1])}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
        <p className="text-[length:var(--ts-2xs)] leading-relaxed text-[var(--text-tertiary)]">{model.disclaimer}</p>
      </div>
    </div>
  );
}

function Header({ fino, setFino }: { fino: boolean; setFino: (v: boolean) => void }) {
  return (
    <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <Scale className="h-4 w-4 text-[var(--accent)]" /> A cuánto se vende · Ciudad Constitución vs Lima vs mundo
      </h3>
      <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
        <button
          type="button"
          onClick={() => setFino(false)}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            !fino ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Corriente
        </button>
        <button
          type="button"
          onClick={() => setFino(true)}
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            fino ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" /> Fino de aroma
        </button>
      </div>
    </div>
  );
}
