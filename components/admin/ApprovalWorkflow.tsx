"use client";

import { useState, useEffect, useMemo } from "react";
import { CheckCircle, XCircle, Clock, Settings, ChevronDown, ChevronUp, User } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type PendingStatus = "pendiente" | "aprobado" | "rechazado";

type PendingItem = {
  id: string;
  type: "compra" | "eliminacion" | "cambio_precio";
  requestedBy: string;
  description: string;
  amount?: number;
  createdAt: string;
  status: PendingStatus;
  note?: string;
  resolvedAt?: string;
};

type ApprovalConfig = {
  purchaseThreshold: number;
  requireDeleteApproval: boolean;
  priceChangeThreshold: number;
};

// ── Storage ───────────────────────────────────────────────────────────────────

const ITEMS_KEY  = "bsm_approval_items";
const CONFIG_KEY = "bsm_approval_config";

const DEFAULT_CONFIG: ApprovalConfig = {
  purchaseThreshold:    500,
  requireDeleteApproval: true,
  priceChangeThreshold: 30,
};

const SEED_ITEMS: PendingItem[] = [
  {
    id: "ap1",
    type: "compra",
    requestedBy: "Carlos Mamani",
    description: "Compra de 50 kg de arroz extra a Distribuidora Lima",
    amount: 750,
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    status: "pendiente",
  },
  {
    id: "ap2",
    type: "cambio_precio",
    requestedBy: "Rosa Flores",
    description: "Cambio de precio de Aceite Primor 1L de S/ 8.50 a S/ 5.90",
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    status: "pendiente",
  },
  {
    id: "ap3",
    type: "eliminacion",
    requestedBy: "Luis Perez",
    description: "Eliminar producto: Galletas Oreo 6-pack (sin stock, descontinuado)",
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    status: "aprobado",
    note: "Confirmado con proveedor",
    resolvedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

function loadItems(): PendingItem[] {
  if (typeof window === "undefined") return SEED_ITEMS;
  try {
    const raw = localStorage.getItem(ITEMS_KEY);
    return raw ? (JSON.parse(raw) as PendingItem[]) : SEED_ITEMS;
  } catch { return SEED_ITEMS; }
}

function loadConfig(): ApprovalConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<ApprovalConfig>) } : DEFAULT_CONFIG;
  } catch { return DEFAULT_CONFIG; }
}

