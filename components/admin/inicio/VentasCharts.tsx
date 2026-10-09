"use client";

/**
 * VentasCharts — gráficos base de Inicio › Ventas.
 *
 * Rediseño Brandon 2026-10-09 («revisa los gráficos y KPIs y mejóralos… con
 * buen diseño y formato»; «ocultar gráficos que no tienen ninguna información»):
 *  1. Ventas por día (14 días): barras teal + utilidad + promedio punteado.
 *  2. ¿Qué día vendes más? (día de la semana, rango elegido).
 *  3. ¿A qué hora vendes más? (hoy) — un solo eje; los tickets van al tooltip.
 *  4. ¿Cómo te pagan? — 1-2 medios = lista corta; 3+ = dona + lista.
 *  5. Meta sugerida (oculta por defecto) · 6. Pronóstico 7 días (oculto por defecto).
 * Cada sección se oculta sola si no tiene qué mostrar (`queSeMuestraVentas`, en VentasHero).
 * Ninguna cifra se recalcula acá: todo viene de `VentasData`.
 */

import { BulejeGaugeChart } from "@/components/ui-system/charts";
import { Flame } from "@buleje/design-system/icons";
import {
  COLOR_CONCEPTO,
  cantidad,
  fechaConDia,
  porcentaje,
  soles,
} from "@/lib/admin/inicio/formato-tablero";
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { ConTonoVentas, VentasBarras } from "./VentasBarras";
import { indiceDelMayor, queSeMuestraVentas, variacionHoyVsAyer } from "./VentasHero";
import type { VentasData } from "./VentasDashboard";

const DIA_COMPLETO: Record<string, string> = {
  Lun: "Lunes",
  Mar: "Martes",
  Mié: "Miércoles",
  Jue: "Jueves",
  Vie: "Viernes",
  Sáb: "Sábado",
  Dom: "Domingo",
};

function Pct({ v, texto }: { v: number; texto: string }) {
  if (!Number.isFinite(v) || Math.abs(v) < 1) return null;
  return (
    <p
      className={
        v >= 0 ? "font-bold text-[var(--data-success)]" : "font-bold text-[var(--data-error)]"
      }
    >
      {v >= 0 ? "+" : ""}
      {porcentaje(v)} {texto}
    </p>
  );
}

