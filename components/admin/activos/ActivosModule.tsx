"use client";

/**
 * ActivosModule — Activos & Maquinaria (Brandon 2026-06-06).
 *
 * Para negocios que ALQUILAN equipos (forestal: cargador, oruga, camión).
 * Cada máquina es una ficha que genera renta y acumula gastos. KPI estrella:
 * la GANANCIA NETA por máquina.
 *
 * Features reforzadas: horómetro, alerta de combustible, cuentas por cobrar,
 * mantenimiento preventivo, checklist de inspección, contrato/cotización PDF,
 * reporte Excel/CSV y calendario (agenda) de alquileres.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Construction, Plus, X, Loader2, TrendingUp, Fuel,
  Wrench, Truck, Pencil, Receipt, AlertTriangle, Download, FileText,
  ClipboardCheck, CheckCircle, Calendar, CreditCard, Clock,
  Upload, BarChart3, Trophy, Store,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { exportToCSV } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar, { type AdminTab } from "@/components/admin/shared/AdminTabBar";
import { Field } from "@/components/admin/shared/Field";
import { generateContractPDF } from "@/lib/assets-contract";

interface AssetStats {
  id: string; name: string; type: string; plate: string | null; imageUrl: string | null;
  purchaseValue: number | null; status: string; hourlyRate: number | null; rateUnit: string;
  capacityPerDay: number | null; currentHours: number | null; fuelTargetPerUnit: number | null;
  notes: string | null; active: boolean;
  totalIncome: number; totalExpense: number; profit: number; incomeCount: number; expenseCount: number;
  unitsWorked: number; units30d: number;
  costPerUnit: number | null; incomePerUnit: number | null; marginPerUnit: number | null;
  utilizationPct: number | null;
  pendingAmount: number; fuelPerUnit: number | null; fuelAlert: boolean;
  maintenanceDue: number; maintenanceSoon: number;
  publishedProductId: number | null;
}
interface IncomeMov { id: string; assetId: string; date: string; client: string | null; quantity: number | null; unit: string; rate: number; amount: number; hourStart: number | null; hourEnd: number | null; paid: boolean; dueDate: string | null; startDate: string | null; endDate: string | null; notes: string | null }
interface ExpenseMov { id: string; date: string; amount: number; notes: string | null; category: string; gallons: number | null; unitPrice: number | null }
interface Maintenance { id: string; assetId: string; title: string; intervalHours: number | null; intervalDays: number | null; lastDoneHours: number | null; lastDoneAt: string | null; notes: string | null; active: boolean; state: "ok" | "soon" | "due"; detail: string }
interface Receivable extends IncomeMov { assetName: string }

const fmt = (n: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);
const dStr = (s: string) => new Date(s).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

const TYPES = [
  { v: "cargador", label: "Cargador" }, { v: "oruga", label: "Oruga" }, { v: "camion", label: "Camión" },
  { v: "excavadora", label: "Excavadora" }, { v: "tractor", label: "Tractor" }, { v: "otro", label: "Otro" },
];
const RATE_UNITS = [
  { v: "hora", label: "Por hora", noun: "horas" }, { v: "dia", label: "Por día", noun: "días" },
  { v: "m3", label: "Por m³", noun: "m³" }, { v: "viaje", label: "Por viaje", noun: "viajes" },
];
const unitNoun = (u: string) => RATE_UNITS.find(r => r.v === u)?.noun ?? u;
const STATUS_META: Record<string, { label: string; chip: string }> = {
  operativo:     { label: "Operativo",     chip: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  mantenimiento: { label: "Mantenimiento", chip: "bg-[var(--data-warning-100)] text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]" },
  parado:        { label: "Parado",        chip: "bg-[var(--data-error-100)] text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" },
};
const EXPENSE_CATS = [
  { v: "combustible", label: "Combustible" }, { v: "mantenimiento", label: "Mantenimiento" }, { v: "repuesto", label: "Repuesto" },
  { v: "operador", label: "Operador" }, { v: "peaje", label: "Peaje" }, { v: "otro", label: "Otro" },
];
const CHECKLIST_DEFAULT = ["Niveles de aceite", "Combustible", "Llantas / orugas", "Frenos", "Luces", "Fugas visibles", "Horómetro anotado", "Limpieza general"];

const FIELD = "w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none transition-all focus:border-[var(--accent)] focus:bg-[var(--surface-raised)]";
const LABEL = "block text-[length:var(--ts-2xs,0.6875rem)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5";

type View = "flota" | "cobrar" | "calendario" | "ranking";

// Sub-tabs top-level: coherencia con el resto del admin (AdminTabBar da
// reorden por drag + registro en sidebar). Los badges son dinámicos (alertas
// de mantto./combustible y pendientes por cobrar), así que el array se arma
// en el render, no acá arriba.
const ACTIVOS_MODULE_ID = "activos";

export default function ActivosModule() {
  const [assets, setAssets] = useState<AssetStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("flota");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AssetStats | null>(null);
  const [moveFor, setMoveFor] = useState<{ asset: AssetStats; kind: "income" | "expense" } | null>(null);
  const [detailFor, setDetailFor] = useState<AssetStats | null>(null);
  const [contractFor, setContractFor] = useState<AssetStats | null>(null);
  const [checklistFor, setChecklistFor] = useState<AssetStats | null>(null);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/assets", { credentials: "include" });
      if (res.ok) { const j = await res.json(); setAssets(j.data ?? []); }
    } catch { /* no crítico */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const totals = assets.reduce(
    (acc, a) => ({ income: acc.income + a.totalIncome, expense: acc.expense + a.totalExpense, profit: acc.profit + a.profit, pending: acc.pending + a.pendingAmount }),
    { income: 0, expense: 0, profit: 0, pending: 0 },
  );
  const alerts = assets.reduce((n, a) => n + a.maintenanceDue + (a.fuelAlert ? 1 : 0), 0);
  // Categorías = defaults + las que ya usan las máquinas del tenant (custom persisten).
  const knownTypes = Array.from(new Set([...TYPES.map(t => t.v), ...assets.map(a => a.type)]));

  const ACTIVOS_TAB_ITEMS: AdminTab[] = [
    { id: "flota", label: "Flota", icon: Construction, badge: alerts > 0 ? alerts : undefined },
    { id: "cobrar", label: "Por cobrar", icon: CreditCard, badge: totals.pending > 0 ? "!" : undefined },
    { id: "calendario", label: "Calendario", icon: Calendar },
    { id: "ranking", label: "Ranking", icon: BarChart3 },
  ];

  const exportReport = () => {
    if (assets.length === 0) { toast.error("No hay máquinas para exportar"); return; }
    const rows = assets.map(a => ({
      Maquina: a.name, Tipo: typeLabel(a.type), Placa: a.plate ?? "",
      Estado: STATUS_META[a.status]?.label ?? a.status,
      Ingresos: a.totalIncome.toFixed(2), Gastos: a.totalExpense.toFixed(2), Ganancia: a.profit.toFixed(2),
      "Por cobrar": a.pendingAmount.toFixed(2),
      [`Costo/${a.rateUnit}`]: a.costPerUnit != null ? a.costPerUnit.toFixed(2) : "",
      [`Ingreso/${a.rateUnit}`]: a.incomePerUnit != null ? a.incomePerUnit.toFixed(2) : "",
      "Utilizacion%": a.utilizationPct != null ? Math.round(a.utilizationPct) : "",
      Horometro: a.currentHours ?? "",
    }));
    exportToCSV(rows, `rentabilidad-flota-${assets.length}-maquinas`);
    toast.success("Reporte exportado (CSV/Excel)");
  };

  // Publicar / quitar el activo como servicio de alquiler en la tienda/marketplace.
  const publishToggle = async (a: AssetStats) => {
    const method = a.publishedProductId ? "DELETE" : "POST";
    try {
      const res = await fetch(`/api/admin/assets/${a.id}/publish`, { method, headers: csrfHeaders(), credentials: "include" });
      if (!res.ok) { toast.error("No se pudo actualizar la tienda"); return; }
      toast.success(a.publishedProductId ? "Quitado de la tienda" : "Publicado en tu tienda como servicio de alquiler");
      void load();
    } catch { toast.error("Sin conexión"); }
  };

  return (
    <div className="space-y-5">
      <AdminModuleHeader
        eyebrow="Finanzas · Maquinaria"
        title="Activos & Maquinaria"
        description="Alquila tus equipos y mira la ganancia real de cada máquina."
        icon={Construction}
      >
        <button type="button" onClick={() => setShowImport(true)} className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3.5 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] min-h-[44px]">
          <Upload className="h-4 w-4" /> Importar
        </button>
        <button type="button" onClick={exportReport} className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3.5 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] min-h-[44px]">
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button type="button" onClick={() => { setEditing(null); setShowForm(true); }} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 min-h-[44px]">
          <Plus className="h-4 w-4" strokeWidth={2.5} /> Nuevo activo
        </button>
      </AdminModuleHeader>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiCard label="Máquinas" value={String(assets.length)} sub={`${assets.filter(a => a.status === "operativo").length} operativas`} bar="primary" />
        <KpiCard label="Ingresos" value={fmt(totals.income)} sub="por alquileres" tone="primary" bar="primary" />
        <KpiCard label="Gastos" value={fmt(totals.expense)} sub="combustible + mantto." bar="muted" />
        <KpiCard label="Ganancia neta" value={fmt(totals.profit)} sub="ingresos − gastos" tone={totals.profit >= 0 ? "primary" : "error"} bar={totals.profit >= 0 ? "primary" : "error"} highlight />
        <button type="button" onClick={() => setView("cobrar")} className="text-left">
          <KpiCard label="Por cobrar" value={fmt(totals.pending)} sub={totals.pending > 0 ? "ver pendientes →" : "todo cobrado"} tone={totals.pending > 0 ? "warning" : "neutral"} bar={totals.pending > 0 ? "warning" : "muted"} />
        </button>
      </div>

      {/* Sub-tabs top-level: AdminTabBar da coherencia con el resto del admin
          (reorden por drag, registro en sidebar). Vistas quedan como hermanas. */}
      <AdminTabBar
        moduleId={ACTIVOS_MODULE_ID}
        tabs={ACTIVOS_TAB_ITEMS}
        activeTab={view}
        onTabChange={(id) => setView(id as View)}
      />

      {/* Vistas */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-[var(--text-tertiary)]"><Loader2 className="h-5 w-5 animate-spin" /> Cargando flota…</div>
      ) : view === "flota" ? (
        assets.length === 0 ? <EmptyFleet onAdd={() => { setEditing(null); setShowForm(true); }} /> : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {assets.map((a) => (
              <AssetCard key={a.id} asset={a}
                onRent={() => setMoveFor({ asset: a, kind: "income" })}
                onExpense={() => setMoveFor({ asset: a, kind: "expense" })}
                onEdit={() => { setEditing(a); setShowForm(true); }}
                onDetail={() => setDetailFor(a)}
                onContract={() => setContractFor(a)}
                onChecklist={() => setChecklistFor(a)}
                onPublish={() => publishToggle(a)}
              />
            ))}
          </div>
        )
      ) : view === "cobrar" ? (
        <ReceivablesView onChanged={load} />
      ) : view === "ranking" ? (
        <RankingView assets={assets} />
      ) : (
        <CalendarView assets={assets} />
      )}

      {showForm && <AssetFormModal asset={editing} knownTypes={knownTypes} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void load(); }} onPublishChanged={load} />}
      {moveFor && <MovementModal asset={moveFor.asset} kind={moveFor.kind} onClose={() => setMoveFor(null)} onSaved={() => { setMoveFor(null); void load(); }} />}
      {detailFor && <AssetDetailDrawer asset={detailFor} onClose={() => setDetailFor(null)} onContract={() => { setContractFor(detailFor); }} onChanged={load} />}
      {contractFor && <ContractModal asset={contractFor} onClose={() => setContractFor(null)} />}
      {checklistFor && <ChecklistModal asset={checklistFor} onClose={() => setChecklistFor(null)} onSaved={() => setChecklistFor(null)} />}
      {showImport && <ImportModal knownTypes={knownTypes} onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); void load(); }} />}
    </div>
  );
}

