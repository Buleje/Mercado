"use client";

/**
 * ComprasCharts — los gráficos base de la pestaña Compras del Inicio.
 *
 * Rehecho 2026-10-09 (Brandon: «ocultar gráficos que no tienen ninguna
 * información… revisa los gráficos y KPIs y mejóralos»). Cada bloque responde
 * UNA pregunta del dueño y se oculta solo si no tiene con qué contestarla
 * (`lib/admin/inicio/hay-datos`):
 *  1. ¿Cuándo compré? — por día (o semana) en TODO el calendario del rango.
 *  2. ¿Cuánto debo y qué vence primero? — tramos sin doble conteo + próximas cuentas.
 *  3. ¿A quién le compro? — 1-2 proveedores = lista; 3+ = barras horizontales.
 *  4. ¿Compro más o menos que antes? — 12 meses con el mismo mes del año pasado
 *     (antes eran dos gráficos: «Tendencia mensual» y «Año actual vs año pasado»).
 * Compras siempre en morado (`COLOR_CONCEPTO.compras`), un solo eje en soles.
 */

import type { CSSProperties } from "react";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { hayDatosEnSerie, hayTendencia, modoRanking } from "@/lib/admin/inicio/hay-datos";
import { cantidad, COLOR_CONCEPTO, fechaConDia, numeroEje, soles } from "@/lib/admin/inicio/formato-tablero";
import { cuandoVence, textoParticipacion, type ComprasData, type CuentaPorPagar } from "./compras-presentacion";

/** El gris del «año pasado» no rota con la posición del bloque (`--section-*` lo pisa DraggableSections). */
const VARS_ANTERIOR = { "--section-tertiary": COLOR_CONCEPTO.anterior } as CSSProperties;

const TRAMOS = [
  { key: "vencido", label: "Vencida", color: "var(--data-error-500)" },
  { key: "urgente", label: "Vence en 7 días", color: "var(--data-warning-500)" },
  { key: "pendiente", label: "Más adelante", color: "var(--data-3)" },
] as const;
const COLOR_TRAMO: Record<CuentaPorPagar["status"], string> = {
  vencido: TRAMOS[0].color,
  urgente: TRAMOS[1].color,
  pendiente: TRAMOS[2].color,
};

/** Eje Y en «16 mil» sin «S/»: el eje mide 60 px y «S/ 16 mil» se partía en dos líneas. La «S/» va en el tooltip y las cifras. */
const ejeSoles = (v: number) => numeroEje(v).replace(/ /g, "\u00a0");
const corto = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const veces = (n: number, una: string, varias: string) => `${cantidad(n)} ${n === 1 ? una : varias}`;

