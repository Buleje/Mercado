"use client";

/**
 * ActivosModule — Activos & Maquinaria (MVP, Brandon 2026-06-06).
 *
 * Para negocios que ALQUILAN equipos (forestal: cargador, oruga, camión).
 * Cada máquina es una ficha que genera renta y acumula gastos (combustible,
 * mantenimiento). El KPI estrella es la GANANCIA NETA por máquina.
 *
 * Flujo: ver flota → registrar alquiler (ingreso) → cargar combustible/gasto
 * → ver rentabilidad de cada equipo de un vistazo.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Construction, Plus, X, Loader2, TrendingUp, TrendingDown, Fuel,
  Wrench, Truck, Pencil, Trash2, Receipt,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

interface AssetStats {
  id: string; name: string; type: string; plate: string | null; imageUrl: string | null;
  purchaseValue: number | null; status: string; hourlyRate: number | null; rateUnit: string;
  capacityPerDay: number | null; notes: string | null; active: boolean;
  totalIncome: number; totalExpense: number; profit: number; incomeCount: number; expenseCount: number;
  unitsWorked: number; units30d: number;
  costPerUnit: number | null; incomePerUnit: number | null; marginPerUnit: number | null;
  utilizationPct: number | null;
}
interface Movement { id: string; date: string; amount: number; notes: string | null }
interface IncomeMov extends Movement { client: string | null; quantity: number | null; unit: string; rate: number }
interface ExpenseMov extends Movement { category: string; gallons: number | null; unitPrice: number | null }

const fmt = (n: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

const TYPES = [
  { v: "cargador", label: "Cargador" },
  { v: "oruga", label: "Oruga" },
  { v: "camion", label: "Camión" },
  { v: "excavadora", label: "Excavadora" },
  { v: "tractor", label: "Tractor" },
  { v: "otro", label: "Otro" },
];
const RATE_UNITS = [
  { v: "hora", label: "Por hora" },
  { v: "dia", label: "Por día" },
  { v: "m3", label: "Por m³" },
  { v: "viaje", label: "Por viaje" },
];
const STATUS_META: Record<string, { label: string; chip: string }> = {
  operativo:     { label: "Operativo",     chip: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  mantenimiento: { label: "Mantenimiento", chip: "bg-[var(--data-warning-100)] text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]" },
  parado:        { label: "Parado",        chip: "bg-[var(--data-error-100)] text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" },
};
const EXPENSE_CATS = [
  { v: "combustible", label: "Combustible" },
  { v: "mantenimiento", label: "Mantenimiento" },
  { v: "repuesto", label: "Repuesto" },
  { v: "operador", label: "Operador" },
  { v: "peaje", label: "Peaje" },
  { v: "otro", label: "Otro" },
];

const FIELD = "w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none transition-all focus:border-[var(--accent)] focus:bg-[var(--surface-raised)]";
const LABEL = "block text-[length:var(--ts-2xs,0.6875rem)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5";

export default function ActivosModule() {
  const [assets, setAssets] = useState<AssetStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AssetStats | null>(null);
  const [moveFor, setMoveFor] = useState<{ asset: AssetStats; kind: "income" | "expense" } | null>(null);
  const [detailFor, setDetailFor] = useState<AssetStats | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/assets", { credentials: "include" });
      if (res.ok) { const j = await res.json(); setAssets(j.data ?? []); }
    } catch { /* no crítico */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const totals = assets.reduce(
    (acc, a) => ({ income: acc.income + a.totalIncome, expense: acc.expense + a.totalExpense, profit: acc.profit + a.profit }),
    { income: 0, expense: 0, profit: 0 },
  );

  return (
    <div className="space-y-5">
      {/* Header estándar del panel (mismo patrón que todos los módulos) */}
      <AdminModuleHeader
        eyebrow="Finanzas · Maquinaria"
        title="Activos & Maquinaria"
        description="Alquila tus equipos y mira la ganancia real de cada máquina."
        icon={Construction}
      >
        <button
          type="button"
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 min-h-[44px]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} /> Nuevo activo
        </button>
      </AdminModuleHeader>

      {/* KPIs — mismo estilo que Inventario (font-mono, barra fina, sin saturar) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Máquinas" value={String(assets.length)} sub={`${assets.filter(a => a.status === "operativo").length} operativas`} bar="primary" />
        <KpiCard label="Ingresos" value={fmt(totals.income)} sub="por alquileres" tone="primary" bar="primary" />
        <KpiCard label="Gastos" value={fmt(totals.expense)} sub="combustible + mantto." bar="muted" />
        <KpiCard label="Ganancia neta" value={fmt(totals.profit)} sub="ingresos − gastos" tone={totals.profit >= 0 ? "primary" : "error"} bar={totals.profit >= 0 ? "primary" : "error"} highlight />
      </div>

      {/* Grilla de activos */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-[var(--text-tertiary)]">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando flota…
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-16 text-center">
          <span className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Construction className="h-7 w-7" strokeWidth={2} />
          </span>
          <p className="text-base font-extrabold text-[var(--text-primary)]">Aún no tienes máquinas</p>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">Agrega tu cargador, oruga o camión y empieza a registrar alquileres.</p>
          <button type="button" onClick={() => { setEditing(null); setShowForm(true); }} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-black text-white">
            <Plus className="h-4 w-4" strokeWidth={2.75} /> Agregar primera máquina
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              onRent={() => setMoveFor({ asset: a, kind: "income" })}
              onExpense={() => setMoveFor({ asset: a, kind: "expense" })}
              onEdit={() => { setEditing(a); setShowForm(true); }}
              onDetail={() => setDetailFor(a)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <AssetFormModal asset={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void load(); }} />
      )}
      {moveFor && (
        <MovementModal asset={moveFor.asset} kind={moveFor.kind} onClose={() => setMoveFor(null)} onSaved={() => { setMoveFor(null); void load(); }} />
      )}
      {detailFor && (
        <AssetDetailDrawer asset={detailFor} onClose={() => setDetailFor(null)} />
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, tone = "neutral", bar = "muted", highlight }: {
  label: string; value: string; sub: string;
  tone?: "neutral" | "primary" | "error";
  bar?: "primary" | "muted" | "error";
  highlight?: boolean;
}) {
  const valueColor = tone === "primary" ? "text-primary" : tone === "error" ? "text-[var(--data-error-600)]" : "text-[var(--text-primary)]";
  const barColor = bar === "primary" ? "bg-primary" : bar === "error" ? "bg-[var(--data-error-500)]/50" : "bg-[var(--rule-soft)]";
  return (
    <div className={cn("rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5", highlight && "ring-1 ring-[var(--accent)]/25")}>
      <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-zinc-400">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-bold tabular-nums", valueColor)}>{value}</p>
      <p className="mt-1 text-xs text-[var(--text-tertiary)] dark:text-zinc-500">{sub}</p>
      <div className={cn("mt-2 h-1 rounded-full", barColor)} />
    </div>
  );
}

