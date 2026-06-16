"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo } from "react";
import { Field } from "@/components/admin/shared/Field";
import { CheckCircle, XCircle, Clock, Settings, ChevronDown, ChevronUp, User } from "@buleje/design-system/icons";
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

const ITEMS_KEY  = "buleje_approval_items";
const CONFIG_KEY = "buleje_approval_config";

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
  compra:        "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
  eliminacion:   "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]",
  cambio_precio: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]",
};

const STATUS_MAP: Record<PendingStatus, { label: string; color: string; Icon: typeof Clock }> = {
  pendiente: { label: "Pendiente",  color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",   Icon: Clock },
  aprobado:  { label: "Aprobado",   color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", Icon: CheckCircle },
  rechazado: { label: "Rechazado",  color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",       Icon: XCircle },
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
    <div className="modal-backdrop flex items-center justify-center p-4">
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl w-full max-w-md p-6 space-y-4">
        <CardTitle className="text-base font-semibold text-[var(--text-primary)]">
          {decision === "aprobado" ? "Aprobar solicitud" : "Rechazar solicitud"}
        </CardTitle>
        <p className="text-sm text-[var(--text-secondary)]">{item.description}</p>
        <Field label="Nota (opcional)" labelClassName="text-xs font-medium text-[var(--text-tertiary)]" className="space-y-1">
          <textarea
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={decision === "aprobado" ? "Todo correcto, proceder..." : "Motivo del rechazo..."}
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(note)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors",
              decision === "aprobado" ? "bg-primary hover:bg-primary-dark" : "bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)]"
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
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-5 space-y-4">
      <p className="text-sm font-semibold text-[var(--text-secondary)]">Que requiere aprobacion</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Compras mayores a (S/)" labelClassName="text-xs font-medium text-[var(--text-tertiary)]" className="space-y-1">
          <input
            type="number"
            value={local.purchaseThreshold}
            min={0}
            onChange={e => setLocal(c => ({ ...c, purchaseThreshold: Number(e.target.value) }))}
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        <Field label="Cambio de precio mayor a (%)" labelClassName="text-xs font-medium text-[var(--text-tertiary)]" className="space-y-1">
          <input
            type="number"
            value={local.priceChangeThreshold}
            min={0}
            max={100}
            onChange={e => setLocal(c => ({ ...c, priceChangeThreshold: Number(e.target.value) }))}
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        <div className="space-y-1">
          <span className="text-xs font-medium text-[var(--text-tertiary)]">
            Eliminaciones de productos
          </span>
          <button
            onClick={() => setLocal(c => ({ ...c, requireDeleteApproval: !c.requireDeleteApproval }))}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors",
              local.requireDeleteApproval
                ? "border-primary bg-primary/10 text-primary dark:text-[#4a9e78]"
                : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]"
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
            "px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors",
            saved ? "bg-[var(--accent-soft)]" : "bg-primary hover:bg-primary-dark"
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
          <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">Flujo de Aprobaciones</SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            {pending.length} pendiente{pending.length !== 1 ? "s" : ""} de revision
          </p>
        </div>
        <button
          onClick={() => setShowConfig(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] text-sm hover:bg-[var(--surface-sunken)] transition-colors"
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
          <div className="text-center py-10 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-[var(--data-success-500)]" />
            <p className="text-sm">Sin solicitudes pendientes.</p>
          </div>
        )}

        {pending.map(item => {
          const { Icon } = STATUS_MAP[item.status];
          return (
            <div
              key={item.id}
              className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4  space-y-3"
            >
              <div className="flex flex-wrap items-start gap-3">
                <span className={cn("px-2.5 py-1 rounded-lg text-xs font-medium shrink-0", TYPE_COLOR[item.type])}>
                  {TYPE_LABEL[item.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] leading-snug">{item.description}</p>
                  {item.amount !== undefined && (
                    <p className="text-sm text-primary dark:text-[#4a9e78] font-semibold mt-0.5">{fmt(item.amount)}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Icon className={cn("w-4 h-4", STATUS_MAP[item.status].color)} />
                  <span className={cn("text-xs font-medium", STATUS_MAP[item.status].color)}>
                    {STATUS_MAP[item.status].label}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-tertiary)]">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {item.requestedBy}
                </span>
                <span>{fmtDate(item.createdAt)}</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setResolving({ item, decision: "aprobado" })}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  Aprobar
                </button>
                <button
                  onClick={() => setResolving({ item, decision: "rechazado" })}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] text-sm font-medium hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 transition-colors"
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
            className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] dark:hover:text-[var(--text-tertiary)] transition-colors"
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
                    className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)]/50 rounded-xl p-3 opacity-75"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("px-2 py-0.5 rounded-lg text-xs font-medium", TYPE_COLOR[item.type])}>
                        {TYPE_LABEL[item.type]}
                      </span>
                      <p className="text-sm text-[var(--text-secondary)] flex-1 min-w-0">{item.description}</p>
                      <span className={cn("flex items-center gap-1 text-xs font-medium shrink-0", color)}>
                        <Icon className="w-3 h-3" /> {label}
                      </span>
                    </div>
                    {item.note && (
                      <p className="text-xs text-[var(--text-tertiary)] mt-1.5">
                        Nota: {item.note}
                      </p>
                    )}
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
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
