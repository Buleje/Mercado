"use client";

import { LoadingState, PageTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo } from "react";
import {
  Receipt, RefreshCw, AlertTriangle,
  CheckCircle, BookOpen,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import AdminCard from "./shared/AdminCard";
import StatusBadge from "./shared/StatusBadge";

// ── Types ─────────────────────────────────────────────────────────────────────

type TaxLine = {
  id: string;
  date: string;
  type: "venta" | "compra";
  docType: string;     // Factura / Boleta
  serie: string;
  number: string;
  entity: string;      // Cliente o Proveedor
  entityDoc: string;   // RUC/DNI
  base: number;        // Base imponible
  igv: number;         // IGV = base * 0.18
  total: number;
  status: "pendiente" | "declarado";
};

type PeriodSummary = {
  salesBase: number;
  salesIGV: number;
  purchasesBase: number;
  purchasesIGV: number;
  igvBalance: number;   // IGV ventas - IGV compras = saldo a pagar/favor
};

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function fmt(n: number) {
  return `S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

// IGV de Perú = 18%. Asumimos que `total`/`amount` lo incluyen (lo estándar en
// boletas/facturas peruanas) → la base se obtiene revirtiendo el IGV.
const IGV_RATE = 0.18;
const round2 = (n: number) => parseFloat(n.toFixed(2));

// ── Component ─────────────────────────────────────────────────────────────────

export default function TaxTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<TaxLine[]>([]);
  const [view, setView] = useState<"ventas" | "compras" | "resumen">("resumen");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // Datos REALES del período (sin relleno: si no hay nada, el período va vacío).
    //   - Ventas  ← órdenes entregadas/confirmadas (/api/orders)
    //   - Compras ← cuentas por pagar registradas en el período (/api/payables),
    //               proxy de las facturas de proveedor para el crédito fiscal.
    const inPeriod = (iso: string) => {
      const day = iso.slice(0, 10);
      return day >= from && day <= to;
    };

    Promise.all([
      fetch(`/api/orders?from=${from}&to=${to}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/payables`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([orders, payables]) => {
      if (!active) return;

      const ventas: TaxLine[] = (Array.isArray(orders) ? orders : [])
        .filter((o: { status: string }) => o.status === "entregado" || o.status === "confirmado")
        .map((o: { id: string; createdAt: string; total: number; customer?: { name?: string; phone?: string } }, i: number) => {
          const base = round2(o.total / (1 + IGV_RATE));
          return {
            id: `ord-${o.id}`,
            date: o.createdAt.slice(0, 10),
            type: "venta" as const,
            docType: "Boleta",
            serie: "B001",
            number: String(i + 1).padStart(8, "0"),
            entity: o.customer?.name ?? "Cliente",
            entityDoc: o.customer?.phone ?? "—",
            base, igv: round2(o.total - base), total: o.total,
            status: "pendiente" as const,
          };
        });

      const compras: TaxLine[] = (Array.isArray(payables) ? payables : [])
        .filter((p: { createdAt?: string }) => !!p.createdAt && inPeriod(p.createdAt))
        .map((p: { id: string; createdAt: string; amount: number; supplierName?: string }, i: number) => {
          const total = Number(p.amount) || 0;
          const base = round2(total / (1 + IGV_RATE));
          return {
            id: `pay-${p.id}`,
            date: p.createdAt.slice(0, 10),
            type: "compra" as const,
            docType: "Factura",
            serie: "FC",
            number: String(i + 1).padStart(8, "0"),
            entity: p.supplierName ?? "Proveedor",
            entityDoc: "—",
            base, igv: round2(total - base), total,
            status: "pendiente" as const,
          };
        });

      setLines([...ventas, ...compras].sort((a, b) => a.date.localeCompare(b.date)));
      setLoading(false);
    });

    return () => { active = false; };
  }, [year, month, tick]);

  const summary = useMemo<PeriodSummary>(() => {
    const ventas = lines.filter(l => l.type === "venta");
    const compras = lines.filter(l => l.type === "compra");
    const salesBase = ventas.reduce((s, l) => s + l.base, 0);
    const salesIGV = ventas.reduce((s, l) => s + l.igv, 0);
    const purchasesBase = compras.reduce((s, l) => s + l.base, 0);
    const purchasesIGV = compras.reduce((s, l) => s + l.igv, 0);
    return { salesBase, salesIGV, purchasesBase, purchasesIGV, igvBalance: salesIGV - purchasesIGV };
  }, [lines]);

  const visibleLines = view === "resumen" ? lines : lines.filter(l => l.type === (view === "ventas" ? "venta" : "compra"));

  const handleDeclare = (id: string) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, status: "declarado" } : l));
  };

  const handleExportBook = (type: "ventas" | "compras") => {
    const filtered = lines.filter(l => l.type === (type === "ventas" ? "venta" : "compra"));
    exportToCSV(filtered.map(l => ({ fecha: l.date, tipo_doc: l.docType, serie: l.serie, número: l.number, entidad: l.entity, ruc_dni: l.entityDoc, base_imponible: l.base, igv: l.igv, total: l.total, estado: l.status })), `libro-${type}-${MONTHS[month]}-${year}`);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header — kicker uppercase + H1 + subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-semibold">SUNAT / Tributario</p>
          <PageTitle className="mt-1 text-fs-h1 font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Receipt className="h-5 w-5 currentColor" />
            Impuestos &amp; IGV
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Registro de ventas y compras, libro tributario, IGV a pagar</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setTick(t => t + 1)} className="p-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4 text-[var(--text-secondary)] dark:text-muted" />
          </button>
          <button onClick={() => handleExportBook("ventas")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <BookOpen className="h-4 w-4" /> Libro ventas
          </button>
          <button onClick={() => handleExportBook("compras")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <BookOpen className="h-4 w-4" /> Libro compras
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          {/* IGV Balance card — AdminCard + intent via StatusBadge */}
          <AdminCard padding="lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[var(--ls-wider)] font-semibold text-[var(--text-tertiary)] mb-2">IGV del período — {MONTHS[month]} {year}</p>
                <p className={cn("text-4xl font-semibold tabular-nums", summary.igvBalance > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--data-success-500)]")}>
                  {fmt(summary.igvBalance)}
                </p>
                <div className="mt-2">
                  <StatusBadge
                    variant={summary.igvBalance > 0 ? "warning" : "success"}
                    label={summary.igvBalance > 0 ? "IGV a pagar a SUNAT" : "Crédito fiscal a favor"}
                    dot
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3 text-center">
                  <p className="text-xs uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">IGV Ventas</p>
                  <p className="font-semibold text-[var(--data-success-500)] tabular-nums">{fmt(summary.salesIGV)}</p>
                  <p className="text-xs text-[var(--text-tertiary)] tabular-nums">Base: {fmt(summary.salesBase)}</p>
                </div>
                <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3 text-center">
                  <p className="text-xs uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">IGV Compras</p>
                  <p className="font-semibold text-[var(--data-success-500)] tabular-nums">{fmt(summary.purchasesIGV)}</p>
                  <p className="text-xs text-[var(--text-tertiary)] tabular-nums">Base: {fmt(summary.purchasesBase)}</p>
                </div>
              </div>
            </div>
          </AdminCard>

          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {(["resumen", "ventas", "compras"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-semibold rounded-lg transition-colors capitalize", view === v ? "bg-primary text-white" : "bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
                {v === "resumen" ? "Todos" : v === "ventas" ? "Libro de ventas" : "Libro de compras"}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-y-hidden overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-gray-50 dark:bg-surface border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-5 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">Fecha</th>
                  <th className="text-left px-3 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">Tipo</th>
                  <th className="text-left px-3 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase hidden sm:table-cell">Doc</th>
                  <th className="text-left px-3 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">Entidad</th>
                  <th className="text-right px-3 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase hidden sm:table-cell">Base</th>
                  <th className="text-right px-3 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">IGV</th>
                  <th className="text-right px-3 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">Total</th>
                  <th className="text-center px-3 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase hidden sm:table-cell">Estado</th>
                  <th className="text-center px-3 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase hidden sm:table-cell">Acc.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {visibleLines.map(line => (
                  <tr key={line.id} className="hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors">
                    <td className="px-5 py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{fmtDate(line.date)}</td>
                    <td className="px-3 py-3">
                      <StatusBadge variant={line.type === "venta" ? "success" : "neutral"} label={line.type === "venta" ? "V" : "C"} size="sm" />
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--text-secondary)] dark:text-muted hidden sm:table-cell font-mono">{line.serie}-{line.number}</td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate max-w-[140px]">{line.entity}</p>
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{line.entityDoc}</p>
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-[var(--text-secondary)] dark:text-muted hidden sm:table-cell">{fmt(line.base)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-[var(--data-warning-500)]">{fmt(line.igv)}</td>
                    <td className="px-3 py-3 text-right font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(line.total)}</td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      <StatusBadge variant={line.status === "declarado" ? "success" : "pending"} label={line.status === "declarado" ? "Declarado" : "Pendiente"} size="sm" />
                    </td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      {line.status === "pendiente" && (
                        <button onClick={() => handleDeclare(line.id)} className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/20 font-semibold transition-colors">Declarar</button>
                      )}
                      {line.status === "declarado" && <CheckCircle className="h-4 w-4 text-[var(--data-success-500)] mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleLines.length === 0 && <p className="text-center py-10 text-[var(--text-tertiary)] dark:text-muted text-sm">Sin registros para el período.</p>}
          </div>

          {/* Pending alert — AdminCard con intent warning */}
          {lines.filter(l => l.status === "pendiente").length > 0 && (
            <AdminCard padding="md" className="flex items-start gap-3 border-l-2 border-l-[var(--data-warning)]">
              <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Registros pendientes de declaración</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Tienes {lines.filter(l => l.status === "pendiente").length} registro(s) aún no marcados como declarados ante SUNAT.
                </p>
              </div>
            </AdminCard>
          )}
        </>
      )}
    </div>
  );
}