function EmptyFleet({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-16 text-center">
      <span className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><Construction className="h-7 w-7" strokeWidth={2} /></span>
      <p className="text-base font-extrabold text-[var(--text-primary)]">Aún no tienes máquinas</p>
      <p className="mt-1 text-sm text-[var(--text-tertiary)]">Agrega tu cargador, oruga o camión y empieza a registrar alquileres.</p>
      <button type="button" onClick={onAdd} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary/90"><Plus className="h-4 w-4" strokeWidth={2.5} /> Agregar primera máquina</button>
    </div>
  );
}

function KpiCard({ label, value, sub, tone = "neutral", bar = "muted", highlight }: {
  label: string; value: string; sub: string;
  tone?: "neutral" | "primary" | "error" | "warning"; bar?: "primary" | "muted" | "error" | "warning"; highlight?: boolean;
}) {
  const valueColor = tone === "primary" ? "text-primary" : tone === "error" ? "text-[var(--data-error-600)]" : tone === "warning" ? "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-primary)]";
  const barColor = bar === "primary" ? "bg-primary" : bar === "error" ? "bg-[var(--data-error-500)]/50" : bar === "warning" ? "bg-[var(--data-warning-500)]" : "bg-[var(--rule-soft)]";
  return (
    <div className={cn("rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5", highlight && "ring-1 ring-[var(--accent)]/25")}>
      <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-zinc-400">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-bold tabular-nums", valueColor)}>{value}</p>
      <p className="mt-1 text-xs text-[var(--text-tertiary)] dark:text-zinc-500">{sub}</p>
      <div className={cn("mt-2 h-1 rounded-full", barColor)} />
    </div>
  );
}

