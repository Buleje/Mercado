"use client";

/**
 * ClientesCharts — gráficos base de Inicio › Clientes.
 *
 * Brandon 2026-10-09 («ocultar gráficos que no tienen ninguna información… y
 * mejorarlos con buen diseño y formato»):
 *  - cada gráfico se oculta si no tiene qué decir (`queSeMuestraClientes`);
 *  - las distribuciones por rango (gasto, frecuencia) son barras horizontales
 *    ordenadas con «N clientes · %», no donas: se leen a 1 m y no esconden el orden;
 *  - «Cuánto gastan por visita» ya no usa dos ejes: es un ranking con las visitas al lado;
 *  - colores fijos (`COLOR_CONCEPTO`): nuevos = azul de clientes; «ya te habían comprado» = gris tinta;
 *  - 2×2 a 1280 px (ranking | por día, gasto | frecuencia): con todo a lo ancho
 *    la grilla de filas iguales estiraba cada tarjeta a 640 px y eran 2,7 pantallas.
 */

import { useState, type CSSProperties } from "react";
import { BulejeStackedBar } from "@/components/ui-system/charts";
import { DashboardSection, MicroList, type MicroListItem } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { COLOR_CONCEPTO, cantidad, fechaConDia, numeroEje, porcentaje, soles } from "@/lib/admin/inicio/formato-tablero";
import { COLOR_YA_CLIENTES, cifraONinguno, pct, queSeMuestraClientes, sinAnonimos, type ClientesData } from "./clientes-tablero";

/** Eje de personas: sólo enteros (antes salía «0.5 · 1.5» con pocos clientes). */
const ejeEntero = (v: number) => (Number.isInteger(v) ? numeroEje(v) : "");

/**
 * Ranuras de color de `BulejeStackedBar` fijadas por concepto: `DraggableSections`
 * rota `--section-*` por posición y «nuevos» cambiaba de color según el lugar.
 */
export const COLORES_CLIENTES = {
  "--section-info": COLOR_CONCEPTO.clientes,
  "--section-primary": COLOR_YA_CLIENTES,
} as CSSProperties;

/** Leyenda/tooltip: «Ya te habían comprado» (gris tinta) abajo, «Nuevos» (azul) arriba. */
const PILAS = [
  { key: "volvieron", label: "Ya te habían comprado", color: "primary" as const },
  { key: "nuevos", label: "Nuevos", color: "info" as const },
];

const plural = (n: number, uno: string, varios: string) => `${cantidad(n)} ${n === 1 ? uno : varios}`;

/** Filas de una distribución por rango: «12 clientes» + «80% de …». */
function filasDeRango(filas: { nombre: string; cantidad: number }[], total: number, de: string): MicroListItem[] {
  return filas.map((f) => ({
    name: f.nombre,
    value: f.cantidad,
    label: plural(f.cantidad, "cliente", "clientes"),
    sublabel: f.cantidad > 0 ? `${porcentaje(pct(f.cantidad, total))} ${de}` : undefined,
  }));
}

/** Cuántos clientes del ranking se ven de entrada (el resto, con «Ver los 10»). */
const TOPE_LISTA = 5;

/** Ranking con los 5 primeros a la vista: 10 filas fijas llevaban la pestaña a 2,7 pantallas. */
function ListaTop({ items }: { items: MicroListItem[] }) {
  const [todos, setTodos] = useState(false);
  return (
    <div className="space-y-2">
      <MicroList items={todos ? items : items.slice(0, TOPE_LISTA)} barColor={COLOR_CONCEPTO.clientes} showRank />
      {items.length > TOPE_LISTA && (
        <button
          type="button"
          onClick={() => setTodos((v) => !v)}
          aria-expanded={todos}
          className="min-h-10 px-2.5 text-sm font-semibold text-[var(--accent-ink)] hover:underline"
        >
          {todos ? "Ver menos" : `Ver los ${items.length}`}
        </button>
      )}
    </div>
  );
}

