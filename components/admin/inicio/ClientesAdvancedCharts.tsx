"use client";

/**
 * ClientesAdvancedCharts — gráficos especializados de Inicio › Clientes (ocultos
 * por defecto; se prenden desde «Gráficos»). Las cuentas viven en
 * `clientes-avanzado.ts`; acá sólo se dibuja.
 *
 * 1. Cohortes: de los que llegaron cada mes, cuántos volvieron después
 * 2. Grupos: qué tan seguido y qué tan reciente compra cada cliente
 * 3. Reseñas por estrellas
 * 4. Clientes nuevos: esta semana vs la pasada
 * 5. Horario: franja × día (30 días)
 * 6. Clientes valiosos que dejaron de venir
 *
 * Brandon 2026-10-09: cada uno se oculta si no tiene qué decir
 * (`queSeMuestraAvanzado`), en español, con colores fijos y sin hex.
 */

import React, { memo, useMemo, type CSSProperties } from "react";
import { DataTable } from "@buleje/design-system";
import { Trophy, HeartHandshake, AlertTriangle, Leaf } from "@buleje/design-system/icons";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import { BulejeComparisonOverlay } from "@/components/ui-system/charts";
import { DashboardSection, MicroList } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { COLOR_CONCEPTO, cantidad, numeroEje, porcentaje, soles } from "@/lib/admin/inicio/formato-tablero";
import { calcularAvanzado, queSeMuestraAvanzado, type ClientesAvanzado } from "./clientes-avanzado";
import { COLOR_YA_CLIENTES, cifraONinguno, type ClientesCrudos } from "./clientes-tablero";

const plural = (n: number, uno: string, varios: string) => `${cantidad(n)} ${n === 1 ? uno : varios}`;
const promedio = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

/** Esta semana = azul de clientes; la pasada = gris de «período anterior». */
const COLORES_SEMANA = {
  "--section-primary": COLOR_CONCEPTO.clientes,
  "--section-tertiary": COLOR_CONCEPTO.anterior,
} as CSSProperties;

/** Celda con intensidad del azul de clientes; el texto se invierte sobre lo oscuro. */
function celda(intensidad: number): CSSProperties {
  return {
    background: `color-mix(in srgb, ${COLOR_CONCEPTO.clientes} ${Math.max(10, Math.round(intensidad * 100))}%, transparent)`,
    color: intensidad > 0.55 ? "var(--text-inverse)" : "var(--text-secondary)",
  };
}