function typeIcon(type: string) { return type === "camion" ? Truck : Construction; }
function typeLabel(type: string) { return TYPES.find(t => t.v === type)?.label ?? (type ? type.charAt(0).toUpperCase() + type.slice(1) : type); }

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="border-b border-[var(--rule-soft)] pb-1.5 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">{title}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function AssetCard({ asset, onRent, onExpense, onEdit, onDetail, onContract, onChecklist, onPublish }: {
  asset: AssetStats; onRent: () => void; onExpense: () => void; onEdit: () => void; onDetail: () => void; onContract: () => void; onChecklist: () => void; onPublish: () => void;
}) {
  const Icon = typeIcon(asset.type);
  const st = STATUS_META[asset.status] ?? STATUS_META.operativo;
  const total = asset.totalIncome + asset.totalExpense;
  const incPct = total > 0 ? (asset.totalIncome / total) * 100 : 0;
  return (
    <div className="flex flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 transition-all hover:border-[var(--accent)]/40 hover:shadow-[var(--shadow-md)]">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onDetail} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Icon className="h-6 w-6" strokeWidth={2} /></button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onDetail} className="block truncate text-base font-extrabold text-[var(--text-primary)] hover:text-[var(--accent)]">{asset.name}</button>
          <p className="text-xs font-medium text-[var(--text-tertiary)]">{typeLabel(asset.type)}{asset.plate ? ` · ${asset.plate}` : ""}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase", st.chip)}>{st.label}</span>
      </div>

      {/* Tienda + alertas (mantenimiento / combustible / cobranza) */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onPublish}
          title={asset.publishedProductId ? "Publicado como servicio de alquiler — tocá para quitarlo de la tienda" : "Publicar como servicio de alquiler en tu tienda/marketplace"}
          className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold transition-colors",
            asset.publishedProductId ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}
        >
          <Store className="h-3 w-3" /> {asset.publishedProductId ? "En tienda" : "Publicar en tienda"}
        </button>
        {asset.maintenanceDue > 0 && <Chip icon={Wrench} tone="error">{asset.maintenanceDue} mantto. vencido</Chip>}
        {asset.maintenanceDue === 0 && asset.maintenanceSoon > 0 && <Chip icon={Wrench} tone="warning">{asset.maintenanceSoon} mantto. pronto</Chip>}
        {asset.fuelAlert && <Chip icon={Fuel} tone="warning">consume de más</Chip>}
        {asset.pendingAmount > 0 && <Chip icon={CreditCard} tone="warning">por cobrar {fmt(asset.pendingAmount)}</Chip>}
      </div>

      {/* Rentabilidad */}
      <div className="mt-3 rounded-xl bg-[var(--surface-sunken)] p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Ganancia</span>
          <span className={cn("font-mono text-lg font-bold tabular-nums", asset.profit >= 0 ? "text-primary" : "text-[var(--data-error-600)]")}>{fmt(asset.profit)}</span>
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[var(--surface-raised)]">
          <span className="bg-primary" style={{ width: `${incPct}%` }} />
          <span className="bg-[var(--rule-base)]" style={{ width: `${100 - incPct}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[length:var(--ts-2xs)] font-bold tabular-nums">
          <span className="text-primary">↑ {fmt(asset.totalIncome)}</span>
          <span className="text-[var(--text-tertiary)]">↓ {fmt(asset.totalExpense)}</span>
        </div>
      </div>

      {/* Costo/unidad + utilización */}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-[var(--rule-base)] p-2.5">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Costo / {asset.rateUnit}</p>
          <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{asset.costPerUnit != null ? fmt(asset.costPerUnit) : "—"}</p>
          {asset.marginPerUnit != null && <p className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">margen {fmt(asset.marginPerUnit)}</p>}
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] p-2.5">
          <p className="flex items-center justify-between text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]"><span>Uso 30d</span><span className="tabular-nums text-[var(--text-secondary)]">{asset.utilizationPct != null ? `${Math.round(asset.utilizationPct)}%` : "—"}</span></p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <span className={cn("block h-full rounded-full", (asset.utilizationPct ?? 0) >= 60 ? "bg-primary" : (asset.utilizationPct ?? 0) >= 30 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]/60")} style={{ width: `${asset.utilizationPct ?? 0}%` }} />
          </div>
          <p className="mt-1 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">{asset.units30d} / {(asset.capacityPerDay ?? 8) * 30} {asset.rateUnit}</p>
        </div>
      </div>

      {/* Acciones */}
      <div className="mt-3 flex items-center gap-1.5">
        <button type="button" onClick={onRent} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-primary/90"><TrendingUp className="h-3.5 w-3.5" /> Alquiler</button>
        <button type="button" onClick={onExpense} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--data-warning-500)] hover:text-[var(--data-warning-600)]"><Fuel className="h-3.5 w-3.5" /> Gasto</button>
        <button type="button" onClick={onChecklist} aria-label="Checklist" title="Checklist pre-alquiler" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"><ClipboardCheck className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={onContract} aria-label="Contrato" title="Contrato / cotización PDF" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"><FileText className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={onEdit} aria-label="Editar" title="Editar" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"><Pencil className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

function Chip({ icon: Icon, tone, children }: { icon: React.ComponentType<{ className?: string }>; tone: "warning" | "error"; children: React.ReactNode }) {
  const cls = tone === "error" ? "bg-[var(--data-error-100)] text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]";
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold", cls)}><Icon className="h-3 w-3" /> {children}</span>;
}

// ── Modal crear / editar activo ─────────────────────────────────────────────
function AssetFormModal({ asset, knownTypes, onClose, onSaved, onPublishChanged }: { asset: AssetStats | null; knownTypes: string[]; onClose: () => void; onSaved: () => void; onPublishChanged?: () => void }) {
  const typeKnown = asset == null || knownTypes.includes(asset.type);
  const [published, setPublished] = useState(!!asset?.publishedProductId);
  const [publishing, setPublishing] = useState(false);
  const togglePublish = async () => {
    if (!asset) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/admin/assets/${asset.id}/publish`, { method: published ? "DELETE" : "POST", headers: csrfHeaders(), credentials: "include" });
      if (!res.ok) { toast.error("No se pudo actualizar la tienda"); return; }
      setPublished(p => !p); toast.success(published ? "Quitado de la tienda" : "Publicado como servicio de alquiler");
      onPublishChanged?.();
    } catch { toast.error("Sin conexión"); } finally { setPublishing(false); }
  };
  const [form, setForm] = useState({
    name: asset?.name ?? "",
    type: asset ? (typeKnown ? asset.type : "__new__") : "cargador",
    newType: asset && !typeKnown ? typeLabel(asset.type) : "",
    plate: asset?.plate ?? "",
    purchaseValue: asset?.purchaseValue != null ? String(asset.purchaseValue) : "",
    status: asset?.status ?? "operativo", hourlyRate: asset?.hourlyRate != null ? String(asset.hourlyRate) : "",
    rateUnit: asset?.rateUnit ?? "hora", capacityPerDay: asset?.capacityPerDay != null ? String(asset.capacityPerDay) : "8",
    currentHours: asset?.currentHours != null ? String(asset.currentHours) : "",
    fuelTargetPerUnit: asset?.fuelTargetPerUnit != null ? String(asset.fuelTargetPerUnit) : "",
    notes: asset?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const Preview = typeIcon(form.type === "__new__" ? "otro" : form.type);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Ponle un nombre a la máquina"); return; }
    const resolvedType = form.type === "__new__" ? form.newType.trim().toLowerCase() : form.type;
    if (!resolvedType) { toast.error("Elige o crea una categoría"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), type: resolvedType, plate: form.plate.trim() || null,
        purchaseValue: form.purchaseValue ? Number(form.purchaseValue) : null,
        status: form.status, hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
        rateUnit: form.rateUnit, capacityPerDay: form.capacityPerDay ? Number(form.capacityPerDay) : null,
        currentHours: form.currentHours ? Number(form.currentHours) : null,
        fuelTargetPerUnit: form.fuelTargetPerUnit ? Number(form.fuelTargetPerUnit) : null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(asset ? `/api/admin/assets/${asset.id}` : "/api/admin/assets", {
        method: asset ? "PATCH" : "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e?.error ?? "No se pudo guardar"); return; }
      toast.success(asset ? "Máquina actualizada" : "Máquina agregada"); onSaved();
    } catch { toast.error("Sin conexión"); } finally { setSaving(false); }
  };

  return (
    <ModalShell title={asset ? "Editar máquina" : "Nueva máquina"} subtitle="Identificación, tarifa de alquiler y control del equipo" onClose={onClose}>
      <div className="space-y-5">
        {/* Resumen vivo */}
        <div className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Preview className="h-6 w-6" strokeWidth={2} /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">{form.name.trim() || "Nueva máquina"}</p>
            <p className="text-xs font-medium text-[var(--text-tertiary)]">{(form.type === "__new__" ? (form.newType.trim() || "Categoría nueva") : typeLabel(form.type))}{form.hourlyRate ? ` · ${fmt(Number(form.hourlyRate))}/${unitNoun(form.rateUnit).replace(/s$/, "")}` : ""}</p>
          </div>
        </div>

        <FormSection title="Identificación">
          <Field label="Nombre *" labelClassName={LABEL} className="sm:col-span-2"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Cargador frontal CAT 938" className={FIELD} autoFocus /></Field>
          <Field label="Categoría" labelClassName={LABEL} className="sm:col-span-2">{(id) => (<>
            <select id={id} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={FIELD}>
              {knownTypes.map(v => <option key={v} value={v}>{typeLabel(v)}</option>)}
              <option value="__new__">+ Nueva categoría…</option>
            </select>
            {form.type === "__new__" && <input value={form.newType} onChange={e => setForm(f => ({ ...f, newType: e.target.value }))} placeholder="Nombre de la categoría (ej. Motoniveladora)" className={cn(FIELD, "mt-2")} autoFocus />}
          </>)}</Field>
          <Field label="Placa / serie" labelClassName={LABEL}><input value={form.plate} onChange={e => setForm(f => ({ ...f, plate: e.target.value }))} placeholder="ABC-123" className={FIELD} /></Field>
          <Field label="Estado" labelClassName={LABEL}><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={FIELD}>{Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}</select></Field>
        </FormSection>

        <FormSection title="Tarifa de alquiler">
          <Field label="Tarifa (S/)" labelClassName={LABEL}><input type="number" min="0" value={form.hourlyRate} onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))} placeholder="180" className={FIELD} /></Field>
          <Field label="Cobro por" labelClassName={LABEL}><select value={form.rateUnit} onChange={e => setForm(f => ({ ...f, rateUnit: e.target.value }))} className={FIELD}>{RATE_UNITS.map(u => <option key={u.v} value={u.v}>{u.label}</option>)}</select></Field>
          <Field label={<span title="Horas/unidades disponibles por día — base de la utilización">Capacidad por día</span>} labelClassName={LABEL}><input type="number" min="1" max="24" value={form.capacityPerDay} onChange={e => setForm(f => ({ ...f, capacityPerDay: e.target.value }))} placeholder="8" className={FIELD} /></Field>
          <Field label="Valor de compra (S/)" labelClassName={LABEL}><input type="number" min="0" value={form.purchaseValue} onChange={e => setForm(f => ({ ...f, purchaseValue: e.target.value }))} placeholder="250000" className={FIELD} /></Field>
        </FormSection>

        <FormSection title="Control del equipo">
          <Field label={<span title="Lectura actual del horómetro (horas de motor)">Horómetro actual</span>} labelClassName={LABEL}><input type="number" min="0" value={form.currentHours} onChange={e => setForm(f => ({ ...f, currentHours: e.target.value }))} placeholder="0" className={FIELD} /></Field>
          <Field label={<span title="Galones esperados por unidad — si consume más, salta la alerta">Meta combustible (gal/{unitNoun(form.rateUnit).replace(/s$/, "")})</span>} labelClassName={LABEL}><input type="number" min="0" step="0.01" value={form.fuelTargetPerUnit} onChange={e => setForm(f => ({ ...f, fuelTargetPerUnit: e.target.value }))} placeholder="ej. 3.5" className={FIELD} /></Field>
          <Field label="Notas" labelClassName={LABEL} className="sm:col-span-2"><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={cn(FIELD, "resize-none")} placeholder="Año, marca, observaciones…" /></Field>
        </FormSection>

        {/* Tienda — publicar como servicio de alquiler (solo al editar una máquina ya guardada) */}
        {asset ? (
          <div className="space-y-3">
            <p className="border-b border-[var(--rule-soft)] pb-1.5 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Tienda</p>
            <button
              type="button"
              onClick={togglePublish}
              disabled={publishing}
              className={cn("flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-60",
                published ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]")}
            >
              <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", published ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>
                {publishing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Store className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[var(--text-primary)]">{published ? "Publicada en tu tienda" : "Publicar en tu tienda"}</span>
                <span className="block text-xs text-[var(--text-tertiary)]">{published ? "Aparece en tienda y marketplace como servicio de alquiler. Tocá para quitarla." : "La muestra como servicio de alquiler. No entra a inventario."}</span>
              </span>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-black uppercase", published ? "bg-[var(--accent)] text-white" : "border border-[var(--rule-base)] text-[var(--text-secondary)]")}>{published ? "On" : "Off"}</span>
            </button>
          </div>
        ) : null}
      </div>
      <ModalFooter onClose={onClose} onSave={save} saving={saving} saveLabel={asset ? "Guardar cambios" : "Agregar máquina"} />
    </ModalShell>
  );
}

// ── Modal registrar alquiler / gasto ────────────────────────────────────────
function MovementModal({ asset, kind, onClose, onSaved }: { asset: AssetStats; kind: "income" | "expense"; onClose: () => void; onSaved: () => void }) {
  const isIncome = kind === "income";
  const [form, setForm] = useState({
    client: "", quantity: "", unit: asset.rateUnit, rate: asset.hourlyRate != null ? String(asset.hourlyRate) : "",
    amount: "", category: "combustible", gallons: "", unitPrice: "", notes: "",
    hourStart: asset.currentHours != null ? String(asset.currentHours) : "", hourEnd: "",
    paid: true, dueDate: "", startDate: "", endDate: "",
  });
  const [saving, setSaving] = useState(false);

  // Cantidad auto: por horómetro (fin−inicio) o manual.
  const hoursQty = form.hourStart !== "" && form.hourEnd !== "" && Number(form.hourEnd) > Number(form.hourStart) ? Number(form.hourEnd) - Number(form.hourStart) : 0;
  const effectiveQty = form.quantity !== "" ? Number(form.quantity) : hoursQty;
  const autoAmount = isIncome
    ? effectiveQty * (Number(form.rate) || 0)
    : form.category === "combustible" ? (Number(form.gallons) || 0) * (Number(form.unitPrice) || 0) : 0;
  const effectiveAmount = form.amount !== "" ? Number(form.amount) : autoAmount;

  const save = async () => {
    if (effectiveAmount <= 0) { toast.error("Ingresa un monto válido"); return; }
    setSaving(true);
    try {
      const payload = isIncome
        ? { client: form.client.trim() || null, quantity: form.quantity ? Number(form.quantity) : (hoursQty || null), unit: form.unit, rate: Number(form.rate) || 0, amount: effectiveAmount,
            hourStart: form.hourStart ? Number(form.hourStart) : null, hourEnd: form.hourEnd ? Number(form.hourEnd) : null,
            paid: form.paid, dueDate: !form.paid && form.dueDate ? form.dueDate : null,
            startDate: form.startDate || null, endDate: form.endDate || null, notes: form.notes.trim() || null }
        : { category: form.category, gallons: form.gallons ? Number(form.gallons) : null, unitPrice: form.unitPrice ? Number(form.unitPrice) : null, amount: effectiveAmount, notes: form.notes.trim() || null };
      const res = await fetch(`/api/admin/assets/${asset.id}/movements?kind=${kind}`, { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e?.error ?? "No se pudo guardar"); return; }
      toast.success(isIncome ? "Alquiler registrado" : "Gasto registrado"); onSaved();
    } catch { toast.error("Sin conexión"); } finally { setSaving(false); }
  };

  return (
    <ModalShell title={isIncome ? `Alquiler — ${asset.name}` : `Gasto — ${asset.name}`} subtitle={isIncome ? "Renta generada por la máquina" : "Combustible, mantenimiento u otro costo"} onClose={onClose} icon={isIncome ? TrendingUp : Fuel}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isIncome ? (<>
          <Field label="Cliente" labelClassName={LABEL} className="sm:col-span-2"><input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} placeholder="Maderera del Sur" className={FIELD} /></Field>
          <Field label="Inicio (periodo)" labelClassName={LABEL}><input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className={FIELD} /></Field>
          <Field label="Fin (periodo)" labelClassName={LABEL}><input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className={FIELD} /></Field>
          <Field label="Horómetro inicio" labelClassName={LABEL}><input type="number" min="0" value={form.hourStart} onChange={e => setForm(f => ({ ...f, hourStart: e.target.value }))} placeholder={asset.currentHours != null ? String(asset.currentHours) : "0"} className={FIELD} /></Field>
          <Field label="Horómetro fin" labelClassName={LABEL}><input type="number" min="0" value={form.hourEnd} onChange={e => setForm(f => ({ ...f, hourEnd: e.target.value }))} placeholder="—" className={FIELD} /></Field>
          <Field label={<>Cantidad ({unitNoun(form.unit)}) {hoursQty > 0 && form.quantity === "" && <span className="text-[var(--accent)] normal-case">· auto {hoursQty}</span>}</>} labelClassName={LABEL}><input type="number" min="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder={hoursQty > 0 ? String(hoursQty) : "8"} className={FIELD} /></Field>
          <Field label="Tarifa (S/)" labelClassName={LABEL}><input type="number" min="0" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="180" className={FIELD} /></Field>
        </>) : (<>
          <Field label="Categoría" labelClassName={LABEL}><select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={FIELD}>{EXPENSE_CATS.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}</select></Field>
          {form.category === "combustible" && (<>
            <Field label="Galones" labelClassName={LABEL}><input type="number" min="0" value={form.gallons} onChange={e => setForm(f => ({ ...f, gallons: e.target.value }))} placeholder="20" className={FIELD} /></Field>
            <Field label="Precio / galón (S/)" labelClassName={LABEL}><input type="number" min="0" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} placeholder="16.50" className={FIELD} /></Field>
          </>)}
        </>)}
        <Field label={<>Monto total (S/) {autoAmount > 0 && form.amount === "" && <span className="text-[var(--accent)] normal-case">· auto {fmt(autoAmount)}</span>}</>} labelClassName={LABEL} className="sm:col-span-2">
          <input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder={autoAmount > 0 ? String(autoAmount) : "0.00"} className={cn(FIELD, "text-lg font-black")} />
        </Field>
        {isIncome && (
          <div className="sm:col-span-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
            <div className="flex gap-1 rounded-lg bg-[var(--surface-raised)] p-1">
              {([[true, "Pagado"], [false, "Pendiente de cobro"]] as const).map(([v, l]) => (
                <button key={String(v)} type="button" onClick={() => setForm(f => ({ ...f, paid: v }))} className={cn("flex-1 rounded-md px-3 py-2 text-sm font-bold transition-colors", form.paid === v ? "bg-primary text-white" : "text-[var(--text-secondary)]")}>{l}</button>
              ))}
            </div>
            {!form.paid && <div className="mt-2"><Field label="Vence el" labelClassName={LABEL}><input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className={FIELD} /></Field></div>}
          </div>
        )}
        <Field label="Notas" labelClassName={LABEL} className="sm:col-span-2"><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={FIELD} /></Field>
      </div>
      <div className={cn("mt-3 flex items-center justify-between rounded-xl px-4 py-3", isIncome ? "bg-[var(--accent-soft)]" : "bg-[var(--data-warning-100)] dark:bg-amber-950/20")}>
        <span className="text-sm font-bold text-[var(--text-secondary)]">{isIncome ? (form.paid ? "Ingreso a registrar" : "Por cobrar a registrar") : "Gasto a registrar"}</span>
        <span className={cn("font-mono text-xl font-bold tabular-nums", isIncome ? "text-primary" : "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]")}>{fmt(effectiveAmount)}</span>
      </div>
      <ModalFooter onClose={onClose} onSave={save} saving={saving} saveLabel={isIncome ? "Registrar alquiler" : "Registrar gasto"} />
    </ModalShell>
  );
}