/** Una barra partida en tramos de deuda + su leyenda con montos (se lee a 1 m, entra a 400 px). */
function BarraTramos({ tramos, total }: { tramos: ComprasData["tramosDeuda"]; total: number }) {
  const conMonto = TRAMOS.filter((t) => tramos[t.key].monto > 0);
  return (
    <div>
      <div
        className="flex h-4 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
        role="img"
        aria-label={conMonto.map((t) => `${t.label}: ${soles(tramos[t.key].monto)}`).join(" · ")}
      >
        {conMonto.map((t) => (
          <div key={t.key} style={{ width: `${(tramos[t.key].monto / total) * 100}%`, backgroundColor: t.color }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {conMonto.map((t) => (
          <li key={t.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
            <span className="font-medium text-[var(--text-secondary)]">{t.label}</span>
            <span className="font-extrabold tabular-nums text-[var(--text-primary)]">{soles(tramos[t.key].monto)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranking de 3+ proveedores: barras horizontales con el nombre entero (las verticales lo cortaban a 13 letras). */
function BarrasProveedores({ filas, total }: { filas: ComprasData["comprasPorProveedor"]; total: number }) {
  const max = Math.max(...filas.map((f) => f.total), 1);
  return (
    <ol className="space-y-3" aria-label="Compras por proveedor">
      {filas.map((f) => (
        <li key={f.nombre}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold text-[var(--text-primary)]">{f.nombre}</span>
            <span className="shrink-0 font-extrabold tabular-nums text-[var(--text-primary)]">{soles(f.total)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2.5 flex-1 rounded-full bg-[var(--surface-sunken)]">
              <div className="h-full rounded-full" style={{ width: `${(f.total / max) * 100}%`, backgroundColor: COLOR_CONCEPTO.compras }} />
            </div>
            <span className="w-28 shrink-0 text-right text-xs font-medium tabular-nums text-[var(--text-tertiary)]">
              {veces(f.ordenes, "compra", "compras")} · {textoParticipacion(f.total, total)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function ComprasCharts({ data, periodo }: { data: ComprasData; periodo: string }) {
  const { filas, granularidad } = data.serie;
  const porSemana = granularidad === "semana";
  const conCompra = filas.filter((f) => f.total !== 0);
  const pico = conCompra.reduce<(typeof filas)[number] | null>((m, f) => (!m || f.total > m.total ? f : m), null);
  const sumaSerie = conCompra.reduce((s, f) => s + f.total, 0);

  const provs = data.comprasPorProveedor;
  const modoProv = modoRanking(provs, "total");
  const lider = provs[0];
  const deuda = data.deudaPendiente;
  const tramos = data.tramosDeuda;

  const meses = data.comprasMensuales;
  const mesesConCompra = meses.filter((m) => m.total !== 0);
  const mesAlto = mesesConCompra.reduce<(typeof meses)[number] | null>((m, f) => (!m || f.total > m.total ? f : m), null);
  const hayAnioPasado = hayDatosEnSerie(meses, ["anterior"]);
  const esteMes = meses[meses.length - 1];

  const sections: DraggableItem[] = [
    {
      id: "compras-por-dia",
      title: porSemana ? "Compras por semana" : "Compras por día",
      render: () => (
        <DashboardSection
          chartId="compras.por-dia"
          hasData={hayTendencia(filas, ["total"])}
          kicker={`Compras · ${periodo}`}
          title={porSemana ? "Compras por semana" : "Compras por día"}
          description={`Cuánto le compraste a tus proveedores ${porSemana ? "cada semana" : "cada día"} del período. Los días sin barra no hubo compras.`}
          kpis={[
            // Rótulos cortos: a 400 px la tarjeta mide ~150 px y cortaba «DÍAS CON COMP…».
            {
              label: porSemana ? "Semanas" : "Días",
              value: `${cantidad(conCompra.length)} de ${cantidad(filas.length)}`,
              sub: "con compras",
            },
            {
              label: porSemana ? "Mejor semana" : "Mejor día",
              value: pico ? soles(pico.total) : null,
              sub: pico ? (porSemana ? `semana del ${pico.etiqueta}` : fechaConDia(pico.clave)) : undefined,
            },
            {
              label: "Promedio",
              value: conCompra.length ? soles(sumaSerie / conCompra.length) : null,
              sub: porSemana ? "por semana con compras" : "por día con compras",
              hint: `Lo comprado dividido entre ${porSemana ? "las semanas" : "los días"} en que sí compraste.`,
            },
          ]}
        >
          <BulejeComposedChart
            data={filas}
            xKey="etiqueta"
            bars={[{ key: "total", label: "Compras", color: "purple", yAxis: "left" }]}
            leftAxisFormat={ejeSoles}
            tooltipFormat={(v) => soles(v)}
            tooltipExtras={porSemana ? (f) => `Semana del ${fechaConDia(String(f.clave))}` : undefined}
            showLegend={false}
            showValues={filas.length <= 16}
            valueFormat={(v) => numeroEje(v)}
            maxXTicks={12}
            minDataPoints={1}
            height={260}
          />
        </DashboardSection>
      ),
    },
    {
      id: "compras-deudas",
      title: "Lo que debes a proveedores",
      render: () => (
        <DashboardSection
          chartId="compras.estado-cuentas"
          hasData={deuda > 0 && data.cuentasPorVencer.length > 0}
          kicker="Cuentas por pagar · hoy"
          title="Lo que debes a proveedores"
          description="Cada cuenta cae en un solo tramo: vencida, vence en los próximos 7 días o más adelante. Abajo, las que vencen primero."
          kpis={[
            { label: "Le debes", value: soles(deuda), sub: veces(tramos.vencido.n + tramos.urgente.n + tramos.pendiente.n, "cuenta", "cuentas") },
            {
              label: "Vencidas",
              value: tramos.vencido.n > 0 ? soles(tramos.vencido.monto) : "Ninguna",
              sub: tramos.vencido.n > 0 ? veces(tramos.vencido.n, "cuenta", "cuentas") : undefined,
              tone: tramos.vencido.n > 0 ? "warning" : "neutral",
            },
            {
              label: "Por vencer",
              value: tramos.urgente.n > 0 ? soles(tramos.urgente.monto) : "Ninguna",
              sub: tramos.urgente.n > 0 ? `${veces(tramos.urgente.n, "cuenta", "cuentas")} · 7 días` : "en los próximos 7 días",
            },
          ]}
        >
          <BarraTramos tramos={tramos} total={deuda} />
          <p className="mb-2 mt-5 text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Vencen primero
          </p>
          <MicroList
            showRank={false}
            items={data.cuentasPorVencer.slice(0, 5).map((c) => ({
              name: c.nombre,
              value: c.monto,
              label: soles(c.monto),
              sublabel: cuandoVence(c),
              color: COLOR_TRAMO[c.status],
            }))}
          />
        </DashboardSection>
      ),
    },
    {
      id: "compras-proveedores",
      title: "A quién le compras",
      render: () => (
        <DashboardSection
          chartId="compras.top-proveedores-periodo"
          hasData={modoProv !== "oculto"}
          kicker={`Proveedores · ${periodo}`}
          title="A quién le compras"
          description="Tus proveedores ordenados por lo que les compraste en el período. Si uno solo se lleva casi todo, un atraso suyo te deja sin mercadería."
          kpis={
            lider
              ? [
                  { label: "Principal", value: corto(lider.nombre), sub: veces(lider.ordenes, "compra", "compras") },
                  { label: "Se lleva", value: textoParticipacion(lider.total, data.totalCompras), sub: "de lo que compraste" },
                ]
              : undefined
          }
        >
          {modoProv === "grafico" ? (
            <BarrasProveedores filas={provs} total={data.totalCompras} />
          ) : (
            <MicroList
              showRank={false}
              barColor={COLOR_CONCEPTO.compras}
              items={provs.map((p) => ({
                name: p.nombre,
                value: p.total,
                label: soles(p.total),
                sublabel: `${veces(p.ordenes, "compra", "compras")} · ${textoParticipacion(p.total, data.totalCompras)} del total`,
              }))}
            />
          )}
        </DashboardSection>
      ),
    },
    {
      id: "compras-por-mes",
      title: "Compras por mes",
      render: () => (
        <DashboardSection
          chartId="compras.por-mes"
          hasData={hayTendencia(meses, ["total"])}
          kicker="Últimos 12 meses"
          title="Compras por mes"
          description={
            hayAnioPasado
              ? "Las barras son este año; la línea gris, el mismo mes del año pasado."
              : "Desde el primer mes con compras. Cuando tengas un año de historia, aparece la comparación con el año pasado."
          }
          kpis={[
            { label: "Este mes", value: esteMes && esteMes.total !== 0 ? soles(esteMes.total) : null, sub: "lo que va del mes", sinDatoHint: "Todavía no compraste este mes." },
            {
              label: "Promedio",
              value: mesesConCompra.length ? soles(mesesConCompra.reduce((s, m) => s + m.total, 0) / mesesConCompra.length) : null,
              sub: `por mes · ${veces(mesesConCompra.length, "mes con compras", "meses con compras")}`,
            },
            { label: "Más alto", value: mesAlto ? mesAlto.nombre : null, sub: mesAlto ? soles(mesAlto.total) : undefined },
          ]}
        >
          <div style={VARS_ANTERIOR}>
            <BulejeComposedChart
              data={meses}
              xKey="etiqueta"
              bars={[{ key: "total", label: "Este año", color: "purple", yAxis: "left" }]}
              lines={hayAnioPasado ? [{ key: "anterior", label: "Mismo mes, año pasado", color: "tertiary", yAxis: "left" }] : []}
              leftAxisFormat={ejeSoles}
              tooltipFormat={(v) => soles(v)}
              showLegend={hayAnioPasado}
              valueFormat={(v) => numeroEje(v)}
              minDataPoints={1}
              height={260}
            />
          </div>
        </DashboardSection>
      ),
    },
  ];

  return <DraggableSections items={sections} storageKey="compras-base-v2" layout="column" gap={1.5} />;
}