export default function VentasCharts({ data }: { data: VentasData }) {
  const muestra = queSeMuestraVentas(data);

  // ── 1. Ventas por día (14 días) ──
  const diasConVenta = data.ventasDiarias.filter((d) => d.ventas > 0).length;
  const iMejorDia = indiceDelMayor(data.ventasDiarias, (d) => d.ventas);
  const mejorDia = iMejorDia >= 0 ? data.ventasDiarias[iMejorDia] : null;

  // ── 2. Día de la semana ──
  const iMejorDow = indiceDelMayor(data.ventasPorDia, (d) => d.total);
  const mejorDow = iMejorDow >= 0 ? data.ventasPorDia[iMejorDow] : null;
  const promedioDow = data.ventasPorDia[0]?.promedio ?? 0;
  const hayPrevDow = data.ventasPorDia.some((d) => d.prev > 0);
  const diasSemanaActivos = data.ventasPorDia.filter((d) => d.total > 0).length;

  // ── 3. Hora ──
  const iPico = indiceDelMayor(data.ventasPorHora, (h) => h.monto);
  const pico = iPico >= 0 ? data.ventasPorHora[iPico] : null;
  const deltaHoy = variacionHoyVsAyer(data.ventasHoy, data.ventasAyer);
  const rangoHora = (hora: string) => {
    const h = Number.parseInt(hora, 10);
    return Number.isFinite(h) ? `${h}:00 – ${h + 1}:00` : hora;
  };

  // ── 4. Medio de pago ──
  const itemsPago = data.metodosPago.map((p) => ({
    name: p.metodo,
    value: p.total,
    label: soles(p.total),
    sublabel: porcentaje(p.porcentaje),
    color: p.color,
  }));

  // ── 5. Meta sugerida (la calcula la pantalla: lo vendido + 20 %, mínimo + S/ 500) ──
  const metaMes =
    data.ventasNetas > 0 ? Math.max(data.ventasNetas * 1.2, data.ventasNetas + 500) : 1000;
  const pctMeta = metaMes > 0 ? (data.ventasNetas / metaMes) * 100 : 0;
  const faltaMeta = Math.max(0, metaMes - data.ventasNetas);

  // ── 6. Pronóstico ──
  const totalForecast = data.forecast7.reduce((s, f) => s + f.estimado, 0);
  const iMejorForecast = indiceDelMayor(data.forecast7, (f) => f.estimado);

  const sections: DraggableItem[] = [
    {
      id: "ventas-utilidad-14d",
      span: "full",
      render: () => (
        <ConTonoVentas>
          <DashboardSection
            chartId="ventas.utilidad-promedio"
            hasData={muestra.porDia}
            kicker="Últimos 14 días"
            title="Ventas por día"
            description="Cada barra es lo que vendiste ese día; la línea oscura, lo que te quedó de ganancia; la punteada, tu promedio de 7 días. Si la barra pasa la punteada, fue un buen día."
            kpis={[
              {
                label: "Últimos 7 días",
                value: soles(data.ventas7d),
                tone: "primary",
                delta: data.wowGrowth,
                deltaLabel: "vs anterior",
              },
              {
                label: "Mejor día",
                value: mejorDia ? soles(mejorDia.ventas) : null,
                sub: mejorDia ? fechaConDia(mejorDia.clave) : undefined,
              },
              { label: "Días con venta", value: `${diasConVenta} de ${data.ventasDiarias.length}` },
            ]}
          >
            <VentasBarras
              data={data.ventasDiarias}
              xKey="dia"
              barras={[{ key: "ventas", label: "Ventas", color: COLOR_CONCEPTO.ventas }]}
              lineas={[
                ...(muestra.utilidadEnPorDia
                  ? [{ key: "utilidad", label: "Utilidad", color: COLOR_CONCEPTO.utilidad }]
                  : []),
                {
                  key: "promedio7d",
                  label: "Promedio 7 días",
                  color: COLOR_CONCEPTO.referencia,
                  punteada: true,
                },
              ]}
              tituloTooltip={(f) => fechaConDia(String(f.clave ?? ""))}
              alto={220}
              ariaLabel={`Ventas por día de los últimos 14 días. Mejor día: ${mejorDia ? `${fechaConDia(mejorDia.clave)}, ${soles(mejorDia.ventas)}` : "ninguno"}.`}
            />
          </DashboardSection>
        </ConTonoVentas>
      ),
    },
    {
      id: "ventas-por-dia-semana",
      span: "full",
      render: () => (
        <ConTonoVentas>
          <DashboardSection
            chartId="ventas.por-dia-semana"
            hasData={muestra.porDiaSemana}
            kicker={`Día de la semana · ${data.dateRangeLabel}`}
            title="¿Qué día vendes más?"
            description="Suma de lo vendido cada día de la semana en el período elegido. La barra fuerte es tu mejor día; la punteada, el promedio de los días con venta."
            kpis={[
              {
                label: "Tu mejor día",
                value: mejorDow ? (DIA_COMPLETO[mejorDow.dia] ?? mejorDow.dia) : null,
                tone: "primary",
                sub: mejorDow ? soles(mejorDow.total) : undefined,
              },
              {
                label: "Promedio",
                value: soles(promedioDow),
                sub: "por día con venta",
                hint: "Promedio de los días de la semana que tuvieron venta.",
              },
              data.nextDayPrediction
                ? {
                    label: "Mañana",
                    value: `≈ ${soles(data.nextDayPrediction.estimado)}`,
                    sub: `${data.nextDayPrediction.diaCompleto.toLowerCase()} · estimado`,
                    hint: `Estimación: promedio de lo que vendiste los ${data.nextDayPrediction.diaCompleto.toLowerCase()} del período elegido.`,
                  }
                : { label: "Días con venta", value: `${diasSemanaActivos} de 7` },
            ]}
          >
            <VentasBarras
              data={data.ventasPorDia}
              xKey="dia"
              barras={[
                { key: "total", label: "Este período", color: COLOR_CONCEPTO.ventas },
                ...(hayPrevDow
                  ? [{ key: "prev", label: "Período anterior", color: COLOR_CONCEPTO.anterior }]
                  : []),
              ]}
              lineas={[
                {
                  key: "promedio",
                  label: "Promedio",
                  color: COLOR_CONCEPTO.referencia,
                  punteada: true,
                },
              ]}
              destacar={iMejorDow}
              tituloTooltip={(f) => DIA_COMPLETO[String(f.dia)] ?? String(f.dia)}
              extraTooltip={(f) => {
                const total = Number(f.total);
                const prev = Number(f.prev);
                if (!(total > 0))
                  return <p className="text-[var(--text-tertiary)]">Sin ventas ese día</p>;
                return (
                  <div className="space-y-0.5">
                    {promedioDow > 0 && (
                      <Pct v={((total - promedioDow) / promedioDow) * 100} texto="vs promedio" />
                    )}
                    {prev > 0 && (
                      <Pct v={((total - prev) / prev) * 100} texto="vs período anterior" />
                    )}
                  </div>
                );
              }}
              alto={220}
              ariaLabel={`Ventas por día de la semana. Mejor día: ${mejorDow ? DIA_COMPLETO[mejorDow.dia] : "ninguno"}.`}
            />
          </DashboardSection>
        </ConTonoVentas>
      ),
    },
    {
      id: "ventas-por-hora",
      span: muestra.medioDePago !== "oculto" ? "half" : "full",
      render: () => (
        <ConTonoVentas>
          <DashboardSection
            chartId="ventas.por-hora"
            hasData={muestra.porHora}
            kicker="Hoy"
            title="¿A qué hora vendes más?"
            description="Lo vendido hoy en cada hora. La barra fuerte es la hora pico; los tickets salen al pasar el mouse."
            kpis={[
              {
                label: "Hora pico",
                value: pico ? rangoHora(pico.hora) : null,
                tone: "primary",
                sub: pico
                  ? `${soles(pico.monto)} · ${cantidad(pico.ventas)} ${pico.ventas === 1 ? "ticket" : "tickets"}`
                  : undefined,
              },
              {
                label: "Vendido hoy",
                value: soles(data.ventasHoy),
                delta: deltaHoy,
                deltaLabel: "vs ayer",
              },
            ]}
          >
            <VentasBarras
              data={data.ventasPorHora}
              xKey="hora"
              barras={[{ key: "monto", label: "Ventas", color: COLOR_CONCEPTO.ventas }]}
              destacar={iPico}
              tituloTooltip={(f) => rangoHora(String(f.hora))}
              extraTooltip={(f) => {
                const n = Number(f.ventas);
                if (!(n > 0)) return null;
                const esPico = pico !== null && f.hora === pico.hora;
                return (
                  <div className="space-y-0.5">
                    <p className="font-semibold text-[var(--text-secondary)]">
                      {cantidad(n)} {n === 1 ? "ticket" : "tickets"}
                    </p>
                    {esPico && (
                      <p className="flex items-center gap-1 font-bold text-[var(--data-warning-500)]">
                        <Flame className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                        Hora pico de hoy
                      </p>
                    )}
                  </div>
                );
              }}
              alto={200}
              ariaLabel={`Ventas de hoy por hora. Hora pico: ${pico ? rangoHora(pico.hora) : "ninguna"}.`}
            />
          </DashboardSection>
        </ConTonoVentas>
      ),
    },
    {
      id: "metodo-pago",
      span: muestra.porHora ? "half" : "full",
      render: () => (
        <ConTonoVentas>
          <DashboardSection
            chartId="ventas.metodo-pago"
            hasData={muestra.medioDePago !== "oculto"}
            kicker={`Medios de pago · ${data.dateRangeLabel}`}
            title="¿Cómo te pagan?"
          >
            {/* Una barra partida por medio (el todo = lo cobrado) + la lista con montos:
              se lee a 1 m y ocupa la mitad que la dona que había, que repetía la lista. */}
            {data.metodosPago.length >= 2 && (
              <div
                className="mb-4 flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
                role="img"
                aria-label={data.metodosPago
                  .map((p) => `${p.metodo} ${porcentaje(p.porcentaje)}`)
                  .join(", ")}
              >
                {data.metodosPago.map((p) => (
                  <span
                    key={p.metodo}
                    className="h-full"
                    style={{ width: `${p.porcentaje}%`, backgroundColor: p.color }}
                  />
                ))}
              </div>
            )}
            <MicroList items={itemsPago} showRank={false} />
          </DashboardSection>
        </ConTonoVentas>
      ),
    },
    {
      id: "meta-periodo",
      render: () => (
        <ConTonoVentas>
          <DashboardSection
            chartId="ventas.meta-periodo"
            hasData={muestra.meta}
            defaultVisible={false}
            kicker={`Objetivo · ${data.dateRangeLabel}`}
            title="Meta sugerida del período"
            description="La meta la propone el panel: lo vendido más 20 % (o S/ 500 más, lo que sea mayor). Es una referencia hasta que puedas fijar la tuya."
            kpis={[
              { label: "Meta sugerida", value: soles(metaMes) },
              pctMeta >= 100
                ? {
                    label: "Superaste por",
                    value: soles(data.ventasNetas - metaMes),
                    tone: "success",
                  }
                : { label: "Te falta", value: soles(faltaMeta), tone: "warning" },
            ]}
          >
            <div className="flex items-center justify-center py-2">
              <BulejeGaugeChart
                value={Math.min(100, pctMeta)}
                label="Avance"
                sublabel={pctMeta >= 100 ? "Meta superada" : `Faltan ${soles(faltaMeta)}`}
                format="percentage"
                size={240}
              />
            </div>
          </DashboardSection>
        </ConTonoVentas>
      ),
    },
    {
      id: "forecast-7d",
      render: () => (
        <ConTonoVentas>
          <DashboardSection
            chartId="ventas.forecast-7d"
            hasData={muestra.pronostico}
            defaultVisible={false}
            kicker="Próximos 7 días"
            title="Pronóstico de ventas"
            description="Sigue la tendencia de los últimos 14 días en línea recta: no sabe de feriados, quincenas ni fin de mes. Úsalo como orientación."
            kpis={[
              { label: "Proyectado 7 días", value: soles(totalForecast), tone: "primary" },
              {
                label: "Mejor día estimado",
                value: iMejorForecast >= 0 ? soles(data.forecast7[iMejorForecast].estimado) : null,
                sub: iMejorForecast >= 0 ? data.forecast7[iMejorForecast].dia : undefined,
              },
            ]}
          >
            <VentasBarras
              data={data.forecast7}
              xKey="dia"
              barras={[{ key: "estimado", label: "Estimado", color: COLOR_CONCEPTO.ventas }]}
              alto={220}
              ariaLabel={`Pronóstico de ventas de los próximos 7 días: ${soles(totalForecast)} en total.`}
            />
          </DashboardSection>
        </ConTonoVentas>
      ),
    },
  ];

  return (
    <DraggableSections
      items={sections}
      storageKey="ventas-base-order"
      layout="grid"
      minColumnWidth="26rem"
      gap={1.5}
    />
  );
}