export default function ClientesCharts({ data }: { data: ClientesData }) {
  const muestra = queSeMuestraClientes(data);

  // ── Quién más te compra ──
  const ranking = sinAnonimos(data.topClientes).filter((c) => c.gasto > 0);
  const gastoTop = ranking.reduce((s, c) => s + c.gasto, 0);
  const comprasTop = ranking.reduce((s, c) => s + c.pedidos, 0);
  const filasTop: MicroListItem[] = ranking.map((c) => ({
    name: c.nombre,
    value: c.gasto,
    label: soles(c.gasto),
    sublabel: `${plural(c.pedidos, "compra", "compras")} · ticket ${soles(c.gasto / Math.max(1, c.pedidos))}`,
  }));

  // ── Por mes (6 meses) y por día ──
  const nuevos6m = data.retencion.reduce((s, m) => s + m.nuevos, 0);
  const total6m = data.retencion.reduce((s, m) => s + m.total, 0);
  const rec6m = data.retencion.reduce((s, m) => s + m.recurrentes, 0);
  const mesesConCompras = data.retencion.filter((m) => m.total > 0).length;
  const porMes = data.retencion.map((m) => ({ mes: m.mes, volvieron: m.recurrentes, nuevos: m.nuevos }));
  const porDia = data.clientesPorDia.map((d) => ({ dia: d.dia, volvieron: Math.max(0, d.activos - d.nuevos), nuevos: d.nuevos }));
  const pico = data.clientesPorDia.reduce<(typeof data.clientesPorDia)[number] | null>(
    (best, d) => (!best || d.activos > best.activos ? d : best),
    null,
  );
  const promDia = data.clientesPorDia.length
    ? data.clientesPorDia.reduce((s, d) => s + d.activos, 0) / data.clientesPorDia.length
    : null;

  // ── Distribuciones ──
  const vip = data.distribucionGasto[data.distribucionGasto.length - 1]?.cantidad ?? 0;
  const sinCompras = Math.max(0, data.totalClientes - data.clientesConGasto);
  const activosFreq = data.frecuenciaCompra.reduce((s, r) => s + r.cantidad, 0);
  const fieles = data.frecuenciaCompra.slice(2).reduce((s, r) => s + r.cantidad, 0);
  const unaVez = data.frecuenciaCompra[0]?.cantidad ?? 0;

  // ── Ticket por cliente ──
  const tickets = sinAnonimos(data.ticketPorCliente).filter((c) => c.ticket > 0).sort((a, b) => b.ticket - a.ticket);
  const promTicket = tickets.length ? tickets.reduce((s, c) => s + c.ticket, 0) / tickets.length : null;

  const sections: DraggableItem[] = [
    {
      id: "top-10-clientes",
      render: () => (
        <DashboardSection
          chartId="clientes.top-10-clientes"
          hasData={muestra.top !== "oculto"}
          kicker="Ranking del período"
          title="Quién más te compra"
          description="Tus clientes con teléfono que más gastaron en el período. Las ventas sin cliente no entran. Llámalos o agradéceles: vuelven más cuando los tratas por su nombre."
          kpis={[
            { label: "Gastaron", value: soles(gastoTop), sub: plural(comprasTop, "compra", "compras"), tone: "primary" },
            {
              label: "Por compra",
              value: soles(comprasTop > 0 ? gastoTop / comprasTop : null),
              hint: "Ticket promedio: lo que gasta en promedio cada vez que te compra uno de estos clientes.",
            },
          ]}
        >
          <ListaTop items={filasTop} />
        </DashboardSection>
      ),
    },
    {
      id: "clientes-por-dia",
      render: () => (
        <DashboardSection
          chartId="clientes.clientes-por-dia"
          hasData={muestra.porDia}
          kicker="Días con compras"
          title="Clientes que te compraron por día"
          description="Sólo aparecen los días en que algún cliente con teléfono te compró (los últimos 14). Azul: clientes nuevos en el período; oscuro: los que ya te habían comprado antes."
          kpis={[
            {
              label: "Por día",
              value: promDia === null ? null : cantidad(promDia, promDia < 10 ? 1 : 0),
              sub: `promedio · ${plural(data.clientesPorDia.length, "día", "días")}`,
              hint: "Clientes distintos que te compran en promedio cada día con compras.",
            },
            { label: "Mejor día", value: pico ? plural(pico.activos, "cliente", "clientes") : null, sub: pico ? fechaConDia(pico.clave) : undefined },
          ]}
        >
          <div style={COLORES_CLIENTES}>
            <BulejeStackedBar
              data={porDia}
              xKey="dia"
              stacks={PILAS}
              height={200}
              yAxisFormat={ejeEntero}
              tooltipFormat={(v) => plural(Number(v), "cliente", "clientes")}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "distribucion-gasto",
      render: () => (
        <DashboardSection
          chartId="clientes.distribucion-gasto"
          hasData={muestra.gasto}
          kicker="Desde que te compran"
          title="Cuánto te ha comprado cada cliente"
          description="Tus clientes registrados según todo lo que te compraron desde siempre. «Hasta S/ 50» incluye a los que todavía no te compran; «Sin compras» son justamente esos."
          kpis={[
            { label: "Más de S/ 500", value: cifraONinguno(vip), sub: vip > 0 ? `${porcentaje(pct(vip, data.totalClientes))} de tu lista` : undefined, tone: vip > 0 ? "success" : "neutral" },
            {
              label: "Sin compras",
              value: cifraONinguno(sinCompras),
              tone: sinCompras > 0 ? "warning" : "neutral",
            },
          ]}
        >
          <MicroList
            items={filasDeRango(data.distribucionGasto.map((r) => ({ nombre: r.rango, cantidad: r.cantidad })), data.totalClientes, "de tu lista")}
            barColor={COLOR_CONCEPTO.clientes}
            showRank={false}
          />
        </DashboardSection>
      ),
    },
    {
      id: "frecuencia-compra",
      render: () => (
        <DashboardSection
          chartId="clientes.frecuencia-compra"
          hasData={muestra.frecuencia}
          kicker="En el período"
          title="Cuántas veces te compraron"
          kpis={[
            { label: "Fieles (4+)", value: cifraONinguno(fieles), sub: fieles > 0 ? `${porcentaje(pct(fieles, activosFreq))} del total` : undefined, tone: fieles > 0 ? "success" : "neutral" },
            { label: "Una sola vez", value: cifraONinguno(unaVez), sub: unaVez > 0 ? `${porcentaje(pct(unaVez, activosFreq))} del total` : undefined, tone: unaVez > 0 ? "warning" : "neutral" },
          ]}
        >
          <MicroList
            items={filasDeRango(data.frecuenciaCompra.map((r) => ({ nombre: r.frecuencia, cantidad: r.cantidad })), activosFreq, "de los que compraron")}
            barColor={COLOR_CONCEPTO.clientes}
            showRank={false}
          />
        </DashboardSection>
      ),
    },
    {
      id: "retencion-6m",
      render: () => (
        <DashboardSection
          chartId="clientes.retencion-6m"
          hasData={muestra.retencion}
          defaultVisible={false}
          kicker="Últimos 6 meses"
          title="Nuevos y los que vuelven, por mes"
          description="Cada barra son los clientes distintos que te compraron ese mes: en azul los que compraban por primera vez, en oscuro los que ya te habían comprado antes."
          kpis={[
            { label: "Nuevos en 6 meses", value: cifraONinguno(nuevos6m) },
            { label: "Clientes por mes", value: mesesConCompras ? cantidad(total6m / mesesConCompras, 0) : null, sub: "promedio de los meses con compras" },
            {
              label: "Vuelven",
              value: porcentaje(pct(rec6m, total6m)),
              hint: "De cada 100 clientes que te compran en un mes, cuántos ya te habían comprado antes.",
              tone: (pct(rec6m, total6m) ?? 0) >= 50 ? "success" : "neutral",
            },
          ]}
        >
          <div style={COLORES_CLIENTES}>
            <BulejeStackedBar
              data={porMes}
              xKey="mes"
              stacks={PILAS}
              height={200}
              yAxisFormat={ejeEntero}
              tooltipFormat={(v) => plural(Number(v), "cliente", "clientes")}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "ticket-por-cliente",
      render: () => (
        <DashboardSection
          chartId="clientes.ticket-por-cliente"
          hasData={muestra.ticket !== "oculto"}
          defaultVisible={false}
          kicker="Tus mejores clientes"
          title="Cuánto gastan por visita"
          description="Lo que gasta en promedio cada uno de tus mejores clientes cada vez que te compra."
          kpis={[
            { label: "Ticket más alto", value: tickets[0] ? soles(tickets[0].ticket) : null, sub: tickets[0]?.nombre },
            { label: "Promedio de ellos", value: soles(promTicket) },
          ]}
        >
          <MicroList
            items={tickets.map((c) => ({
              name: c.nombre,
              value: c.ticket,
              label: soles(c.ticket),
              sublabel: plural(c.visitas, "compra", "compras"),
            }))}
            barColor={COLOR_CONCEPTO.clientes}
            showRank
          />
        </DashboardSection>
      ),
    },
  ];

  // layout="grid": las secciones sin span van de a dos (gasto + frecuencia lado a
  // lado); minColumnWidth="22rem" deja las 2 columnas aun con la barra lateral.
  return (
    <DraggableSections items={sections} storageKey="clientes-base-order" layout="grid" gap={4} minColumnWidth="22rem" />
  );
}
