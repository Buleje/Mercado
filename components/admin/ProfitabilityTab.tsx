"use client";

/**
 * Mi Plata › Resultado › Rentabilidad: cuánto ganas con cada producto.
 *
 * 2026-10-11 (patrón del panel): la cabecera en UNA fila —título · ⓘ ·
 * período · Indicadores · «Más»—; los cinco indicadores, plegables y
 * recordados (plegados dicen el margen en una línea); la ganancia por
 * categoría, plegada; la ventana del detalle, en su archivo.
 */

import { SectionTitle } from "@buleje/design-system";
import { useState, useMemo, useCallback } from "react";
import {
  Download, Search, AlertTriangle, RefreshCw, MoreHorizontal,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import { useProductProfitability } from "@/hooks/use-product-profitability";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useOrdenColumnas, BotonRestablecerColumnas } from "@/components/admin/shared/columnas-ordenables";
import ActionMenu from "@/components/admin/shared/action-menu";
import Plegable from "@/components/admin/shared/Plegable";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import DetalleProductoModal, { type ProfitLine } from "@/components/admin/rentabilidad/DetalleProductoModal";
import TablaRentabilidad from "@/components/admin/rentabilidad/TablaRentabilidad";
import type { FacetaOpcion } from "@/lib/admin/filtros-columna";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `${formatCurrency(n)}`;
}
/* Pasado ±999 % el porcentaje no dice nada (S/ 0.10 cobrado con S/ 18.29 de costo = −18190 %): «—», como en el Resumen. */
function pct(n: number) { return Math.abs(n) > 999 ? "—" : `${n.toFixed(1)}%`; }

