"use client";
import { CardTitle, DataTable, LoadingState } from "@buleje/design-system";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import {
  Star, Download, Eye,
  Coins, HelpCircle, TrendingDown,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import { VacioMetricas } from "@/components/admin/analisis/metricas-tarjetas";
import type { BCGProduct } from "@/app/api/analytics/bcg/route";
import { formatNumber } from "@/lib/format";

/* ── Types ── */
type Quadrant = "estrella" | "vaca" | "interrogante" | "perro";
/** `productId` renombrado a `id` para calzar con el resto del componente
 *  (celdas, detalle, exportar) que ya hablaba de `id` antes de conectarse
 *  a datos reales. */
type Product = Omit<BCGProduct, "productId"> & { id: number };

/* ── Config ── */
const Q_CONFIG: Record<Quadrant, { label: string; Icon: LucideIcon; color: string; bg: string; desc: string }> = {
  estrella: { label: "Estrellas", Icon: Star, color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/20 border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]", desc: "Alto crecimiento + alta participación. Invertir y potenciar." },
  vaca: { label: "Vacas Lecheras", Icon: Coins, color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15 border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30", desc: "Bajo crecimiento + alta participación. Máximo beneficio, mínima inversión." },
  interrogante: { label: "Interrogantes", Icon: HelpCircle, color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15 border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30", desc: "Alto crecimiento + baja participación. Evaluar si invertir o descartar." },
  perro: { label: "Perros", Icon: TrendingDown, color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-canvas)]/20 border-[var(--rule-base)]", desc: "Bajo crecimiento + baja participación. Considerar eliminar." },
};

const fmt = (n: number) => `S/ ${formatNumber(n, { min: 2 })}`;

export default function BCGMatrixTab() {
  const [PRODUCTS, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQ, setSelectedQ] = useState<Quadrant | "todas">("todas");
  const [detail, setDetail] = useState<Product | null>(null);
  const detailModalRef = useRef<HTMLDivElement>(null);
  const detailTitleId = useId();
  const cerrarDetail = useCallback(() => setDetail(null), []);
  useModalAccesible(detailModalRef, { onCerrar: cerrarDetail, activo: !!detail });
  /** Ventana: se mueve, se achica y se fija (ADR-420). */
  const ventanaDetalle = useVentanaDeModal(!!detail, {
    ref: detailModalRef,
    aplicarTranslate: true,
    claveMemoria: "bcg-detalle-producto",
  });

  useEffect(() => {
    fetch("/api/analytics/bcg", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: BCGProduct[]) => setProducts(d.map((p) => ({ ...p, id: p.productId }))))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  // Posición del punto en el mapa: determinística por producto (no `Math.random`
  // en cada render, si no los puntos "bailan" cada vez que el componente
  // vuelve a pintar), pero recalculada cuando llegan datos nuevos.
  const DOT_POSITIONS = useMemo(() => {
    const map = new Map<number, { x: number; y: number }>();
    let seed = 0;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    PRODUCTS.forEach(p => {
      const x = p.quadrant === "estrella" || p.quadrant === "vaca" ? 10 + rand() * 35 : 55 + rand() * 35;
      const y = p.quadrant === "estrella" || p.quadrant === "interrogante" ? 10 + rand() * 35 : 55 + rand() * 35;
      map.set(p.id, { x, y });
    });
    return map;
  }, [PRODUCTS]);

  const grouped = useMemo(() => {
    const g: Record<Quadrant, Product[]> = { estrella: [], vaca: [], interrogante: [], perro: [] };
    PRODUCTS.forEach(p => g[p.quadrant].push(p));
    return g;
  }, [PRODUCTS]);

  const filtered = selectedQ === "todas" ? PRODUCTS : PRODUCTS.filter(p => p.quadrant === selectedQ);
  const totalRevenue = PRODUCTS.reduce((s, p) => s + p.revenue, 0);

  if (loading) return <LoadingState />;

  if (PRODUCTS.length === 0) {
    return (
      <VacioMetricas
        icono={Star}
        titulo="Todavía no hay ventas suficientes para la matriz"
        descripcion="Compara los últimos 30 días contra los 30 anteriores: hacen falta ventas en los dos."
      />
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Sin título propio: el panel de Métricas dice «Matriz BCG» y su ⓘ
          explica los cuadrantes. Los cuatro cuadrantes filtran la tabla. */}
      <div className="flex flex-wrap items-stretch gap-2">
        {(["estrella", "vaca", "interrogante", "perro"] as Quadrant[]).map(q => {
          const c = Q_CONFIG[q];
          const items = grouped[q];
          const rev = items.reduce((s, p) => s + p.revenue, 0);
          return (
            <button key={q} type="button" aria-pressed={selectedQ === q} title={c.desc} onClick={() => setSelectedQ(selectedQ === q ? "todas" : q)} className={cn("min-h-12 min-w-0 flex-1 basis-40 rounded-xl border px-3 py-2 text-left transition-colors", c.bg, selectedQ === q && "ring-2 ring-[var(--accent)]")}>
              <span className={cn("block text-sm font-extrabold", c.color)}>{c.label} · {items.length}</span>
              <span className="block text-sm text-[var(--text-secondary)]">{fmt(rev)} ({totalRevenue > 0 ? ((rev / totalRevenue) * 100).toFixed(0) : 0} %)</span>
            </button>
          );
        })}
        <button type="button" onClick={() => exportToCSV(PRODUCTS.map(p => ({ Producto: p.name, Categoría: p.category, Ingreso: p.revenue, Crecimiento: `${p.growth}%`, Participación: `${p.marketShare}%`, Cuadrante: Q_CONFIG[p.quadrant].label })), "bcg-matrix")} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {/* Visual Matrix */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-6">
        <div className="relative w-full aspect-square max-w-[420px] mx-auto" style={{ minHeight: 320 }}>
          {/* Axes */}
          <div className="absolute inset-0 grid grid-cols-1 sm:grid-cols-2 grid-rows-2 rounded-xl overflow-hidden">
            <div className="border-b-2 border-r-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-primary/10 dark:bg-primary/15 flex items-center justify-center p-2">
              <span className="text-sm font-semibold text-[var(--data-success-500)]/40 dark:text-[var(--data-success-500)]/40">Estrellas</span>
            </div>
            <div className="border-b-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-primary/10 dark:bg-primary/15 flex items-center justify-center p-2">
              <span className="text-sm font-semibold text-[var(--data-success-500)]/40 dark:text-[var(--data-success-500)]/40">Interrogantes</span>
            </div>
            <div className="border-r-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--data-warning-50)]/50 dark:bg-amber-950/10 flex items-center justify-center p-2">
              <span className="text-sm font-semibold text-[var(--data-warning-500)]/40 dark:text-[var(--data-warning-500)]/40">Vacas Lecheras</span>
            </div>
            <div className="bg-[var(--data-error-50)]/50 dark:bg-red-950/10 flex items-center justify-center p-2">
              <span className="text-sm font-semibold text-[var(--text-secondary)]/40 dark:text-[var(--text-tertiary)]/40">Perros</span>
            </div>
          </div>
          {/* Axis labels */}
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-sm font-semibold text-[var(--text-secondary)]">Participación (%)</div>
          <div className="absolute -left-10 top-1/2 -translate-y-1/2 -rotate-90 text-sm font-semibold text-[var(--text-secondary)] whitespace-nowrap">Crecimiento (%)</div>
          {/* Product dots */}
          {PRODUCTS.map(p => {
            const pos = DOT_POSITIONS.get(p.id) ?? { x: 50, y: 50 };
            const x = pos.x;
            const y = pos.y;
            const size = Math.max(24, Math.min(48, (p.revenue / totalRevenue) * 400));
            return (
              <button key={p.id} onClick={() => setDetail(p)} title={p.name} className={cn("absolute rounded-full border-2 border-white dark:border-card flex items-center justify-center text-[length:var(--ts-2xs)] font-bold hover:scale-125 transition-transform z-10", p.quadrant === "estrella" ? "bg-primary/10 text-white" : p.quadrant === "vaca" ? "bg-[var(--data-warning-500)] text-white" : p.quadrant === "interrogante" ? "bg-primary/10 text-white" : "bg-gray-400 text-white")} style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}>
                {p.name.slice(0, 2)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Product Table */}
      <div className="bg-[var(--surface-raised)]">
        <div className="pb-2 border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Productos ({filtered.length})</CardTitle>
        </div>
        <DataTable stickyHeader wrapperClassName="max-h-[26rem] overflow-y-auto" className="min-w-[600px]">
            <thead><tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th className="text-right">Ingreso</th>
              <th className="text-right">Crecimiento</th>
              <th className="text-right">Participación</th>
              <th>Cuadrante</th>
              <th className="text-center">Acción</th>
            </tr></thead>
            <tbody>
              {filtered.map(p => {
                const c = Q_CONFIG[p.quadrant];
                return (
                  <tr key={p.id}>
                    <td className="font-bold">{p.name}</td>
                    <td className="text-[var(--text-secondary)] dark:text-muted">{p.category}</td>
                    <td className="text-right font-bold">{fmt(p.revenue)}</td>
                    <td className={cn("text-right font-bold", p.growth >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{p.growth > 0 && "+"}{p.growth}%</td>
                    <td className="text-right font-bold">{p.marketShare}%</td>
                    <td><span className={cn("font-bold px-2 py-1 rounded-full", c.bg)}>{c.label}</span></td>
                    <td className="text-center">
                      <button aria-label="Ver" onClick={() => setDetail(p)} className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] "><Eye className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
        </DataTable>
      </div>

      </div>

      {/* Detail modal */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={(e) => { if (e.target === e.currentTarget && !ventanaDetalle.fijado) cerrarDetail(); }}>
          <div ref={detailModalRef} role="dialog" aria-modal="true" aria-labelledby={detailTitleId} tabIndex={-1} className="relative bg-[var(--surface-raised)] rounded-xl w-full max-w-md">
            <div {...ventanaDetalle.asaProps} className="px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between">
              <CardTitle id={detailTitleId} className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{detail.name}</CardTitle>
              <span className="ml-auto flex items-center gap-1">
                <ControlesDeVentana ventana={ventanaDetalle} />
              </span>
              <button onClick={cerrarDetail} aria-label="Cerrar" className="text-base sm:text-xl font-bold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">×</button>
            </div>
            <div className="px-3 sm:px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[var(--surface-alt)] rounded-xl p-3"><span className="text-sm text-[var(--text-secondary)]">Ingreso</span><p className="font-bold">{fmt(detail.revenue)}</p></div>
              <div className="bg-[var(--surface-alt)] rounded-xl p-3"><span className="text-sm text-[var(--text-secondary)]">Crecimiento</span><p className={cn("font-bold", detail.growth >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{detail.growth > 0 && "+"}{detail.growth}%</p></div>
              <div className="bg-[var(--surface-alt)] rounded-xl p-3"><span className="text-sm text-[var(--text-secondary)]">Participación</span><p className="font-bold">{detail.marketShare}%</p></div>
              <div className="bg-[var(--surface-alt)] rounded-xl p-3"><span className="text-sm text-[var(--text-secondary)]">Unidades/mes</span><p className="font-bold">{detail.units}</p></div>
              <div className="col-span-2 bg-[var(--surface-alt)] rounded-xl p-3">
                <span className="text-sm text-[var(--text-secondary)]">Cuadrante</span>
                {(() => {
                  const DIcon = Q_CONFIG[detail.quadrant].Icon;
                  return (
                    <p className="font-bold inline-flex items-center gap-1.5">
                      <DIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {Q_CONFIG[detail.quadrant].label}
                    </p>
                  );
                })()}
              </div>
              <div className="col-span-2 bg-primary/10 dark:bg-primary/15 rounded-xl p-3"><span className="text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">Recomendación</span><p className="text-sm text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-1">{Q_CONFIG[detail.quadrant].desc}</p></div>
            </div>
            <TiradorDeVentana ventana={ventanaDetalle} />
          </div>
        </div>
      )}
    </div>
  );
}