function saveItems(items: PendingItem[]) {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

function saveConfig(cfg: ApprovalConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<PendingItem["type"], string> = {
  compra:        "Compra",
  eliminacion:   "Eliminacion",
  cambio_precio: "Cambio de precio",
};

const TYPE_COLOR: Record<PendingItem["type"], string> = {
  compra:        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  eliminacion:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  cambio_precio: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const STATUS_MAP: Record<PendingStatus, { label: string; color: string; Icon: typeof Clock }> = {
  pendiente: { label: "Pendiente",  color: "text-amber-600 dark:text-amber-400",   Icon: Clock },
  aprobado:  { label: "Aprobado",   color: "text-emerald-600 dark:text-emerald-400", Icon: CheckCircle },
  rechazado: { label: "Rechazado",  color: "text-red-600 dark:text-red-400",       Icon: XCircle },
};

function fmt(n: number) { return "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 }); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Resolve modal ─────────────────────────────────────────────────────────────

function ResolveModal({
  item,
  decision,
  onConfirm,
  onCancel,
}: {
  item: PendingItem;
  decision: "aprobado" | "rechazado";
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {decision === "aprobado" ? "Aprobar solicitud" : "Rechazar solicitud"}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">{item.description}</p>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Nota (opcional)
          </label>
          <textarea
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={decision === "aprobado" ? "Todo correcto, proceder..." : "Motivo del rechazo..."}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-gray-900 dark:text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(note)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors",
              decision === "aprobado" ? "bg-[#00B4A6] hover:bg-[#245a41]" : "bg-red-600 hover:bg-red-700"
            )}
          >
            {decision === "aprobado" ? "Confirmar aprobacion" : "Confirmar rechazo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Config panel ──────────────────────────────────────────────────────────────

function ConfigPanel({ config, onSave }: { config: ApprovalConfig; onSave: (c: ApprovalConfig) => void }) {
  const [local, setLocal] = useState(config);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 space-y-4">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Que requiere aprobacion</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Compras mayores a (S/)
          </label>
          <input
            type="number"
            value={local.purchaseThreshold}
            min={0}
            onChange={e => setLocal(c => ({ ...c, purchaseThreshold: Number(e.target.value) }))}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Cambio de precio mayor a (%)
          </label>
          <input
            type="number"
            value={local.priceChangeThreshold}
            min={0}
            max={100}
            onChange={e => setLocal(c => ({ ...c, priceChangeThreshold: Number(e.target.value) }))}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Eliminaciones de productos
          </label>
          <button
            onClick={() => setLocal(c => ({ ...c, requireDeleteApproval: !c.requireDeleteApproval }))}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors",
              local.requireDeleteApproval
                ? "border-[#00B4A6] bg-[#00B4A6]/10 text-[#00B4A6] dark:text-[#4a9e78]"
                : "border-gray-200 dark:border-card-border text-gray-400 dark:text-gray-600"
            )}
          >
            {local.requireDeleteApproval ? "Requiere aprobacion" : "Sin restriccion"}
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors",
            saved ? "bg-emerald-600" : "bg-[#00B4A6] hover:bg-[#245a41]"
          )}
        >
          {saved ? "Guardado" : "Guardar configuracion"}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ApprovalWorkflow() {
  const [items, setItems]   = useState<PendingItem[]>([]);
  const [config, setConfig] = useState<ApprovalConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [resolving, setResolving] = useState<{ item: PendingItem; decision: "aprobado" | "rechazado" } | null>(null);

  useEffect(() => {
    setItems(loadItems());
    setConfig(loadConfig());
  }, []);

  const persist = (next: PendingItem[]) => {
    setItems(next);
    saveItems(next);
  };

  const handleSaveConfig = (c: ApprovalConfig) => {
    setConfig(c);
    saveConfig(c);
  };

  const handleResolve = (note: string) => {
    if (!resolving) return;
    const next = items.map(it =>
      it.id === resolving.item.id
        ? { ...it, status: resolving.decision, note: note.trim() || undefined, resolvedAt: new Date().toISOString() }
        : it
    );
    persist(next);
    setResolving(null);
  };

  const pending  = useMemo(() => items.filter(i => i.status === "pendiente"), [items]);
  const history  = useMemo(() => items.filter(i => i.status !== "pendiente"), [items]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Flujo de Aprobaciones</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {pending.length} pendiente{pending.length !== 1 ? "s" : ""} de revision
          </p>
        </div>
        <button
          onClick={() => setShowConfig(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Configuracion
          {showConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {showConfig && <ConfigPanel config={config} onSave={handleSaveConfig} />}

      {/* Pending */}
      <div className="space-y-3">
        {pending.length === 0 && (
          <div className="text-center py-10 text-gray-400 dark:text-gray-600">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
            <p className="text-sm">Sin solicitudes pendientes.</p>
          </div>
        )}

        {pending.map(item => {
          const { Icon } = STATUS_MAP[item.status];
          return (
            <div
              key={item.id}
              className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 shadow-sm space-y-3"
            >
              <div className="flex flex-wrap items-start gap-3">
                <span className={cn("px-2.5 py-1 rounded-lg text-xs font-medium shrink-0", TYPE_COLOR[item.type])}>
                  {TYPE_LABEL[item.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white leading-snug">{item.description}</p>
                  {item.amount !== undefined && (
                    <p className="text-sm text-[#00B4A6] dark:text-[#4a9e78] font-semibold mt-0.5">{fmt(item.amount)}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Icon className={cn("w-4 h-4", STATUS_MAP[item.status].color)} />
                  <span className={cn("text-xs font-medium", STATUS_MAP[item.status].color)}>
                    {STATUS_MAP[item.status].label}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 dark:text-gray-500">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {item.requestedBy}
                </span>
                <span>{fmtDate(item.createdAt)}</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setResolving({ item, decision: "aprobado" })}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#245a41] transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  Aprobar
                </button>
                <button
                  onClick={() => setResolving({ item, decision: "rechazado" })}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Rechazar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* History toggle */}
      {history.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Historial ({history.length})
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2">
              {history.map(item => {
                const { Icon, color, label } = STATUS_MAP[item.status];
                return (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-card border border-gray-100 dark:border-card-border/50 rounded-xl p-3 opacity-75"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("px-2 py-0.5 rounded-lg text-xs font-medium", TYPE_COLOR[item.type])}>
                        {TYPE_LABEL[item.type]}
                      </span>
                      <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0">{item.description}</p>
                      <span className={cn("flex items-center gap-1 text-xs font-medium shrink-0", color)}>
                        <Icon className="w-3 h-3" /> {label}
                      </span>
                    </div>
                    {item.note && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                        Nota: {item.note}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {item.requestedBy} &middot; {item.resolvedAt ? fmtDate(item.resolvedAt) : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Resolve modal */}
      {resolving && (
        <ResolveModal
          item={resolving.item}
          decision={resolving.decision}
          onConfirm={handleResolve}
          onCancel={() => setResolving(null)}
        />
      )}
    </div>
  );
}
