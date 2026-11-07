"use client";

/**
 * PrecioCacaoInteractive — parte cliente de la página pública /precio-cacao:
 * gráfico de flujo del precio (reusa CacaoPriceChart) + calculadora "¿cuánto vale
 * tu cosecha?". Los números del precio de hoy se pintan en el server (SEO); acá va
 * lo interactivo. Brandon 2026-07-03.
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import { Calculator, ArrowRight } from "@buleje/design-system/icons";

const CacaoPriceChart = dynamic(() => import("@/components/admin/cacao/CacaoPriceChart"), {
  ssr: false,
  loading: () => <div className="flex h-[320px] items-center justify-center rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]">Cargando gráfico…</div>,
});

interface Props { series: { t: number; c: number }[]; usdPen: number | null; pricePenPerKg: number | null }

const n2 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PrecioCacaoInteractive({ series, usdPen, pricePenPerKg }: Props) {
  const [kg, setKg] = useState("");
  const kgNum = kg ? Math.max(0, Number(kg)) : 0;
  const est = pricePenPerKg != null && kgNum > 0 ? kgNum * pricePenPerKg : null;

  return (
    <div className="space-y-6">
      {series.length > 1 && <CacaoPriceChart series={series} usdPen={usdPen} />}

      {/* Calculadora: ¿cuánto vale tu cosecha? */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-[var(--text-primary)]"><Calculator className="h-5 w-5 text-[var(--accent)]" />¿Cuánto vale tu cosecha?</h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">Escribí cuántos kilos de cacao seco tenés y te damos una referencia al precio internacional de hoy (antes de flete y margen del acopiador).</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-bold text-[var(--text-primary)]">Kilos de cacao seco
            <div className="mt-1 flex items-center gap-2">
              <input type="number" inputMode="decimal" min="0" step="1" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="ej. 500" className="h-12 w-40 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
              <span className="text-sm font-bold text-[var(--text-secondary)]">kg</span>
            </div>
          </label>
          <div className="rounded-xl bg-[var(--surface-sunken)] px-4 py-3">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Referencia estimada</p>
            <p className="font-mono text-2xl font-extrabold text-[var(--accent)]">{est != null ? `S/ ${n2(est)}` : "—"}</p>
            {pricePenPerKg != null && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">a S/ {n2(pricePenPerKg)}/kg seco (ref. internacional)</p>}
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--text-tertiary)]">Es una referencia, no una oferta de compra. El precio real en chacra suele ir algo por debajo (flete + margen). Cotizá con tu acopiador.</p>
      </div>

      {/* CTA */}
      <div className="flex flex-col items-start gap-3 rounded-2xl border-2 border-[var(--accent)] bg-primary/10 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-bold text-[var(--text-primary)]">¿Acopias o produces cacao?</p>
          <p className="text-sm text-[var(--text-secondary)]">Lleva tu libro de acopio, calidad (NTP 208.040) y pago al productor con Buleje — gratis para empezar.</p>
        </div>
        <a href="/registro" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90">Crear mi cuenta<ArrowRight className="h-4 w-4" /></a>
      </div>
    </div>
  );
}