// ── Drawer de detalle (movimientos + mantenimiento) ─────────────────────────
function AssetDetailDrawer({ asset, onClose, onContract, onChanged }: { asset: AssetStats; onClose: () => void; onContract: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<"movimientos" | "mantenimiento">("movimientos");
  const [mov, setMov] = useState<{ incomes: IncomeMov[]; expenses: ExpenseMov[] } | null>(null);
  useEffect(() => {
    fetch(`/api/admin/assets/${asset.id}/movements`, { credentials: "include" })
      .then(r => r.ok ? r.json() : { data: { incomes: [], expenses: [] } }).then(j => setMov(j.data)).catch(() => setMov({ incomes: [], expenses: [] }));
  }, [asset.id]);
  const all = mov ? [...mov.incomes.map(i => ({ ...i, t: "income" as const })), ...mov.expenses.map(e => ({ ...e, t: "expense" as const }))].sort((a, b) => (a.date < b.date ? 1 : -1)) : [];

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-[var(--text-primary)]/50 backdrop-blur-sm" />
      <div className="relative flex h-full w-full max-w-md flex-col bg-[var(--surface-canvas)] shadow-2xl motion-safe:animate-[slideInRight_0.25s_ease-out]">
        <div className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 py-3.5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Receipt className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-[var(--text-primary)]">{asset.name}</p>
            <p className="text-xs font-bold text-[var(--text-tertiary)]">Ganancia: <span className={cn("font-mono", asset.profit >= 0 ? "text-primary" : "text-[var(--data-error-600)]")}>{fmt(asset.profit)}</span>{asset.currentHours != null && <span> · {asset.currentHours} h</span>}</p>
          </div>
          <button type="button" onClick={onContract} aria-label="Contrato" title="Contrato / cotización" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"><FileText className="h-4.5 w-4.5" /></button>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"><X className="h-4.5 w-4.5" strokeWidth={2.5} /></button>
        </div>
        <div className="flex gap-1 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 pt-2">
          {([["movimientos", "Movimientos"], ["mantenimiento", "Mantenimiento"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setTab(v)} className={cn("rounded-t-lg px-3 py-2 text-sm font-bold transition-colors", tab === v ? "border-b-2 border-[var(--accent)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>{l}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "movimientos" ? (
            !mov ? <Center><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</Center>
            : all.length === 0 ? <p className="py-10 text-center text-sm font-medium text-[var(--text-tertiary)]">Aún no hay movimientos. Registra un alquiler o gasto.</p>
            : <ul className="space-y-2">{all.map((m) => {
                const inc = m.t === "income";
                return (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
                    <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", inc ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-600)] dark:bg-amber-950/20 dark:text-[var(--data-warning-500)]")}>{inc ? <TrendingUp className="h-4 w-4" /> : (m as ExpenseMov).category === "combustible" ? <Fuel className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}</span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate text-sm font-bold text-[var(--text-primary)]">{inc ? ((m as IncomeMov).client ?? "Alquiler") : EXPENSE_CATS.find(c => c.v === (m as ExpenseMov).category)?.label}{inc && !(m as IncomeMov).paid && <span className="ml-1 rounded bg-[var(--data-warning-100)] px-1 text-[length:var(--ts-2xs)] font-black text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]">PENDIENTE</span>}</p>
                      <p className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">{dStr(m.date)}{m.notes ? ` · ${m.notes}` : ""}</p>
                    </div>
                    <span className={cn("shrink-0 font-mono text-sm font-bold tabular-nums", inc ? "text-primary" : "text-[var(--text-secondary)]")}>{inc ? "+" : "−"}{fmt(m.amount)}</span>
                  </li>
                );
              })}</ul>
          ) : (
            <MaintenanceSection asset={asset} onChanged={onChanged} />
          )}
        </div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-[var(--text-tertiary)]">{children}</div>;
}

// ── Mantenimiento (dentro del drawer) ───────────────────────────────────────
function MaintenanceSection({ asset, onChanged }: { asset: AssetStats; onChanged: () => void }) {
  const [items, setItems] = useState<Maintenance[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", mode: "hours" as "hours" | "days", interval: "", lastDoneHours: asset.currentHours != null ? String(asset.currentHours) : "" });

  const load = useCallback(() => {
    fetch(`/api/admin/assets/${asset.id}/maintenance`, { credentials: "include" }).then(r => r.ok ? r.json() : { data: [] }).then(j => setItems(j.data)).catch(() => setItems([]));
  }, [asset.id]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.title.trim() || !form.interval) { toast.error("Pon título e intervalo"); return; }
    const payload = { title: form.title.trim(), ...(form.mode === "hours" ? { intervalHours: Number(form.interval), lastDoneHours: form.lastDoneHours ? Number(form.lastDoneHours) : null } : { intervalDays: Number(form.interval), lastDoneAt: new Date().toISOString() }) };
    const res = await fetch(`/api/admin/assets/${asset.id}/maintenance`, { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
    if (!res.ok) { toast.error("No se pudo agregar"); return; }
    toast.success("Mantenimiento programado"); setForm({ title: "", mode: "hours", interval: "", lastDoneHours: asset.currentHours != null ? String(asset.currentHours) : "" }); setAdding(false); load(); onChanged();
  };
  const complete = async (m: Maintenance) => {
    const res = await fetch(`/api/admin/assets/${asset.id}/maintenance/${m.id}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ action: "complete", atHours: asset.currentHours ?? null }) });
    if (res.ok) { toast.success("Marcado como hecho"); load(); onChanged(); } else toast.error("No se pudo");
  };
  const del = async (m: Maintenance) => {
    const res = await fetch(`/api/admin/assets/${asset.id}/maintenance/${m.id}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" });
    if (res.ok) { load(); onChanged(); }
  };

  const stChip = (s: Maintenance["state"]) => s === "due" ? "bg-[var(--data-error-100)] text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" : s === "soon" ? "bg-[var(--data-warning-100)] text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]" : "bg-[var(--accent-soft)] text-[var(--accent)]";

  return (
    <div className="space-y-2">
      {asset.currentHours == null && <p className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">Tip: registra el horómetro de la máquina (en Editar) para alertas por horas.</p>}
      {items == null ? <Center><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</Center>
       : items.length === 0 && !adding ? <p className="py-6 text-center text-sm font-medium text-[var(--text-tertiary)]">Sin mantenimientos programados.</p>
       : <ul className="space-y-2">{items.map(m => (
            <li key={m.id} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]"><Wrench className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[var(--text-primary)]">{m.title}</p><p className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">{m.intervalHours ? `cada ${m.intervalHours} h` : `cada ${m.intervalDays} d`}</p></div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold", stChip(m.state))}>{m.detail}</span>
              </div>
              <div className="mt-2 flex gap-1.5">
                <button type="button" onClick={() => complete(m)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--accent-soft)] px-2 py-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] hover:brightness-95"><CheckCircle className="h-3.5 w-3.5" /> Marcar hecho</button>
                <button type="button" onClick={() => del(m)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--data-error-600)]"><X className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          ))}</ul>}

      {adding ? (
        <div className="rounded-xl border-2 border-[var(--accent)]/30 bg-[var(--surface-raised)] p-3 space-y-2">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Cambio de aceite" className={FIELD} autoFocus />
          <div className="flex gap-1 rounded-lg bg-[var(--surface-sunken)] p-1">
            {([["hours", "Por horas"], ["days", "Por días"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setForm(f => ({ ...f, mode: v }))} className={cn("flex-1 rounded-md px-2 py-1.5 text-xs font-bold", form.mode === v ? "bg-primary text-white" : "text-[var(--text-secondary)]")}>{l}</button>)}
          </div>
          <input type="number" min="1" value={form.interval} onChange={e => setForm(f => ({ ...f, interval: e.target.value }))} placeholder={form.mode === "hours" ? "cada cuántas horas (ej. 250)" : "cada cuántos días (ej. 30)"} className={FIELD} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)} className="flex-1 rounded-lg border-2 border-[var(--rule-base)] py-2 text-xs font-bold text-[var(--text-secondary)]">Cancelar</button>
            <button type="button" onClick={add} className="flex-1 rounded-lg bg-primary py-2 text-xs font-bold text-white">Programar</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[var(--rule-base)] py-2.5 text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"><Plus className="h-4 w-4" /> Programar mantenimiento</button>
      )}
    </div>
  );
}

// ── Cuentas por cobrar ──────────────────────────────────────────────────────
function ReceivablesView({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<Receivable[] | null>(null);
  const load = useCallback(() => {
    fetch("/api/admin/assets/receivables", { credentials: "include" }).then(r => r.ok ? r.json() : { data: [] }).then(j => setRows(j.data)).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const markPaid = async (r: Receivable) => {
    const res = await fetch("/api/admin/assets/receivables", { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ incomeId: r.id, paid: true }) });
    if (res.ok) { toast.success("Marcado como cobrado"); load(); onChanged(); } else toast.error("No se pudo");
  };
  const remind = (r: Receivable) => {
    const msg = `Hola${r.client ? ` ${r.client}` : ""}, te recuerdo el pago pendiente del alquiler de *${r.assetName}* por ${fmt(r.amount)}${r.dueDate ? ` (vence ${dStr(r.dueDate)})` : ""}. ¡Gracias!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (rows == null) return <Center><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</Center>;
  if (rows.length === 0) return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-14 text-center">
      <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><CheckCircle className="h-6 w-6" /></span>
      <p className="text-base font-extrabold text-[var(--text-primary)]">Todo cobrado</p>
      <p className="mt-1 text-sm text-[var(--text-tertiary)]">No tienes alquileres pendientes de pago.</p>
    </div>
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const overdue = (r: Receivable) => r.dueDate && new Date(r.dueDate).getTime() < Date.now();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-xl bg-[var(--data-warning-100)] px-4 py-2.5 dark:bg-amber-950/20"><span className="text-sm font-bold text-[var(--text-secondary)]">Total por cobrar ({rows.length})</span><span className="font-mono text-lg font-bold tabular-nums text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]">{fmt(total)}</span></div>
      {rows.map(r => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-[var(--text-primary)]">{r.client ?? "Cliente"} · <span className="font-medium text-[var(--text-secondary)]">{r.assetName}</span></p>
            <p className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">{dStr(r.date)}{r.dueDate && <span className={cn("ml-1 font-bold", overdue(r) ? "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]")}>· vence {dStr(r.dueDate)}{overdue(r) ? " (vencido)" : ""}</span>}</p>
          </div>
          <span className="font-mono text-base font-bold tabular-nums text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]">{fmt(r.amount)}</span>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => remind(r)} title="Recordar por WhatsApp" className="inline-flex h-9 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"><Clock className="h-3.5 w-3.5" /> Recordar</button>
            <button type="button" onClick={() => markPaid(r)} className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-bold text-white hover:bg-primary/90"><CheckCircle className="h-3.5 w-3.5" /> Cobrado</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Calendario (agenda de alquileres) ───────────────────────────────────────
function CalendarView({ assets }: { assets: AssetStats[] }) {
  const [items, setItems] = useState<(IncomeMov & { assetName: string })[] | null>(null);
  useEffect(() => {
    if (assets.length === 0) { setItems([]); return; }
    Promise.all(assets.map(a => fetch(`/api/admin/assets/${a.id}/movements`, { credentials: "include" }).then(r => r.ok ? r.json() : { data: { incomes: [] } }).then(j => (j.data.incomes as IncomeMov[]).map(i => ({ ...i, assetName: a.name }))).catch(() => [])))
      .then(arr => setItems(arr.flat().sort((a, b) => ((a.startDate ?? a.date) < (b.startDate ?? b.date) ? 1 : -1))));
  }, [assets]);

  if (items == null) return <Center><Loader2 className="h-4 w-4 animate-spin" /> Cargando agenda…</Center>;
  if (items.length === 0) return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-14 text-center">
      <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><Calendar className="h-6 w-6" /></span>
      <p className="text-base font-extrabold text-[var(--text-primary)]">Sin alquileres aún</p>
      <p className="mt-1 text-sm text-[var(--text-tertiary)]">Registra alquileres con fecha de inicio/fin y aparecerán acá en orden.</p>
    </div>
  );
  const now = Date.now();
  return (
    <ul className="space-y-2">
      {items.map(i => {
        const start = i.startDate ?? i.date;
        const active = i.startDate && i.endDate && new Date(i.startDate).getTime() <= now && new Date(i.endDate).getTime() >= now;
        return (
          <li key={i.id} className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
            <span className={cn("inline-flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg", active ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>
              <span className="text-sm font-black leading-none tabular-nums">{new Date(start).getDate()}</span>
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase leading-none">{new Date(start).toLocaleDateString("es-PE", { month: "short" })}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[var(--text-primary)]">{i.assetName} {active && <span className="rounded bg-[var(--accent-soft)] px-1 text-[length:var(--ts-2xs)] font-black text-[var(--accent)]">EN USO</span>}</p>
              <p className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">{i.client ?? "Alquiler"}{i.startDate && i.endDate ? ` · ${dStr(i.startDate)} → ${dStr(i.endDate)}` : ` · ${dStr(i.date)}`}{!i.paid && " · pendiente"}</p>
            </div>
            <span className="font-mono text-sm font-bold tabular-nums text-primary">{fmt(i.amount)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Ranking / comparador de flota ───────────────────────────────────────────
function RankingView({ assets }: { assets: AssetStats[] }) {
  const [metric, setMetric] = useState<"profit" | "roi" | "util" | "cost">("profit");
  if (assets.length === 0) return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-14 text-center">
      <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><BarChart3 className="h-6 w-6" /></span>
      <p className="text-base font-extrabold text-[var(--text-primary)]">Sin máquinas para comparar</p>
      <p className="mt-1 text-sm text-[var(--text-tertiary)]">Agrega máquinas y registra alquileres para ver cuál rinde más.</p>
    </div>
  );
  const roi = (a: AssetStats) => (a.purchaseValue && a.purchaseValue > 0 ? (a.profit / a.purchaseValue) * 100 : null);
  const metricVal = (a: AssetStats) => metric === "profit" ? a.profit : metric === "roi" ? (roi(a) ?? -Infinity) : metric === "util" ? (a.utilizationPct ?? 0) : (a.costPerUnit ?? Infinity);
  const lowerBetter = metric === "cost";
  const ranked = [...assets].sort((a, b) => lowerBetter ? metricVal(a) - metricVal(b) : metricVal(b) - metricVal(a));
  const fmtMetric = (a: AssetStats) => metric === "profit" ? fmt(a.profit) : metric === "roi" ? (roi(a) != null ? `${Math.round(roi(a)!)}%` : "—") : metric === "util" ? (a.utilizationPct != null ? `${Math.round(a.utilizationPct)}%` : "—") : (a.costPerUnit != null ? `${fmt(a.costPerUnit)}/${a.rateUnit}` : "—");
  const vals = ranked.map(a => { const v = metricVal(a); return Number.isFinite(v) ? Math.abs(v) : 0; });
  const max = Math.max(...vals, 1);
  const METRICS = [["profit", "Ganancia"], ["roi", "ROI %"], ["util", "Utilización"], ["cost", "Costo/hora"]] as const;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
        {METRICS.map(([v, l]) => (
          <button key={v} type="button" onClick={() => setMetric(v)} className={cn("flex-1 rounded-lg px-2 py-2 text-xs font-bold transition-colors", metric === v ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>{l}</button>
        ))}
      </div>
      <p className="px-1 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">{lowerBetter ? "Menor es mejor — la máquina más barata de operar arriba." : "Mayor es mejor — la máquina que más rinde arriba."}</p>
      <ul className="space-y-2">
        {ranked.map((a, i) => {
          const v = metricVal(a);
          const pct = Number.isFinite(v) ? (Math.abs(v) / max) * 100 : 0;
          const medal = i === 0 ? "text-[var(--accent)]" : i === 1 ? "text-[var(--text-secondary)]" : i === 2 ? "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]";
          return (
            <li key={a.id} className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
              <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] font-mono text-sm font-black tabular-nums", medal)}>{i < 3 ? <Trophy className="h-4 w-4" /> : i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[var(--text-primary)]">{a.name}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"><span className={cn("block h-full rounded-full", i === 0 ? "bg-primary" : "bg-[var(--accent)]/50")} style={{ width: `${pct}%` }} /></div>
              </div>
              <span className={cn("shrink-0 font-mono text-sm font-bold tabular-nums", metric === "cost" ? "text-[var(--text-primary)]" : "text-primary")}>{fmtMetric(a)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Importar flota (CSV/Excel) ──────────────────────────────────────────────
const UNIT_ALIASES: Record<string, string> = { hora: "hora", horas: "hora", dia: "dia", día: "dia", dias: "dia", días: "dia", m3: "m3", "m³": "m3", viaje: "viaje", viajes: "viaje" };
function ImportModal({ knownTypes, onClose, onDone }: { knownTypes: string[]; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<{ name: string; type: string; plate: string | null; hourlyRate: number | null; rateUnit: string; capacityPerDay: number | null }[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number } | null>(null);

  const parse = (raw: string) => {
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { setRows([]); return; }
    if (/nombre/i.test(lines[0]) && /tarifa|categor|placa|cobro/i.test(lines[0])) lines.shift(); // header
    const parsed = lines.map(l => {
      const c = l.split(/[,;\t]/).map(x => x.trim());
      const unitRaw = (c[4] ?? "").toLowerCase();
      return {
        name: c[0] ?? "", type: (c[1] || "otro").toLowerCase(), plate: c[2] || null,
        hourlyRate: c[3] ? Number(c[3].replace(/[^\d.]/g, "")) || null : null,
        rateUnit: UNIT_ALIASES[unitRaw] ?? "hora",
        capacityPerDay: c[5] ? Number(c[5]) || null : null,
      };
    }).filter(r => r.name);
    setRows(parsed);
  };

  const onFile = (f: File | undefined) => { if (!f) return; const r = new FileReader(); r.onload = () => { const t = String(r.result ?? ""); setText(t); parse(t); }; r.readAsText(f); };

  const run = async () => {
    if (!rows || rows.length === 0) return;
    setImporting(true);
    let ok = 0, fail = 0;
    for (const r of rows) {
      try {
        const res = await fetch("/api/admin/assets", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(r) });
        if (res.ok) ok++; else fail++;
      } catch { fail++; }
    }
    setResult({ ok, fail }); setImporting(false);
    if (ok > 0) toast.success(`${ok} máquina${ok > 1 ? "s" : ""} importada${ok > 1 ? "s" : ""}`);
    if (fail > 0) toast.error(`${fail} fila${fail > 1 ? "s" : ""} con error`);
  };

  return (
    <ModalShell title="Importar flota" subtitle="Pega o sube un Excel/CSV y crea varias máquinas de una" onClose={onClose} icon={Upload}>
      {result ? (
        <div className="py-6 text-center">
          <span className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><CheckCircle className="h-7 w-7" /></span>
          <p className="text-base font-extrabold text-[var(--text-primary)]">{result.ok} importadas{result.fail > 0 ? ` · ${result.fail} con error` : ""}</p>
          <button type="button" onClick={onDone} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary/90">Listo</button>
        </div>
      ) : (<>
        <div className="rounded-xl bg-[var(--surface-sunken)] p-3 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">
          Columnas (en este orden, separadas por coma): <span className="font-bold text-[var(--text-secondary)]">Nombre, Categoría, Placa, Tarifa, Cobro (hora/día/m³/viaje), Capacidad/día</span>. Una máquina por línea.
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3.5 py-2 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
            <FileText className="h-4 w-4" />
            <label htmlFor="activos-import-file" className="cursor-pointer">Subir archivo</label>
            <input id="activos-import-file" type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
          </span>
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">o pega abajo ↓</span>
        </div>
        <textarea value={text} onChange={e => { setText(e.target.value); parse(e.target.value); }} rows={6} className={cn(FIELD, "mt-2 font-mono")} placeholder={"Oruga D6, oruga, PUC-123, 180, hora, 8\nCamión Volquete, camion, ABC-456, 90, viaje, 6"} />
        {rows && rows.length > 0 && (
          <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-[var(--rule-base)]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"><tr><th className="px-2 py-1.5 text-left font-bold">Nombre</th><th className="px-2 py-1.5 text-left font-bold">Categoría</th><th className="px-2 py-1.5 text-right font-bold">Tarifa</th></tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-[var(--rule-soft)]"><td className="px-2 py-1.5 font-bold text-[var(--text-primary)]">{r.name}</td><td className="px-2 py-1.5 text-[var(--text-secondary)]">{typeLabel(r.type)}</td><td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{r.hourlyRate != null ? fmt(r.hourlyRate) : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <div className="mt-6 flex items-center gap-3">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border-2 border-[var(--rule-base)] px-5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button type="button" onClick={run} disabled={importing || !rows || rows.length === 0} className="flex flex-1 items-center justify-center gap-2 h-11 rounded-xl bg-primary text-sm font-extrabold text-white hover:bg-primary/90 disabled:opacity-50">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? "Importando…" : rows && rows.length > 0 ? `Importar ${rows.length}` : "Importar"}
          </button>
        </div>
      </>)}
    </ModalShell>
  );
}

// ── Contrato / cotización PDF ───────────────────────────────────────────────
function ContractModal({ asset, onClose }: { asset: AssetStats; onClose: () => void }) {
  const [form, setForm] = useState({ mode: "contrato" as "contrato" | "cotizacion", client: "", quantity: "", rate: asset.hourlyRate != null ? String(asset.hourlyRate) : "", startDate: "", endDate: "", notes: "" });
  const amount = (Number(form.quantity) || 0) * (Number(form.rate) || 0);
  const gen = () => {
    if (!form.client.trim()) { toast.error("Pon el cliente"); return; }
    if (amount <= 0) { toast.error("Pon cantidad y tarifa"); return; }
    generateContractPDF({
      mode: form.mode, asset: { name: asset.name, type: asset.type, plate: asset.plate },
      client: form.client.trim(), quantity: form.quantity ? Number(form.quantity) : null, unitLabel: unitNoun(asset.rateUnit),
      rate: Number(form.rate) || 0, amount, startDate: form.startDate ? dStr(form.startDate) : null, endDate: form.endDate ? dStr(form.endDate) : null,
      notes: form.notes.trim() || null, dateStr: new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" }),
    });
    toast.success("PDF generado"); onClose();
  };
  return (
    <ModalShell title="Contrato / cotización" subtitle={`Genera el PDF de alquiler de ${asset.name}`} onClose={onClose} icon={FileText}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2 flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
          {([["contrato", "Contrato"], ["cotizacion", "Cotización"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setForm(f => ({ ...f, mode: v }))} className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors", form.mode === v ? "bg-primary text-white" : "text-[var(--text-secondary)]")}>{l}</button>)}
        </div>
        <Field label="Cliente *" labelClassName={LABEL} className="sm:col-span-2"><input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} placeholder="Maderera del Sur S.A.C." className={FIELD} /></Field>
        <Field label="Inicio" labelClassName={LABEL}><input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className={FIELD} /></Field>
        <Field label="Fin" labelClassName={LABEL}><input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className={FIELD} /></Field>
        <Field label={`Cantidad (${unitNoun(asset.rateUnit)})`} labelClassName={LABEL}><input type="number" min="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="8" className={FIELD} /></Field>
        <Field label="Tarifa (S/)" labelClassName={LABEL}><input type="number" min="0" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="180" className={FIELD} /></Field>
        <Field label="Condiciones / notas" labelClassName={LABEL} className="sm:col-span-2"><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={cn(FIELD, "resize-none")} placeholder="Incluye operador. Combustible por cuenta del cliente." /></Field>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--accent-soft)] px-4 py-3"><span className="text-sm font-bold text-[var(--text-secondary)]">Total</span><span className="font-mono text-xl font-bold tabular-nums text-primary">{fmt(amount)}</span></div>
      <div className="mt-6 flex items-center gap-3">
        <button type="button" onClick={onClose} className="h-11 rounded-xl border-2 border-[var(--rule-base)] px-5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
        <button type="button" onClick={gen} className="flex flex-1 items-center justify-center gap-2 h-11 rounded-xl bg-primary text-sm font-extrabold text-white hover:bg-primary/90"><Download className="h-4 w-4" /> Generar PDF</button>
      </div>
    </ModalShell>
  );
}

// ── Checklist pre-alquiler ──────────────────────────────────────────────────
function ChecklistModal({ asset, onClose, onSaved }: { asset: AssetStats; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<"salida" | "retorno">("salida");
  const [client, setClient] = useState("");
  const [hours, setHours] = useState(asset.currentHours != null ? String(asset.currentHours) : "");
  const [checks, setChecks] = useState<Record<string, boolean>>(() => Object.fromEntries(CHECKLIST_DEFAULT.map(l => [l, true])));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const items = CHECKLIST_DEFAULT.map(l => ({ label: l, ok: checks[l] }));
      const res = await fetch(`/api/admin/assets/${asset.id}/inspections`, { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ kind, client: client.trim() || null, hours: hours ? Number(hours) : null, items, notes: notes.trim() || null }) });
      if (!res.ok) { toast.error("No se pudo guardar"); return; }
      toast.success("Checklist guardado"); onSaved();
    } catch { toast.error("Sin conexión"); } finally { setSaving(false); }
  };
  return (
    <ModalShell title={`Checklist — ${asset.name}`} subtitle="Inspección antes de entregar o al recibir la máquina" onClose={onClose} icon={ClipboardCheck}>
      <div className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
        {([["salida", "Salida (entrega)"], ["retorno", "Retorno (recibo)"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setKind(v)} className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors", kind === v ? "bg-primary text-white" : "text-[var(--text-secondary)]")}>{l}</button>)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Cliente" labelClassName={LABEL}><input value={client} onChange={e => setClient(e.target.value)} className={FIELD} /></Field>
        <Field label="Horómetro" labelClassName={LABEL}><input type="number" min="0" value={hours} onChange={e => setHours(e.target.value)} className={FIELD} /></Field>
      </div>
      <div className="mt-3 space-y-1.5">
        {CHECKLIST_DEFAULT.map(l => (
          <button key={l} type="button" onClick={() => setChecks(c => ({ ...c, [l]: !c[l] }))} className="flex w-full items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-sunken)]">
            <span className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors", checks[l] ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--rule-base)] text-transparent")}><CheckCircle className="h-4 w-4" /></span>
            <span className="flex-1 text-sm font-bold text-[var(--text-primary)]">{l}</span>
            <span className={cn("text-[length:var(--ts-2xs)] font-black uppercase", checks[l] ? "text-[var(--accent)]" : "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]")}>{checks[l] ? "OK" : "Falla"}</span>
          </button>
        ))}
      </div>
      <div className="mt-3"><Field label="Observaciones" labelClassName={LABEL}><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={cn(FIELD, "resize-none")} placeholder="Rayón en la puerta, falta 1/4 de combustible…" /></Field></div>
      <ModalFooter onClose={onClose} onSave={save} saving={saving} saveLabel="Guardar checklist" />
    </ModalShell>
  );
}

// ── Shells reutilizables ────────────────────────────────────────────────────
function ModalShell({ title, subtitle, onClose, children, icon: Icon = Construction }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode; icon?: React.ComponentType<{ className?: string; strokeWidth?: number }> }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-6 py-5">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Icon className="h-6 w-6" strokeWidth={2.1} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Activos & Maquinaria</p>
            <h2 className="text-xl font-extrabold leading-tight text-[var(--text-primary)]">{title}</h2>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSave, saving, saveLabel }: { onClose: () => void; onSave: () => void; saving: boolean; saveLabel: string }) {
  return (
    <div className="mt-6 flex items-center gap-3">
      <button type="button" onClick={onClose} className="h-11 rounded-xl border-2 border-[var(--rule-base)] px-5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]">Cancelar</button>
      <button type="button" onClick={onSave} disabled={saving} className="flex flex-1 items-center justify-center gap-2 h-11 rounded-xl bg-primary text-sm font-extrabold text-white transition-all hover:bg-primary/90 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
        {saving ? "Guardando…" : saveLabel}
      </button>
    </div>
  );
}
