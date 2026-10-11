"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { Download, MoreHorizontal, TrendingDown, TrendingUp, Repeat } from "@buleje/design-system/icons";
import { exportToCSV } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useHistorialPrecios } from "@/components/admin/precios/hooks/use-historial-precios";
import PreciosFiltros from "@/components/admin/precios/PreciosFiltros";
import PreciosTabla from "@/components/admin/precios/PreciosTabla";
import { fmtFecha, variacionPct } from "@/components/admin/precios/precios-compartido";

interface PriceHistoryTabProps {
  /** Si se pasa, carga sólo el historial de ese producto (modo "editor de producto") */
  productId?: number;
  /** Acciones que la vista que lo monta suma al menú «Más» (p. ej. el enlace al Marketplace). */
  accionesExtra?: MenuAccion[];
}

const TARJETA = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3";

export default function PriceHistoryTab({ productId, accionesExtra = [] }: PriceHistoryTabProps) {
  const h = useHistorialPrecios(productId);
  const { cuentas, filas, nombres, filtros } = h;
  const sinFiltro = productId != null;

  const cifras = [
    { rotulo: "Cambios", valor: String(cuentas.cambios), icono: Repeat, sub: `${cuentas.productos} producto${cuentas.productos === 1 ? "" : "s"}` },
    { rotulo: "Subidas", valor: String(cuentas.subas), icono: TrendingUp },
    { rotulo: "Bajadas", valor: String(cuentas.bajas), icono: TrendingDown },
    {
      rotulo: "Cambio promedio",
      valor: cuentas.promedio == null ? "—" : `${cuentas.promedio > 0 ? "+" : ""}${formatNumber(cuentas.promedio, { max: 1 })}%`,
      icono: TrendingUp,
    },
  ];
  const kpis = useKpisPlegables({
    claveMemoria: "precios-historial",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    resumen: `${cuentas.cambios} cambios · ${cuentas.subas} suben · ${cuentas.bajas} bajan`,
    tarjetas: h.loading || filas.length === 0 ? [] : cifras.map((c) => (
      <div key={c.rotulo} className={TARJETA}>
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <c.icono className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{c.rotulo}</span>
        </div>
        <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{c.valor}</p>
        {c.sub && <p className="text-sm text-[var(--text-secondary)]">{c.sub}</p>}
      </div>
    )),
  });

  const exportar = () =>
    exportToCSV(
      filas.map((r) => {
        const pct = variacionPct(r);
        return {
          fecha: fmtFecha(r.changedAt),
          producto: nombres[r.productId] ?? `#${r.productId}`,
          precio_anterior: r.oldPrice,
          precio_nuevo: r.newPrice,
          cambio_pct: pct != null ? `${pct.toFixed(1)}%` : "N/A",
          modificado_por: r.changedBy ?? "—",
        };
      }),
      "historial-precios",
    );
  const acciones: MenuAccion[] = [
    { id: "exportar", label: "Exportar a Excel", hint: `${filas.length} cambios, con los filtros de abajo`, icon: Download, onSelect: exportar, disabled: filas.length === 0 },
    ...accionesExtra,
  ];

  if (h.loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Historial de precios</SectionTitle>
        <InfoTip
          title="Historial de precios"
          what="Cada vez que cambias el precio de un producto queda aquí: cuánto valía, cuánto vale y quién lo cambió."
          affects="Es sólo lectura: cambiar un precio se hace en Productos y stock. Exportar baja a Excel lo que estás viendo con los filtros."
          example="Arroz Costeño: de S/ 4.50 a S/ 4.80 el jueves 10/09, +6,7 %, lo cambió el dueño."
        />
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Exportar y enlaces" />
        </div>
      </div>

      {kpis.panel}

      {h.error && (
        <p role="alert" className="text-sm text-[var(--data-error-ink)]">No pudimos cargar el historial. Recarga la página para intentarlo otra vez.</p>
      )}

      {!sinFiltro && (
        <PreciosFiltros
          filtros={filtros}
          onCambiar={h.setFiltros}
          productos={h.productosConCambios}
          nombres={nombres}
          hayFiltros={h.hayFiltros}
          onLimpiar={h.limpiar}
        />
      )}

      {filas.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
          {h.hayFiltros ? "Ningún cambio coincide con los filtros." : "Aún no cambiaste ningún precio."}
        </p>
      ) : (
        <PreciosTabla filas={filas} nombres={nombres} conProducto={!sinFiltro} />
      )}
    </div>
  );
}
