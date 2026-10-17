"use client";
import { useState, useEffect, useCallback } from "react";
import { DataTable } from "@buleje/design-system";
import { CheckCircle, Clock, DollarSign, Star, Trophy, Users, Crown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import { TableSkeleton, VehicleIcon, toNum } from "@/components/admin/delivery-partners/shared";
import { useIndicadoresReparto } from "@/components/admin/delivery/reparto-indicadores";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { formatCurrency } from "@/lib/format";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fechaConDia } from "@/lib/admin/inicio/formato-tablero";
import { MUESTRA_CHICA, type FilaRanking, type ResumenRanking } from "@/lib/delivery/ranking-reparto";
import { TasaCompletadas, tonoTasa } from "../TasaCompletadas";

export function RankingTab() {
  const [data, setData] = useState<FilaRanking[]>([]);
  const [summary, setSummary] = useState<ResumenRanking | null>(null);
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "month" | "all">("month");

  const fetchRanking = useCallback((p: string) => {
    setLoading(true);
    tenantFetch(`/api/admin/delivery/ranking?period=${p}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { ranking: [], summary: null }))
      .then((d) => {
        setData(d.ranking ?? []);
        setSummary(d.summary ?? null);
        setRango(d.since && d.hasta ? { desde: d.since, hasta: d.hasta } : null);
      })
      .catch(() => { setData([]); setSummary(null); setRango(null); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchRanking(period); }, [fetchRanking, period]);

  // 17-10 (P37): «Esta semana»/«Este mes» eran 7 y 30 días corridos, no la
  // semana ni el mes del calendario. El rótulo dice lo que cuenta y al lado van las fechas.
  const PERIODS: { id: "week" | "month" | "all"; label: string; enTexto: string }[] = [
    { id: "week",  label: "7 días",  enTexto: "en los últimos 7 días" },
    { id: "month", label: "30 días", enTexto: "en los últimos 30 días" },
    { id: "all",   label: "Todo",    enTexto: "desde el inicio" },
  ];

  const periodLabel = PERIODS.find((p) => p.id === period)?.enTexto ?? "";
  const fechas = rango && period !== "all" ? `del ${fechaConDia(rango.desde)} al ${fechaConDia(rango.hasta)}` : null;
  const topPartner = data[0];

  const tasa = summary?.completionRate ?? null;
  const pct = tasa == null ? null : Math.round(tasa * 100);
  const kpis = useIndicadoresReparto({
    clave: "ranking",
    cargando: loading && !summary,
    resumen: summary
      ? `${summary.totalDelivered} entregas · ${pct == null ? "sin cerradas" : `${pct}% completas`}`
      : undefined,
    indicadores: summary
      ? [
          { icono: Users, rotulo: "Repartidores", valor: String(summary.totalPartners), ayuda: "Los repartidores activos de tu equipo, tengan o no pedidos en el período." },
          { icono: CheckCircle, rotulo: "Entregas", valor: String(summary.totalDelivered), tono: summary.totalDelivered > 0 ? "ok" : undefined },
          {
            icono: DollarSign,
            rotulo: "Ganado en tarifas",
            valor: formatCurrency(toNum(summary.totalEarnings)),
            ayuda: "Lo que suman las tarifas de los pedidos entregados (de los asignados en el período). No es lo pagado: los retiros pagados están en Retiros.",
          },
          {
            icono: Trophy,
            rotulo: "Completadas",
            valor: pct == null ? "Sin datos" : `${pct}%`,
            ayuda: `Entregados ÷ (entregados + cancelados) de los pedidos asignados en el período: ${summary.totalDelivered} de ${summary.cerradas}. Los que siguen en camino (${summary.enCurso}) todavía no cuentan.`,
            tono: tonoTasa(tasa, summary.cerradas),
          },
        ]
      : [],
  });

  return (
    <div className="space-y-4">
      {kpis.boton}
      {kpis.panel}

      {/* Una fila: período · quién lidera. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SegmentedControl<"week" | "month" | "all">
          value={period}
          onChange={setPeriod}
          label="Período del ranking"
          size="lg"
          options={PERIODS.map((p) => ({ value: p.id, label: p.label }))}
        />
        <span className="flex items-center gap-1 text-sm text-[var(--text-secondary)]">
          {fechas ?? "Todos los pedidos asignados"}
          <InfoTip
            title="Qué cuenta el ranking"
            what="Los pedidos ASIGNADOS en esas fechas (por el día en que se asignaron, no el de la entrega). De ellos salen entregas, cancelados y tarifas."
            affects={`«Completadas» = entregados ÷ (entregados + cancelados). Los que siguen en camino no cuentan hasta cerrarse. Con menos de ${MUESTRA_CHICA} cerrados se muestra la muestra. Aceptación y calificación son de toda su historia, no del período.`}
            example="Rosa: 9 entregados y 1 cancelado → 90 %. Un repartidor nuevo sin pedidos cerrados → «Sin datos», no 0 %."
          />
        </span>
        {topPartner && topPartner.delivered > 0 && (
          <p className="flex min-w-0 items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <Crown className="h-4 w-4 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
            <span>
              <span className="font-bold text-[var(--text-primary)]">{topPartner.name}</span> lidera {periodLabel} con {topPartner.delivered}{" "}
              {topPartner.delivered === 1 ? "entrega" : "entregas"} y {toNum(topPartner.rating).toFixed(1)} de calificación.
            </span>
          </p>
        )}
      </div>

      {/* ── 2. Tabla / Empty / Loading ──────────────────────────── */}
      {loading ? (
        <TableSkeleton />
      ) : data.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-8 text-center text-sm font-semibold text-[var(--text-secondary)]">
          Nadie entregó {periodLabel}: elige otro período o espera a que tus repartidores sumen entregas.
        </p>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--rule-base)] flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold text-[var(--text-secondary)]">
              Tabla de posiciones · {PERIODS.find((p) => p.id === period)?.label}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] font-bold">
              {data.length} {data.length === 1 ? "repartidor" : "repartidores"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <DataTable className="w-full">
              <thead>
                <tr>
                  <th className="w-16">#</th>
                  <th>Repartidor</th>
                  <th className="text-center">Rating</th>
                  <th className="text-center">Aceptación</th>
                  <th className="text-center">Entregas</th>
                  <th className="text-center">Cancelados</th>
                  <th className="text-center">Min. promedio</th>
                  <th className="text-right">Ganado</th>
                  <th className="text-center">Completadas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {data.map((entry, idx) => {
                  const isPodium = idx < 3;
                  const medalBg = idx === 0
                    ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                    : idx === 1
                      ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                      : idx === 2
                        ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]";
                  return (
                    <tr
                      key={entry.id}
                      className={cn(
                        "",
                        isPodium && "bg-[var(--data-warning-50)]/30",
                      )}
                    >
                      <td>
                        <span className={cn(
                          "inline-flex items-center justify-center h-10 w-10 rounded-xl font-extrabold tabular-nums text-base",
                          medalBg,
                        )}>
                          {isPodium ? <Trophy className="h-5 w-5" /> : idx + 1}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="h-11 w-11 rounded-2xl flex items-center justify-center text-base font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10 shrink-0">
                            {entry.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-extrabold text-[var(--text-primary)] text-base leading-tight truncate">
                              {entry.name}
                            </p>
                            <p className="text-sm text-[var(--text-tertiary)] mt-0.5 flex items-center gap-1.5">
                              <VehicleIcon type={entry.vehicleType} className="h-3.5 w-3.5" />
                              <span className="font-mono">{entry.phone}</span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="text-center">
                        <span className="inline-flex items-center justify-center gap-1 text-base font-extrabold text-[var(--data-warning-500)] tabular-nums">
                          <Star className="h-4 w-4 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" />
                          {toNum(entry.rating).toFixed(1)}
                        </span>
                      </td>
                      <td className="text-center font-bold text-[var(--text-secondary)] tabular-nums">
                        {Math.round(entry.acceptanceRate * 100)}%
                      </td>
                      <td className="text-center">
                        <span className="text-base font-extrabold text-[var(--data-success-500)] tabular-nums">
                          {entry.delivered}
                        </span>
                        {entry.inProgress > 0 && (
                          <span className="ml-1 text-sm text-[var(--text-tertiary)] font-bold">
                            +{entry.inProgress}
                          </span>
                        )}
                      </td>
                      <td className="text-center text-[var(--text-tertiary)] tabular-nums font-bold">
                        {entry.cancelled || "—"}
                      </td>
                      <td className="text-center">
                        <span className="inline-flex items-center justify-center gap-1 text-base text-[var(--text-secondary)] font-bold tabular-nums">
                          <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
                          {entry.avgDeliveryMin != null ? `${Math.round(entry.avgDeliveryMin)}` : "—"}
                        </span>
                      </td>
                      <td className="text-right font-extrabold tabular-nums">
                        {formatCurrency(toNum(entry.totalEarnings))}
                      </td>
                      <td className="text-center">
                        <TasaCompletadas tasa={entry.completionRate} cerradas={entry.cerradas} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>
        </div>
      )}
    </div>
  );
}
