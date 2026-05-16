"use client";

/**
 * InventarioCharts — charts base del módulo Inventario.
 *
 * Rediseñado con DashboardSection + primitivas Buleje DS + DraggableSections.
 *
 * Secciones:
 *  1. Valor y stock por categoría (Composed)
 *  2. Movimiento diario 14d (Composed entradas/salidas)
 *  3. Top 10 salidas (MicroList con tendencia)
 *  4. Distribución por rango de stock (Donut)
 *  5. Días de cobertura (Composed con umbrales)
 *  6. Proyección de agotamiento (Composed con umbral crítico 7d) + botón Generar OC
 */

import { useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { InventarioData } from "./InventarioDashboard";
import {
  BulejeComposedChart,
  BulejeDonutChart,
} from "@/components/ui-system/charts";
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { ReorderModal, type ReorderCandidate } from "./ReorderModal";
import { Package, Bell } from "@buleje/design-system/icons";
import { toast } from "sonner";

function fmtS(v: number) {
  return `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}
function fmtU(v: number) {
  return `${v.toLocaleString("es-PE")} u`;
}

export default function InventarioCharts({ data }: { data: InventarioData }) {
  const [reorderOpen, setReorderOpen] = useState(false);
  const [sendingAlert, setSendingAlert] = useState(false);
  const reorderCandidates: ReorderCandidate[] = data.proyeccionAgotamiento
    .filter((p) => p.status === "critico" || p.status === "alerta")
    .slice(0, 20)
    .map((p) => ({
      id: p.nombre,
      name: p.nombre,
      stock: p.stock,
      suggestedQty: Math.max(5, Math.ceil(p.diario * 30)),
      daysRemaining: p.diasRestantes,
    }));

  async function handleSendAlert() {
    setSendingAlert(true);
    try {
      const res = await fetch("/api/admin/alerts/stock-critical", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Error");
      }
      if (json.affected === 0) {
        toast("Sin SKUs críticos", {
          description: "No se enviaron alertas — todo en orden.",
        });
      } else {
        const channels = json.channels ?? {};
        const active = [
          channels.inApp ? "in-app" : null,
          channels.whatsapp ? "WhatsApp" : null,
          channels.telegram ? "Telegram" : null,
        ].filter(Boolean);
        toast.success("Alerta disparada", {
          description: `${json.affected} SKUs · canales: ${active.length > 0 ? active.join(", ") : "solo log interno (configurá webhooks)"}`,
          duration: 4000,
        });
      }
    } catch (err) {
      toast.error("No se pudo enviar alerta", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSendingAlert(false);
    }
  }
  const catTop = useMemo(() => {
    const arr = data.stockPorCategoria;
    if (arr.length === 0) return { top: null, totalValor: 0, share: 0 };
    const totalValor = arr.reduce((s, c) => s + c.valor, 0);
    const top = arr[0];
    const share = totalValor > 0 ? Math.round((top.valor / totalValor) * 100) : 0;
    return { top, totalValor, share };
  }, [data.stockPorCategoria]);

  const movKpis = useMemo(() => {
    const totalSalidas = data.movimientoDiario.reduce((s, d) => s + d.salidas, 0);
    const totalEntradas = data.movimientoDiario.reduce((s, d) => s + d.entradas, 0);
    const neto = totalEntradas - totalSalidas;
    const diaPico = data.movimientoDiario.reduce(
      (best, d) => (d.salidas > best.salidas ? d : best),
      { dia: "—", entradas: 0, salidas: 0 },
    );
    return { totalSalidas, totalEntradas, neto, diaPico };
  }, [data.movimientoDiario]);

  const topSalidasRows = data.topSalidas.slice(0, 10).map((p) => ({
    name: p.nombre.length > 22 ? p.nombre.slice(0, 21) + "…" : p.nombre,
    value: p.unidades,
    label: `${fmtU(p.unidades)} ${p.tendencia === "up" ? "↑" : p.tendencia === "down" ? "↓" : "·"}`,
  }));

  const cobKpis = useMemo(() => {
    const critico = data.coberturaDias.filter((c) => c.status === "critico").length;
    const alerta = data.coberturaDias.filter((c) => c.status === "alerta").length;
    const promDias = data.coberturaDias.length
      ? Math.round(
          data.coberturaDias.reduce((s, c) => s + Math.min(c.dias, 365), 0) /
            data.coberturaDias.length,
        )
      : 0;
    const worst = data.coberturaDias[0];
    return { critico, alerta, promDias, worst };
  }, [data.coberturaDias]);

  const coverChart = data.coberturaDias.slice(0, 10).map((c) => ({
    producto: c.nombre.length > 14 ? c.nombre.slice(0, 13) + "…" : c.nombre,
    dias: Math.min(c.dias, 90),
    umbralCritico: 7,
    umbralAlerta: 14,
  }));

  const stockoutChart = data.proyeccionAgotamiento.slice(0, 10).map((p) => ({
    producto: p.nombre.length > 14 ? p.nombre.slice(0, 13) + "…" : p.nombre,
    dias: Math.min(p.diasRestantes, 60),
    stock: p.stock,
  }));

  const stockoutKpis = useMemo(() => {
    const critico = data.proyeccionAgotamiento.filter((p) => p.status === "critico").length;
    const alerta = data.proyeccionAgotamiento.filter((p) => p.status === "alerta").length;
    const worstItem = data.proyeccionAgotamiento[0];
    return { critico, alerta, worstItem };
  }, [data.proyeccionAgotamiento]);

  const sections: DraggableItem[] = [
    {
      id: "valor-categoria",
      span: "full",
      render: () => (
        <DashboardSection
          chartId="inventario.valor-categoria"
          hasData={true}
          kicker="Valor del inventario · por categoría"
          title="Cuánto vale y cuánto hay por categoría"
          description="Plata trabada y unidades por categoría."
          kpis={[
            { label: "Valor total", value: fmtS(data.valorInventario), tone: "primary" },
            { label: "Categoría líder", value: catTop.top?.nombre ?? "—", tone: "success" },
            {
              label: "Valor líder",
              value: fmtS(catTop.top?.valor ?? 0),
              tone: "primary",
            },
            {
              label: "Share líder",
              value: `${catTop.share}%`,
              tone: catTop.share >= 40 ? "warning" : "neutral",
            },
          ]}
        >
          <BulejeComposedChart
            data={data.stockPorCategoria.map((c) => ({
              categoria: c.nombre,
              valor: Math.round(c.valor),
              cantidad: c.cantidad,
            }))}
            xKey="categoria"
            bars={[{ key: "valor", label: "Valor S/", color: "primary", yAxis: "left" }]}
            lines={[{ key: "cantidad", label: "Unidades", color: "accent", yAxis: "right" }]}
            leftAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            rightAxisFormat={(v) => v.toString()}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("valor")
                ? fmtS(Number(v))
                : fmtU(Number(v))
            }
            height={300}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "movimiento-diario",
      span: "full",
      render: () => (
        <DashboardSection
          chartId="inventario.movimiento-diario"
          hasData={true}
          kicker="Movimiento · rango activo"
          title="Entradas y salidas de stock"
          description="Entradas (compras) y salidas (ventas) por día."
          kpis={[
            { label: "Salidas 14d", value: fmtU(movKpis.totalSalidas), tone: "primary" },
            { label: "Entradas 14d", value: fmtU(movKpis.totalEntradas), tone: "success" },
            {
              label: "Neto",
              value: fmtU(movKpis.neto),
              tone: movKpis.neto >= 0 ? "success" : "warning",
            },
            { label: "Día pico salida", value: movKpis.diaPico.dia, tone: "neutral" },
          ]}
        >
          <BulejeComposedChart
            data={data.movimientoDiario}
            xKey="dia"
            bars={[
              { key: "entradas", label: "Entradas", color: "primary", yAxis: "left" },
              { key: "salidas", label: "Salidas", color: "amber", yAxis: "left" },
            ]}
            leftAxisFormat={(v) => v.toString()}
            tooltipFormat={(v) => fmtU(Number(v))}
            height={280}
            minDataPoints={2}
          />
        </DashboardSection>
      ),
    },
    {
      id: "top-salidas",
      span: "full",
      render: () => (
        <DashboardSection
          chartId="inventario.top-salidas"
          hasData={true}
          kicker="Productos · más rotación · periodo"
          title="Top 10 productos por unidades salidas"
          description="Productos con más rotación."
          kpis={[
            {
              label: "Líder",
              value: data.topSalidas[0]?.nombre.slice(0, 20) ?? "—",
              tone: "success",
            },
            {
              label: "Salidas líder",
              value: fmtU(data.topSalidas[0]?.unidades ?? 0),
              tone: "primary",
            },
            {
              label: "Subiendo",
              value: String(data.topSalidas.filter((p) => p.tendencia === "up").length),
              tone: "success",
            },
            {
              label: "Bajando",
              value: String(data.topSalidas.filter((p) => p.tendencia === "down").length),
              tone: "warning",
            },
          ]}
        >
          <MicroList items={topSalidasRows} barColor="var(--brand-primary)" showRank />
        </DashboardSection>
      ),
    },
    {
      id: "distribucion-stock",
      render: () => (
        <DashboardSection
          chartId="inventario.distribucion-stock"
          hasData={true}
          defaultVisible={false}
          kicker="Distribución · SKUs por rango de stock"
          title="Cuántos productos hay en cada rango"
          description="SKUs agrupados por rango de stock."
          kpis={[
            { label: "Total SKUs", value: String(data.totalProductos), tone: "primary" },
            {
              label: "Agotados",
              value: String(data.agotados),
              tone: data.agotados > 0 ? "warning" : "success",
            },
            {
              label: "Stock crítico",
              value: String(data.stockCritico),
              tone: data.stockCritico > 0 ? "warning" : "success",
            },
            {
              label: "Sin movimiento",
              value: String(data.sinMovimiento),
              tone: data.sinMovimiento > 5 ? "warning" : "neutral",
            },
          ]}
        >
          <div className="flex items-center justify-center py-2">
            <div className="w-full max-w-md">
              <BulejeDonutChart
                data={data.distribucionStock.map((d) => ({ name: d.rango, value: d.cantidad }))}
                height={260}
                format={(v) => `${v} SKUs`}
                label={
                  <div className="text-center">
                    <p className="text-[length:var(--ts-3xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      Total
                    </p>
                    <p className="text-2xl font-extrabold text-[var(--text-primary)]">
                      {data.totalProductos}
                    </p>
                    <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">SKUs activos</p>
                  </div>
                }
              />
            </div>
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "dias-cobertura",
      render: () => (
        <DashboardSection
          chartId="inventario.dias-cobertura"
          hasData={true}
          defaultVisible={false}
          kicker="Cobertura · días restantes top-10"
          title="Días de stock para los productos más expuestos"
          description="Días de stock restante. Rojo = reponer YA."
          kpis={[
            {
              label: "En crítico",
              value: String(cobKpis.critico),
              tone: cobKpis.critico > 0 ? "warning" : "success",
            },
            {
              label: "En alerta",
              value: String(cobKpis.alerta),
              tone: cobKpis.alerta > 0 ? "primary" : "success",
            },
            { label: "Peor días", value: `${cobKpis.worst?.dias ?? 0}d`, tone: "warning" },
            { label: "Promedio", value: `${cobKpis.promDias}d`, tone: "neutral" },
          ]}
        >
          <BulejeComposedChart
            data={coverChart}
            xKey="producto"
            bars={[{ key: "dias", label: "Días de stock", color: "primary", yAxis: "left" }]}
            lines={[
              { key: "umbralAlerta", label: "Alerta (14d)", color: "amber", yAxis: "left" },
              { key: "umbralCritico", label: "Crítico (7d)", color: "accent", yAxis: "left" },
            ]}
            leftAxisFormat={(v) => `${v}d`}
            tooltipFormat={(v) => `${v} días`}
            height={280}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "stockout-proyeccion",
      span: "full",
      render: () => (
        <DashboardSection
          chartId="inventario.stockout-proyeccion"
          hasData={true}
          kicker="Proyección · cuándo se agota"
          title="Días hasta agotarse · top 10 riesgo"
          description="Cuándo se agota cada SKU al ritmo actual."
          rightSlot={
            reorderCandidates.length > 0 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendAlert}
                  disabled={sendingAlert}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold bg-[var(--data-warning-500)] text-white hover:bg-[var(--data-warning-500)]/90 shadow-sm transition-all disabled:opacity-50"
                >
                  <Bell className="h-3.5 w-3.5" />
                  {sendingAlert ? "Enviando..." : "Enviar alerta"}
                </button>
                <button
                  type="button"
                  onClick={() => setReorderOpen(true)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 shadow-sm transition-all"
                >
                  <Package className="h-3.5 w-3.5" />
                  Generar OC ({reorderCandidates.length})
                </button>
              </div>
            ) : undefined
          }
          kpis={[
            {
              label: "Crítico (<7d)",
              value: String(stockoutKpis.critico),
              tone: stockoutKpis.critico > 0 ? "warning" : "success",
            },
            {
              label: "Alerta (<14d)",
              value: String(stockoutKpis.alerta),
              tone: stockoutKpis.alerta > 0 ? "primary" : "success",
            },
            {
              label: "Más urgente",
              value: stockoutKpis.worstItem?.nombre?.slice(0, 18) ?? "—",
              tone: "warning",
            },
            {
              label: "Días urgente",
              value: `${stockoutKpis.worstItem?.diasRestantes ?? 0}d`,
              tone: "warning",
            },
          ]}
        >
          <BulejeComposedChart
            data={stockoutChart}
            xKey="producto"
            bars={[{ key: "dias", label: "Días restantes", color: "primary", yAxis: "left" }]}
            lines={[{ key: "stock", label: "Stock actual", color: "accent", yAxis: "right" }]}
            leftAxisFormat={(v) => `${v}d`}
            rightAxisFormat={(v) => v.toString()}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("días") ? `${v} días` : `${v} u`
            }
            height={280}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
  ];

  return (
    <>
      <DraggableSections
        items={sections}
        storageKey="inventario-base-order"
        layout="grid"
        gap={4}
        minColumnWidth="22rem"
      />
      <ReorderModal
        open={reorderOpen}
        candidates={reorderCandidates}
        onClose={() => setReorderOpen(false)}
      />
    </>
  );
}
