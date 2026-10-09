"use client";

/**
 * InventarioCharts — los bloques de Inicio › Inventario.
 *
 * Rediseño 2026-10-09 (Brandon: «revisa los gráficos y KPIs… ocultar los que
 * no tienen información»). Cada bloque responde UNA pregunta del dueño:
 *  1. ¿Dónde está trabada mi plata?   → Valor por categoría (lista con barras)
 *  2. ¿Qué se me acaba primero?       → Por agotarse (días que quedan) + pedido
 *  3. ¿Cuánto vendo por día?          → Unidades vendidas por día (barras)
 *  4. ¿Qué es lo que más sale?        → Lo que más se vende (lista)
 *  5-6. Ocultos por defecto: SKUs por rango de stock y días de cobertura.
 *
 * Un bloque sin datos se oculta (`lib/admin/inicio/hay-datos`) hasta que
 * llegue el primero; en «Gráficos» figura como «Sin datos todavía». Los
 * rankings van como lista: el nombre se lee entero, sin etiquetas giradas.
 * Sólo presentación: las cifras llegan calculadas desde InventarioDashboard.
 */

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import type { InventarioData } from "./InventarioDashboard";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import { DashboardSection, MicroList, type MicroListItem } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { ReorderModal, type ReorderCandidate } from "./ReorderModal";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Package } from "@buleje/design-system/icons";
import { hayDatosEnSerie, hayTendencia, modoRanking } from "@/lib/admin/inicio/hay-datos";
import { COLOR_CONCEPTO, cantidad, fechaConDia, numeroEje, porcentaje, soles } from "@/lib/admin/inicio/formato-tablero";

/** Sentinela del cálculo: «no se vendió en 30 días» → no se agota al ritmo actual. */
const SIN_RITMO = 999;
/** Filas a la vista en cada lista: el bloque no crece más que su vecino. */
const FILAS_LISTA = 6;

type Proyeccion = InventarioData["proyeccionAgotamiento"][number];
type Cobertura = InventarioData["coberturaDias"][number];
type Dia = InventarioData["movimientoDiario"][number];

/** Soles sin centavos para listas y KPIs (el valor del inventario no se lee al céntimo). */
export function solesEnteros(v: number): string {
  return soles(Math.round(v)).replace(/\.00$/, "");
}

/** «hoy» · «1 día» · «12 días». */
export function diasTexto(d: number): string {
  if (d <= 0) return "hoy";
  return d === 1 ? "1 día" : `${cantidad(d)} días`;
}

/** Sólo lo que de verdad se agota: con ritmo de venta (sin la sentinela 999). */
export function filasPorAgotarse(filas: readonly Proyeccion[]): Proyeccion[] {
  return filas.filter((p) => p.diario > 0 && p.diasRestantes < SIN_RITMO);
}

/** Cobertura con ritmo de venta: los «999 días» no son cobertura, son «no se vende». */
export function filasConCobertura(filas: readonly Cobertura[]): Cobertura[] {
  return filas.filter((c) => c.dias < SIN_RITMO);
}

/** Total vendido y mejor día de la serie diaria (sólo para rotular, no recalcula). */
export function resumenSalidas(dias: readonly Dia[]): { total: number; pico: Dia | null; diasConVenta: number } {
  let total = 0;
  let pico: Dia | null = null;
  let diasConVenta = 0;
  for (const d of dias) {
    total += d.salidas;
    if (d.salidas > 0) diasConVenta += 1;
    if (d.salidas > 0 && (!pico || d.salidas > pico.salidas)) pico = d;
  }
  return { total, pico, diasConVenta };
}

/**
 * Fija el color de las series por CONCEPTO dentro de un gráfico del DS: los
 * primitivos leen `--section-*`, que `DraggableSections` rota por posición.
 * Una variable más cercana gana, así «vendido» es teal en todas las pestañas.
 */
export function ColoresSerie({ colores, children }: { colores: Partial<Record<"primary" | "secondary" | "tertiary" | "accent" | "amber", string>>; children: ReactNode }) {
  const style = Object.fromEntries(Object.entries(colores).map(([k, v]) => [`--section-${k}`, v])) as CSSProperties;
  return <div className="w-full" style={style}>{children}</div>;
}

/**
 * Las listas arrancan ARRIBA: el cuerpo de `DashboardSection` empuja al pie
 * (para que los gráficos se estiren) y la grilla iguala el alto de la fila,
 * así que una lista de 1 fila quedaba sola abajo de un hueco.
 */
