"use client";

/**
 * AnalisisView — Análisis del módulo Adelantos (ADR-121).
 *
 * Mejoras sobre la versión inline anterior:
 *  • KPIs arriba (adelantado / liquidado / pendiente / % recuperado / personas).
 *  • Segmentación por MONEDA (fix bug: antes sumaba S/ y US$ juntos). Toggle si
 *    hay >1 moneda; default a la de mayor volumen.
 *  • Tramos de atraso (mismos 5 de Cobranza, vía `deudoresDeCobranza`/TRAMOS) —
 *    antes bucketeaba por antigüedad del adelanto (`daysSince(fechaAdelanto)`),
 *    el mismo error que `urgencia-cobranza.ts` documenta como el bug que
 *    vino a corregir: un adelanto de 45 días con entrega pactada para el mes
 *    que viene contaba como "vencido" acá aunque en Cobranza no lo fuera.
 *  • Tasa de recuperación + velocidad media de liquidación (días).
 */

import { useMemo, useState } from "react";
import { CardTitle, StatCard } from "@buleje/design-system";
import { BarChart3, TrendingDown, TrendingUp, Coins, Users, Clock, FileText, Gauge } from "@buleje/design-system/icons";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { fmtMon, EmptyState, SkeletonGrid } from "./shared";
import { deudoresDeCobranza } from "@/lib/adelantos/urgencia-cobranza";
import { TRAMOS, tramoDe, type TramoId } from "@/lib/adelantos/gestion-cobranza";