function typeIcon(type: string) {
  if (type === "camion") return Truck;
  return Construction;
}

function AssetCard({ asset, onRent, onExpense, onEdit, onDetail }: {
  asset: AssetStats; onRent: () => void; onExpense: () => void; onEdit: () => void; onDetail: () => void;
}) {
  const Icon = typeIcon(asset.type);
  const st = STATUS_META[asset.status] ?? STATUS_META.operativo;
  const total = asset.totalIncome + asset.totalExpense;
  const incPct = total > 0 ? (asset.totalIncome / total) * 100 : 0;
  return (
    <div className="flex flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 transition-all hover:border-[var(--accent)]/40 hover:shadow-[var(--shadow-md)]">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onDetail} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Icon className="h-6 w-6" strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onDetail} className="block truncate text-base font-extrabold text-[var(--text-primary)] hover:text-[var(--accent)]">{asset.name}</button>
          <p className="text-xs font-medium text-[var(--text-tertiary)]">
            {TYPES.find(t => t.v === asset.type)?.label ?? asset.type}{asset.plate ? ` · ${asset.plate}` : ""}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase", st.chip)}>{st.label}</span>
      </div>

      {/* Rentabilidad — turquesa para ingreso, neutro para gasto (sin saturar) */}
      <div className="mt-3 rounded-xl bg-[var(--surface-sunken)] p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Ganancia</span>
          <span className={cn("font-mono text-lg font-bold tabular-nums", asset.profit >= 0 ? "text-primary" : "text-[var(--data-error-600)]")}>
            {fmt(asset.profit)}
          </span>
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

      {/* Operación: costo/ingreso real por unidad + utilización (Brandon 2026-06-06) */}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-[var(--rule-base)] p-2.5">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Costo / {asset.rateUnit}</p>
          <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
            {asset.costPerUnit != null ? fmt(asset.costPerUnit) : "—"}
          </p>
          {asset.marginPerUnit != null && (
            <p className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
              margen {fmt(asset.marginPerUnit)}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] p-2.5">
          <p className="flex items-center justify-between text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            <span>Uso 30d</span>
            <span className="tabular-nums text-[var(--text-secondary)]">{asset.utilizationPct != null ? `${Math.round(asset.utilizationPct)}%` : "—"}</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <span
              className={cn("block h-full rounded-full",
                (asset.utilizationPct ?? 0) >= 60 ? "bg-primary" :
                (asset.utilizationPct ?? 0) >= 30 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]/60",
              )}
              style={{ width: `${asset.utilizationPct ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
            {asset.units30d} / {(asset.capacityPerDay ?? 8) * 30} {asset.rateUnit}
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={onRent} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-primary/90">
          <TrendingUp className="h-3.5 w-3.5" /> Alquiler
        </button>
        <button type="button" onClick={onExpense} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 py-2 text-xs font-black text-[var(--text-secondary)] transition-colors hover:border-[var(--data-warning-500)] hover:text-[var(--data-warning-500)]">
          <Fuel className="h-3.5 w-3.5" /> Gasto
        </button>
        <button type="button" onClick={onEdit} aria-label="Editar" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Modal crear / editar activo ─────────────────────────────────────────────
function AssetFormModal({ asset, onClose, onSaved }: { asset: AssetStats | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: asset?.name ?? "", type: asset?.type ?? "cargador", plate: asset?.plate ?? "",
    purchaseValue: asset?.purchaseValue != null ? String(asset.purchaseValue) : "",
    status: asset?.status ?? "operativo", hourlyRate: asset?.hourlyRate != null ? String(asset.hourlyRate) : "",
    rateUnit: asset?.rateUnit ?? "hora", capacityPerDay: asset?.capacityPerDay != null ? String(asset.capacityPerDay) : "8",
    notes: asset?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Ponle un nombre a la máquina"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), type: form.type, plate: form.plate.trim() || null,
        purchaseValue: form.purchaseValue ? Number(form.purchaseValue) : null,
        status: form.status, hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
        rateUnit: form.rateUnit, capacityPerDay: form.capacityPerDay ? Number(form.capacityPerDay) : null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(asset ? `/api/admin/assets/${asset.id}` : "/api/admin/assets", {
        method: asset ? "PATCH" : "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e?.error ?? "No se pudo guardar"); return; }
      toast.success(asset ? "Máquina actualizada" : "Máquina agregada");
      onSaved();
    } catch { toast.error("Sin conexión"); } finally { setSaving(false); }
  };

  return (
    <ModalShell title={asset ? "Editar máquina" : "Nueva máquina"} subtitle="Datos del activo y su tarifa de alquiler" onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={LABEL}>Nombre *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Cargador frontal CAT 938" className={FIELD} /></div>
        <div><label className={LABEL}>Tipo</label><select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={FIELD}>{TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}</select></div>
        <div><label className={LABEL}>Placa / serie</label><input value={form.plate} onChange={e => setForm(f => ({ ...f, plate: e.target.value }))} placeholder="ABC-123" className={FIELD} /></div>
        <div><label className={LABEL}>Estado</label><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={FIELD}>{Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}</select></div>
        <div><label className={LABEL}>Valor de compra (S/)</label><input type="number" min="0" value={form.purchaseValue} onChange={e => setForm(f => ({ ...f, purchaseValue: e.target.value }))} placeholder="250000" className={FIELD} /></div>
        <div><label className={LABEL}>Tarifa de alquiler (S/)</label><input type="number" min="0" value={form.hourlyRate} onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))} placeholder="180" className={FIELD} /></div>
        <div><label className={LABEL}>Cobro por</label><select value={form.rateUnit} onChange={e => setForm(f => ({ ...f, rateUnit: e.target.value }))} className={FIELD}>{RATE_UNITS.map(u => <option key={u.v} value={u.v}>{u.label}</option>)}</select></div>
        <div><label className={LABEL} title="Horas/unidades disponibles por día — base para calcular la utilización">Capacidad por día</label><input type="number" min="1" max="24" value={form.capacityPerDay} onChange={e => setForm(f => ({ ...f, capacityPerDay: e.target.value }))} placeholder="8" className={FIELD} /></div>
        <div className="sm:col-span-2"><label className={LABEL}>Notas</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={cn(FIELD, "resize-none")} /></div>
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
  });
  const [saving, setSaving] = useState(false);

  // Auto-cálculo del monto: alquiler = cantidad × tarifa; combustible = galones × precio.
  const autoAmount = isIncome
    ? (Number(form.quantity) || 0) * (Number(form.rate) || 0)
    : form.category === "combustible" ? (Number(form.gallons) || 0) * (Number(form.unitPrice) || 0) : 0;
  const effectiveAmount = form.amount !== "" ? Number(form.amount) : autoAmount;

  const save = async () => {
    if (effectiveAmount <= 0) { toast.error("Ingresa un monto válido"); return; }
    setSaving(true);
    try {
      const payload = isIncome
        ? { client: form.client.trim() || null, quantity: form.quantity ? Number(form.quantity) : null, unit: form.unit, rate: Number(form.rate) || 0, amount: effectiveAmount, notes: form.notes.trim() || null }
        : { category: form.category, gallons: form.gallons ? Number(form.gallons) : null, unitPrice: form.unitPrice ? Number(form.unitPrice) : null, amount: effectiveAmount, notes: form.notes.trim() || null };
      const res = await fetch(`/api/admin/assets/${asset.id}/movements?kind=${kind}`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e?.error ?? "No se pudo guardar"); return; }
      toast.success(isIncome ? "Alquiler registrado" : "Gasto registrado");
      onSaved();
    } catch { toast.error("Sin conexión"); } finally { setSaving(false); }
  };

  return (
    <ModalShell
      title={isIncome ? `Alquiler — ${asset.name}` : `Gasto — ${asset.name}`}
      subtitle={isIncome ? "Renta generada por la máquina" : "Combustible, mantenimiento u otro costo"}
      onClose={onClose}
      icon={isIncome ? TrendingUp : Fuel}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isIncome ? (<>
          <div className="sm:col-span-2"><label className={LABEL}>Cliente</label><input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} placeholder="Maderera del Sur" className={FIELD} /></div>
          <div><label className={LABEL}>Cantidad ({RATE_UNITS.find(u => u.v === form.unit)?.label ?? form.unit})</label><input type="number" min="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="8" className={FIELD} /></div>
          <div><label className={LABEL}>Tarifa (S/)</label><input type="number" min="0" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="180" className={FIELD} /></div>
        </>) : (<>
          <div><label className={LABEL}>Categoría</label><select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={FIELD}>{EXPENSE_CATS.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}</select></div>
          {form.category === "combustible" && (<>
            <div><label className={LABEL}>Galones</label><input type="number" min="0" value={form.gallons} onChange={e => setForm(f => ({ ...f, gallons: e.target.value }))} placeholder="20" className={FIELD} /></div>
            <div><label className={LABEL}>Precio / galón (S/)</label><input type="number" min="0" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} placeholder="16.50" className={FIELD} /></div>
          </>)}
        </>)}
        <div className="sm:col-span-2">
          <label className={LABEL}>Monto total (S/) {autoAmount > 0 && form.amount === "" && <span className="text-[var(--accent)] normal-case">· auto {fmt(autoAmount)}</span>}</label>
          <input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder={autoAmount > 0 ? String(autoAmount) : "0.00"} className={cn(FIELD, "text-lg font-black")} />
        </div>
        <div className="sm:col-span-2"><label className={LABEL}>Notas</label><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={FIELD} /></div>
      </div>
      {/* Resumen */}
      <div className={cn("mt-3 flex items-center justify-between rounded-xl px-4 py-3", isIncome ? "bg-[var(--accent-soft)]" : "bg-[var(--data-warning-100)] dark:bg-amber-950/20")}>
        <span className="text-sm font-bold text-[var(--text-secondary)]">{isIncome ? "Ingreso a registrar" : "Gasto a registrar"}</span>
        <span className={cn("font-mono text-xl font-bold tabular-nums", isIncome ? "text-primary" : "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]")}>{fmt(effectiveAmount)}</span>
      </div>
      <ModalFooter onClose={onClose} onSave={save} saving={saving} saveLabel={isIncome ? "Registrar alquiler" : "Registrar gasto"} />
    </ModalShell>
  );
}

// ── Drawer de detalle / movimientos ─────────────────────────────────────────
function AssetDetailDrawer({ asset, onClose }: { asset: AssetStats; onClose: () => void }) {
  const [mov, setMov] = useState<{ incomes: IncomeMov[]; expenses: ExpenseMov[] } | null>(null);
  useEffect(() => {
    fetch(`/api/admin/assets/${asset.id}/movements`, { credentials: "include" })
      .then(r => r.ok ? r.json() : { data: { incomes: [], expenses: [] } })
      .then(j => setMov(j.data))
      .catch(() => setMov({ incomes: [], expenses: [] }));
  }, [asset.id]);

  const all = mov
    ? [...mov.incomes.map(i => ({ ...i, kind: "income" as const })), ...mov.expenses.map(e => ({ ...e, kind: "expense" as const }))]
        .sort((a, b) => (a.date < b.date ? 1 : -1))
    : [];

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-[var(--text-primary)]/50 backdrop-blur-sm" />
      <div className="relative flex h-full w-full max-w-md flex-col bg-[var(--surface-canvas)] shadow-2xl motion-safe:animate-[slideInRight_0.25s_ease-out]">
        <div className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 py-3.5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Receipt className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-[var(--text-primary)]">{asset.name}</p>
            <p className="text-xs font-bold text-[var(--text-tertiary)]">Ganancia: <span className={cn("font-mono", asset.profit >= 0 ? "text-primary" : "text-[var(--data-error-600)]")}>{fmt(asset.profit)}</span></p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"><X className="h-4.5 w-4.5" strokeWidth={2.5} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!mov ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
          ) : all.length === 0 ? (
            <p className="py-10 text-center text-sm font-medium text-[var(--text-tertiary)]">Aún no hay movimientos. Registra un alquiler o gasto.</p>
          ) : (
            <ul className="space-y-2">
              {all.map((m) => {
                const inc = m.kind === "income";
                return (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
                    <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", inc ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-600)] dark:bg-amber-950/20 dark:text-[var(--data-warning-500)]")}>
                      {inc ? <TrendingUp className="h-4 w-4" /> : (m as ExpenseMov).category === "combustible" ? <Fuel className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                        {inc ? ((m as IncomeMov).client ?? "Alquiler") : EXPENSE_CATS.find(c => c.v === (m as ExpenseMov).category)?.label}
                      </p>
                      <p className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">
                        {new Date(m.date).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                        {m.notes ? ` · ${m.notes}` : ""}
                      </p>
                    </div>
                    <span className={cn("shrink-0 font-mono text-sm font-bold tabular-nums", inc ? "text-primary" : "text-[var(--text-secondary)]")}>
                      {inc ? "+" : "−"}{fmt(m.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
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
      <button type="button" onClick={onSave} disabled={saving} className="flex flex-1 items-center justify-center gap-2 h-11 rounded-xl bg-[var(--accent)] text-sm font-extrabold text-white shadow-[var(--shadow-md)] transition-all hover:-translate-y-0.5 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
        {saving ? "Guardando…" : saveLabel}
      </button>
    </div>
  );
}