export function Arriba({ children }: { children: ReactNode }) {
  return <div className="flex-1">{children}</div>;
}

/**
 * En una sola columna (celular) las filas «1fr» de `DraggableSections`
 * igualaban cada bloque al más alto: una lista de 1 producto quedaba en una
 * caja de 700 px. Con una columna no hay vecinos que alinear → alto propio.
 * (45rem ≈ dos columnas de 22rem + el espacio entre ellas.)
 */
export function AltoPropioEnUnaColumna({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      <div className="@max-[45rem]:[&_[style*=grid-auto-rows]]:[grid-auto-rows:auto]!">{children}</div>
    </div>
  );
}

/** Línea al pie de una lista recortada: «y 7 categorías más». */
function Resto({ n, que }: { n: number; que: string }) {
  if (n <= 0) return null;
  return <p className="mt-2 px-2.5 text-xs font-medium text-[var(--text-tertiary)]">y {n} {que} más</p>;
}

const BOTON_BASE =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-sm font-bold transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

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
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Error");
      if (json.affected === 0) {
        toast("Nada por avisar", { description: "Ningún producto está en stock crítico." });
      } else {
        const channels = json.channels ?? {};
        const activos = [channels.inApp ? "panel" : null, channels.whatsapp ? "WhatsApp" : null, channels.telegram ? "Telegram" : null].filter(Boolean);
        toast.success("Aviso enviado", {
          description: `${json.affected} productos · por ${activos.length > 0 ? activos.join(", ") : "registro interno (configura WhatsApp o Telegram)"}`,
          duration: 4000,
        });
      }
    } catch (err) {
      toast.error("No se pudo enviar el aviso", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSendingAlert(false);
    }
  }

  // ── 1. Valor por categoría ────────────────────────────────────────────────
  const conValor = data.stockPorCategoria.filter((c) => c.valor > 0);
  const valorCategorias = conValor.reduce((s, c) => s + c.valor, 0);
  const lider = conValor[0];
  const shareLider = lider && valorCategorias > 0 ? Math.round((lider.valor / valorCategorias) * 100) : 0;
  const itemsCategoria: MicroListItem[] = conValor.slice(0, FILAS_LISTA).map((c) => ({
    name: c.nombre,
    value: c.valor,
    label: solesEnteros(c.valor),
    sublabel: `${cantidad(c.cantidad)} u · ${porcentaje(valorCategorias > 0 ? (c.valor / valorCategorias) * 100 : 0)} del valor`,
  }));

  // ── 2. Por agotarse ───────────────────────────────────────────────────────
  const porAgotarse = filasPorAgotarse(data.proyeccionAgotamiento);
  const criticos = porAgotarse.filter((p) => p.status === "critico").length;
  const enAlerta = porAgotarse.filter((p) => p.status === "alerta").length;
  const itemsAgotarse: MicroListItem[] = porAgotarse.slice(0, FILAS_LISTA).map((p) => ({
    name: p.nombre,
    value: p.diasRestantes,
    label: diasTexto(p.diasRestantes),
    sublabel: `quedan ${cantidad(p.stock)} u · vendes ${cantidad(p.diario, 1)} al día`,
    color: p.status === "ok" ? COLOR_CONCEPTO.stock : COLOR_CONCEPTO.alerta,
    TrailIcon: p.status === "critico" ? AlertTriangle : undefined,
    trailIconClass: "text-[var(--data-warning-500)]",
  }));

  // ── 3. Vendido por día ────────────────────────────────────────────────────
  const salidas = resumenSalidas(data.movimientoDiario);

  // ── 4. Lo que más se vende ────────────────────────────────────────────────
  const modoTop = modoRanking(data.topSalidas, "unidades");
  const itemsTop: MicroListItem[] = data.topSalidas.slice(0, FILAS_LISTA).map((p) => ({
    name: p.nombre,
    value: p.unidades,
    label: `${cantidad(p.unidades)} u`,
    TrailIcon: p.tendencia === "up" ? ArrowUpRight : p.tendencia === "down" ? ArrowDownRight : undefined,
    trailIconClass: p.tendencia === "down" ? "text-[var(--data-warning-500)]" : "text-[var(--data-5)]",
  }));

  // ── 6. Cobertura ──────────────────────────────────────────────────────────
  const cobertura = filasConCobertura(data.coberturaDias);
  const modoCobertura = modoRanking(cobertura, "dias");
  const masCorta = cobertura[0];

  const sections: DraggableItem[] = [
    {
      id: "valor-categoria",
      title: "Valor por categoría",
      render: () => (
        <DashboardSection
          chartId="inventario.valor-categoria"
          hasData={hayDatosEnSerie(data.stockPorCategoria, ["valor"])}
          kicker="Inventario · a costo"
          title="Dónde está tu plata"
          description="Valor a costo del stock de cada categoría. Los productos sin costo cargado no suman."
          kpis={[
            { label: "Categoría líder", value: lider?.nombre ?? null, sub: lider ? `${shareLider}% del valor` : undefined },
            ...(data.productosSinCosto > 0
              ? [{
                  label: "Sin costo",
                  value: cantidad(data.productosSinCosto),
                  sub: "no suman al valor",
                  tone: "warning" as const,
                  hint: "Cárgales el costo en Productos para que el valor salga completo.",
                }]
              : []),
          ]}
        >
          <Arriba>
            <MicroList items={itemsCategoria} barColor={COLOR_CONCEPTO.stock} />
            <Resto n={conValor.length - itemsCategoria.length} que={conValor.length - itemsCategoria.length === 1 ? "categoría" : "categorías"} />
          </Arriba>
        </DashboardSection>
      ),
    },
    {
      id: "stockout-proyeccion",
      title: "Por agotarse",
      render: () => (
        <DashboardSection
          chartId="inventario.stockout-proyeccion"
          hasData={porAgotarse.length > 0}
          kicker="Reposición · ritmo de 30 días"
          title="Qué se acaba primero"
          description="Días que dura el stock si sigues vendiendo como en los últimos 30 días."
          kpis={[
            { label: "Se acaban en 7 días", value: cantidad(criticos), tone: criticos > 0 ? "warning" : undefined, sub: criticos > 0 ? "reponer ya" : undefined },
            { label: "En 14 días", value: cantidad(enAlerta), sub: enAlerta > 0 ? "pedir esta semana" : undefined },
          ]}
        >
          <Arriba>
            <MicroList items={itemsAgotarse} barColor={COLOR_CONCEPTO.stock} showRank={false} />
          </Arriba>
          {reorderCandidates.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setReorderOpen(true)}
                className={`${BOTON_BASE} bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90`}
              >
                <Package className="h-4 w-4" aria-hidden />
                Generar pedido ({reorderCandidates.length})
              </button>
              <button
                type="button"
                onClick={handleSendAlert}
                disabled={sendingAlert}
                className={`${BOTON_BASE} border border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--text-primary)]`}
              >
                <Bell className="h-4 w-4" aria-hidden />
                {sendingAlert ? "Avisando…" : "Avisar al equipo"}
              </button>
            </div>
          )}
        </DashboardSection>
      ),
    },
    {
      id: "movimiento-diario",
      title: "Vendido por día",
      render: () => (
        <DashboardSection
          chartId="inventario.movimiento-diario"
          hasData={hayTendencia(data.movimientoDiario, ["salidas"])}
          kicker="Salidas · últimos 14 días"
          title="Unidades vendidas por día"
          description="Unidades que salieron por ventas en caja y pedidos entregados."
          kpis={[
            { label: "Vendidas", value: `${cantidad(salidas.total)} u`, sub: `en ${salidas.diasConVenta} ${salidas.diasConVenta === 1 ? "día" : "días"} con venta` },
            { label: "Mejor día", value: salidas.pico ? fechaConDia(salidas.pico.clave) : null, sub: salidas.pico ? `${cantidad(salidas.pico.salidas)} u` : undefined },
          ]}
        >
          <ColoresSerie colores={{ accent: COLOR_CONCEPTO.ventas }}>
            <BulejeComposedChart
              data={data.movimientoDiario}
              xKey="dia"
              bars={[{ key: "salidas", label: "Unidades vendidas", color: "accent", yAxis: "left" }]}
              leftAxisFormat={numeroEje}
              tooltipFormat={(v) => `${cantidad(Number(v))} u`}
              showLegend={false}
              showValues
              valueFormat={(v) => (v > 0 ? cantidad(v) : "")}
              height={220}
              minDataPoints={2}
            />
          </ColoresSerie>
        </DashboardSection>
      ),
    },
    {
      id: "top-salidas",
      title: "Lo que más se vende",
      render: () => (
        <DashboardSection
          chartId="inventario.top-salidas"
          hasData={modoTop !== "oculto"}
          kicker="Productos · período"
          title="Lo que más se vende"
          description="Unidades vendidas en el período. La flecha compara con el período anterior."
        >
          <Arriba>
            <MicroList items={itemsTop} barColor={COLOR_CONCEPTO.ventas} showRank={modoTop === "grafico"} />
            <Resto n={data.topSalidas.length - itemsTop.length} que="productos" />
          </Arriba>
        </DashboardSection>
      ),
    },
    {
      id: "distribucion-stock",
      title: "Productos por rango de stock",
      render: () => (
        <DashboardSection
          chartId="inventario.distribucion-stock"
          hasData={hayDatosEnSerie(data.distribucionStock, ["cantidad"])}
          defaultVisible={false}
          kicker="Stock · cuántas unidades tiene cada producto"
          title="Productos por rango de stock"
        >
          {/* Lista y no dona (2026-10-09): la dona no tenía leyenda y 5 tajadas
              grises no se distinguían a 1 m. Acá cada rango dice su cifra. */}
          <Arriba>
            <MicroList
              showRank={false}
              items={data.distribucionStock.map((d) => ({
                name: d.rango,
                value: d.cantidad,
                label: cantidad(d.cantidad),
                sublabel: data.totalProductos > 0 ? `${porcentaje((d.cantidad / data.totalProductos) * 100)} de tus productos` : undefined,
                color: d.color,
              }))}
              barColor={COLOR_CONCEPTO.stock}
            />
          </Arriba>
        </DashboardSection>
      ),
    },
    {
      id: "dias-cobertura",
      title: "Días de cobertura",
      render: () => (
        <DashboardSection
          chartId="inventario.dias-cobertura"
          hasData={modoCobertura !== "oculto"}
          defaultVisible={false}
          kicker="Cobertura · ritmo de 30 días"
          title="Para cuántos días alcanza"
          description="Días de stock de los productos con menos cobertura. Bajo la línea de 7 días: reponer ya."
          kpis={[
            { label: "Menos de 7 días", value: cantidad(cobertura.filter((c) => c.status === "critico").length), tone: cobertura.some((c) => c.status === "critico") ? "warning" : undefined },
            { label: "El más corto", value: masCorta ? diasTexto(masCorta.dias) : null, sub: masCorta?.nombre },
          ]}
        >
          {modoCobertura === "lista" ? (
            <Arriba><MicroList
              items={cobertura.map((c) => ({ name: c.nombre, value: c.dias, label: diasTexto(c.dias), color: c.status === "ok" ? COLOR_CONCEPTO.stock : COLOR_CONCEPTO.alerta }))}
              barColor={COLOR_CONCEPTO.stock}
            /></Arriba>
          ) : (
            <ColoresSerie colores={{ primary: COLOR_CONCEPTO.stock, amber: COLOR_CONCEPTO.alerta, secondary: COLOR_CONCEPTO.referencia }}>
              <BulejeComposedChart
                data={cobertura.slice(0, 10).map((c) => ({ producto: c.nombre.length > 14 ? c.nombre.slice(0, 13) + "…" : c.nombre, dias: Math.min(c.dias, 90), critico: 7, alerta: 14 }))}
                xKey="producto"
                bars={[{ key: "dias", label: "Días de stock", color: "primary", yAxis: "left" }]}
                lines={[
                  { key: "critico", label: "Reponer ya (7 días)", color: "amber", yAxis: "left" },
                  { key: "alerta", label: "Pedir (14 días)", color: "secondary", yAxis: "left" },
                ]}
                leftAxisFormat={(v) => `${v} d`}
                tooltipFormat={(v) => diasTexto(Number(v))}
                height={260}
                minDataPoints={1}
              />
            </ColoresSerie>
          )}
        </DashboardSection>
      ),
    },
  ];

  return (
    <>
      <AltoPropioEnUnaColumna>
        <DraggableSections items={sections} storageKey="inventario-base-order" layout="grid" gap={4} minColumnWidth="22rem" />
      </AltoPropioEnUnaColumna>
      <ReorderModal open={reorderOpen} candidates={reorderCandidates} onClose={() => setReorderOpen(false)} />
    </>
  );
}