export function AnalisisView({ adelantos, loading }: { adelantos: DbAdelanto[]; loading: boolean }) {
  // Monedas presentes (por volumen adelantado), para el toggle.
  const monedas = useMemo(() => {
    const vol: Record<string, number> = {};
    for (const a of adelantos) {
      if (a.status === "CANCELADO") continue;
      const c = a.moneda || "PEN";
      vol[c] = (vol[c] ?? 0) + a.montoAdelantado;
    }
    return Object.keys(vol).sort((x, y) => vol[y] - vol[x]);
  }, [adelantos]);

  const [moneda, setMoneda] = useState<string>(monedas[0] ?? "PEN");
  const cur = monedas.includes(moneda) ? moneda : (monedas[0] ?? "PEN");

  // Adelantos de la moneda seleccionada (no cancelados).
  const scoped = useMemo(
    () => adelantos.filter((a) => (a.moneda || "PEN") === cur && a.status !== "CANCELADO"),
    [adelantos, cur],
  );

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    let adelantado = 0, liquidado = 0, pendiente = 0;
    const deudores = new Set<string>();
    for (const a of scoped) {
      adelantado += a.montoAdelantado;
      for (const e of a.entregas) liquidado += e.valor;
      if (a.status === "ABIERTO" && a.saldoPendiente > 0) {
        pendiente += a.saldoPendiente;
        deudores.add(a.beneficiarioId);
      }
    }
    const pct = adelantado > 0 ? Math.min(100, Math.round((liquidado / adelantado) * 100)) : 0;
    return { adelantado, liquidado, pendiente, pct, deudores: deudores.size };
  }, [scoped]);

  // ── Velocidad media de liquidación (días) sobre adelantos LIQUIDADOS ────────
  const velocidad = useMemo(() => {
    const tiempos: number[] = [];
    for (const a of scoped) {
      if (a.status !== "LIQUIDADO" || a.entregas.length === 0) continue;
      const ultima = a.entregas.reduce((max, e) => (e.fecha > max ? e.fecha : max), a.entregas[0].fecha);
      const dias = Math.max(0, Math.floor((new Date(ultima).getTime() - new Date(a.fechaAdelanto).getTime()) / 86_400_000));
      tiempos.push(dias);
    }
    if (tiempos.length === 0) return null;
    return Math.round(tiempos.reduce((s, d) => s + d, 0) / tiempos.length);
  }, [scoped]);

  /**
   * Atraso de saldos pendientes — por DEUDOR, no por adelanto suelto.
   *
   * Misma regla que Cobranza (`deudoresDeCobranza` + `tramoDe`): el atraso se
   * mide contra la pactada/vencimiento incumplido más viejo de la persona, y
   * sólo cae a antigüedad cuando no hay fecha comprometida. Si una persona
   * debe por dos adelantos, el peor de los dos arrastra el saldo de ambos al
   * mismo tramo — es la misma convención de riesgo que usa Cobranza para
   * decidir a quién llamar primero.
   */
  const aging = useMemo(() => {
    const abiertos = scoped.filter((a) => a.status === "ABIERTO" && a.saldoPendiente > 0);
    const buckets = Object.fromEntries(TRAMOS.map((t) => [t.id, 0])) as Record<TramoId, number>;
    for (const d of deudoresDeCobranza(abiertos)) buckets[tramoDe(d.dias)] += d.saldo;
    return TRAMOS.map((t) => ({ key: t.id, label: t.label, color: t.tono, monto: buckets[t.id] }));
  }, [scoped]);
  const hayAging = aging.some((b) => b.monto > 0);

  // ── Evolución mensual (6 meses) — moneda seleccionada ───────────────────────
  const meses = useMemo(() => {
    const out: { mes: string; adelantado: number; liquidado: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("es-PE", { month: "short" });
      let adelantado = 0, liquidado = 0;
      for (const a of scoped) {
        if (a.fechaAdelanto.startsWith(key)) adelantado += a.montoAdelantado;
        for (const e of a.entregas) if (e.fecha.startsWith(key)) liquidado += e.valor;
      }
      out.push({ mes: label, adelantado, liquidado });
    }
    return out;
  }, [scoped]);
  const hayMov = meses.some((m) => m.adelantado > 0 || m.liquidado > 0);

  // ── Por modalidad ───────────────────────────────────────────────────────────
  const porModalidad = useMemo(() => [
    { name: "Cuenta corriente", value: scoped.filter((a) => a.modalidad === "CUENTA_CORRIENTE").length, color: "var(--accent)" },
    { name: "Entregas pactadas", value: scoped.filter((a) => a.modalidad === "ENTREGAS_PACTADAS").length, color: "var(--data-warning)" },
  ].filter((d) => d.value > 0), [scoped]);

  // ── Top deudores ────────────────────────────────────────────────────────────
  const topDeudores = useMemo(() => {
    const map = scoped.filter((a) => a.status === "ABIERTO" && a.saldoPendiente > 0)
      .reduce<Record<string, number>>((acc, a) => { const k = (a.beneficiario?.nombre ?? "—").slice(0, 14); acc[k] = (acc[k] ?? 0) + a.saldoPendiente; return acc; }, {});
    return Object.entries(map).map(([name, monto]) => ({ name, monto })).sort((a, b) => b.monto - a.monto).slice(0, 5);
  }, [scoped]);

  // ── Export CSV (todas las monedas; incluye columna Moneda) ──────────────────
  const exportarCsv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: (string | number)[][] = [["Fecha", "Tipo", "Persona", "Modalidad", "Detalle", "Monto", "Moneda"]];
    for (const a of adelantos) {
      const persona = a.beneficiario?.nombre ?? "—";
      // 2026-05-26 (P2-3): fallback PEN si una fila antigua tiene moneda null —
      // evita el literal "null" en la columna Moneda del CSV.
      const mon = a.moneda || "PEN";
      if (a.status !== "CANCELADO") rows.push([a.fechaAdelanto.slice(0, 10), "Adelanto", persona, a.modalidad === "CUENTA_CORRIENTE" ? "Cuenta corriente" : "Entregas pactadas", a.notas ?? "", a.montoAdelantado.toFixed(2), mon]);
      for (const e of a.entregas) rows.push([e.fecha.slice(0, 10), "Entrega", persona, "", e.descripcion ?? "", (-e.valor).toFixed(2), mon]);
    }
    const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `adelantos-movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <SkeletonGrid />;
  if (adelantos.length === 0) return <EmptyState icon={BarChart3} title="Sin datos" hint="Los gráficos aparecen cuando registres adelantos." />;

  const monedaLabel = (c: string) => (c === "USD" ? "US$ Dólares" : c === "PEN" ? "S/ Soles" : c);

  return (
    <div className="space-y-5">
      {/* Header + toggle de moneda + export */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base font-extrabold text-[var(--text-primary)]">Análisis del módulo</CardTitle>
        <div className="flex items-center gap-2">
          {monedas.length > 1 && (
            <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] overflow-hidden">
              {monedas.map((c) => (
                <button
                  key={c}
                  onClick={() => setMoneda(c)}
                  className={`h-10 px-4 text-sm font-bold transition-colors ${cur === c ? "bg-primary text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
                >
                  {c === "USD" ? "US$" : "S/"}
                </button>
              ))}
            </div>
          )}
          <button onClick={exportarCsv} className="inline-flex items-center gap-1 h-10 px-4 rounded-xl border border-[var(--rule-base)] text-base font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors">
            <FileText className="h-5 w-5" /> Exportar CSV
          </button>
        </div>
      </div>

      {monedas.length > 1 && (
        <p className="text-sm text-[var(--text-tertiary)] -mt-2">Mostrando <strong className="text-[var(--text-secondary)]">{monedaLabel(cur)}</strong>. Cambiá la moneda arriba.</p>
      )}

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <StatCard label="Adelantado" value={fmtMon(kpi.adelantado, cur)} icon={TrendingDown} subValue="Plata que diste" />
        <StatCard label="Liquidado" value={fmtMon(kpi.liquidado, cur)} icon={TrendingUp} emphasis="success" subValue="Recuperado" />
        <StatCard label="Pendiente" value={fmtMon(kpi.pendiente, cur)} icon={Coins} emphasis={kpi.pendiente > 0 ? "warning" : "neutral"} subValue="Por cobrar" />
        <StatCard label="% Recuperado" value={`${kpi.pct}%`} icon={Gauge} emphasis={kpi.pct >= 80 ? "success" : kpi.pct >= 50 ? "neutral" : "warning"} subValue={velocidad !== null ? `~${velocidad} días prom.` : "Sin liquidaciones"} />
        <StatCard label="Personas deben" value={String(kpi.deudores)} icon={Users} density="compact" subValue="Con saldo abierto" />
      </div>

      {/* Aging de saldos */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <CardTitle className="text-base font-extrabold text-[var(--text-primary)] mb-1 inline-flex items-center gap-2">
          <Clock className="h-5 w-5 text-[var(--data-warning)]" /> Atraso de lo que te deben
        </CardTitle>
        <p className="text-sm text-[var(--text-tertiary)] mb-4">A quién hay que cobrarle primero — mientras más atrasado, más prioridad.</p>
        {hayAging ? (
          <ResponsiveContainer minWidth={0} width="100%" height={220}>
            <BarChart data={aging}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v: number) => fmtMon(v, cur)} tick={{ fontSize: 11 }} width={70} axisLine={false} tickLine={false} />
              <Tooltip formatter={((v: number) => [fmtMon(Number(v), cur), "Saldo"]) as never} contentStyle={{ borderRadius: "12px", fontSize: "13px" }} />
              <Bar dataKey="monto" radius={[6, 6, 0, 0]}>{aging.map((b) => <Cell key={b.key} fill={b.color} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="py-8 text-center text-base text-[var(--text-tertiary)]">Nadie te debe nada en {monedaLabel(cur)}. 🎉</p>}
      </div>

      {/* Evolución mensual */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <CardTitle className="text-base font-extrabold text-[var(--text-primary)] mb-4">Adelantado vs Liquidado (6 meses)</CardTitle>
        {hayMov ? (
          <ResponsiveContainer minWidth={0} width="100%" height={240}>
            <AreaChart data={meses}>
              <defs>
                <linearGradient id="adelGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--data-warning)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--data-warning)" stopOpacity={0} /></linearGradient>
                <linearGradient id="liqGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--data-success)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--data-success)" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v: number) => fmtMon(v, cur)} tick={{ fontSize: 12 }} width={70} />
              <Tooltip formatter={((v: number, name: string) => [fmtMon(Number(v), cur), name === "adelantado" ? "Adelantado" : "Liquidado"]) as never} contentStyle={{ borderRadius: "12px", fontSize: "13px" }} />
              <Area type="monotone" dataKey="adelantado" stroke="var(--data-warning)" fill="url(#adelGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="liquidado" stroke="var(--data-success)" fill="url(#liqGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <p className="py-8 text-center text-base text-[var(--text-tertiary)]">Sin movimiento en los últimos 6 meses.</p>}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <CardTitle className="text-base font-extrabold text-[var(--text-primary)] mb-2">Por modalidad</CardTitle>
          {porModalidad.length > 0 ? (
            <>
              <ResponsiveContainer minWidth={0} width="100%" height={170}>
                <PieChart><Pie data={porModalidad} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="value" stroke="none" paddingAngle={2}>{porModalidad.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip formatter={((v: number, n: string) => [v, n]) as never} contentStyle={{ borderRadius: "12px", fontSize: "13px" }} /></PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap gap-3">
                {porModalidad.map((d) => (<span key={d.name} className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />{d.name}: <strong>{d.value}</strong></span>))}
              </div>
            </>
          ) : <p className="py-8 text-center text-base text-[var(--text-tertiary)]">Sin datos.</p>}
        </div>

        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <CardTitle className="text-base font-extrabold text-[var(--text-primary)] mb-2">Top 5 deudores</CardTitle>
          {topDeudores.length > 0 ? (
            <ResponsiveContainer minWidth={0} width="100%" height={200}>
              <BarChart data={topDeudores} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.1)" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => fmtMon(v, cur)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={((v: number) => [fmtMon(Number(v), cur), "Saldo"]) as never} contentStyle={{ borderRadius: "12px", fontSize: "13px" }} />
                <Bar dataKey="monto" radius={[0, 6, 6, 0]}>{topDeudores.map((_, i) => <Cell key={i} fill={i === 0 ? "var(--data-warning)" : "var(--text-tertiary)"} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-8 text-center text-base text-[var(--text-tertiary)]">Nadie debe nada.</p>}
        </div>
      </div>
    </div>
  );
}