// ── 1. Cohortes ──────────────────────────────────────────────────────────────
function TablaCohortes({ cohort }: { cohort: ClientesAvanzado["cohort"] }) {
  const th = "pb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
  return (
    <div className="overflow-x-auto">
      <DataTable className="min-w-full text-sm">
        <thead>
          <tr>
            <th className={`${th} pr-3 text-left`}>Llegaron en</th>
            <th className={`${th} pr-3 text-right`}>Clientes</th>
            {["Ese mes", "+1 mes", "+2 meses", "+3 meses"].map((m) => (
              <th key={m} className={`${th} px-1 text-center`}>{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohort.map((c) => (
            <tr key={c.cohorte} className="border-t border-[var(--rule-soft)]">
              <td className="py-2 pr-3 text-sm font-semibold text-[var(--text-primary)]">{c.cohorte}</td>
              <td className="py-2 pr-3 text-right text-sm tabular-nums text-[var(--text-secondary)]">{c.size > 0 ? cantidad(c.size) : "—"}</td>
              {[c.m0, c.m1, c.m2, c.m3].map((p, i) =>
                p < 0 || c.size === 0 ? (
                  <td key={i} className="px-1 py-1 text-center text-xs text-[var(--text-tertiary)]">—</td>
                ) : (
                  <td key={i} className="px-1 py-1">
                    <div className="rounded-md py-1.5 text-center text-xs font-bold tabular-nums" style={celda(p / 100)}>
                      {porcentaje(p)}
                    </div>
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

// ── 2. Grupos (reciente × frecuente; tamaño = cuánto gastó) ─────────────────
const GRUPOS = {
  campeones: { label: "Campeones", Icono: Trophy, color: COLOR_CONCEPTO.clientes },
  leales: { label: "Leales", Icono: HeartHandshake, color: COLOR_YA_CLIENTES },
  riesgo: { label: "En riesgo", Icono: AlertTriangle, color: COLOR_CONCEPTO.alerta },
  nuevos: { label: "Nuevos", Icono: Leaf, color: COLOR_CONCEPTO.anterior },
} as const;

function MapaGrupos({ rfm }: { rfm: ClientesAvanzado["rfm"] }) {
  const maxF = Math.max(1, ...rfm.rows.map((x) => x.frequency));
  const maxR = Math.max(1, ...rfm.rows.map((x) => x.recencyDays));
  const maxM = Math.max(1, ...rfm.rows.map((x) => x.monetary));
  // Los puntos van en 8-92 % × 14-84 %: los rótulos de las esquinas no los tapan.
  const posX = (frecuencia: number) => 8 + (frecuencia / maxF) * 84;
  const posY = (dias: number) => 14 + (dias / maxR) * 70;
  // Las líneas van en la MEDIANA (la que decide el grupo), no al medio de la caja:
  // antes un «campeón» podía caer en el cuadro de «Nuevos».
  const corteX = posX(rfm.medianFreq);
  const corteY = posY(rfm.medianRecency);
  const rotulo = (g: keyof typeof GRUPOS, pos: string) => {
    const { label, Icono, color } = GRUPOS[g];
    return (
      <span className={`absolute ${pos} inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[var(--ls-wider)]`} style={{ color }}>
        <Icono className="h-4 w-4" aria-hidden /> {label}
      </span>
    );
  };
  return (
    <div>
    <div
      role="img"
      aria-label={`Mapa de ${rfm.rows.length} clientes: ${rfm.counts.champions} campeones, ${rfm.counts.loyal} leales, ${rfm.counts.risk} en riesgo y ${rfm.counts.new} nuevos.`}
      className="relative min-h-[320px] overflow-hidden rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-6"
    >
      <div className="absolute inset-y-0 border-l border-dashed border-[var(--rule-strong)] opacity-30" style={{ left: `${corteX}%` }} aria-hidden />
      <div className="absolute inset-x-0 border-t border-dashed border-[var(--rule-strong)] opacity-30" style={{ top: `${corteY}%` }} aria-hidden />
      {rotulo("nuevos", "top-2 left-3")}
      {rotulo("campeones", "top-2 right-3")}
      {rotulo("riesgo", "bottom-2 left-3")}
      {rotulo("leales", "bottom-2 right-3")}
      {rfm.rows.slice(0, 50).map((r, i) => {
        const x = posX(r.frequency);
        const y = posY(r.recencyDays);
        const size = 8 + Math.min(14, (r.monetary / maxM) * 14);
        const reciente = r.recencyDays <= rfm.medianRecency;
        const frecuente = r.frequency >= rfm.medianFreq;
        const g = reciente ? (frecuente ? "campeones" : "nuevos") : frecuente ? "leales" : "riesgo";
        return (
          <div
            key={i}
            className="absolute rounded-full border-2 border-[var(--surface-raised)] transition-transform hover:z-10 hover:scale-125"
            style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, background: GRUPOS[g].color, transform: "translate(-50%, -50%)" }}
            title={`${r.name} · ${plural(r.frequency, "compra", "compras")} · última hace ${plural(r.recencyDays, "día", "días")} · ${soles(r.monetary)}`}
          />
        );
      })}
    </div>
    <p className="mt-2 flex justify-between gap-3 text-xs font-semibold text-[var(--text-tertiary)]">
      <span>↑ Arriba: compraron hace poco</span>
      <span>Compran más seguido →</span>
    </p>
    </div>
  );
}

// ── 5. Horario (franja × día, 30 días) ──────────────────────────────────────
function MapaHorario({ heatmap }: { heatmap: ClientesAvanzado["heatmap"] }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[30rem]">
        <div className="grid" style={{ gridTemplateColumns: "6.5rem repeat(7, 1fr)" }}>
          <div />
          {heatmap.days.map((d) => (
            <div key={d} className="pb-2 text-center text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{d}</div>
          ))}
          {heatmap.buckets.map((bucket, bi) => (
            <React.Fragment key={bucket.label}>
              <div className="flex items-center pr-3 text-xs font-semibold text-[var(--text-secondary)]">{bucket.label}</div>
              {heatmap.matrix[bi].map((v, di) => (
                <div
                  key={di}
                  className="m-0.5 flex min-h-8 items-center justify-center rounded-md text-xs font-bold tabular-nums"
                  style={v === 0 ? { background: "var(--surface-sunken)" } : celda(v / heatmap.max)}
                  title={`${bucket.label} del ${heatmap.days[di].toLowerCase()}: ${plural(v, "compra", "compras")}`}
                >
                  {v > 0 ? v : ""}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export const ClientesAdvancedCharts = memo(function ClientesAdvancedCharts() {
  const { data } = useDashboardData();

  const av = useMemo(() => {
    const raw = {
      customers: data?.customers ?? [],
      orders: data?.orders ?? [],
      sales: data?.sales ?? [],
      reviews: data?.reviews ?? [],
    } as unknown as ClientesCrudos;
    return calcularAvanzado(raw);
  }, [data]);
  const muestra = queSeMuestraAvanzado(av);
  const { cohort, rfm, ratingChart, comp, heatmap, churn } = av;

  const medidas = cohort.filter((c) => c.size > 0);
  const vuelvenM1 = promedio(medidas.filter((c) => c.m1 >= 0).map((c) => c.m1));
  const vuelvenM3 = promedio(medidas.filter((c) => c.m3 >= 0).map((c) => c.m3));
  const nuevosSemana = comp.reduce((s, d) => s + d.current, 0);
  const nuevosSemanaPasada = comp.reduce((s, d) => s + d.previous, 0);
  const totalHorario = heatmap.matrix.flat().reduce((s, v) => s + v, 0);
  const porDiaSemana = heatmap.days.map((_, di) => heatmap.matrix.reduce((s, row) => s + row[di], 0));
  const diaFuerte = porDiaSemana.indexOf(Math.max(...porDiaSemana));

  const sections: DraggableItem[] = [
    {
      id: "cohort-retention",
      span: "full",
      render: () => (
        <DashboardSection
          chartId="clientes.advanced.cohort-retention"
          hasData={muestra.cohorte}
          defaultVisible={false}
          kicker="Últimos 4 meses"
          title="Cuántos vuelven después de su primera compra"
          description="Cada fila son los clientes que te compraron por primera vez ese mes; las columnas, qué parte volvió a comprarte 1, 2 y 3 meses después. Más color = más vuelven."
          kpis={[
            { label: "Vuelven al mes siguiente", value: vuelvenM1 === 0 ? "Nadie" : porcentaje(vuelvenM1), tone: "primary" },
            { label: "Siguen a los 3 meses", value: vuelvenM3 === 0 ? "Nadie" : porcentaje(vuelvenM3) },
            { label: "Llegaron en 4 meses", value: cantidad(medidas.reduce((s, c) => s + c.size, 0)), sub: "clientes nuevos" },
          ]}
        >
          <TablaCohortes cohort={cohort} />
        </DashboardSection>
      ),
    },
    {
      id: "rfm-quadrant",
      render: () => (
        <DashboardSection
          chartId="clientes.advanced.rfm-quadrant"
          hasData={muestra.rfm}
          defaultVisible={false}
          kicker="Todas tus compras"
          title="Tus clientes por grupo"
          description="Cada punto es un cliente: arriba los que compraron hace poco, a la derecha los que compran más seguido; el tamaño es cuánto te gastó. Pasa el mouse para ver quién es."
          kpis={[
            { label: "Campeones", icon: Trophy, value: cifraONinguno(rfm.counts.champions), tone: "primary", hint: "Compran seguido y hace poco: tus mejores clientes." },
            { label: "Leales", icon: HeartHandshake, value: cifraONinguno(rfm.counts.loyal), hint: "Compran seguido, pero hace un tiempo que no vienen." },
            { label: "En riesgo", icon: AlertTriangle, value: cifraONinguno(rfm.counts.risk), tone: rfm.counts.risk > 0 ? "warning" : "neutral", hint: "Compran poco y hace tiempo: escríbeles antes de perderlos." },
            { label: "Nuevos", icon: Leaf, value: cifraONinguno(rfm.counts.new), hint: "Compraron hace poco, todavía pocas veces." },
          ]}
        >
          <MapaGrupos rfm={rfm} />
        </DashboardSection>
      ),
    },
    {
      id: "rating-distribution",
      render: () => (
        <DashboardSection
          chartId="clientes.advanced.rating-distribution"
          hasData={muestra.rating}
          defaultVisible={false}
          kicker="Todas tus reseñas"
          title="Qué te dicen tus clientes"
          kpis={[
            { label: "Calificación", value: `${ratingChart.promedio.toFixed(1)} de 5`, sub: plural(ratingChart.total, "reseña", "reseñas"), tone: ratingChart.promedio >= 4 ? "success" : "neutral" },
            { label: "Malas (1-2)", value: ratingChart.malos > 0 ? cantidad(ratingChart.malos) : "Ninguna", tone: ratingChart.malos > 0 ? "warning" : "success" },
          ]}
        >
          <MicroList
            items={[...ratingChart.arr].reverse().map((x) => ({
              name: `${x.rating[0]} ${x.rating[0] === "1" ? "estrella" : "estrellas"}`,
              value: x.cantidad,
              label: plural(x.cantidad, "reseña", "reseñas"),
              color: Number(x.rating[0]) <= 2 ? COLOR_CONCEPTO.alerta : COLOR_CONCEPTO.clientes,
            }))}
            showRank={false}
          />
        </DashboardSection>
      ),
    },
    {
      id: "comparativa-nuevos",
      render: () => (
        <DashboardSection
          chartId="clientes.advanced.comparativa-nuevos"
          hasData={muestra.comparativa}
          defaultVisible={false}
          kicker="Últimos 7 días"
          title="Clientes nuevos: esta semana y la pasada"
          kpis={[
            {
              label: "Esta semana",
              value: cifraONinguno(nuevosSemana),
              tone: "primary",
              delta: nuevosSemanaPasada > 0 ? ((nuevosSemana - nuevosSemanaPasada) / nuevosSemanaPasada) * 100 : null,
              deltaLabel: "vs la pasada",
            },
            { label: "Semana pasada", value: cifraONinguno(nuevosSemanaPasada) },
          ]}
        >
          <div style={COLORES_SEMANA}>
            <BulejeComparisonOverlay
              data={comp}
              xKey="day"
              currentKey="current"
              previousKey="previous"
              currentLabel="Esta semana"
              previousLabel="Semana pasada"
              yAxisFormat={(v) => numeroEje(v)}
              tooltipFormat={(v) => plural(Number(v), "nuevo", "nuevos")}
              height={240}
            />
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "heatmap-actividad",
      span: "full",
      render: () => (
        <DashboardSection
          chartId="clientes.advanced.heatmap-actividad"
          hasData={muestra.mapaDeCalor}
          defaultVisible={false}
          kicker="Últimos 30 días"
          title="Cuándo te compran"
          description="Compras por franja del día y día de la semana (todas las ventas, con o sin cliente). Más color = más compras: ahí conviene tener la tienda lista."
          kpis={[
            { label: "Compras", value: cantidad(totalHorario), sub: "en 30 días" },
            { label: "Franja más fuerte", value: heatmap.peak.idx >= 0 ? heatmap.buckets[heatmap.peak.idx].label : null, sub: heatmap.peak.value > 0 ? `hasta ${plural(heatmap.peak.value, "compra", "compras")}` : undefined },
            { label: "Día más fuerte", value: totalHorario > 0 ? heatmap.days[diaFuerte] : null, sub: totalHorario > 0 ? plural(porDiaSemana[diaFuerte], "compra", "compras") : undefined },
          ]}
        >
          <MapaHorario heatmap={heatmap} />
        </DashboardSection>
      ),
    },
    {
      id: "churn-risk",
      span: "full",
      render: () => (
        <DashboardSection
          chartId="clientes.advanced.churn-risk"
          hasData={muestra.riesgo}
          defaultVisible={false}
          kicker="Para llamar"
          title="Clientes valiosos que dejaron de venir"
          description="Te compraron 2 veces o más y no vuelven hace más de 30 días. Ordenados por lo que te compraron: escríbeles primero a los de arriba."
          kpis={[
            { label: "Hace más de 60 días", value: cifraONinguno(churn.high), tone: churn.high > 0 ? "warning" : "neutral" },
            { label: "Entre 30 y 60 días", value: cifraONinguno(churn.med) },
            { label: "Te compraron", value: soles(churn.valueAtRisk), sub: "en total, estos clientes" },
          ]}
        >
          <MicroList
            items={churn.rows.map((c) => ({
              name: c.name,
              value: c.total,
              label: soles(c.total),
              sublabel: `${plural(c.freq, "compra", "compras")} · última hace ${plural(c.daysSinceLast, "día", "días")}`,
            }))}
            barColor={COLOR_CONCEPTO.alerta}
            showRank
          />
        </DashboardSection>
      ),
    },
  ];

  return <DraggableSections items={sections} storageKey="clientes-advanced-order" layout="column" gap={4} />;
});
