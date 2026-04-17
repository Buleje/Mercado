"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Search, Plus, X, ChevronLeft, ChevronRight, Loader2, AlertTriangle,
  Calendar, DollarSign, FileX, Download, ArrowUpDown, ArrowUp,
  ArrowDown, Copy, LayoutGrid, LayoutList, Trash2, Send, TrendingUp,
  TrendingDown, Filter, CheckSquare, FileText, Receipt, CreditCard,
  Keyboard, History, AlertCircle, Minus, Package,
  MessageCircle, ShieldCheck, ShieldAlert, ShieldX, BookmarkPlus,
  Bookmark, FileDown, Activity, Users, Kanban,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type NCStatus = "BORRADOR" | "EMITIDA" | "ANULADA";

type NotaCredito = {
  id: string;
  numero: string;
  tenantId: string;
  orderId?: string;
  saleId?: string;
  orderNumero?: string;
  codigoMotivo: string;
  descripcionMotivo: string;
  monto: number;
  igv: number;
  total: number;
  notas?: string;
  status: NCStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  emitidaPor?: string;
  anuladaPor?: string;
  emitidaAt?: string;
  anuladaAt?: string;
  clienteNombre?: string;
  clienteDocumento?: string;
  items?: Array<{ nombre: string; cantidad: number; precio: number }>;
};

type SaleDoc = {
  id: string;
  numero: string;
  comprobanteTipo: "ticket" | "boleta" | "factura";
  comprobanteNumero: string;
  fecha: string;
  total: number;
  clienteNombre: string;
  clienteDocumento: string;
  items: Array<{
    id: string;
    nombre: string;
    cantidad: number;
    precio: number;
    cantidadDevolver: number;
    selected: boolean;
  }>;
};

type PickerDocType = "all" | "factura" | "boleta" | "ticket";
type DocType = "all" | "factura" | "boleta" | "nota_credito";
type SortField = "numero" | "total" | "createdAt" | "status";
type SortDir = "asc" | "desc";
type ViewMode = "table" | "cards" | "kanban";

type NCTemplate = {
  id: string;
  name: string;
  codigoMotivo: string;
  descripcionMotivo: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<NCStatus, { label: string; color: string; bg: string; dot: string }> = {
  BORRADOR: { label: "Borrador", color: "text-gray-700", bg: "bg-gray-100", dot: "bg-gray-400" },
  EMITIDA:  { label: "Emitida",  color: "text-emerald-700", bg: "bg-emerald-100", dot: "bg-emerald-500" },
  ANULADA:  { label: "Anulada",  color: "text-red-700", bg: "bg-red-100", dot: "bg-red-500" },
};

const DOC_STYLE: Record<string, { bg: string; border: string; icon: string; badge: string; label: string; accent: string }> = {
  factura: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "\u{1F4CB}", badge: "bg-emerald-100 text-emerald-700", label: "Factura", accent: "text-emerald-600" },
  boleta:  { bg: "bg-emerald-50", border: "border-emerald-200", icon: "\u{1F4C4}", badge: "bg-emerald-100 text-emerald-700", label: "Boleta", accent: "text-emerald-600" },
  ticket:  { bg: "bg-amber-50", border: "border-amber-200", icon: "\u{1F3AB}", badge: "bg-amber-100 text-amber-700", label: "Ticket", accent: "text-amber-600" },
};

const PICKER_TABS: { id: PickerDocType; label: string; icon: string }[] = [
  { id: "all", label: "Todos", icon: "\u{1F4D1}" },
  { id: "factura", label: "Facturas", icon: "\u{1F4CB}" },
  { id: "boleta", label: "Boletas", icon: "\u{1F4C4}" },
  { id: "ticket", label: "Tickets", icon: "\u{1F3AB}" },
];

const DOC_TYPES: { id: DocType; label: string; icon: React.ElementType; prefix: string }[] = [
  { id: "all", label: "Todos", icon: FileText, prefix: "" },
  { id: "factura", label: "Facturas", icon: Receipt, prefix: "F001" },
  { id: "boleta", label: "Boletas", icon: FileText, prefix: "B001" },
  { id: "nota_credito", label: "Notas de Cr\u00e9dito", icon: CreditCard, prefix: "NC01" },
];

