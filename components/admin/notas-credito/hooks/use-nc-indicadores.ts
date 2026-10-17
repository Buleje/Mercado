import { useMemo } from "react";
import { ShieldCheck, ShieldAlert, ShieldX } from "@buleje/design-system/icons";
import { MOTIVOS_SUNAT } from "@/components/admin/notas-credito/nc-compartido";
import { useNcEstado } from "@/components/admin/notas-credito/hooks/use-nc-estado";
import { useNcSelector } from "@/components/admin/notas-credito/hooks/use-nc-selector";
import { useNcLista } from "@/components/admin/notas-credito/hooks/use-nc-lista";
import { useNcAcciones } from "@/components/admin/notas-credito/hooks/use-nc-acciones";

/** Indicadores, gráficos, semáforo e historial del cliente. Parte de `useNotasCredito`. */
export function useNcIndicadores(previo: ReturnType<typeof useNcEstado> & ReturnType<typeof useNcSelector> & ReturnType<typeof useNcLista> & ReturnType<typeof useNcAcciones>) {
  const {
    notas, statusFilter, selected, dateFrom, dateTo, minAmount, maxAmount,
  } = previo;
  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const now = new Date();
    const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const ncMes = notas.filter(nc => nc.createdAt.startsWith(mesActual));
    const mesAnterior = now.getMonth() === 0 ? `${now.getFullYear() - 1}-12` : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;
    const ncMesAnt = notas.filter(nc => nc.createdAt.startsWith(mesAnterior));
    const count = ncMes.length;
    const total = ncMes.reduce((s, nc) => s + nc.total, 0);
    const prevTotal = ncMesAnt.reduce((s, nc) => s + nc.total, 0);
    const trend = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;
    const motivoCounts: Record<string, number> = {};
    for (const nc of ncMes) { const m = MOTIVOS_SUNAT.find(x => x.code === nc.motivoCodigo)?.label ?? nc.motivoCodigo; motivoCounts[m] = (motivoCounts[m] ?? 0) + 1; }
    const topMotivo = Object.entries(motivoCounts).sort((a, b) => b[1] - a[1])[0];
    return { count, total, trend, topMotivo };
  }, [notas]);

  const trendData = useMemo(() => {
    const weeks: Record<string, number> = {};
    const now = Date.now();
    for (const nc of notas) {
      const age = now - new Date(nc.createdAt).getTime();
      if (age > 90 * 86_400_000) continue;
      const d = new Date(nc.createdAt);
      const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      weeks[key] = (weeks[key] ?? 0) + 1;
    }
    return Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0])).map(([week, count]) => ({ week: week.slice(5), count }));
  }, [notas]);

  const donutData = useMemo(() => {
    const now = new Date();
    const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const ncMes = notas.filter(nc => nc.createdAt.startsWith(mesActual));
    const motivoMap = new Map<string, { desc: string; count: number }>();
    for (const nc of ncMes) {
      const desc = MOTIVOS_SUNAT.find(m => m.code === nc.motivoCodigo)?.label || nc.motivoDesc || "Otro";
      const existing = motivoMap.get(nc.motivoCodigo);
      if (existing) existing.count++; else motivoMap.set(nc.motivoCodigo, { desc, count: 1 });
    }
    const motivoColors: Record<string, string> = { "01": "var(--data-error)", "06": "var(--data-warning)", "07": "var(--data-warning)", "02": "var(--text-secondary)", "03": "var(--text-secondary)", "04": "var(--text-tertiary)", "05": "var(--text-tertiary)" };
    return Array.from(motivoMap.entries()).map(([code, { desc, count }]) => ({ name: desc, value: count, color: motivoColors[code] || "var(--text-tertiary)" }));
  }, [notas]);

  const activeFilterCount = [statusFilter, dateFrom, dateTo, minAmount, maxAmount].filter(Boolean).length;

  // ── Semáforo de salud ─────────────────────────────────────────────────────
  const semaforo = useMemo(() => {
    if (kpis.count === 0) return { nivel: "verde", label: "Normal", Icon: ShieldCheck, color: "text-[var(--data-success-500)]", bg: "bg-primary/10" };
    if (kpis.trend > 50) return { nivel: "rojo", label: "Alto", Icon: ShieldX, color: "text-[var(--data-error-500)]", bg: "bg-[var(--data-error-50)]" };
    if (kpis.trend > 20) return { nivel: "amarillo", label: "Atención", Icon: ShieldAlert, color: "text-[var(--data-warning-ink)]", bg: "bg-[var(--data-warning-50)]" };
    return { nivel: "verde", label: "Normal", Icon: ShieldCheck, color: "text-[var(--data-success-500)]", bg: "bg-primary/10" };
  }, [kpis]);

  // ── Distribución por día de semana (mes actual) ───────────────────────────
  const weekdayData = useMemo(() => {
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const now = new Date();
    const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    for (const nc of notas.filter(n => n.createdAt.startsWith(mesActual))) {
      counts[new Date(nc.createdAt).getDay()]++;
    }
    return days.map((name, i) => ({ name, count: counts[i] }));
  }, [notas]);

  // ── Impacto en ventas del NC seleccionado ─────────────────────────────────
  const impactoVentas = useMemo(() => {
    if (!selected || kpis.total === 0) return null;
    return (selected.total / kpis.total) * 100;
  }, [selected, kpis.total]);

  // ── Historial de NCs del mismo cliente ────────────────────────────────────
  const clienteHistorial = useMemo(() => {
    if (!selected?.clienteNombre) return 0;
    return notas.filter(nc => nc.clienteNombre === selected.clienteNombre && nc.id !== selected.id).length;
  }, [selected, notas]);

  return {
    kpis, trendData, donutData, activeFilterCount, semaforo, weekdayData, impactoVentas,
    clienteHistorial,
  };
}
