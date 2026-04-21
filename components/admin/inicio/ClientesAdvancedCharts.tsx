"use client";

/**
 * ClientesAdvancedCharts — charts especializados del módulo Clientes.
 *
 * 1. Cohort retention (matriz m0 → m3)
 * 2. RFM Quadrant — Recency × Frequency (con monetary como tamaño)
 * 3. Distribución de rating (Composed)
 * 4. Comparativa nuevos sem actual vs previa (ComparisonOverlay)
 * 5. Heatmap activity hora × día (30d)
 * 6. Churn risk — clientes en riesgo (lista ordenada por recency)
 */

import React, { memo, useMemo } from "react";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import {
  BulejeComposedChart,
  BulejeComparisonOverlay,
} from "@/components/ui-system/charts";
import { DashboardSection } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";

type Customer = {
  phone?: string;
  name?: string;
  createdAt?: string;
  totalSpent?: number;
};
type Order = {
  id: string | number;
  createdAt: string;
  status: string;
  total: number;
  customer?: { phone?: string; name?: string };
};
type Sale = {
  id?: string | number;
  createdAt: string;
  total: number;
  customerPhone?: string;
};
type Review = { rating: number; date?: string };

export const ClientesAdvancedCharts = memo(function ClientesAdvancedCharts() {
  const { data } = useDashboardData();

  const customers = (data?.customers ?? []) as Customer[];
  const orders = (data?.orders ?? []) as Order[];
  const sales = (data?.sales ?? []) as Sale[];
  const reviews = (data?.reviews ?? []) as Review[];

  // ── 1. COHORT RETENTION (matriz m0-m3) ──────────────────────────────────
  const cohort = useMemo(() => {
    const now = new Date();
    const rows: Array<{
      cohorte: string;
      size: number;
      m0: number;
      m1: number;
      m2: number;
      m3: number;
    }> = [];
    for (let c = 3; c >= 0; c--) {
      const cStart = new Date(now.getFullYear(), now.getMonth() - c, 1);
      const cEnd = new Date(now.getFullYear(), now.getMonth() - c + 1, 0, 23, 59, 59);
      const label = cStart.toLocaleDateString("es-PE", { month: "short" });
      const allPhonesBefore = new Set<string>();
      orders
        .filter((o) => o.status !== "cancelado" && new Date(o.createdAt) < cStart)
        .forEach((o) => {
          if (o.customer?.phone) allPhonesBefore.add(o.customer.phone);
        });
      sales
        .filter((s) => new Date(s.createdAt) < cStart)
        .forEach((s) => {
          if (s.customerPhone) allPhonesBefore.add(s.customerPhone);
        });
      const firstPurchase = new Set<string>();
      orders
        .filter(
          (o) =>
            o.status !== "cancelado" &&
            new Date(o.createdAt) >= cStart &&
            new Date(o.createdAt) <= cEnd,
        )
        .forEach((o) => {
          if (o.customer?.phone && !allPhonesBefore.has(o.customer.phone))
            firstPurchase.add(o.customer.phone);
        });
      sales
        .filter((s) => new Date(s.createdAt) >= cStart && new Date(s.createdAt) <= cEnd)
        .forEach((s) => {
          if (s.customerPhone && !allPhonesBefore.has(s.customerPhone))
            firstPurchase.add(s.customerPhone);
        });
      const cohortSize = firstPurchase.size;
      if (cohortSize === 0) {
        rows.push({ cohorte: label, size: 0, m0: 0, m1: 0, m2: 0, m3: 0 });
        continue;
      }
      const mPcts = [100];
      for (let m = 1; m <= 3; m++) {
        const mS = new Date(now.getFullYear(), now.getMonth() - c + m, 1);
        const mE = new Date(now.getFullYear(), now.getMonth() - c + m + 1, 0, 23, 59, 59);
        if (mS > now) {
          mPcts.push(-1);
          continue;
        }
        let retained = 0;
        firstPurchase.forEach((phone) => {
          const hasPurchase =
            orders.some(
              (o) =>
                o.status !== "cancelado" &&
                o.customer?.phone === phone &&
                new Date(o.createdAt) >= mS &&
                new Date(o.createdAt) <= mE,
            ) ||
            sales.some(
              (s) =>
                s.customerPhone === phone &&
                new Date(s.createdAt) >= mS &&
                new Date(s.createdAt) <= mE,
            );
          if (hasPurchase) retained++;
        });
        mPcts.push(Math.round((retained / cohortSize) * 100));
      }
      rows.push({
        cohorte: label,
        size: cohortSize,
        m0: mPcts[0],
        m1: mPcts[1],
        m2: mPcts[2],
        m3: mPcts[3],
      });
    }
    return rows;
  }, [orders, sales]);

  // ── 2. RFM Quadrant (Recency × Frequency, size = Monetary) ──────────────
  const rfm = useMemo(() => {
    const now = Date.now();
    const m = new Map<
      string,
      { name: string; lastPurchase: number; frequency: number; monetary: number }
    >();
    const addOrder = (
      phone: string | undefined,
      name: string | undefined,
      date: string,
      total: number,
    ) => {
      if (!phone) return;
      const t = new Date(date).getTime();
      const cur = m.get(phone) ?? {
        name: name ?? phone,
        lastPurchase: 0,
        frequency: 0,
        monetary: 0,
      };
      cur.lastPurchase = Math.max(cur.lastPurchase, t);
      cur.frequency += 1;
      cur.monetary += total;
      m.set(phone, cur);
    };
    orders
      .filter((o) => o.status !== "cancelado")
      .forEach((o) =>
        addOrder(o.customer?.phone, o.customer?.name, o.createdAt, o.total),
      );
    sales.forEach((s) =>
      addOrder(s.customerPhone, s.customerPhone, s.createdAt, s.total),
    );
    const rows = Array.from(m.values()).map((c) => ({
      name: c.name,
      recencyDays: Math.round((now - c.lastPurchase) / (24 * 60 * 60 * 1000)),
      frequency: c.frequency,
      monetary: c.monetary,
    }));
    if (rows.length === 0) {
      return { rows: [], medianRecency: 0, medianFreq: 0, counts: { champions: 0, loyal: 0, risk: 0, new: 0 } };
    }
    const sortedR = [...rows].sort((a, b) => a.recencyDays - b.recencyDays);
    const sortedF = [...rows].sort((a, b) => a.frequency - b.frequency);
    const medianRecency = sortedR[Math.floor(sortedR.length / 2)]?.recencyDays ?? 0;
    const medianFreq = sortedF[Math.floor(sortedF.length / 2)]?.frequency ?? 0;
    const champions = rows.filter(
      (r) => r.recencyDays <= medianRecency && r.frequency >= medianFreq,
    ).length;
    const loyal = rows.filter(
      (r) => r.recencyDays > medianRecency && r.frequency >= medianFreq,
    ).length;
    const risk = rows.filter(
      (r) => r.recencyDays > medianRecency && r.frequency < medianFreq,
    ).length;
    const newC = rows.filter(
      (r) => r.recencyDays <= medianRecency && r.frequency < medianFreq,
    ).length;
    return { rows, medianRecency, medianFreq, counts: { champions, loyal, risk, new: newC } };
  }, [orders, sales]);

  // ── 3. DISTRIBUCIÓN DE RATING ─────────────────────────────────────────────
  const ratingChart = useMemo(() => {
    const arr = [1, 2, 3, 4, 5].map((r) => ({
      rating: `${r}★`,
      cantidad: reviews.filter((rv) => Math.round(rv.rating) === r).length,
    }));
    const total = arr.reduce((s, x) => s + x.cantidad, 0);
    const promedio =
      reviews.length > 0
        ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
        : 0;
    const buenos = arr.filter((x) => Number(x.rating[0]) >= 4).reduce((s, x) => s + x.cantidad, 0);
    const malos = arr.filter((x) => Number(x.rating[0]) <= 2).reduce((s, x) => s + x.cantidad, 0);
    return { arr, total, promedio, buenos, malos };
  }, [reviews]);

  // ── 4. COMPARATIVA NUEVOS CLIENTES SEM ACTUAL vs PREVIA ─────────────────
  const comp = useMemo(() => {
    const now = Date.now();
    const DAYS_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const buckets = Array.from({ length: 7 }).map(() => ({
      day: "",
      current: 0,
      previous: 0,
    }));
    const curStart = now - 7 * 24 * 60 * 60 * 1000;
    const prevStart = now - 14 * 24 * 60 * 60 * 1000;

    // Nuevos = primera compra en la semana
    const firstByPhone = new Map<string, number>();
    const pushFirst = (phone: string | undefined, date: string) => {
      if (!phone) return;
      const t = new Date(date).getTime();
      const cur = firstByPhone.get(phone);
      if (cur == null || t < cur) firstByPhone.set(phone, t);
    };
    orders
      .filter((o) => o.status !== "cancelado")
      .forEach((o) => pushFirst(o.customer?.phone, o.createdAt));
    sales.forEach((s) => pushFirst(s.customerPhone, s.createdAt));

    firstByPhone.forEach((t) => {
      if (t >= curStart) {
        const daysAgo = Math.floor((now - t) / (24 * 60 * 60 * 1000));
        if (daysAgo < 0 || daysAgo >= 7) return;
        buckets[6 - daysAgo].current += 1;
      } else if (t >= prevStart) {
        const daysAgo = Math.floor((curStart - t) / (24 * 60 * 60 * 1000));
        if (daysAgo < 0 || daysAgo >= 7) return;
        buckets[6 - daysAgo].previous += 1;
      }
    });
    const today = new Date();
    buckets.forEach((r, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      r.day = DAYS_LABEL[d.getDay()];
    });
    return buckets;
  }, [orders, sales]);

  // ── 5. HEATMAP activity hora × día (30d) ────────────────────────────────
  const heatmap = useMemo(() => {
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const BUCKETS = [
      { label: "Mañana", range: [6, 11] },
      { label: "Mediodía", range: [12, 14] },
      { label: "Tarde", range: [15, 18] },
      { label: "Noche", range: [19, 23] },
    ];
    const matrix = BUCKETS.map(() => [0, 0, 0, 0, 0, 0, 0]);
    const add = (iso: string) => {
      if (new Date(iso).getTime() < last30) return;
      const d = new Date(iso);
      const dow = (d.getDay() + 6) % 7;
      const h = d.getHours();
      const bi = BUCKETS.findIndex(({ range }) => h >= range[0] && h <= range[1]);
      if (bi < 0) return;
      matrix[bi][dow] += 1;
    };
    orders.filter((o) => o.status !== "cancelado").forEach((o) => add(o.createdAt));
    sales.forEach((s) => add(s.createdAt));
    const max = Math.max(1, ...matrix.flat());
    const peak = matrix.reduce(
      (best, row, idx) => {
        const rowMax = Math.max(...row);
        return rowMax > best.value ? { idx, value: rowMax } : best;
      },
      { idx: -1, value: 0 },
    );
    return { matrix, max, buckets: BUCKETS, days: DAYS, peak };
  }, [orders, sales]);

  // ── 6. CHURN RISK — clientes en riesgo ──────────────────────────────────
  const churn = useMemo(() => {
    const now = Date.now();
    const lastByPhone = new Map<string, { name: string; last: number; total: number; freq: number }>();
    const register = (
      phone: string | undefined,
      name: string | undefined,
      date: string,
      total: number,
    ) => {
      if (!phone) return;
      const t = new Date(date).getTime();
      const cur = lastByPhone.get(phone) ?? { name: name ?? phone, last: 0, total: 0, freq: 0 };
      cur.last = Math.max(cur.last, t);
      cur.total += total;
      cur.freq += 1;
      if (name) cur.name = name;
      lastByPhone.set(phone, cur);
    };
    orders
      .filter((o) => o.status !== "cancelado")
      .forEach((o) => register(o.customer?.phone, o.customer?.name, o.createdAt, o.total));
    sales.forEach((s) => register(s.customerPhone, s.customerPhone, s.createdAt, s.total));

    const rows = Array.from(lastByPhone.values())
      .map((c) => {
        const days = Math.round((now - c.last) / (24 * 60 * 60 * 1000));
        const riskScore =
          days > 60 ? 3 : days > 30 ? 2 : days > 14 ? 1 : 0;
        return { ...c, daysSinceLast: days, riskScore };
      })
      .filter((r) => r.riskScore >= 2 && r.freq >= 2)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const high = rows.filter((r) => r.riskScore === 3).length;
    const med = rows.filter((r) => r.riskScore === 2).length;
    const valueAtRisk = rows.reduce((s, r) => s + r.total, 0);
    return { rows, high, med, valueAtRisk };
  }, [orders, sales]);

  const fmtS = (v: number) => `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

  const sections: DraggableItem[] = [
    {
      id: "cohort-retention",
      render: () => (
        <DashboardSection
          kicker="Cohort analysis · retención mes a mes"
          title="Cuántos vuelven después de la 1ra compra"
          kpis={[
            { label: "Cohortes", value: String(cohort.length), tone: "neutral" },
            {
              label: "Promedio m1",
              value: `${
                cohort.filter((c) => c.m1 >= 0 && c.size > 0).length > 0
                  ? Math.round(
                      cohort
                        .filter((c) => c.m1 >= 0 && c.size > 0)
                        .reduce((s, c) => s + c.m1, 0) /
                        cohort.filter((c) => c.m1 >= 0 && c.size > 0).length,
                    )
                  : 0
              }%`,
              tone: "primary",
            },
            {
              label: "Promedio m3",
              value: `${
                cohort.filter((c) => c.m3 >= 0 && c.size > 0).length > 0
                  ? Math.round(
                      cohort
                        .filter((c) => c.m3 >= 0 && c.size > 0)
                        .reduce((s, c) => s + c.m3, 0) /
                        cohort.filter((c) => c.m3 >= 0 && c.size > 0).length,
                    )
                  : 0
              }%`,
              tone: "success",
            },
            {
              label: "Cohort size max",
              value: String(Math.max(0, ...cohort.map((c) => c.size))),
              tone: "neutral",
            },
          ]}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left text-[10px] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] pb-2 pr-3">
                    Cohorte
                  </th>
                  <th className="text-right text-[10px] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] pb-2 pr-3">
                    Tamaño
                  </th>
                  {["M0", "M1", "M2", "M3"].map((m) => (
                    <th
                      key={m}
                      className="text-center text-[10px] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] pb-2 px-1"
                    >
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohort.map((c) => (
                  <tr key={c.cohorte} className="border-t border-[var(--rule-soft)]">
                    <td className="py-2 pr-3 text-sm font-semibold text-[var(--text-primary)]">
                      {c.cohorte}
                    </td>
                    <td className="py-2 pr-3 text-right text-xs text-[var(--text-secondary)] tabular-nums">
                      {c.size}
                    </td>
                    {[c.m0, c.m1, c.m2, c.m3].map((pct, i) => {
                      if (pct < 0) {
                        return (
                          <td
                            key={i}
                            className="px-1 py-1 text-center text-[10px] text-[var(--text-tertiary)]"
                          >
                            —
                          </td>
                        );
                      }
                      const bg = `color-mix(in srgb, var(--accent) ${Math.max(8, pct)}%, transparent)`;
                      return (
                        <td key={i} className="px-1 py-1">
                          <div
                            className="rounded-md py-1.5 text-center text-xs font-bold tabular-nums"
                            style={{
                              background: bg,
                              color: pct > 50 ? "#fff" : "var(--text-secondary)",
                            }}
                          >
                            {pct}%
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashboardSection>
      ),
    },
    {
      id: "rfm-quadrant",
      render: () => (
        <DashboardSection
          kicker="RFM · recency × frequency · monetary = tamaño"
          title="Segmentación estratégica de clientes"
          kpis={[
            { label: "🏆 Champions", value: String(rfm.counts.champions), tone: "success" },
            { label: "💙 Leales", value: String(rfm.counts.loyal), tone: "primary" },
            { label: "⚠️ En riesgo", value: String(rfm.counts.risk), tone: "warning" },
            { label: "🌱 Nuevos", value: String(rfm.counts.new), tone: "neutral" },
          ]}
        >
          {rfm.rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
              Sin clientes con compras registradas.
            </div>
          ) : (
            <div className="relative rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)] p-6 min-h-[340px] overflow-hidden">
              <div
                className="absolute top-0 bottom-0 border-l-2 border-dashed border-[var(--rule-base)]"
                style={{ left: "50%" }}
              />
              <div
                className="absolute left-0 right-0 border-t-2 border-dashed border-[var(--rule-base)]"
                style={{ top: "50%" }}
              />
              <span className="absolute top-2 left-3 text-[10px] font-bold uppercase tracking-[var(--ls-wider)] text-primary">
                🌱 Nuevos
              </span>
              <span className="absolute top-2 right-3 text-[10px] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-success)]">
                🏆 Champions
              </span>
              <span className="absolute bottom-2 left-3 text-[10px] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning)]">
                ⚠️ En riesgo
              </span>
              <span className="absolute bottom-2 right-3 text-[10px] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
                💙 Leales
              </span>
              <span className="absolute top-1/2 left-2 -translate-y-1/2 text-[10px] font-semibold text-[var(--text-tertiary)] -rotate-90">
                ← Más reciente
              </span>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-[var(--text-tertiary)]">
                Frecuencia →
              </span>
              {rfm.rows.slice(0, 50).map((r, i) => {
                const maxF = Math.max(...rfm.rows.map((x) => x.frequency)) || 1;
                const maxR = Math.max(...rfm.rows.map((x) => x.recencyDays)) || 1;
                const maxM = Math.max(...rfm.rows.map((x) => x.monetary)) || 1;
                const x = (r.frequency / maxF) * 92 + 4;
                const y = 96 - ((maxR - r.recencyDays) / maxR) * 88;
                const size = 6 + Math.min(14, (r.monetary / maxM) * 14);
                const isChamp = r.recencyDays <= rfm.medianRecency && r.frequency >= rfm.medianFreq;
                const isRisk = r.recencyDays > rfm.medianRecency && r.frequency < rfm.medianFreq;
                const color = isChamp
                  ? "var(--data-success)"
                  : isRisk
                    ? "var(--data-warning)"
                    : r.frequency >= rfm.medianFreq
                      ? "var(--brand-primary)"
                      : "var(--text-tertiary)";
                return (
                  <div
                    key={i}
                    className="absolute rounded-full border-2 border-white dark:border-[var(--surface-sunken)] transition-transform hover:scale-125 hover:z-10 cursor-default"
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: size,
                      height: size,
                      background: color,
                      transform: "translate(-50%, -50%)",
                    }}
                    title={`${r.name} · ${r.frequency} pedidos · ${r.recencyDays}d · ${fmtS(r.monetary)}`}
                  />
                );
              })}
            </div>
          )}
        </DashboardSection>
      ),
    },
    {
      id: "rating-distribution",
      render: () => (
        <DashboardSection
          kicker="Satisfacción · todos los periodos"
          title="Distribución de reseñas por rating"
          kpis={[
            { label: "Total reseñas", value: String(ratingChart.total), tone: "primary" },
            { label: "Promedio", value: ratingChart.promedio.toFixed(1), tone: "success" },
            {
              label: "4★ y 5★",
              value: String(ratingChart.buenos),
              tone: "success",
            },
            {
              label: "1★ y 2★",
              value: String(ratingChart.malos),
              tone: ratingChart.malos > 0 ? "warning" : "success",
            },
          ]}
        >
          {ratingChart.total > 0 ? (
            <BulejeComposedChart
              data={ratingChart.arr}
              xKey="rating"
              bars={[{ key: "cantidad", label: "Reseñas", color: "primary", yAxis: "left" }]}
              leftAxisFormat={(v) => v.toString()}
              tooltipFormat={(v) => `${v} reseñas`}
              height={260}
              showLegend={false}
              minDataPoints={1}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
              Sin reseñas aún. Invitá a tus clientes a dejar feedback.
            </div>
          )}
        </DashboardSection>
      ),
    },
    {
      id: "comparativa-nuevos",
      render: () => (
        <DashboardSection
          kicker="Comparativa · nuevos clientes semana a semana"
          title="Adquisición · esta semana vs pasada"
        >
          <BulejeComparisonOverlay
            data={comp}
            xKey="day"
            currentKey="current"
            previousKey="previous"
            currentLabel="Esta semana"
            previousLabel="Semana pasada"
            yAxisFormat={(v) => v.toString()}
            tooltipFormat={(v) => `${v} nuevos`}
            height={280}
          />
        </DashboardSection>
      ),
    },
    {
      id: "heatmap-actividad",
      render: () => {
        const peakLabel =
          heatmap.peak.idx >= 0
            ? heatmap.buckets[heatmap.peak.idx].label
            : "—";
        return (
          <DashboardSection
            kicker="Heatmap · franja × día · últimos 30 días"
            title="Cuándo compran tus clientes"
            kpis={[
              { label: "Total compras 30d", value: String(heatmap.matrix.flat().reduce((s, v) => s + v, 0)), tone: "primary" },
              { label: "Franja pico", value: peakLabel, tone: "success" },
              { label: "Pico compras", value: String(heatmap.peak.value), tone: "primary" },
              { label: "Franjas", value: String(heatmap.buckets.length), tone: "neutral" },
            ]}
          >
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                <div className="grid" style={{ gridTemplateColumns: "120px repeat(7, 1fr)" }}>
                  <div />
                  {heatmap.days.map((d) => (
                    <div
                      key={d}
                      className="text-center text-[10px] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] pb-2"
                    >
                      {d}
                    </div>
                  ))}
                  {heatmap.buckets.map((bucket, bucketIdx) => (
                    <React.Fragment key={bucket.label}>
                      <div className="text-xs font-semibold text-[var(--text-secondary)] pr-3 py-1 flex items-center">
                        {bucket.label}
                      </div>
                      {heatmap.matrix[bucketIdx].map((v, dayIdx) => {
                        const intensity = v / heatmap.max;
                        const bg =
                          v === 0
                            ? "var(--surface-sunken)"
                            : `color-mix(in srgb, var(--accent) ${Math.max(10, intensity * 100)}%, transparent)`;
                        return (
                          <div
                            key={dayIdx}
                            className="relative m-0.5 rounded-md flex items-center justify-center text-[10px] font-bold transition-transform hover:scale-105 cursor-default"
                            style={{
                              background: bg,
                              color: intensity > 0.55 ? "#fff" : "var(--text-secondary)",
                              minHeight: 32,
                            }}
                            title={`${bucket.label} · ${heatmap.days[dayIdx]}: ${v} compras`}
                          >
                            {v > 0 ? v : ""}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </DashboardSection>
        );
      },
    },
    {
      id: "churn-risk",
      render: () => (
        <DashboardSection
          kicker="Churn risk · clientes en peligro de abandono"
          title="Clientes valiosos que no vuelven"
          kpis={[
            {
              label: "Alto riesgo (>60d)",
              value: String(churn.high),
              tone: churn.high > 0 ? "warning" : "success",
            },
            {
              label: "Medio (30-60d)",
              value: String(churn.med),
              tone: churn.med > 0 ? "primary" : "success",
            },
            {
              label: "Valor en riesgo",
              value: fmtS(churn.valueAtRisk),
              tone: "warning",
            },
            { label: "Total clientes", value: String(customers.length), tone: "neutral" },
          ]}
        >
          {churn.rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
              Sin clientes en riesgo ✓ — todos compraron recientemente.
            </div>
          ) : (
            <ul className="space-y-2">
              {churn.rows.map((c, i) => {
                const maxM = churn.rows[0]?.total || 1;
                const width = Math.round((c.total / maxM) * 100);
                return (
                  <li
                    key={i}
                    className="relative rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3 overflow-hidden"
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-[var(--data-warning)]/15 transition-all"
                      style={{ width: `${width}%` }}
                    />
                    <div className="relative flex items-center gap-3">
                      <span
                        className={
                          "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0 " +
                          (c.riskScore === 3
                            ? "bg-[var(--data-warning)] text-white"
                            : "bg-[var(--data-warning-50)] text-[var(--data-warning)]")
                        }
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {c.name}
                        </p>
                        <p className="text-[11px] text-[var(--text-tertiary)]">
                          {c.freq} pedidos · último hace {c.daysSinceLast} días
                        </p>
                      </div>
                      <span className="text-sm font-bold text-[var(--text-secondary)] shrink-0">
                        {fmtS(c.total)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DashboardSection>
      ),
    },
  ];

  return <DraggableSections items={sections} storageKey="clientes-advanced-order" />;
});