const MOTIVOS_SUNAT = [
  { code: "01", label: "Anulaci\u00f3n de la operaci\u00f3n", icon: "\u{1F6AB}", desc: "Se cancela toda la operaci\u00f3n" },
  { code: "02", label: "Anulaci\u00f3n por error en el RUC", icon: "\u{1F522}", desc: "RUC incorrecto en el comprobante" },
  { code: "03", label: "Correcci\u00f3n por error en la descripci\u00f3n", icon: "\u270F\uFE0F", desc: "Texto o descripci\u00f3n equivocada" },
  { code: "04", label: "Descuento global", icon: "\u{1F4B0}", desc: "Descuento aplicado al total" },
  { code: "05", label: "Descuento por \u00edtem", icon: "\u{1F3F7}\uFE0F", desc: "Descuento en productos espec\u00edficos" },
  { code: "06", label: "Devoluci\u00f3n total", icon: "\u21A9\uFE0F", desc: "Devuelve todos los productos" },
  { code: "07", label: "Devoluci\u00f3n parcial", icon: "\u{1F4E6}", desc: "Devuelve algunos productos" },
  { code: "08", label: "Bonificaci\u00f3n", icon: "\u{1F381}", desc: "Productos regalados o de cortes\u00eda" },
  { code: "09", label: "Disminuci\u00f3n en el valor", icon: "\u{1F4C9}", desc: "Se reduce el precio original" },
  { code: "10", label: "Otros conceptos", icon: "\u{1F4DD}", desc: "Otro motivo no listado" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function getDocIcon(numero: string): string {
  if (numero.startsWith("F")) return "\u{1F9FE}";
  if (numero.startsWith("B")) return "\u{1F4C4}";
  if (numero.startsWith("NC")) return "\u{1F4CB}";
  return "\u{1F4CE}";
}

const PER_PAGE = 15;

// ── Keyboard Shortcuts Hook ─────────────────────────────────────────────────

function useKeyboardShortcuts(handlers: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const key = e.key.toLowerCase();
      if (handlers[key]) { e.preventDefault(); handlers[key](); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlers]);
}

// ── StatusTimeline ──────────────────────────────────────────────────────────

function StatusTimeline({ nc }: { nc: NotaCredito }) {
  const steps = [
    { label: "Creada", date: nc.createdAt, by: nc.createdBy, done: true },
    { label: "Emitida", date: nc.emitidaAt, by: nc.emitidaPor, done: nc.status === "EMITIDA" || nc.status === "ANULADA" },
    { label: nc.status === "ANULADA" ? "Anulada" : "Pagada", date: nc.anuladaAt, by: nc.anuladaPor, done: nc.status === "ANULADA" },
  ];
  return (
    <div className="relative pl-6 space-y-4">
      <div className="absolute left-2.75 top-2 bottom-2 w-0.5 bg-gray-200" />
      {steps.map((step, i) => (
        <div key={i} className="relative flex items-start gap-3">
          <div className={cn("absolute -left-3.25 w-4 h-4 rounded-full border-2 flex items-center justify-center",
            step.done ? "bg-primary border-primary" : "bg-white border-[var(--rule-base)]")}>
            {step.done && <span className="text-white text-[length:var(--ts-2xs)]">{"\u2713"}</span>}
          </div>
          <div>
            <p className={cn("text-xs font-bold", step.done ? "text-gray-900" : "text-gray-400")}>{step.label}</p>
            {step.date && <p className="text-[length:var(--ts-2xs)] text-gray-400">{formatDateTime(step.date)}</p>}
            {step.by && <p className="text-[length:var(--ts-2xs)] text-gray-400">Por: {step.by}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── NCCard ──────────────────────────────────────────────────────────────────

function NCCard({ nc, onSelect, selected, onToggle }: { nc: NotaCredito; onSelect: () => void; selected: boolean; onToggle: () => void }) {
  const meta = STATUS_META[nc.status];
  return (
    <m.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className={cn("bg-white border rounded-xl p-4 cursor-pointer transition-all hover:shadow-sm",
        selected ? "border-primary ring-2 ring-primary/20" : "border-[var(--rule-base)]")}>
      <div className="flex items-start gap-3">
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={cn("w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
            selected ? "bg-primary border-primary text-white" : "border-[var(--rule-base)]")}>
          {selected && <span className="text-[length:var(--ts-2xs)]">{"\u2713"}</span>}
        </button>
        <div className="flex-1 min-w-0" onClick={onSelect}>
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1.5">
              <span className="text-lg">{getDocIcon(nc.numero)}</span>
              <span className="font-mono text-xs font-bold text-gray-900">{nc.numero}</span>
            </span>
            <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-lg text-[length:var(--ts-2xs)] font-bold", meta.bg, meta.color)}>
              <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
              {meta.label}
            </span>
          </div>
          <p className="text-xs text-gray-600 truncate mb-1">[{nc.codigoMotivo}] {nc.descripcionMotivo}</p>
          {nc.clienteNombre && <p className="text-[length:var(--ts-2xs)] text-gray-400 mb-1">{nc.clienteNombre}</p>}
          {nc.orderNumero && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[length:var(--ts-2xs)] font-bold bg-emerald-50 text-emerald-600 mb-2">
              {"\u{1F517}"} {nc.orderNumero}
            </span>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--rule-soft)]">
            <span className="text-[length:var(--ts-2xs)] text-gray-400">{formatDate(nc.createdAt)}</span>
            <span className="text-sm font-bold text-gray-900">{formatCurrency(nc.total)}</span>
          </div>
        </div>
      </div>
    </m.div>
  );
}

// ── StaleDraftsBanner ───────────────────────────────────────────────────────

function StaleDraftsBanner({ notas, onFilter }: { notas: NotaCredito[]; onFilter: () => void }) {
  // Capture "now" once per mount via lazy state init (avoids impure Date.now() during render)
  const [nowTs] = useState(() => Date.now());
  const stale = notas.filter(nc => nc.status === "BORRADOR" && (nowTs - new Date(nc.createdAt).getTime()) > 48 * 3600000);
  if (stale.length === 0) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm">
      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
      <span className="text-amber-800">
        Tienes <strong>{stale.length}</strong> borrador{stale.length !== 1 ? "es" : ""} sin emitir desde hace m{"\u00e1"}s de 48 horas.
      </span>
      <button onClick={onFilter} className="ml-auto text-xs font-bold text-amber-600 hover:underline shrink-0">Ver borradores</button>
    </div>
  );
}

// ── WizardProgress ──────────────────────────────────────────────────────────

const WIZARD_STEPS = ["Documento", "Motivo & Items", "Confirmar"] as const;

function WizardProgress({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {WIZARD_STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-2 flex-1">
          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-[var(--dur-base)]",
            i < step ? "bg-primary text-white " :
            i === step ? "bg-primary/10 text-primary border-2 border-primary" :
            "bg-gray-100 text-gray-400")}>
            {i < step ? "\u2713" : i + 1}
          </div>
          <span className={cn("text-xs font-semibold hidden sm:block", i <= step ? "text-gray-900" : "text-gray-400")}>{label}</span>
          {i < WIZARD_STEPS.length - 1 && (
            <div className="flex-1 h-0.5 rounded-full overflow-hidden bg-gray-200">
              <m.div className="h-full bg-primary" initial={{ width: "0%" }} animate={{ width: i < step ? "100%" : "0%" }} transition={{ duration: 0.4 }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── SaleDocCard (Visual Document Picker Card) ───────────────────────────────

function SaleDocCard({ doc, isSelected, onSelect }: { doc: SaleDoc; isSelected: boolean; onSelect: () => void }) {
  const style = DOC_STYLE[doc.comprobanteTipo] || DOC_STYLE.ticket;
  return (
    <m.button type="button" layout onClick={onSelect}
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
      className={cn(
        "w-full text-left rounded-xl border-2 p-4 transition-all duration-[var(--dur-base)] relative overflow-hidden",
        isSelected
          ? "border-primary ring-2 ring-primary/20 bg-primary/5"
          : cn(style.bg, style.border, "hover:shadow-lg")
      )}>
      {/* Color accent strip */}
      <div className={cn("absolute top-0 left-0 w-1.5 h-full rounded-l-2xl", isSelected ? "bg-primary" :
        doc.comprobanteTipo === "factura" ? "bg-emerald-500" : doc.comprobanteTipo === "boleta" ? "bg-emerald-500" : "bg-amber-500"
      )} />
      <div className="flex items-start gap-3 pl-2">
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ",
          isSelected ? "bg-primary/10" : style.badge)}>
          {style.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={cn("px-2 py-0.5 rounded-lg text-[length:var(--ts-2xs)] font-bold", style.badge)}>
              {style.label}
            </span>
            <span className="font-mono text-xs font-bold text-gray-900">
              {doc.comprobanteNumero || `#${doc.numero}`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-gray-500 mb-2">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>{doc.fecha ? formatDate(doc.fecha) : "\u2014"}</span>
            <span className="text-gray-300">{"\u00b7"}</span>
            <span className="truncate">{doc.clienteNombre}</span>
            {doc.clienteDocumento && <span className="text-gray-300">({doc.clienteDocumento})</span>}
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] text-gray-400">
              <Package className="h-3 w-3" />
              {doc.items.length} item{doc.items.length !== 1 ? "s" : ""}
            </span>
            <span className={cn("text-base font-extrabold", isSelected ? "text-primary" : "text-gray-900")}>
              {formatCurrency(doc.total)}
            </span>
          </div>
          {/* Mini item preview */}
          {doc.items.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[var(--rule-base)]/50 flex items-center gap-1 overflow-hidden">
              {doc.items.slice(0, 3).map((it, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-white/70 rounded text-[length:var(--ts-2xs)] text-gray-500 truncate max-w-25 border border-[var(--rule-soft)]">
                  {it.nombre}
                </span>
              ))}
              {doc.items.length > 3 && <span className="text-[length:var(--ts-2xs)] text-gray-400">+{doc.items.length - 3}</span>}
            </div>
          )}
        </div>
        {isSelected && (
          <m.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shrink-0 ">
            <span className="text-xs font-bold">{"\u2713"}</span>
          </m.div>
        )}
      </div>
    </m.button>
  );
}

// ── MotivoCard (Visual Motivo Picker) ───────────────────────────────────────

function MotivoCard({ motivo, selected, onClick }: { motivo: typeof MOTIVOS_SUNAT[number]; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "text-left p-3 rounded-xl border-2 transition-all duration-[var(--dur-base)]",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20 "
          : "border-[var(--rule-base)] hover:border-gray-300 hover:bg-gray-50"
      )}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{motivo.icon}</span>
        <span className={cn("text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded",
          selected ? "bg-primary text-white" : "bg-gray-100 text-gray-500")}>{motivo.code}</span>
      </div>
      <p className={cn("text-xs font-semibold mb-0.5", selected ? "text-primary" : "text-gray-700")}>{motivo.label}</p>
      <p className="text-[length:var(--ts-2xs)] text-gray-400 leading-tight">{motivo.desc}</p>
    </button>
  );
}

// ── AmountBreakdown (Visual Amount Bar) ─────────────────────────────────────

function AmountBreakdown({ monto, igv, total, originalTotal }: { monto: number; igv: number; total: number; originalTotal?: number }) {
  const pct = originalTotal && originalTotal > 0 ? Math.min(100, (total / originalTotal) * 100) : 100;
  return (
    <div className="space-y-3">
      {originalTotal != null && originalTotal > 0 && (
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-gray-400">NC respecto al documento original</span>
            <span className="font-bold text-gray-700">{pct.toFixed(0)}%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <m.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full bg-[var(--data-error)]" />
          </div>
          <div className="flex justify-between text-[length:var(--ts-2xs)] text-gray-400 mt-1">
            <span>NC: {formatCurrency(total)}</span>
            <span>Original: {formatCurrency(originalTotal)}</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-gray-400 mb-1">Monto</p>
          <p className="text-lg font-extrabold text-gray-900">{formatCurrency(monto)}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-amber-500 mb-1">IGV 18%</p>
          <p className="text-lg font-extrabold text-amber-600">{formatCurrency(igv)}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 text-center border border-red-200">
          <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-red-400 mb-1">Total NC</p>
          <p className="text-lg font-extrabold text-red-600">{formatCurrency(total)}</p>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main Component ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export default function NotasCreditoModule() {
  // ── Main list state ───────────────────────────────────────────────────────
  const [notas, setNotas] = useState<NotaCredito[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<NCStatus | "">("");
  const [docTypeFilter, setDocTypeFilter] = useState<DocType>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<NotaCredito | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [showAdvFilters, setShowAdvFilters] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [templates, setTemplates] = useState<NCTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem("nc-templates") ?? "[]") as NCTemplate[]; } catch { return []; }
  });
  const [showTemplates, setShowTemplates] = useState(false);

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [showNew, setShowNew] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({ orderId: "", codigoMotivo: "", descripcionMotivo: "", monto: "", notasText: "" });

  // ── Document Picker state (VISUAL) ────────────────────────────────────────
  const [pickerDocs, setPickerDocs] = useState<SaleDoc[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerDocType, setPickerDocType] = useState<PickerDocType>("all");
  const [selectedVenta, setSelectedVenta] = useState<SaleDoc | null>(null);

  const [devolverStock, setDevolverStock] = useState(true);
  const esDevolucion = form.codigoMotivo === "06" || form.codigoMotivo === "07";
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────
  useKeyboardShortcuts(useMemo(() => ({
    n: () => { setShowNew(true); setCreateError(null); setWizardStep(0); setPickerSearch(""); setPickerDocType("all"); },
    f: () => searchRef.current?.focus(),
  }), []));

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showNew) { setShowNew(false); return; }
      if (selected) { setSelected(null); return; }
      if (showShortcuts) { setShowShortcuts(false); return; }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [showNew, selected, showShortcuts]);

  // ── Document Picker Fetch ─────────────────────────────────────────────────
  const fetchPickerDocs = useCallback(async (searchTerm = "") => {
    setPickerLoading(true);
    try {
      const params = new URLSearchParams({ limit: "24" });
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      const res = await fetch(`/api/sales?${params}`);
      if (res.ok) {
        const data = await res.json();
        const sales = (Array.isArray(data) ? data : data.sales ?? data.data ?? []).slice(0, 24);
        setPickerDocs(sales.map((s: Record<string, unknown>) => ({
          id: String(s.id ?? ""),
          numero: String(s.numero ?? s.orderNumber ?? s.id ?? ""),
          comprobanteTipo: (["factura", "boleta", "ticket"].includes(String(s.comprobanteTipo ?? "")) ? String(s.comprobanteTipo) : "ticket") as SaleDoc["comprobanteTipo"],
          comprobanteNumero: String(s.comprobanteNumero ?? ""),
          fecha: String(s.createdAt ?? s.fecha ?? ""),
          total: Number(s.total ?? s.grandTotal ?? 0),
          clienteNombre: String(s.customerName ?? s.clienteNombre ?? "Cliente"),
          clienteDocumento: String(s.customerDocument ?? s.clienteDocumento ?? ""),
          items: (Array.isArray(s.items) ? s.items : []).map((it: Record<string, unknown>) => ({
            id: String(it.productId ?? it.id ?? ""),
            nombre: String(it.name ?? it.productName ?? it.nombre ?? ""),
            cantidad: Number(it.quantity ?? it.cantidad ?? 0),
            precio: Number(it.price ?? it.precio ?? 0),
            cantidadDevolver: Number(it.quantity ?? it.cantidad ?? 0),
            selected: true,
          })),
        })));
      }
    } catch { /* silent */ }
    finally { setPickerLoading(false); }
  }, []);

  useEffect(() => { if (showNew) fetchPickerDocs(); }, [showNew, fetchPickerDocs]);

  useEffect(() => {
    if (!showNew) return;
    const timer = setTimeout(() => fetchPickerDocs(pickerSearch), 400);
    return () => clearTimeout(timer);
  }, [pickerSearch, showNew, fetchPickerDocs]);

  const filteredPickerDocs = useMemo(() => {
    if (pickerDocType === "all") return pickerDocs;
    return pickerDocs.filter(d => d.comprobanteTipo === pickerDocType);
  }, [pickerDocs, pickerDocType]);

  const pickerCounts = useMemo(() => ({
    all: pickerDocs.length,
    factura: pickerDocs.filter(d => d.comprobanteTipo === "factura").length,
    boleta: pickerDocs.filter(d => d.comprobanteTipo === "boleta").length,
    ticket: pickerDocs.filter(d => d.comprobanteTipo === "ticket").length,
  }), [pickerDocs]);

  // ── Auto-monto from selected items ────────────────────────────────────────
  const autoMonto = useMemo(() => {
    if (!selectedVenta) return 0;
    return selectedVenta.items.filter(it => it.selected).reduce((sum, it) => sum + it.cantidadDevolver * it.precio, 0);
  }, [selectedVenta]);

  useEffect(() => {
    if (selectedVenta && autoMonto > 0) {
      setForm(prev => ({ ...prev, monto: autoMonto.toFixed(2) }));
    }
  }, [autoMonto, selectedVenta]);

  const handleItemToggle = (idx: number) => {
    setSelectedVenta(prev => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item) };
    });
  };

  const handleItemQty = (idx: number, qty: number) => {
    setSelectedVenta(prev => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.map((item, i) => i === idx ? { ...item, cantidadDevolver: Math.max(1, Math.min(item.cantidad, qty)) } : item) };
    });
  };

  // ── Main list logic ───────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchNotas = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const res = await fetch(`/api/notas-credito?${params}`);
      if (!res.ok) throw new Error("Error al cargar notas de cr\u00e9dito");
      const data: NotaCredito[] = await res.json();
      setNotas(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally { setLoading(false); }
  }, [statusFilter, debouncedSearch]);

  useEffect(() => { fetchNotas(); }, [fetchNotas]);

  // ── Computed values ───────────────────────────────────────────────────────
  const montoNum = parseFloat(form.monto) || 0;
  const computedIgv = montoNum * 0.18;
  const computedTotal = montoNum + computedIgv;

  const filteredNotas = useMemo(() => {
    let list = [...notas];
    if (dateFrom) list = list.filter(nc => nc.createdAt.slice(0, 10) >= dateFrom);
    if (dateTo) list = list.filter(nc => nc.createdAt.slice(0, 10) <= dateTo);
    if (minAmount) list = list.filter(nc => nc.total >= parseFloat(minAmount));
    if (maxAmount) list = list.filter(nc => nc.total <= parseFloat(maxAmount));
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "numero") cmp = a.numero.localeCompare(b.numero);
      else if (sortField === "total") cmp = a.total - b.total;
      else if (sortField === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortField === "status") cmp = a.status.localeCompare(b.status);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [notas, dateFrom, dateTo, minAmount, maxAmount, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredNotas.length / PER_PAGE));
  const paginated = filteredNotas.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo, minAmount, maxAmount]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-gray-300" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  // ── Bulk operations ───────────────────────────────────────────────────────
  const allChecked = paginated.length > 0 && paginated.every(nc => checkedIds.has(nc.id));
  const someChecked = checkedIds.size > 0;
  const toggleCheck = (id: string) => setCheckedIds(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAll = () => { if (allChecked) setCheckedIds(new Set()); else setCheckedIds(new Set(paginated.map(nc => nc.id))); };

  const exportCSV = () => {
    const items = someChecked ? filteredNotas.filter(nc => checkedIds.has(nc.id)) : filteredNotas;
    const header = "Numero,Motivo,Codigo,Monto,IGV,Total,Status,Fecha\n";
    const rows = items.map(nc => `${nc.numero},"${nc.descripcionMotivo}",${nc.codigoMotivo},${nc.monto},${nc.igv},${nc.total},${nc.status},${nc.createdAt.slice(0, 10)}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `notas-credito-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── CRUD Operations ───────────────────────────────────────────────────────
  const resetWizard = () => {
    setShowNew(false); setWizardStep(0); setCreateError(null);
    setForm({ orderId: "", codigoMotivo: "", descripcionMotivo: "", monto: "", notasText: "" });
    setSelectedVenta(null); setPickerSearch(""); setPickerDocType("all");
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (montoNum <= 0) { setCreateError("Monto inv\u00e1lido"); return; }
    if (!form.codigoMotivo) { setCreateError("Selecciona un motivo"); return; }
    if (!form.descripcionMotivo.trim()) { setCreateError("Descripci\u00f3n del motivo requerida"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/notas-credito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: form.orderId.trim() || undefined,
          motivoCodigo: form.codigoMotivo,
          motivoDesc: form.descripcionMotivo.trim(),
          monto: montoNum,
          notas: form.notasText.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al crear" }));
        throw new Error(typeof err.error === "string" ? err.error : "Error al crear nota de cr\u00e9dito");
      }
      resetWizard();
      fetchNotas();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error desconocido");
    } finally { setCreating(false); }
  };

  const handleDuplicate = (nc: NotaCredito) => {
    setForm({ orderId: nc.saleId ?? nc.orderId ?? "", codigoMotivo: nc.codigoMotivo, descripcionMotivo: nc.descripcionMotivo, monto: String(nc.monto), notasText: nc.notas ?? "" });
    setShowNew(true); setWizardStep(1); setSelected(null);
  };

  const handleEmitSunat = async (nc: NotaCredito) => {
    if (!confirm("\u00bfEmitir nota de cr\u00e9dito a SUNAT? Esta acci\u00f3n no se puede deshacer.")) return;
    try {
      const res = await fetch(`/api/notas-credito/${nc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "EMITIDA" }) });
      if (res.ok) fetchNotas();
    } catch { /* silent */ }
  };

  const handleAnular = async (nc: NotaCredito) => {
    if (!confirm("\u00bfSeguro que quieres anular esta nota de cr\u00e9dito?")) return;
    try {
      const res = await fetch(`/api/notas-credito/${nc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ANULADA" }) });
      if (res.ok) { fetchNotas(); if (selected?.id === nc.id) setSelected(null); }
    } catch { /* silent */ }
  };

  // ── Bulk emit ─────────────────────────────────────────────────────────────
  const handleBulkEmit = async () => {
    const borradores = filteredNotas.filter(nc => checkedIds.has(nc.id) && nc.status === "BORRADOR");
    if (borradores.length === 0) return;
    if (!confirm(`¿Emitir ${borradores.length} nota(s) de crédito a SUNAT?`)) return;
    await Promise.all(borradores.map(nc =>
      fetch(`/api/notas-credito/${nc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "EMITIDA" }) }).catch(() => null)
    ));
    fetchNotas(); setCheckedIds(new Set());
  };

  // ── Templates ─────────────────────────────────────────────────────────────
  const saveTemplate = () => {
    if (!form.codigoMotivo || !form.descripcionMotivo.trim()) return;
    const name = window.prompt("Nombre del template (ej: Devolución Parcial):");
    if (!name?.trim()) return;
    const t: NCTemplate = { id: crypto.randomUUID(), name: name.trim(), codigoMotivo: form.codigoMotivo, descripcionMotivo: form.descripcionMotivo };
    const updated = [...templates, t];
    setTemplates(updated);
    localStorage.setItem("nc-templates", JSON.stringify(updated));
  };

  const deleteTemplate = (id: string) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    localStorage.setItem("nc-templates", JSON.stringify(updated));
  };

  const loadTemplate = (t: NCTemplate) => {
    setForm(prev => ({ ...prev, codigoMotivo: t.codigoMotivo, descripcionMotivo: t.descripcionMotivo }));
    setShowTemplates(false);
  };

  // ── Exportar PDF real ─────────────────────────────────────────────────────
  const exportPDF = async (nc: NotaCredito) => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(45, 106, 79);
    doc.text("NOTA DE CRÉDITO", 105, 22, { align: "center" });
    doc.setDrawColor(45, 106, 79);
    doc.setLineWidth(0.5);
    doc.line(15, 27, 195, 27);
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    const col1 = 20, col2 = 120;
    const rows = [
      ["N° Documento:", nc.numero],
      ["Fecha:", formatDate(nc.createdAt)],
      ["Estado:", STATUS_META[nc.status].label],
      ["Cliente:", nc.clienteNombre ?? "—"],
      ["RUC/DNI:", nc.clienteDocumento ?? "—"],
      ["Doc. referencia:", nc.orderNumero ?? "—"],
    ];
    let y = 38;
    rows.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold"); doc.text(label, col1, y);
      doc.setFont("helvetica", "normal"); doc.text(value, col2, y);
      y += 8;
    });
    y += 4;
    doc.setFont("helvetica", "bold"); doc.text(`[${nc.codigoMotivo}] Motivo:`, col1, y);
    doc.setFont("helvetica", "normal");
    doc.text(nc.descripcionMotivo, col2, y);
    y += 12;
    doc.line(15, y, 195, y); y += 8;
    doc.setFontSize(12);
    const montos = [["Monto base:", formatCurrency(nc.monto)], ["IGV (18%):", formatCurrency(nc.igv)], ["TOTAL NC:", formatCurrency(nc.total)]];
    montos.forEach(([label, value], i) => {
      if (i === 2) { doc.setFontSize(14); doc.setTextColor(220, 38, 38); }
      doc.setFont("helvetica", "bold"); doc.text(label, 110, y);
      doc.text(value, 185, y, { align: "right" });
      y += 9;
    });
    if (nc.notas) { doc.setFontSize(10); doc.setTextColor(120, 120, 120); doc.setFont("helvetica", "italic"); doc.text(`Notas: ${nc.notas}`, col1, y + 8); }
    doc.setFontSize(8); doc.setTextColor(160, 160, 160);
    doc.text("Documento generado por Buleje", 105, 285, { align: "center" });
    doc.save(`NC-${nc.numero}-${nc.createdAt.slice(0, 10)}.pdf`);
  };

  // ── Enviar por WhatsApp ───────────────────────────────────────────────────
  const sendWhatsApp = (nc: NotaCredito) => {
    const text = `*Nota de Crédito ${nc.numero}*\nMotivo: [${nc.codigoMotivo}] ${nc.descripcionMotivo}\nCliente: ${nc.clienteNombre ?? "—"}\nTotal: ${formatCurrency(nc.total)}\nEstado: ${STATUS_META[nc.status].label}\nFecha: ${formatDate(nc.createdAt)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

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
    for (const nc of ncMes) { const m = MOTIVOS_SUNAT.find(x => x.code === nc.codigoMotivo)?.label ?? nc.codigoMotivo; motivoCounts[m] = (motivoCounts[m] ?? 0) + 1; }
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
      const desc = MOTIVOS_SUNAT.find(m => m.code === nc.codigoMotivo)?.label || nc.descripcionMotivo || "Otro";
      const existing = motivoMap.get(nc.codigoMotivo);
      if (existing) existing.count++; else motivoMap.set(nc.codigoMotivo, { desc, count: 1 });
    }
    const motivoColors: Record<string, string> = { "01": "#ef4444", "06": "#f97316", "07": "#f97316", "02": "#3b82f6", "03": "#3b82f6", "04": "#8b5cf6", "05": "#8b5cf6" };
    return Array.from(motivoMap.entries()).map(([code, { desc, count }]) => ({ name: desc, value: count, color: motivoColors[code] || "#9ca3af" }));
  }, [notas]);

  const activeFilterCount = [statusFilter, dateFrom, dateTo, minAmount, maxAmount].filter(Boolean).length;

  // ── Semáforo de salud ─────────────────────────────────────────────────────
  const semaforo = useMemo(() => {
    if (kpis.count === 0) return { nivel: "verde", label: "Normal", Icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-50" };
    if (kpis.trend > 50) return { nivel: "rojo", label: "Alto", Icon: ShieldX, color: "text-red-500", bg: "bg-red-50" };
    if (kpis.trend > 20) return { nivel: "amarillo", label: "Atención", Icon: ShieldAlert, color: "text-amber-500", bg: "bg-amber-50" };
    return { nivel: "verde", label: "Normal", Icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-50" };
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

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER ────────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary text-white flex items-center justify-center  shrink-0">
            <FileX className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Notas de Cr{"\u00e9"}dito</h1>
            <p className="text-sm text-gray-500">Centro de documentos {"\u2014"} anulaciones, devoluciones y ajustes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowShortcuts(s => !s)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors hidden sm:block" title="Atajos de teclado">
            <Keyboard className="h-4 w-4" />
          </button>
          <button onClick={() => { setShowNew(true); setCreateError(null); setWizardStep(0); setPickerSearch(""); setPickerDocType("all"); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark  transition-colors shrink-0">
            <Plus className="h-4 w-4" />
            Nueva NC
          </button>
        </div>
      </div>

      {/* ── Keyboard Shortcuts Panel ───────────────────────────────────── */}
      {showShortcuts && (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3 text-xs text-gray-500">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[length:var(--ts-2xs)]">N</kbd> Nueva NC</div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[length:var(--ts-2xs)]">F</kbd> Buscar</div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[length:var(--ts-2xs)]">Esc</kbd> Cerrar</div>
          </div>
        </div>
      )}

      {/* ── Stale Drafts Banner ────────────────────────────────────────── */}
      <StaleDraftsBanner notas={notas} onFilter={() => setStatusFilter("BORRADOR")} />

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      {!loading && notas.length > 0 && (
        <div className="space-y-3">
          {/* Semáforo de salud */}
          <div className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold", semaforo.bg,
            semaforo.nivel === "rojo" ? "border-red-200" :
            semaforo.nivel === "amarillo" ? "border-amber-200" :
            "border-emerald-200")}>
            <semaforo.Icon className={cn("h-4 w-4 shrink-0", semaforo.color)} />
            <span className={semaforo.color}>Salud de devoluciones: <strong>{semaforo.label}</strong></span>
            <span className="text-gray-400 text-xs font-normal ml-1">
              {semaforo.nivel === "rojo" ? "Las devoluciones subieron más del 50% vs el mes pasado" :
               semaforo.nivel === "amarillo" ? "Las devoluciones están un poco por encima del mes pasado" :
               "Todo dentro de lo normal este mes"}
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3">
              <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-gray-400 mb-1">NC este mes</p>
              <p className="text-2xl font-extrabold text-gray-900">{kpis.count}</p>
              <p className="text-[length:var(--ts-2xs)] text-gray-400 mt-0.5">{notas.filter(nc => nc.status === "BORRADOR").length} borradores pendientes</p>
            </div>
            <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3">
              <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-gray-400 mb-1">Monto devuelto</p>
              <p className="text-2xl font-extrabold text-red-600">{formatCurrency(kpis.total)}</p>
              <p className="text-[length:var(--ts-2xs)] text-gray-400 mt-0.5">solo NCs emitidas este mes</p>
            </div>
            <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3">
              <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-gray-400 mb-1">vs Mes anterior</p>
              <div className="flex items-center gap-1">
                {kpis.trend > 0 ? <TrendingUp className="h-4 w-4 text-red-500" /> : <TrendingDown className="h-4 w-4 text-emerald-500" />}
                <p className={cn("text-2xl font-extrabold", kpis.trend > 0 ? "text-red-600" : "text-emerald-600")}>{kpis.trend > 0 ? "+" : ""}{kpis.trend.toFixed(0)}%</p>
              </div>
              <p className="text-[length:var(--ts-2xs)] text-gray-400 mt-0.5">{kpis.trend > 0 ? "subió" : "bajó"} respecto al mes pasado</p>
            </div>
            <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3">
              <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-gray-400 mb-1">Top motivo</p>
              <p className="text-sm font-bold text-gray-900 truncate">{kpis.topMotivo ? kpis.topMotivo[0] : "\u2014"}</p>
              {kpis.topMotivo && <p className="text-[length:var(--ts-2xs)] text-gray-400">{kpis.topMotivo[1]} casos este mes</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Trend Chart + Donut + Weekday ──────────────────────────────── */}
      {!loading && trendData.length > 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 bg-white border border-[var(--rule-base)] rounded-xl p-4">
            <p className="text-xs font-bold text-gray-700 mb-2">NC por semana ({"\u00fa"}ltimos 3 meses)</p>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Line type="monotone" dataKey="count" stroke="#00B4A6" strokeWidth={2} dot={{ r: 3, fill: "#00B4A6" }} />
                <RechartsTooltip />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-3">
            {donutData.length > 1 && (
              <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 flex-1">
                <p className="text-xs font-bold text-gray-700 mb-1">Motivos del mes</p>
                <ResponsiveContainer width="100%" height={80}>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" cx="50%" cy="50%" innerRadius={20} outerRadius={36} paddingAngle={2}>
                      {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-0.5">
                  {donutData.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-gray-600">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="truncate">{d.name}: {d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Días con más devoluciones */}
            <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 flex-1">
              <p className="text-xs font-bold text-gray-700 mb-1">Días con más devoluciones</p>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={weekdayData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                  <Bar dataKey="count" fill="#00B4A6" radius={[3, 3, 0, 0]} />
                  <RechartsTooltip />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Doc Type Tabs + Search + Filters ───────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {DOC_TYPES.map(dt => {
            const Icon = dt.icon;
            return (
              <button key={dt.id} onClick={() => setDocTypeFilter(dt.id)}
                className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap",
                  docTypeFilter === dt.id ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
                <Icon className="h-3.5 w-3.5" />
                {dt.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input ref={searchRef} type="text" placeholder="Buscar por n\u00famero, cliente, RUC/DNI..."
              aria-label="Buscar documentos" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex gap-1 items-center">
            {(["", "BORRADOR", "EMITIDA", "ANULADA"] as const).map(s => {
              const count = s === "" ? filteredNotas.length : filteredNotas.filter(n => n.status === s).length;
              return (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={cn("shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5",
                    statusFilter === s ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
                  {s === "" ? "Todos" : STATUS_META[s].label}
                  {count > 0 && <span className={cn("px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold min-w-4.5 text-center", statusFilter === s ? "bg-white/20" : "bg-gray-200")}>{count}</span>}
                </button>
              );
            })}
            <button onClick={() => setShowAdvFilters(s => !s)}
              className={cn("p-2 rounded-lg transition-colors relative", showAdvFilters ? "bg-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>
              <Filter className="h-4 w-4" />
              {activeFilterCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[length:var(--ts-2xs)] font-bold flex items-center justify-center">{activeFilterCount}</span>}
            </button>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1">
              {([["table", LayoutList], ["cards", LayoutGrid], ["kanban", Kanban]] as const).map(([mode, Icon]) => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  title={mode === "table" ? "Tabla" : mode === "cards" ? "Tarjetas" : "Kanban"}
                  className={cn("p-1.5 rounded-lg transition-colors", viewMode === mode ? "bg-white text-primary " : "text-gray-500 hover:text-gray-700")}>
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showAdvFilters && (
            <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-50 rounded-xl p-3">
                <div>
                  <label className="text-[length:var(--ts-2xs)] font-bold text-gray-400 block mb-1">Desde</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white text-xs text-gray-900" />
                </div>
                <div>
                  <label className="text-[length:var(--ts-2xs)] font-bold text-gray-400 block mb-1">Hasta</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white text-xs text-gray-900" />
                </div>
                <div>
                  <label className="text-[length:var(--ts-2xs)] font-bold text-gray-400 block mb-1">Monto min</label>
                  <input type="number" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="0"
                    className="w-full px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white text-xs text-gray-900" />
                </div>
                <div>
                  <label className="text-[length:var(--ts-2xs)] font-bold text-gray-400 block mb-1">Monto max</label>
                  <input type="number" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} placeholder={"\u221e"}
                    className="w-full px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white text-xs text-gray-900" />
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bulk Actions Bar ───────────────────────────────────────────── */}
      <AnimatePresence>
        {someChecked && (
          <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
              <CheckSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-primary">{checkedIds.size} seleccionado{checkedIds.size !== 1 ? "s" : ""}</span>
              <div className="flex-1" />
              {filteredNotas.filter(nc => checkedIds.has(nc.id) && nc.status === "BORRADOR").length > 0 && (
                <button onClick={handleBulkEmit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                  <Send className="h-3.5 w-3.5" />Emitir {filteredNotas.filter(nc => checkedIds.has(nc.id) && nc.status === "BORRADOR").length} NC
                </button>
              )}
              <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-[var(--rule-base)] text-gray-700 hover:bg-gray-50 transition-colors">
                <Download className="h-3.5 w-3.5" />Exportar CSV
              </button>
              <button onClick={() => setCheckedIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Deseleccionar</button>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* ── Kanban View ────────────────────────────────────────────────── */}
      {!loading && !error && viewMode === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["BORRADOR", "EMITIDA", "ANULADA"] as NCStatus[]).map(status => {
            const col = filteredNotas.filter(nc => nc.status === status);
            const meta = STATUS_META[status];
            return (
              <div key={status} className="bg-gray-50 border border-[var(--rule-base)] rounded-xl overflow-hidden">
                <div className={cn("px-4 py-3 flex items-center gap-2 border-b border-[var(--rule-base)]", meta.bg)}>
                  <span className={cn("w-2 h-2 rounded-full shrink-0", meta.dot)} />
                  <span className={cn("text-xs font-bold", meta.color)}>{meta.label}</span>
                  <span className={cn("ml-auto px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-white/60", meta.color)}>{col.length}</span>
                </div>
                <div className="p-2 space-y-2 max-h-130 overflow-y-auto">
                  {col.length === 0 ? (
                    <div className="text-center py-8 text-gray-300">
                      <p className="text-2xl mb-1">{"\u{1F4C4}"}</p>
                      <p className="text-[length:var(--ts-2xs)]">Sin NCs en {meta.label}</p>
                    </div>
                  ) : col.map(nc => (
                    <m.div key={nc.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      onClick={() => setSelected(nc)}
                      className="bg-white border border-[var(--rule-base)] rounded-lg p-3 cursor-pointer hover:shadow-sm hover:border-primary/40 transition-all">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[length:var(--ts-2xs)] font-bold text-gray-500">{nc.numero}</span>
                        <span className="text-sm font-extrabold text-gray-900">{formatCurrency(nc.total)}</span>
                      </div>
                      <p className="text-xs text-gray-600 truncate mb-1">[{nc.codigoMotivo}] {nc.descripcionMotivo}</p>
                      {nc.clienteNombre && <p className="text-[length:var(--ts-2xs)] text-gray-400 truncate">{nc.clienteNombre}</p>}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--rule-soft)]">
                        <span className="text-[length:var(--ts-2xs)] text-gray-400">{formatDate(nc.createdAt)}</span>
                        <div className="flex gap-1">
                          {nc.status === "BORRADOR" && (
                            <button onClick={(e) => { e.stopPropagation(); handleEmitSunat(nc); }}
                              className="p-1 rounded hover:bg-emerald-50 text-emerald-500" title="Emitir">
                              <Send className="h-3 w-3" />
                            </button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); handleDuplicate(nc); }}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400" title="Duplicar">
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </m.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Table / Cards View ─────────────────────────────────────────── */}
      {viewMode !== "kanban" && (
      <div className="bg-white border border-[var(--rule-base)] rounded-xl overflow-hidden ">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={fetchNotas} className="text-xs text-primary hover:underline font-semibold mt-1">Reintentar</button>
          </div>
        ) : filteredNotas.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="text-6xl mb-4">{"\u{1F4C4}"}</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Sin notas de cr{"\u00e9"}dito</h3>
            <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">Las notas de cr{"\u00e9"}dito se crean al hacer devoluciones, anulaciones o ajustes a documentos existentes</p>
            <button onClick={() => { setShowNew(true); setCreateError(null); setWizardStep(0); }} className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-dark">Crear NC</button>
          </div>
        ) : viewMode === "cards" ? (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence>
              {paginated.map(nc => (
                <NCCard key={nc.id} nc={nc} onSelect={() => setSelected(nc)} selected={checkedIds.has(nc.id)} onToggle={() => toggleCheck(nc.id)} />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-175 text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule-soft)] text-left">
                    <th className="px-3 py-3 w-10">
                      <button onClick={toggleAll} className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                        allChecked ? "bg-primary border-primary text-white" : "border-[var(--rule-base)]")}>
                        {allChecked && <span className="text-[length:var(--ts-2xs)]">{"\u2713"}</span>}
                      </button>
                    </th>
                    <th className="px-3 py-3 font-semibold text-gray-500 cursor-pointer select-none" onClick={() => toggleSort("numero")}>
                      <span className="flex items-center gap-1">Documento <SortIcon field="numero" /></span>
                    </th>
                    <th className="px-3 py-3 font-semibold text-gray-500 hidden sm:table-cell">Referencia</th>
                    <th className="px-3 py-3 font-semibold text-gray-500">Motivo</th>
                    <th className="px-3 py-3 font-semibold text-gray-500 text-right cursor-pointer select-none" onClick={() => toggleSort("total")}>
                      <span className="flex items-center gap-1 justify-end">Total <SortIcon field="total" /></span>
                    </th>
                    <th className="px-3 py-3 font-semibold text-gray-500 cursor-pointer select-none" onClick={() => toggleSort("status")}>
                      <span className="flex items-center gap-1">Estado <SortIcon field="status" /></span>
                    </th>
                    <th className="px-3 py-3 font-semibold text-gray-500 hidden md:table-cell cursor-pointer select-none" onClick={() => toggleSort("createdAt")}>
                      <span className="flex items-center gap-1">Fecha <SortIcon field="createdAt" /></span>
                    </th>
                    <th className="px-3 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(nc => {
                    const meta = STATUS_META[nc.status];
                    return (
                      <tr key={nc.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                        <td className="px-3 py-3">
                          <button onClick={() => toggleCheck(nc.id)} className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                            checkedIds.has(nc.id) ? "bg-primary border-primary text-white" : "border-[var(--rule-base)]")}>
                            {checkedIds.has(nc.id) && <span className="text-[length:var(--ts-2xs)]">{"\u2713"}</span>}
                          </button>
                        </td>
                        <td className="px-3 py-3 cursor-pointer" onClick={() => setSelected(nc)}>
                          <span className="flex items-center gap-2">
                            <span className="text-base">{getDocIcon(nc.numero)}</span>
                            <span className="font-mono text-xs font-bold text-gray-900">{nc.numero}</span>
                          </span>
                          {nc.clienteNombre && <p className="text-[length:var(--ts-2xs)] text-gray-400 mt-0.5">{nc.clienteNombre}</p>}
                        </td>
                        <td className="px-3 py-3 hidden sm:table-cell">
                          {nc.orderNumero ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[length:var(--ts-2xs)] font-bold bg-emerald-50 text-emerald-600">
                              {"\u{1F517}"} {nc.orderNumero}
                            </span>
                          ) : <span className="text-gray-300">{"\u2014"}</span>}
                        </td>
                        <td className="px-3 py-3 text-gray-700 truncate max-w-45">
                          <span className="text-xs text-gray-400 mr-1">[{nc.codigoMotivo}]</span>
                          {nc.descripcionMotivo}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-gray-900">{formatCurrency(nc.total)}</td>
                        <td className="px-3 py-3">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold", meta.bg, meta.color)}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-gray-500 hidden md:table-cell text-xs">{formatDate(nc.createdAt)}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {nc.status === "BORRADOR" && (
                              <button onClick={(e) => { e.stopPropagation(); handleEmitSunat(nc); }} className="p-1 rounded-lg hover:bg-emerald-50 text-emerald-600" title="Emitir">
                                <Send className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {nc.status !== "ANULADA" && (
                              <button onClick={(e) => { e.stopPropagation(); handleAnular(nc); }} className="p-1 rounded-lg hover:bg-red-50 text-red-500" title="Anular">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); handleDuplicate(nc); }} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400" title="Duplicar">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)]">
                <p className="text-xs text-gray-500">{filteredNotas.length} doc{filteredNotas.length !== 1 ? "s" : ""} {"\u2014"} P{"\u00e1"}g. {page}/{totalPages}</p>
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── Detail Side Panel ─────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selected && (
          <>
            <m.div key="nc-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)} />
            <m.div key="nc-panel" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white border-l border-[var(--rule-base)] overflow-y-auto">
              <div className="p-4 sm:p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <span className="text-xl">{getDocIcon(selected.numero)}</span>
                      NC {selected.numero}
                    </h3>
                    <p className="text-xs text-gray-400">Creada {formatDateTime(selected.createdAt)}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("px-3 py-1.5 rounded-xl text-xs font-bold", STATUS_META[selected.status].bg, STATUS_META[selected.status].color)}>
                    {STATUS_META[selected.status].label}
                  </span>
                  {selected.orderNumero && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[length:var(--ts-2xs)] font-bold bg-emerald-50 text-emerald-600">
                      {"\u{1F517}"} Vinculada a {selected.orderNumero}
                    </span>
                  )}
                  <div className="flex-1" />
                  {selected.status === "BORRADOR" && (
                    <button onClick={() => handleEmitSunat(selected)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                      <Send className="h-3.5 w-3.5" />Emitir a SUNAT
                    </button>
                  )}
                  {selected.status !== "ANULADA" && (
                    <button onClick={() => handleAnular(selected)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />Anular
                    </button>
                  )}
                  <button onClick={() => handleDuplicate(selected)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                    <Copy className="h-3.5 w-3.5" />Duplicar
                  </button>
                  <button onClick={() => sendWhatsApp(selected)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-50 text-green-700 hover:bg-green-100 transition-colors" title="Enviar por WhatsApp">
                    <MessageCircle className="h-3.5 w-3.5" />WhatsApp
                  </button>
                  <button onClick={() => exportPDF(selected)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors" title="Descargar PDF">
                    <FileDown className="h-3.5 w-3.5" />PDF
                  </button>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-bold text-gray-900">[{selected.codigoMotivo}] {selected.descripcionMotivo}</p>
                  {selected.clienteNombre && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>Cliente: <strong className="text-gray-700">{selected.clienteNombre}</strong></span>
                      {selected.clienteDocumento && <span className="text-gray-400">({selected.clienteDocumento})</span>}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[var(--rule-base)]">
                    <div><p className="text-[length:var(--ts-2xs)] uppercase font-bold text-gray-400">Monto</p><p className="text-sm font-bold text-gray-900">{formatCurrency(selected.monto)}</p></div>
                    <div><p className="text-[length:var(--ts-2xs)] uppercase font-bold text-gray-400">IGV</p><p className="text-sm font-bold text-gray-900">{formatCurrency(selected.igv)}</p></div>
                    <div><p className="text-[length:var(--ts-2xs)] uppercase font-bold text-gray-400">Total</p><p className="text-sm font-bold text-red-600">{formatCurrency(selected.total)}</p></div>
                  </div>
                </div>

                {selected.items && selected.items.length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-bold text-gray-700 mb-2">Items</p>
                    <div className="space-y-1.5">
                      {selected.items.map((it, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">{it.nombre} x{it.cantidad}</span>
                          <span className="font-bold text-gray-900">{formatCurrency(it.cantidad * it.precio)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" />Historial
                  </p>
                  <StatusTimeline nc={selected} />
                </div>

                {selected.notas && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-bold text-gray-700 mb-1">Notas</p>
                    <p className="text-sm text-gray-600">{selected.notas}</p>
                  </div>
                )}

                {/* ── Impacto en ventas ───────────────────────────────── */}
                {impactoVentas !== null && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-xs font-bold text-amber-700 mb-1 flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5" />Impacto en devoluciones del mes
                    </p>
                    <p className="text-sm text-amber-800">
                      Esta NC representa el <strong>{impactoVentas.toFixed(1)}%</strong> del total devuelto este mes (<strong>{formatCurrency(kpis.total)}</strong>)
                    </p>
                    <div className="mt-2 h-2 bg-amber-100 rounded-full overflow-hidden">
                      <m.div className="h-full bg-amber-400 rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(100, impactoVentas)}%` }} transition={{ duration: 0.6 }} />
                    </div>
                  </div>
                )}

                {/* ── Historial del cliente ───────────────────────────── */}
                {selected.clienteNombre && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />Historial de {selected.clienteNombre}
                    </p>
                    {clienteHistorial === 0 ? (
                      <p className="text-xs text-gray-400">Primera nota de crédito de este cliente</p>
                    ) : (
                      <p className="text-xs text-gray-600">
                        Este cliente tiene <strong className="text-gray-900">{clienteHistorial}</strong> nota{clienteHistorial !== 1 ? "s" : ""} de crédito anteriore{clienteHistorial !== 1 ? "s" : ""}
                        {clienteHistorial >= 3 && <span className="ml-1 text-amber-600 font-semibold">{"\u26a0\ufe0f"} Cliente con múltiples devoluciones</span>}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── NEW NC WIZARD — Visual Document Picker ────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showNew && (
          <>
            <m.div key="nnc-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => resetWizard()} />
            <m.div key="nnc-modal" initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && resetWizard()}>
              <div className={cn(
                "w-full bg-white border border-[var(--rule-base)] rounded-xl overflow-hidden",
                wizardStep === 0 ? "max-w-3xl" : "max-w-xl"
              )}>
                {/* Wizard Header */}
                <div className="px-5 pt-5 pb-0">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <CreditCard className="h-4 w-4 text-primary" />
                      </div>
                      Nueva Nota de Cr{"\u00e9"}dito
                    </h3>
                    <button onClick={resetWizard} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <WizardProgress step={wizardStep} />
                </div>

                <div className="px-5 pb-5 max-h-[70vh] overflow-y-auto">
                  {/* ═══════════════════════════════════════════════════════ */}
                  {/* STEP 0: Visual Document Picker Gallery                */}
                  {/* ═══════════════════════════════════════════════════════ */}
                  {wizardStep === 0 && (
                    <div className="space-y-6">
                      <p className="text-sm text-gray-500">
                        Selecciona el documento original (factura, boleta o ticket) al que quieres aplicar la nota de cr{"\u00e9"}dito
                      </p>

                      {/* Doc Type Picker Tabs */}
                      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
                        {PICKER_TABS.map(tab => (
                          <button key={tab.id} onClick={() => setPickerDocType(tab.id)}
                            className={cn("flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all",
                              pickerDocType === tab.id
                                ? "bg-white text-gray-900 "
                                : "text-gray-500 hover:text-gray-700")}>
                            <span>{tab.icon}</span>
                            <span>{tab.label}</span>
                            <span className={cn("px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold",
                              pickerDocType === tab.id ? "bg-primary text-white" : "bg-gray-200 text-gray-500")}>
                              {pickerCounts[tab.id]}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Picker Search */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input type="text" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                          placeholder="Buscar por n\u00famero, cliente, RUC/DNI..."
                          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        {pickerLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
                      </div>

                      {/* Selected Document Banner */}
                      <AnimatePresence>
                        {selectedVenta && (
                          <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="bg-primary/5 border-2 border-primary/30 rounded-xl p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">{(DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).icon}</span>
                                  <span className={cn("px-2 py-0.5 rounded-lg text-[length:var(--ts-2xs)] font-bold uppercase", (DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).badge)}>
                                    {(DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).label}
                                  </span>
                                  <span className="font-mono text-sm font-bold text-primary">
                                    {selectedVenta.comprobanteNumero || `#${selectedVenta.numero}`}
                                  </span>
                                  <span className="text-xs text-gray-400">{"\u00b7"} {selectedVenta.clienteNombre}</span>
                                  <span className="text-sm font-bold text-gray-900">{"\u00b7"} {formatCurrency(selectedVenta.total)}</span>
                                </div>
                                <button onClick={() => setSelectedVenta(null)} className="text-xs font-bold text-red-500 hover:underline px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                                  Quitar
                                </button>
                              </div>
                              <div className="text-[length:var(--ts-2xs)] text-emerald-600 font-bold flex items-center gap-1">
                                <span>{"\u2713"}</span> Documento seleccionado {"\u2014"} en el paso siguiente podr{"\u00e1"}s elegir qu{"\u00e9"} items devolver
                              </div>
                            </div>
                          </m.div>
                        )}
                      </AnimatePresence>

                      {/* Document Cards Grid */}
                      {pickerLoading && pickerDocs.length === 0 ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <span className="ml-2 text-sm text-gray-500">Cargando documentos...</span>
                        </div>
                      ) : filteredPickerDocs.length === 0 ? (
                        <div className="text-center py-10">
                          <div className="text-4xl mb-3">{"\u{1F50D}"}</div>
                          <p className="text-sm font-semibold text-gray-700 mb-1">No se encontraron documentos</p>
                          <p className="text-xs text-gray-400">Intenta con otro t{"\u00e9"}rmino de b{"\u00fasqueda"}</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-85 overflow-y-auto pr-1 scrollbar-thin">
                          <AnimatePresence>
                            {filteredPickerDocs.map(doc => (
                              <SaleDocCard key={doc.id} doc={doc} isSelected={selectedVenta?.id === doc.id}
                                onSelect={() => { setSelectedVenta(selectedVenta?.id === doc.id ? null : doc); setForm(prev => ({ ...prev, orderId: selectedVenta?.id === doc.id ? "" : doc.id })); }} />
                            ))}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-3 pt-2 border-t border-[var(--rule-soft)]">
                        <button type="button" onClick={() => { setSelectedVenta(null); setForm(prev => ({ ...prev, orderId: "" })); setWizardStep(1); }}
                          className="text-xs text-gray-400 hover:text-gray-600 hover:underline transition-colors">
                          Continuar sin documento {"\u2192"}
                        </button>
                        <div className="flex-1" />
                        <button onClick={() => setWizardStep(1)} disabled={!selectedVenta}
                          className={cn("px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
                            selectedVenta
                              ? "text-white bg-primary hover:bg-primary-dark "
                              : "text-gray-400 bg-gray-100 cursor-not-allowed")}>
                          Siguiente {"\u2192"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ═══════════════════════════════════════════════════════ */}
                  {/* STEP 1: Motivo, Items & Amounts                       */}
                  {/* ═══════════════════════════════════════════════════════ */}
                  {wizardStep === 1 && (
                    <div className="space-y-6">
                      {/* ── Templates guardados ─────────────────────────── */}
                      {templates.length > 0 && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                          <button onClick={() => setShowTemplates(s => !s)} className="flex items-center gap-2 w-full text-xs font-bold text-emerald-700">
                            <Bookmark className="h-3.5 w-3.5" />
                            Mis templates guardados ({templates.length})
                            <span className="ml-auto text-[length:var(--ts-2xs)] text-emerald-400">{showTemplates ? "Ocultar" : "Ver"}</span>
                          </button>
                          <AnimatePresence>
                            {showTemplates && (
                              <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="mt-2 space-y-1">
                                  {templates.map(t => (
                                    <div key={t.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2">
                                      <span className="flex-1 text-xs text-gray-700">
                                        <strong>{t.name}</strong> — [{t.codigoMotivo}] {t.descripcionMotivo}
                                      </span>
                                      <button onClick={() => loadTemplate(t)} className="text-[length:var(--ts-2xs)] font-bold text-emerald-600 hover:underline shrink-0">Usar</button>
                                      <button onClick={() => deleteTemplate(t.id)} className="text-[length:var(--ts-2xs)] text-red-400 hover:text-red-600 shrink-0">x</button>
                                    </div>
                                  ))}
                                </div>
                              </m.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Visual Motivo Picker Cards */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-bold text-gray-600">Motivo SUNAT {"\u2014"} {"\u00bfPor qu\u00e9"} se emite la NC?</label>
                          {form.codigoMotivo && (
                            <button onClick={saveTemplate} className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-emerald-600 hover:underline">
                              <BookmarkPlus className="h-3 w-3" />Guardar template
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
                          {MOTIVOS_SUNAT.map(m => (
                            <MotivoCard key={m.code} motivo={m} selected={form.codigoMotivo === m.code}
                              onClick={() => setForm(prev => ({
                                ...prev,
                                codigoMotivo: m.code,
                                descripcionMotivo: prev.descripcionMotivo || m.label,
                              }))} />
                          ))}
                        </div>
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">Descripci{"\u00f3"}n del motivo</label>
                        <textarea value={form.descripcionMotivo} onChange={e => setForm(p => ({ ...p, descripcionMotivo: e.target.value }))} placeholder="Detalle del motivo..." rows={2}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                      </div>

                      {/* Item Quantity Picker (if linked to a sale) */}
                      {selectedVenta && selectedVenta.items.length > 0 && (
                        <div>
                          <label className="block text-xs font-bold text-gray-600 mb-2">
                            Items a incluir en la NC {"\u2014"} ajusta cantidades para devoluci{"\u00f3"}n parcial
                          </label>
                          <div className="border border-[var(--rule-base)] rounded-xl divide-y divide-gray-100 overflow-hidden">
                            {selectedVenta.items.map((item, idx) => (
                              <div key={idx} className={cn("flex items-center gap-3 p-3 transition-colors", item.selected ? "bg-primary/5" : "hover:bg-gray-50")}>
                                <button type="button" onClick={() => handleItemToggle(idx)}
                                  className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0",
                                    item.selected ? "bg-primary border-primary text-white" : "border-[var(--rule-base)]")}>
                                  {item.selected && <span className="text-[length:var(--ts-2xs)]">{"\u2713"}</span>}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{item.nombre}</p>
                                  <p className="text-[length:var(--ts-2xs)] text-gray-400">Comprado: {item.cantidad} {"\u00d7"} {formatCurrency(item.precio)}</p>
                                </div>
                                {item.selected && (
                                  <div className="flex items-center gap-1.5">
                                    <button type="button" onClick={() => handleItemQty(idx, item.cantidadDevolver - 1)}
                                      className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                                      <Minus className="h-3 w-3 text-gray-600" />
                                    </button>
                                    <span className="w-8 text-center text-sm font-bold text-gray-900">{item.cantidadDevolver}</span>
                                    <button type="button" onClick={() => handleItemQty(idx, item.cantidadDevolver + 1)}
                                      className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                                      <Plus className="h-3 w-3 text-gray-600" />
                                    </button>
                                  </div>
                                )}
                                <span className={cn("text-sm font-bold w-20 text-right", item.selected ? "text-gray-900" : "text-gray-300")}>
                                  {formatCurrency((item.selected ? item.cantidadDevolver : 0) * item.precio)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 flex justify-between text-xs px-1">
                            <span className="text-gray-400">{selectedVenta.items.filter(it => it.selected).length} de {selectedVenta.items.length} items seleccionados</span>
                            <span className="font-bold text-primary">Subtotal: {formatCurrency(autoMonto)}</span>
                          </div>
                        </div>
                      )}

                      {/* Manual amount (if no linked sale or override) */}
                      {!selectedVenta && (
                        <div>
                          <label className="block text-xs font-bold text-gray-600 mb-1">Monto a acreditar (S/)</label>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input type="number" step="0.01" min="0.01" value={form.monto} onChange={e => setForm(p => ({ ...p, monto: e.target.value }))} placeholder="0.00"
                              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                          </div>
                        </div>
                      )}

                      {/* Amount Preview */}
                      {montoNum > 0 && (
                        <AmountBreakdown monto={montoNum} igv={computedIgv} total={computedTotal} originalTotal={selectedVenta?.total} />
                      )}

                      {/* Notes */}
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">Notas internas (opcional)</label>
                        <input type="text" value={form.notasText} onChange={e => setForm(p => ({ ...p, notasText: e.target.value }))} placeholder="Observaciones..."
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>

                      {/* Return stock toggle */}
                      {esDevolucion && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={() => setDevolverStock(!devolverStock)}
                              className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                                devolverStock ? "bg-primary" : "bg-gray-300")}>
                              <span className={cn("inline-block h-4 w-4 rounded-full bg-white transition-transform", devolverStock ? "translate-x-4" : "translate-x-0")} />
                            </button>
                            <span className="text-xs font-bold text-amber-800">{"\u{1F4E6}"} Devolver items al stock</span>
                          </div>
                        </div>
                      )}

                      {createError && <p className="text-xs text-red-600 font-semibold">{createError}</p>}

                      {/* Navigation */}
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => setWizardStep(0)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                          {"\u2190"} Atr{"\u00e1"}s
                        </button>
                        <button onClick={() => {
                          if (!form.codigoMotivo) { setCreateError("Selecciona un motivo"); return; }
                          if (!form.descripcionMotivo.trim()) { setCreateError("Completa la descripci\u00f3n"); return; }
                          if (montoNum <= 0) { setCreateError("El monto debe ser mayor a 0"); return; }
                          setCreateError(null); setWizardStep(2);
                        }} className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark  transition-colors">
                          Siguiente {"\u2192"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ═══════════════════════════════════════════════════════ */}
                  {/* STEP 2: Confirmation & Summary                        */}
                  {/* ═══════════════════════════════════════════════════════ */}
                  {wizardStep === 2 && (
                    <div className="space-y-6">
                      {/* Document Reference */}
                      {selectedVenta && (
                        <div className={cn("rounded-xl p-4 border-2", (DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).border, (DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).bg)}>
                          <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-gray-400 mb-2">Documento de referencia</p>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{(DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).icon}</span>
                            <div>
                              <span className={cn("px-2 py-0.5 rounded-lg text-[length:var(--ts-2xs)] font-bold uppercase", (DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).badge)}>
                                {(DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket).label}
                              </span>
                              <span className="font-mono text-sm font-bold text-gray-900 ml-2">{selectedVenta.comprobanteNumero || `#${selectedVenta.numero}`}</span>
                            </div>
                            <div className="flex-1" />
                            <div className="text-right">
                              <p className="text-xs text-gray-500">{selectedVenta.clienteNombre}</p>
                              <p className="text-sm font-bold text-gray-900">{formatCurrency(selectedVenta.total)}</p>
                            </div>
                          </div>

                          {/* Items being returned */}
                          {selectedVenta.items.filter(it => it.selected).length > 0 && (
                            <div className="mt-3 pt-3 border-t border-[var(--rule-base)]/50 space-y-1">
                              <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-gray-400 mb-1">Items incluidos en la NC</p>
                              {selectedVenta.items.filter(it => it.selected).map((it, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                  <span className="text-gray-600">{it.nombre} {"\u00d7"}{it.cantidadDevolver}{it.cantidadDevolver < it.cantidad ? ` (de ${it.cantidad})` : ""}</span>
                                  <span className="font-bold text-gray-900">{formatCurrency(it.cantidadDevolver * it.precio)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Motivo Summary */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-gray-400 mb-2">Motivo</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{MOTIVOS_SUNAT.find(m => m.code === form.codigoMotivo)?.icon || "\u{1F4DD}"}</span>
                          <div>
                            <p className="text-sm font-bold text-gray-900">[{form.codigoMotivo}] {form.descripcionMotivo}</p>
                            {form.notasText && <p className="text-xs text-gray-400 italic mt-0.5">{form.notasText}</p>}
                          </div>
                        </div>
                        {esDevolucion && devolverStock && (
                          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">{"\u{1F4E6}"} Se devolver{"\u00e1"}n items al stock</p>
                        )}
                      </div>

                      {/* Amount Breakdown */}
                      <AmountBreakdown monto={montoNum} igv={computedIgv} total={computedTotal} originalTotal={selectedVenta?.total} />

                      {createError && <p className="text-xs text-red-600 font-semibold bg-red-50 p-3 rounded-xl">{createError}</p>}

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => setWizardStep(1)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                          {"\u2190"} Atr{"\u00e1"}s
                        </button>
                        <button onClick={handleCreate} disabled={creating}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark disabled:opacity-50  transition-all">
                          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          Crear Nota de Cr{"\u00e9"}dito
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}