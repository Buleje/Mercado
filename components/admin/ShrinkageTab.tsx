"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useEffect, useMemo, useState } from "react";
import {
  Package,
  Download,
  Search,
  Eye,
  X,
  AlertTriangle,
  TrendingDown,
  DollarSign,
  Info,
  Plus,
  Loader2,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

type ShrinkageCause = "vencimiento" | "rotura" | "robo" | "deterioro" | "error-inventario" | "daño-transporte";
type ShrinkageStatus = "registrado" | "revisado";

type ProductOption = { id: number; name: string; category: string; costPrice?: number; stock?: number; unit?: string };

type ShrinkageRecord = {
  id: string;
  date: string;
  productId: number;
  product: string;
  category: string;
  quantity: number;
  unitCost: number;
  totalLoss: number;
  cause: ShrinkageCause;
  status: ShrinkageStatus;
  notes: string;
  reportedBy: string;
};

const fmt = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

const CAUSE_META: Record<ShrinkageCause, { label: string; color: string; bg: string }> = {
  vencimiento: { label: "Vencimiento", color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
  rotura: { label: "Rotura", color: "text-[var(--data-error-500)]", bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30" },
  robo: { label: "Robo/perdida", color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
  deterioro: { label: "Deterioro", color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
  "error-inventario": { label: "Error inventario", color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  "daño-transporte": { label: "Daño transporte", color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]/30" },
};

function ModuleTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} className="text-[var(--text-tertiary)] hover:text-primary transition-colors focus:outline-none" aria-label="Ayuda sobre Pérdidas">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="pointer-events-none absolute left-6 top-0 z-50 w-80 rounded-xl border border-[var(--rule-base)] bg-white p-4 text-xs leading-relaxed dark:border-card-border dark:bg-card">
          <p className="mb-2 text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground">Pérdidas</p>
          <p className="mb-3 text-[var(--text-secondary)] dark:text-muted">Aquí registras lo que se perdió (por vencimiento, rotura, robo o errores al contar), y el sistema baja las existencias automáticamente.</p>
          <p className="text-[var(--text-secondary)] dark:text-muted">Ejemplo: si se vencen 3 yogures, registras la pérdida, queda el motivo guardado y el inventario baja en 3 unidades.</p>
        </div>
      )}
    </div>
  );
}

export default function ShrinkageTab() {
  const [records, setRecords] = useState<ShrinkageRecord[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCause, setFilterCause] = useState<ShrinkageCause | "todos">("todos");
  const [detail, setDetail] = useState<ShrinkageRecord | null>(null);
  const [form, setForm] = useState({ productId: "", quantity: "", cause: "vencimiento" as ShrinkageCause, notes: "", reportedBy: "Almacenero" });

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      try {
        const [mermasRes, productsRes] = await Promise.all([fetch("/api/mermas"), fetch("/api/products")]);
        const [mermasData, productsData] = await Promise.all([mermasRes.json(), productsRes.json()]);
        if (cancelled) return;
        setRecords(Array.isArray(mermasData) ? mermasData : []);
        setProducts(Array.isArray(productsData) ? productsData : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = [...records];
    if (filterCause !== "todos") list = list.filter((record) => record.cause === filterCause);
    if (search.trim()) {
      const query = search.toLowerCase();
      list = list.filter((record) => record.product.toLowerCase().includes(query) || record.category.toLowerCase().includes(query));
    }
    return list;
  }, [records, filterCause, search]);

  const stats = useMemo(() => {
    const totalLoss = records.reduce((sum, record) => sum + record.totalLoss, 0);
    const byCause: Record<string, number> = {};
    records.forEach((record) => {
      byCause[record.cause] = (byCause[record.cause] || 0) + record.totalLoss;
    });
    const topCause = Object.entries(byCause).sort((a, b) => b[1] - a[1])[0];
    return { totalLoss, topCause, count: records.length };
  }, [records]);

  async function handleAdd() {
    if (!form.productId || !form.quantity) return;
    setSaving(true);
    try {
      const res = await fetch("/api/mermas", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ productId: Number(form.productId), quantity: Number(form.quantity), cause: form.cause, notes: form.notes, reportedBy: form.reportedBy }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created?.error || "No se pudo registrar la merma");
      setRecords((prev) => [created, ...prev]);
      setForm({ productId: "", quantity: "", cause: "vencimiento", notes: "", reportedBy: "Almacenero" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col gap-2 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SectionTitle className="flex flex-wrap items-center gap-2 text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">
            <Package className="h-6 w-6 text-[var(--data-error-500)]" /> Pérdidas <ModuleTooltip />
          </SectionTitle>
          <p className="mt-1 text-sm text-[var(--text-secondary)] dark:text-muted">Registra lo que se perdió y cuánto costó</p>
        </div>
        <button onClick={() => exportToCSV(records.map((record) => ({ Fecha: record.date, Producto: record.product, Categoria: record.category, Cantidad: record.quantity, CostoUnitario: record.unitCost, Perdida: record.totalLoss, Motivo: record.cause, Estado: record.status })), "mermas")} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] px-2 sm:px-4 py-1.5 sm:py-2.5 text-sm font-bold transition-colors hover:bg-gray-50 dark:border-card-border dark:bg-card dark:hover:bg-accent">
          <Download className="h-4 w-4" /> Descargar
        </button>
      </div>

      <div className="grid gap-2 sm:gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3 sm:p-5 dark:border-card-border dark:bg-card">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground"><Plus className="h-4 w-4 text-primary" /> Registrar pérdida</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={form.productId} onChange={(event) => setForm((prev) => ({ ...prev, productId: event.target.value }))} className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface">
              <option value="">Selecciona producto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
            <input type="number" min={1} value={form.quantity} onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))} placeholder="Cantidad" className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface" />
            <select value={form.cause} onChange={(event) => setForm((prev) => ({ ...prev, cause: event.target.value as ShrinkageCause }))} className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface">
              {Object.entries(CAUSE_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
            <input value={form.reportedBy} onChange={(event) => setForm((prev) => ({ ...prev, reportedBy: event.target.value }))} placeholder="Reportado por" className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface" />
            <textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notas" rows={3} className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm sm:col-span-2 dark:border-card-border dark:bg-surface" />
          </div>
          <button onClick={handleAdd} disabled={saving || !form.productId || !form.quantity} className="mt-4 rounded-lg bg-primary px-2 sm:px-4 py-1.5 sm:py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Guardando..." : "Registrar pérdida"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
          <MetricCard title="Perdida total" value={fmt(stats.totalLoss)} icon={DollarSign} tone="text-[var(--data-error-600)]" bg="bg-red-50 dark:bg-red-950/20" />
          <MetricCard title="Registros" value={String(stats.count)} icon={TrendingDown} tone="text-[var(--data-warning-600)]" bg="bg-amber-50 dark:bg-amber-950/20" />
          <div className="col-span-2 rounded-xl border border-[var(--rule-base)] bg-white p-3 sm:p-5 dark:border-card-border dark:bg-card">
            <p className="text-xs font-semibold uppercase text-[var(--text-secondary)] dark:text-muted">Motivo principal</p>
            <p className="mt-2 text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">{stats.topCause ? CAUSE_META[stats.topCause[0] as ShrinkageCause]?.label : "Sin datos"}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)] dark:text-muted">{stats.topCause ? `${fmt(stats.topCause[1])} acumulados` : "Aún no hay pérdidas registradas."}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto o categoria..." className="w-full rounded-lg border border-[var(--rule-base)] bg-white py-2.5 pl-10 pr-4 text-sm dark:border-card-border dark:bg-card" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterCause("todos")} className={cn("rounded-lg px-3 py-2 text-xs font-bold", filterCause === "todos" ? "bg-primary text-white" : "border border-[var(--rule-base)] bg-white text-[var(--text-secondary)] dark:border-card-border dark:bg-card dark:text-muted")}>Todos</button>
          {(Object.keys(CAUSE_META) as ShrinkageCause[]).map((cause) => (
            <button key={cause} onClick={() => setFilterCause(cause)} className={cn("rounded-lg px-3 py-2 text-xs font-bold", filterCause === cause ? "bg-primary text-white" : "border border-[var(--rule-base)] bg-white text-[var(--text-secondary)] dark:border-card-border dark:bg-card dark:text-muted")}>
              {CAUSE_META[cause].label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-white dark:border-card-border dark:bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface">
              <tr>
                <th className="px-5 py-3 text-left font-bold text-[var(--text-secondary)] dark:text-muted">Fecha</th>
                <th className="px-5 py-3 text-left font-bold text-[var(--text-secondary)] dark:text-muted">Producto</th>
                <th className="px-5 py-3 text-right font-bold text-[var(--text-secondary)] dark:text-muted">Cantidad</th>
                <th className="px-5 py-3 text-right font-bold text-[var(--text-secondary)] dark:text-muted">Costo u.</th>
                <th className="px-5 py-3 text-right font-bold text-[var(--text-secondary)] dark:text-muted">Perdida</th>
                <th className="px-5 py-3 text-left font-bold text-[var(--text-secondary)] dark:text-muted">Motivo</th>
                <th className="px-5 py-3 text-center font-bold text-[var(--text-secondary)] dark:text-muted">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {loading && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-[var(--text-tertiary)] dark:text-muted"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Cargando pérdidas...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-[var(--text-tertiary)] dark:text-muted">No hay pérdidas registradas.</td></tr>
              )}
              {filtered.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-surface">
                  <td className="px-5 py-3 text-[var(--text-secondary)] dark:text-muted">{new Date(record.date).toLocaleDateString("es-PE")}</td>
                  <td className="px-5 py-3">
                    <div>
                      <p className="font-bold text-[var(--text-primary)] dark:text-foreground">{record.product}</p>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{record.category}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-[var(--data-error-500)]">-{record.quantity}</td>
                  <td className="px-5 py-3 text-right text-[var(--text-secondary)] dark:text-muted">{fmt(record.unitCost)}</td>
                  <td className="px-5 py-3 text-right font-extrabold text-[var(--data-error-500)]">{fmt(record.totalLoss)}</td>
                  <td className="px-5 py-3">
                    <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-bold", CAUSE_META[record.cause].bg, CAUSE_META[record.cause].color)}>{CAUSE_META[record.cause].label}</span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button onClick={() => setDetail(record)} className="rounded-lg border border-[var(--rule-base)] p-2 text-[var(--text-secondary)] hover:bg-gray-50 dark:border-card-border dark:hover:bg-accent"><Eye className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-backdrop p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--rule-base)] bg-white p-3 sm:p-6 dark:border-card-border dark:bg-card">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">Detalle de la pérdida</CardTitle>
                <p className="text-sm text-[var(--text-secondary)] dark:text-muted">{detail.product}</p>
              </div>
              <button onClick={() => setDetail(null)} className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <p><strong>Fecha:</strong> {new Date(detail.date).toLocaleString("es-PE")}</p>
              <p><strong>Motivo:</strong> {CAUSE_META[detail.cause].label}</p>
              <p><strong>Cantidad:</strong> {detail.quantity}</p>
              <p><strong>Perdida:</strong> {fmt(detail.totalLoss)}</p>
              <p><strong>Reportado por:</strong> {detail.reportedBy}</p>
              <div className="rounded-xl bg-gray-50 p-3 text-[var(--text-secondary)] dark:bg-surface dark:text-muted">
                {detail.notes || "Sin notas adicionales."}
              </div>
            </div>
          </div>
        </div>
      )}

      {records.length > 0 && stats.totalLoss > 0 && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 sm:p-5 dark:border-[var(--data-warning-500)] dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-warning-500)]" />
          <div>
            <CardTitle className="text-sm font-extrabold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">Impacto acumulado</CardTitle>
            <p className="mt-1 text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">Las pérdidas registradas acumulan {fmt(stats.totalLoss)}. Usa esta sección para detectar causas repetidas y reducir lo que se pierde.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, tone, bg }: { title: string; value: string; icon: typeof DollarSign; tone: string; bg: string }) {
  return (
    <div className={cn("rounded-xl p-3 sm:p-5", bg)}>
      <Icon className={cn("mb-2 h-5 w-5", tone)} />
      <p className="text-xs font-semibold uppercase text-[var(--text-secondary)] dark:text-muted">{title}</p>
      <p className={cn("mt-2 text-xl font-extrabold", tone)}>{value}</p>
    </div>
  );
}