const PERIODOS = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProfitabilityTab() {
  const [days, setDays] = useState<number>(30);
  const { lines: raw, resumen, since, loading, error, refetch } = useProductProfitability(days);
  const [search, setSearch] = useState("");
  /** Multi-selección, ahora en el `<th>Categoría` de la tabla — vivía como un
   *  `<select>` suelto en la barra (convención de filtros en la cabecera). */
  const [catFilter, setCatFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"marginPct" | "grossMargin" | "revenue" | "unitsSold">("marginPct");
  const [detail, setDetail] = useState<ProfitLine | null>(null);
  const cerrarDetalle = useCallback(() => setDetail(null), []);

  // Columnas de la tabla: arrastrar el título para reordenarlas.
  const ordenProf = useOrdenColumnas("profitability-productos", ["producto", "categoria", "unidades", "ingresos", "costo", "margen", "pct"]);

  const periodo = since ? `desde ${since}` : `últimos ${days} días`;

  const lines = useMemo<ProfitLine[]>(
    () => raw.map(l => ({
      id: String(l.productId),
      product: l.product,
      category: l.category,
      unitsSold: l.unitsSold,
      revenue: l.revenue,
      cogs: l.cogs,
      grossMargin: l.grossMargin,
      marginPct: l.marginPct,
      period: periodo,
      costEstimated: l.costEstimated,
    })),
    [raw, periodo]
  );

  // Las categorías salen de lo realmente vendido, no de una lista fija.
  const categories = useMemo(
    () => Array.from(new Set(lines.map(l => l.category))).sort((a, b) => a.localeCompare(b, "es")),
    [lines]
  );

  const estimatedCount = useMemo(() => lines.filter(l => l.costEstimated).length, [lines]);

  // Peso de cada categoría sobre TODAS las líneas del período (no sobre lo ya
  // filtrado): así la opción sigue ahí aunque se haya elegido otra.
  const catOptions = useMemo<FacetaOpcion[]>(() => {
    const counts: Record<string, number> = {};
    for (const l of lines) counts[l.category] = (counts[l.category] ?? 0) + 1;
    return categories.map(c => ({ value: c, count: counts[c] ?? 0 }));
  }, [lines, categories]);

  const filtered = useMemo(() => {
    let list = [...lines];
    if (catFilter.length > 0) list = list.filter(l => catFilter.includes(l.category));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l => l.product.toLowerCase().includes(q));
    }
    list.sort((a, b) => b[sortBy] - a[sortBy]);
    return list;
  }, [lines, catFilter, search, sortBy]);

  // KPIs de arriba: el período completo, lo calcula el backend.
  const totals = useMemo(
    () => ({
      revenue: resumen.totalRevenue,
      cogs: resumen.totalCogs,
      grossMargin: resumen.totalMargin,
      marginPct: resumen.marginPct,
      units: resumen.totalUnits,
    }),
    [resumen]
  );


  const catSummary = useMemo(() => {
    const map: Record<string, { revenue: number; cogs: number; margin: number }> = {};
    lines.forEach(l => {
      if (!map[l.category]) map[l.category] = { revenue: 0, cogs: 0, margin: 0 };
      map[l.category].revenue += l.revenue;
      map[l.category].cogs += l.cogs;
      map[l.category].margin += l.grossMargin;
    });
    return Object.entries(map).sort(([, a], [, b]) => b.margin - a.margin);
  }, [lines]);

  const maxCatMargin = catSummary.length > 0 ? catSummary[0][1].margin : 1;
  const mejorCategoria = catSummary[0];

  // Los cinco indicadores del período: el backend los calcula (`resumen`).
  const kpis = useKpisPlegables({
    claveMemoria: "plata:rentabilidad",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: loading && lines.length === 0,
    resumen: lines.length > 0 ? `Margen ${fmt(totals.grossMargin)} · ${pct(totals.marginPct)}` : undefined,
    tarjetas: [
      { label: "Ingresos", value: fmt(totals.revenue), color: "text-[var(--text-primary)]" },
      { label: "Costo de venta", value: fmt(totals.cogs), color: "text-[var(--text-primary)]" },
      { label: "Margen bruto", value: fmt(totals.grossMargin), color: totals.grossMargin >= 0 ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]" },
      { label: "% Margen", value: pct(totals.marginPct), color: "text-[var(--text-primary)]" },
      { label: "Unidades vendidas", value: formatNumber(totals.units), color: "text-[var(--text-primary)]" },
    ].map(({ label, value, color }) => (
      <div key={label} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <p className="mb-1 text-sm font-semibold text-[var(--text-secondary)]">{label}</p>
        <p className={cn("text-xl font-extrabold tabular-nums", color)}>{value}</p>
      </div>
    )),
  });

  return (
    <div className="space-y-4">
      {/* Una fila: título · ⓘ · período · Indicadores · Más. */}
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Ganancia por producto</SectionTitle>
        <InfoTip
          title="Ganancia por producto"
          what={`Cuánto ganas con cada producto y categoría · ${periodo}: lo que se cobró en la línea de la venta menos lo que costó.`}
          affects="Es el margen bruto: no resta luz, alquiler ni planilla. Lo que ganó el negocio en el mes, con todos los costos, está en Ganancias."
          example="Vendiste 10 arroces a S/ 4.50 que te costaron S/ 3.60: ingresos S/ 45, margen S/ 9 (20 %)."
        />
        <div role="radiogroup" aria-label="Período" className="inline-flex overflow-hidden rounded-xl border border-[var(--rule-base)]">
          {PERIODOS.map(p => (
            <button
              key={p.days}
              type="button"
              role="radio"
              aria-checked={days === p.days}
              onClick={() => setDays(p.days)}
              className={cn(
                "min-h-12 px-3 text-sm font-semibold transition-colors",
                days === p.days
                  ? "bg-[var(--accent-ink)] text-white dark:bg-[var(--accent)] dark:text-[var(--surface-canvas)]"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <ActionMenu
            label="Más"
            icon={MoreHorizontal}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            title="Actualizar y descargar"
            actions={[
              { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: refetch, busy: loading },
              {
                id: "descargar",
                label: "Descargar (CSV)",
                hint: "Lo que estás viendo, con el filtro aplicado",
                icon: Download,
                disabled: filtered.length === 0,
                onSelect: () => exportToCSV(filtered.map(l => ({ producto: l.product, categoria: l.category, unidades: l.unitsSold, ingresos: l.revenue, costo: l.cogs, margen_bruto: l.grossMargin, margen_pct: Number(l.marginPct).toFixed(1) + "%" })), "ganancias-producto"),
              },
            ]}
          />
        </div>
      </div>

      {kpis.panel}

      {error && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-[var(--data-error-ink)]" aria-hidden />
          <p className="flex-1 text-sm font-semibold text-[var(--text-primary)]">{error}</p>
          <button onClick={refetch} className="min-h-11 text-sm font-bold text-[var(--data-error-ink)] underline">
            Reintentar
          </button>
        </div>
      )}

      {/* Aviso en una línea; el porqué, en el ⓘ. */}
      {estimatedCount > 0 && !loading && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/10 px-4 py-2">
          <AlertTriangle className="h-4 w-4 text-[var(--data-warning-ink)]" aria-hidden />
          <p className="text-sm text-[var(--text-primary)]">
            <span className="font-bold">{estimatedCount}</span> {estimatedCount === 1 ? "producto con margen aproximado" : "productos con margen aproximado"}
          </p>
          <InfoTip
            title="Margen aproximado"
            what="La venta no guardó el costo del momento, así que se usa el costo actual del producto."
            affects="Si el costo cambió desde la venta, ese margen no es exacto. En la tabla lo marca el triángulo junto al costo."
          />
        </div>
      )}

      {catSummary.length > 0 && (
        <Plegable
          clave="plata:rentabilidad:categorias"
          titulo="Ganancia por categoría"
          resumen={mejorCategoria ? `${catSummary.length} ${catSummary.length === 1 ? "categoría" : "categorías"} · la que más deja: ${mejorCategoria[0]} ${fmt(mejorCategoria[1].margin)}` : undefined}
        >
          <div className="space-y-3">
            {catSummary.map(([cat, data]) => {
              const pctFill = maxCatMargin > 0 ? (data.margin / maxCatMargin) * 100 : 0;
              const mPct = data.revenue > 0 ? (data.margin / data.revenue) * 100 : 0;
              return (
                <div key={cat} className="flex flex-wrap items-center gap-3">
                  <span className="w-24 truncate text-sm font-semibold text-[var(--text-secondary)]">{cat}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded-full bg-[var(--rule-soft)]">
                    <div className="h-full rounded-full bg-[var(--data-success-500)] transition-all" style={{ width: `${Math.max(0, pctFill)}%` }} />
                  </div>
                  <span className="w-24 text-right text-sm font-bold tabular-nums text-[var(--text-primary)]">{fmt(data.margin)}</span>
                  <span className="w-14 text-right text-sm font-semibold tabular-nums text-[var(--data-success-ink)]">{pct(mPct)}</span>
                </div>
              );
            })}
          </div>
        </Plegable>
      )}

      {/* Filters & sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" className="w-full pl-9 pr-3 h-12 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
        </div>
        <select aria-label="Ordenar por" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-3 h-12 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          <option value="marginPct">Mayor % margen</option>
          <option value="grossMargin">Mayor margen bruto</option>
          <option value="revenue">Mayor ingreso</option>
          <option value="unitsSold">Mayor volumen</option>
        </select>
        <BotonRestablecerColumnas cambiado={ordenProf.cambiado} onRestablecer={ordenProf.restablecer} />
      </div>

      <TablaRentabilidad
        lines={lines}
        filtered={filtered}
        loading={loading}
        days={days}
        catFilter={catFilter}
        setCatFilter={setCatFilter}
        catOptions={catOptions}
        ordenProf={ordenProf}
        onVer={setDetail}
      />

      <DetalleProductoModal detail={detail} onClose={cerrarDetalle} />
    </div>
  );
}
