"use client";

import { LoadingState, PageTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Landmark, Calculator, CalendarDays, Info, ClipboardCheck,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminCard from "./shared/AdminCard";
import StatusBadge from "./shared/StatusBadge";
import {
  computeObligacionesMensuales,
  ventanaVencimientoReferencial,
  REGIMEN_LABELS,
  IGV_RATE,
  type RegimenTributario,
} from "@/lib/tax/obligaciones-peru";

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const REGIMENES = ["nrus", "rer", "rmt", "general"] as const;

const fmt = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ObligacionesTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [regimen, setRegimen] = useState<RegimenTributario>("rmt");
  const [ruc, setRuc] = useState("");
  const [loading, setLoading] = useState(true);
  // Base imponible por mes (0..11) del año seleccionado — para el mes actual y
  // el resumen anual, con una sola carga de datos.
  const [monthlyVentas, setMonthlyVentas] = useState<number[]>(() => Array(12).fill(0));
  const [monthlyCompras, setMonthlyCompras] = useState<number[]>(() => Array(12).fill(0));
  // Tracker de declaraciones del año (estado persistido por tenant).
  const [declaraciones, setDeclaraciones] = useState<Array<{ periodo: string; tipo: string; estado: string }>>([]);

  // Config REAL del tenant (régimen + RUC viven en Settings, no en localStorage):
  // así se comparten entre los usuarios y dispositivos del negocio.
  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then((s: { regimenTributario?: string; ruc?: string } | null) => {
        if (!s) return;
        if (s.regimenTributario && (REGIMENES as readonly string[]).includes(s.regimenTributario)) {
          setRegimen(s.regimenTributario as RegimenTributario);
        }
        if (s.ruc) setRuc(String(s.ruc));
      })
      .catch((err) => console.warn("[ObligacionesTab] settings load failed:", String(err)));
  }, []);

  // Persiste un campo de config al tenant (Settings) vía PATCH con CSRF.
  const saveSetting = useCallback((patch: Record<string, string>) => {
    fetch("/api/settings", {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    }).catch((err) => console.warn("[ObligacionesTab] settings save failed:", String(err)));
  }, []);

  // Carga el estado real de las declaraciones del año (tracker persistido).
  useEffect(() => {
    fetch(`/api/admin/declaraciones?year=${year}`)
      .then(r => r.ok ? r.json() : [])
      .then((d) => setDeclaraciones(Array.isArray(d) ? d : []))
      .catch((err) => console.warn("[ObligacionesTab] declaraciones load failed:", String(err)));
  }, [year]);

  // Marca/actualiza el estado de una declaración y lo persiste (optimista).
  const setDeclaracionEstado = useCallback((periodo: string, tipo: string, estado: string, montoDeclarado?: number) => {
    setDeclaraciones(prev => {
      const rest = prev.filter(d => !(d.periodo === periodo && d.tipo === tipo));
      return [...rest, { periodo, tipo, estado }];
    });
    fetch("/api/admin/declaraciones", {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ periodo, tipo, estado, ...(montoDeclarado != null && { montoDeclarado }) }),
    }).catch((err) => console.warn("[ObligacionesTab] declaracion save failed:", String(err)));
  }, []);

  // Datos REALES del AÑO completo (1 sola carga), buckets por mes. Sin relleno:
  // un mes sin actividad queda en 0. Ventas ← órdenes; compras ← payables.
  useEffect(() => {
    let active = true;
    setLoading(true);
    // Mes (0..11) del año seleccionado a partir de un ISO "YYYY-MM-DD…"; -1 si no.
    const bucketMonth = (iso: string): number => {
      const s = iso.slice(0, 10);
      if (s.slice(0, 4) !== String(year)) return -1;
      return Number(s.slice(5, 7)) - 1;
    };

    Promise.all([
      fetch(`/api/orders?from=${year}-01-01&to=${year}-12-31`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/payables`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([orders, payables]) => {
      if (!active) return;
      const ventas = Array(12).fill(0);
      const compras = Array(12).fill(0);
      for (const o of (Array.isArray(orders) ? orders : []) as Array<{ status: string; createdAt?: string; total: number }>) {
        if (o.status !== "entregado" && o.status !== "confirmado") continue;
        const m = o.createdAt ? bucketMonth(o.createdAt) : -1;
        if (m >= 0) ventas[m] += (Number(o.total) || 0) / (1 + IGV_RATE);
      }
      for (const p of (Array.isArray(payables) ? payables : []) as Array<{ createdAt?: string; amount: number }>) {
        const m = p.createdAt ? bucketMonth(p.createdAt) : -1;
        if (m >= 0) compras[m] += (Number(p.amount) || 0) / (1 + IGV_RATE);
      }
      setMonthlyVentas(ventas);
      setMonthlyCompras(compras);
      setLoading(false);
    });

    return () => { active = false; };
  }, [year]);

  // Mes seleccionado — ingreso acumulado hasta ese mes (umbral RMT 300 UIT).
  const ventasBase = monthlyVentas[month] ?? 0;
  const comprasBase = monthlyCompras[month] ?? 0;
  const accHastaMes = useMemo(
    () => monthlyVentas.slice(0, month + 1).reduce((s, v) => s + v, 0),
    [monthlyVentas, month],
  );
  const result = useMemo(
    () => computeObligacionesMensuales({ regimen, ventasBase, comprasBase, ingresosNetosAnualAcum: accHastaMes }),
    [regimen, ventasBase, comprasBase, accHastaMes],
  );

  // Resumen anual — obligaciones de cada mes con ingreso acumulado correcto.
  const anual = useMemo(() => {
    let acc = 0;
    const rows = monthlyVentas.map((v, i) => {
      acc += v;
      const r = computeObligacionesMensuales({ regimen, ventasBase: v, comprasBase: monthlyCompras[i], ingresosNetosAnualAcum: acc });
      const igv = r.obligaciones.find(o => o.key === "igv")?.monto ?? 0;
      const renta = r.obligaciones.find(o => o.key === "renta")?.monto ?? 0;
      return { igv, renta, total: r.total };
    });
    return {
      rows,
      totalIgv: rows.reduce((s, r) => s + r.igv, 0),
      totalRenta: rows.reduce((s, r) => s + r.renta, 0),
      total: rows.reduce((s, r) => s + r.total, 0),
    };
  }, [monthlyVentas, monthlyCompras, regimen]);

  const venc = ventanaVencimientoReferencial(ruc);

  // Estado persistido de la declaración IGV-Renta del mes seleccionado.
  const periodoActual = `${year}-${String(month + 1).padStart(2, "0")}`;
  const estadoIgvRenta = declaraciones.find(d => d.periodo === periodoActual && d.tipo === "igv-renta")?.estado ?? "pendiente";

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header — mismo patrón que Impuestos/Cuentas por Pagar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-semibold">SUNAT / Tributario</p>
          <PageTitle className="mt-1 text-fs-h1 font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Landmark className="h-5 w-5 currentColor" />
            Obligaciones &amp; Declaraciones
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Cuánto debe pagar y declarar tu empresa este mes (IGV, Renta y más)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={regimen} onChange={e => { const v = e.target.value as RegimenTributario; setRegimen(v); saveSetting({ regimenTributario: v }); }} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            {(Object.keys(REGIMEN_LABELS) as RegimenTributario[]).map(r => <option key={r} value={r}>{REGIMEN_LABELS[r]}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Disclaimer — honesto: son estimaciones, no reemplazan al contador */}
      <AdminCard padding="md" className="flex items-start gap-3 border-l-2 border-l-[var(--data-info-500)]">
        <Info className="h-5 w-5 text-[var(--data-info-500)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Estimaciones calculadas con tu actividad real del período y fórmulas estándar SUNAT. <span className="font-semibold text-[var(--text-primary)]">No reemplazan a tu contador</span>: el coeficiente de Renta del Régimen General, retenciones, detracciones y planilla pueden cambiar el monto final.
        </p>
      </AdminCard>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          {/* Total a pagar + vencimiento referencial */}
          <AdminCard padding="lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[var(--ls-wider)] font-semibold text-[var(--text-tertiary)] mb-2">Total a pagar — {MONTHS[month]} {year}</p>
                <p className="text-4xl font-semibold tabular-nums text-[var(--text-primary)]">{fmt(result.total)}</p>
                <div className="mt-2">
                  <StatusBadge variant={result.total > 0 ? "warning" : "success"} label={result.total > 0 ? "Pendiente de declarar/pagar" : "Sin saldo a pagar este mes"} dot />
                </div>
              </div>
              <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 text-sm max-w-xs">
                <p className="text-xs uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1 flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" /> Vencimiento
                </p>
                {venc ? (
                  <p className="text-[var(--text-primary)] font-semibold">
                    {venc.rango}
                    <span className="block text-xs font-normal text-[var(--text-tertiary)] mt-0.5">RUC terminado en {venc.ultimoDigito} · referencial, confirmá el cronograma oficial SUNAT</span>
                  </p>
                ) : (
                  <input
                    value={ruc}
                    onChange={e => setRuc(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    onBlur={() => { if (ruc.length === 11) saveSetting({ ruc }); }}
                    placeholder="Ingresá tu RUC (11 dígitos)"
                    className="w-full text-sm border border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)]"
                  />
                )}
              </div>
            </div>
          </AdminCard>

          {/* Obligaciones del mes — una card por tributo con su fórmula */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {result.obligaciones.map(o => (
              <AdminCard key={o.key} padding="md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-[var(--text-tertiary)]" /> {o.label}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1 leading-snug">{o.formula}</p>
                  </div>
                  {o.estimado && <StatusBadge variant="neutral" label="estimado" size="sm" />}
                </div>
                <p className={cn("mt-3 text-2xl font-semibold tabular-nums", o.monto > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)]")}>
                  {o.key === "nrus" ? "Cuota fija" : fmt(o.monto)}
                </p>
              </AdminCard>
            ))}
          </div>

          {/* Resumen anual — 12 meses de pagos a cuenta (IGV + Renta) */}
          <AdminCard padding="lg">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[var(--text-tertiary)]" /> Resumen anual {year}
              </p>
              <StatusBadge variant="neutral" label="estimado" size="sm" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead className="bg-[var(--surface-alt)] dark:bg-surface border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">Mes</th>
                    <th className="text-right px-3 py-2 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">IGV</th>
                    <th className="text-right px-3 py-2 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">Renta</th>
                    <th className="text-right px-3 py-2 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                  {anual.rows.map((r, i) => (
                    <tr key={i} className={cn("transition-colors hover:bg-[var(--surface-alt)] dark:hover:bg-surface/50", i === month && "bg-primary/10/40")}>
                      <td className="px-3 py-2 text-[var(--text-primary)] dark:text-[var(--text-primary)]">{MONTHS[i]}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--data-warning-500)]">{fmt(r.igv)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)] dark:text-muted">{fmt(r.renta)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--rule-base)] font-bold">
                    <td className="px-3 py-2 text-[var(--text-primary)] dark:text-[var(--text-primary)]">Total {year}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--data-warning-500)]">{fmt(anual.totalIgv)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)] dark:text-muted">{fmt(anual.totalRenta)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(anual.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 text-xs text-[var(--text-secondary)] leading-relaxed">
              Suma de los pagos a cuenta del año. La <span className="font-semibold text-[var(--text-primary)]">Renta anual definitiva</span> se determina sobre la renta neta (ingresos − gastos del ejercicio), que requiere tu estado de resultados completo — no se estima acá.
            </p>
          </AdminCard>

          {/* Declaraciones del mes — checklist informativo */}
          <AdminCard padding="lg">
            <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-3">
              <ClipboardCheck className="h-4 w-4 text-[var(--text-tertiary)]" /> Declaraciones de {MONTHS[month]} {year}
            </p>
            <ul className="space-y-2.5 text-sm">
              <li className="flex flex-col gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[var(--text-primary)]">
                    <span className="font-semibold">Declaración mensual IGV-Renta</span> — Formulario Virtual 621 ({MONTHS[month]} {year}). Cubre el IGV y el pago a cuenta de Renta de arriba.
                  </span>
                  <StatusBadge
                    variant={estadoIgvRenta === "pagada" ? "success" : estadoIgvRenta === "presentada" ? "info" : "warning"}
                    label={estadoIgvRenta === "pagada" ? "Pagada" : estadoIgvRenta === "presentada" ? "Presentada" : "Pendiente"}
                    size="sm"
                    dot
                  />
                </div>
                <div className="inline-flex self-start overflow-hidden rounded-lg border border-[var(--rule-base)]">
                  {(["pendiente", "presentada", "pagada"] as const).map((est, i) => (
                    <button
                      key={est}
                      type="button"
                      onClick={() => setDeclaracionEstado(periodoActual, "igv-renta", est, result.total)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                        i > 0 && "border-l border-[var(--rule-base)]",
                        estadoIgvRenta === est
                          ? "bg-primary text-white"
                          : "bg-white dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] dark:hover:bg-accent",
                      )}
                    >
                      {est}
                    </button>
                  ))}
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <Info className="h-4 w-4 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
                <span className="text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">PLAME</span> (Planilla Electrónica) — solo si tenés trabajadores en planilla (ESSALUD 9%, ONP/AFP)
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Info className="h-4 w-4 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
                <span className="text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">Declaración Anual de Renta</span> — una vez al año (marzo/abril del año siguiente)
                </span>
              </li>
            </ul>
          </AdminCard>

          {/* Pendiente honesto — lo que aún no se calcula automático */}
          <AdminCard padding="md" className="border-l-2 border-l-[var(--data-warning)]">
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">Lo que falta integrar (no se inventa)</p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              ESSALUD/ONP/AFP (requiere planilla), detracciones y percepciones (según comprobantes), ITAN y Renta anual. Cuando conectemos esas fuentes, aparecen acá con su monto real.
            </p>
          </AdminCard>
        </>
      )}
    </div>
  );
}
