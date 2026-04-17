"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Search, Plus, X, ChevronLeft, ChevronRight, Loader2, AlertTriangle,
  Truck, User, Calendar, Printer, MapPin, Package,
  FileText, CheckCircle, XCircle, Filter, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type GuiaStatus = "BORRADOR" | "EMITIDA" | "EN_TRANSITO" | "ENTREGADA" | "ANULADA";

type GuiaItem = {
  descripcion: string;
  cantidad: number;
  unidad: string;
  pesoUnitario?: number;
  productoId?: string;
};

type GuiaRemision = {
  id: string;
  numero: string;
  tenantId: string;
  orderId?: string;
  fechaTraslado: string;
  motivoTraslado: string;
  destinatarioNombre: string;
  destinatarioRuc?: string;
  destinatarioDireccion: string;
  transportistaNombre?: string;
  transportistaRuc?: string;
  vehiculoPlaca?: string;
  transportistaPlaca?: string; // backward compat
  conductorNombre?: string;
  conductorDni?: string;
  bultos?: number;
  documentoRef?: string;
  puntoPartida: string;
  puntoLlegada: string;
  status: GuiaStatus;
  pesoTotal?: number;
  pesoBruto?: number;
  notas?: string;
  items: GuiaItem[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type Resumen = {
  totalMes: number;
  enTransito: number;
  entregadas: number;
  anuladas: number;
  transportistasFrecuentes: Array<{ nombre: string; ruc: string; count: number }>;
};

type OrderSummary = {
  id: string;
  numero: string;
  customerName: string;
  shippingAddress?: string;
  createdAt: string;
  items: Array<{ nombre: string; cantidad: number; unidad?: string }>;
};

type AdvancedFilters = {
  from: string;
  to: string;
  transportistaRuc: string;
  puntoLlegada: string;
  vehiculoPlaca: string;
};

type DraftItem = {
  descripcion: string;
  cantidad: string;
  unidad: string;
  pesoUnitario: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META: Record<GuiaStatus, { label: string; color: string; bg: string; dot: string }> = {
  BORRADOR:    { label: "Borrador",    color: "text-gray-700",       bg: "bg-gray-100",       dot: "bg-gray-400" },
  EMITIDA:     { label: "Emitida",     color: "text-emerald-700",       bg: "bg-emerald-100",       dot: "bg-emerald-500" },
  EN_TRANSITO: { label: "En tránsito", color: "text-amber-700",     bg: "bg-amber-100",     dot: "bg-amber-500" },
  ENTREGADA:   { label: "Entregada",   color: "text-emerald-700", bg: "bg-emerald-100", dot: "bg-emerald-500" },
  ANULADA:     { label: "Anulada",     color: "text-red-700",         bg: "bg-red-100",         dot: "bg-red-500" },
};

const _STATUS_ORDER: GuiaStatus[] = ["BORRADOR", "EMITIDA", "EN_TRANSITO", "ENTREGADA"];

const MOTIVOS = [
  "VENTA",
  "TRASLADO ENTRE ALMACENES",
  "DEVOLUCION",
  "EXHIBICION",
  "CONSIGNACION",
  "OTROS",
];

const _PILL_COLORS: Record<string, { active: string; inactive: string }> = {
  "":          { active: "bg-primary text-white",  inactive: "bg-gray-100 text-gray-600" },
  BORRADOR:    { active: "bg-gray-600 text-white",    inactive: "bg-gray-100 text-gray-600" },
  EMITIDA:     { active: "bg-emerald-600 text-white",    inactive: "bg-emerald-50 text-emerald-700" },
  EN_TRANSITO: { active: "bg-amber-500 text-white",   inactive: "bg-amber-50 text-amber-700" },
  ENTREGADA:   { active: "bg-emerald-600 text-white", inactive: "bg-emerald-50 text-emerald-700" },
  ANULADA:     { active: "bg-red-600 text-white",     inactive: "bg-red-50 text-red-700" },
};

const PER_PAGE = 10;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function validateRuc(ruc: string): "valid" | "invalid" | "empty" {
  if (!ruc || ruc.trim() === "") return "empty";
  const cleaned = ruc.trim();
  if (!/^\d{11}$/.test(cleaned)) return "invalid";
  if (!cleaned.startsWith("10") && !cleaned.startsWith("20")) return "invalid";
  return "valid";
}

function validatePlaca(placa: string): "valid" | "invalid" | "empty" {
  if (!placa || placa.trim() === "") return "empty";
  return /^[A-Z]{3}-?\d{3}$/i.test(placa.trim()) ? "valid" : "invalid";
}

function getPlaca(g: GuiaRemision) {
  return g.vehiculoPlaca || g.transportistaPlaca || "";
}

function emptyItem(): DraftItem {
  return { descripcion: "", cantidad: "1", unidad: "NIU", pesoUnitario: "" };
}

// ── ValidationBadge ──────────────────────────────────────────────────────────

function _ValidationBadge({ status }: { status: "valid" | "invalid" | "empty" }) {
  if (status === "empty") return null;
  return status === "valid"
    ? <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
    : <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />;
}

// ── GuiaPreview (tooltip on hover) ───────────────────────────────────────────

function GuiaPreview({ guia }: { guia: GuiaRemision }) {
  const meta = STATUS_META[guia.status];
  const placa = getPlaca(guia);
  return (
    <div className="w-75 bg-white border border-[var(--rule-base)] rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-gray-500">{guia.numero}</span>
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[length:var(--ts-2xs)] font-bold", meta.bg, meta.color)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />{meta.label}
        </span>
      </div>
      <p className="font-bold text-gray-900 text-sm">{guia.destinatarioNombre}</p>
      <p className="text-[length:var(--ts-2xs)] text-gray-400">{guia.puntoPartida} → {guia.puntoLlegada}</p>
      {guia.transportistaNombre && (
        <p className="text-[length:var(--ts-2xs)] text-gray-500 flex items-center gap-1">
          <Truck className="h-3 w-3" /> {guia.transportistaNombre}
          {placa && <span className="ml-1 px-1 bg-emerald-100 text-emerald-700 rounded text-[length:var(--ts-2xs)] font-bold">{placa}</span>}
        </p>
      )}
      <div className="border-t border-[var(--rule-soft)] pt-2">
        <p className="text-[length:var(--ts-2xs)] font-bold text-gray-500 uppercase mb-1">Items</p>
        {guia.items.slice(0, 3).map((it, i) => (
          <p key={i} className="text-xs text-gray-600 truncate">{it.cantidad}× {it.descripcion}</p>
        ))}
        {guia.items.length > 3 && <p className="text-[length:var(--ts-2xs)] text-gray-400">y {guia.items.length - 3} más...</p>}
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-[var(--rule-soft)]">
        <span className="text-xs text-gray-500">{formatDate(guia.fechaTraslado)}</span>
        <span className="text-xs font-semibold text-gray-500">{guia.motivoTraslado}</span>
      </div>
    </div>
  );
}

function GuiaHoverRow({ children, preview }: { children: ReactNode; preview: ReactNode }) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleEnter = () => { timerRef.current = setTimeout(() => setShow(true), 300); };
  const handleLeave = () => { if (timerRef.current) clearTimeout(timerRef.current); setShow(false); };
  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {show && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]">
          {preview}
        </div>
      )}
    </div>
  );
}

// ── OrderPickerCard ──────────────────────────────────────────────────────────

function _OrderPickerCard({ order, isSelected, onSelect }: {
  order: OrderSummary;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <m.button
      type="button"
      layout
      onClick={onSelect}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "w-full text-left rounded-xl border-2 p-4 transition-all duration-[var(--dur-base)] relative overflow-hidden",
        isSelected
          ? "border-primary ring-2 ring-primary/20 bg-primary/5"
          : "bg-white border-[var(--rule-base)] hover:shadow-lg hover:border-primary/40"
      )}
    >
      <div className={cn("absolute top-0 left-0 w-1.5 h-full rounded-l-2xl", isSelected ? "bg-primary" : "bg-emerald-400")} />
      <div className="pl-2">
        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
          <span className="font-mono text-xs font-bold text-gray-900">#{order.numero}</span>
          <span className="text-[length:var(--ts-2xs)] text-gray-400">{formatDate(order.createdAt)}</span>
        </div>
        <p className={cn("text-sm font-semibold truncate mb-1", isSelected ? "text-primary" : "text-gray-800")}>
          {order.customerName}
        </p>
        {order.shippingAddress && (
          <p className="text-[length:var(--ts-2xs)] text-gray-400 truncate flex items-center gap-1">
            <MapPin className="h-2.5 w-2.5 shrink-0" /> {order.shippingAddress}
          </p>
        )}
        <div className="flex items-center gap-1 mt-1.5 text-[length:var(--ts-2xs)] text-gray-400">
          <Package className="h-3 w-3 shrink-0" />
          {order.items.length} item{order.items.length !== 1 ? "s" : ""}
        </div>
      </div>
    </m.button>
  );
}

// ── DashboardSection ─────────────────────────────────────────────────────────

function _DashboardSection({ resumen, loading }: { resumen: Resumen | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-[var(--rule-base)] rounded-xl p-3 animate-pulse">
            <div className="h-7 w-7 rounded-lg bg-gray-100 mb-2" />
            <div className="h-3 w-20 rounded bg-gray-100 mb-1.5" />
            <div className="h-7 w-10 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    );
  }
  if (!resumen) return null;

  const kpis = [
    { label: "Guías este mes", value: resumen.totalMes, icon: FileText, color: "text-emerald-600", bg: "bg-emerald-100" },
    { label: "En tránsito", value: resumen.enTransito, icon: Truck, color: "text-amber-600", bg: "bg-amber-100" },
    { label: "Entregadas", value: resumen.entregadas, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-100" },
    { label: "Anuladas", value: resumen.anuladas, icon: XCircle, color: resumen.anuladas > 0 ? "text-red-600" : "text-gray-400", bg: resumen.anuladas > 0 ? "bg-red-100" : "bg-gray-100" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(card => {
          const Icon = card.icon;
          return (
            <m.div key={card.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-[var(--rule-base)] rounded-xl  p-3">
              <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mb-2", card.bg)}>
                <Icon className={cn("h-3.5 w-3.5", card.color)} />
              </div>
              <p className="text-[length:var(--ts-2xs)] text-gray-400 font-bold">{card.label}</p>
              <p className="text-2xl font-mono font-bold text-gray-900">{card.value}</p>
            </m.div>
          );
        })}
      </div>
      {resumen.transportistasFrecuentes.length > 0 && (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4">
          <p className="text-[length:var(--ts-2xs)] text-gray-400 font-bold mb-3 flex items-center gap-1.5">
            <Truck className="h-3 w-3" /> Transportistas frecuentes
          </p>
          <div className="space-y-2">
            {resumen.transportistasFrecuentes.slice(0, 3).map((t, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-emerald-600 shrink-0">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-900 truncate">{t.nombre}</p>
                  <p className="text-[length:var(--ts-2xs)] text-gray-400 font-mono">{t.ruc}</p>
                </div>
                <span className="text-xs font-bold text-primary">{t.count} guía{t.count !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Print Helper ──────────────────────────────────────────────────────────────

function printGuiaSunat(g: GuiaRemision, formatDate: (d: string) => string) {
  const items = g.items ?? [];
  const pesoTotal = items.reduce((sum, it) => sum + (it.cantidad * (it.pesoUnitario || 0)), 0);
  const rowsHtml = items.map((it, i) => {
    const pesoCell = it.pesoUnitario ? (it.cantidad * it.pesoUnitario).toFixed(1) : "-";
    return "<tr><td>" + (i + 1) + "</td><td>" + it.descripcion + "</td><td>" + it.unidad + '</td><td class="right">' + it.cantidad + '</td><td class="right">' + pesoCell + "</td></tr>";
  }).join("");

  const conditionalRow = (condition: unknown, label: string, value: string) =>
    condition ? '<div class="row"><span class="row-label">' + label + ':</span><span class="row-value">' + value + "</span></div>" : "";

  const html = [
    '<!DOCTYPE html><html><head><title>GRR ' + g.numero + "</title><style>",
    "@media print { @page { size: A4; margin: 15mm; } }",
    "body { font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; font-size: 13px; }",
    "h1 { text-align: center; font-size: 18px; margin: 0; }",
    "h2 { text-align: center; font-size: 14px; color: #555; margin: 4px 0 20px; }",
    '.sep { border-top: 1px solid #333; margin: 12px 0; } .sep-double { border-top: 3px double #333; margin: 12px 0; }',
    ".section { margin: 8px 0; } .section-title { font-weight: bold; font-size: 12px; text-transform: uppercase; color: #555; margin-bottom: 4px; }",
    ".row { display: flex; margin: 3px 0; } .row-label { width: 160px; font-weight: 600; color: #333; } .row-value { flex: 1; }",
    "table { width: 100%; border-collapse: collapse; margin: 8px 0; }",
    'th { background: #f5f5f5; text-align: left; padding: 6px 8px; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #333; }',
    "td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 12px; } td.right, th.right { text-align: right; }",
    ".firmas { margin-top: 60px; display: flex; justify-content: space-between; }",
    '.firma-box { text-align: center; width: 200px; } .firma-line { border-top: 1px solid #000; padding-top: 5px; font-size: 11px; }',
    ".total-peso { text-align: right; font-weight: bold; font-size: 14px; margin-top: 8px; }",
    "</style></head><body>",
    '<div class="sep-double"></div>',
    "<h1>GUIA DE REMISION REMITENTE</h1>",
    "<h2>N. " + g.numero + "</h2>",
    '<div class="sep-double"></div>',
    '<div class="section"><div class="section-title">Remitente</div>',
    '<div class="row"><span class="row-label">Nombre/Razon Social:</span><span class="row-value">Buleje</span></div>',
    '<div class="row"><span class="row-label">Direccion:</span><span class="row-value">' + g.puntoPartida + "</span></div></div>",
    '<div class="sep"></div>',
    '<div class="section"><div class="section-title">Destinatario</div>',
    '<div class="row"><span class="row-label">Nombre/Razon Social:</span><span class="row-value">' + g.destinatarioNombre + "</span></div>",
    conditionalRow(g.destinatarioRuc, "RUC/DNI", g.destinatarioRuc || ""),
    conditionalRow(g.destinatarioDireccion, "Direccion", g.destinatarioDireccion || ""),
    "</div>",
    '<div class="sep"></div>',
    '<div class="section"><div class="section-title">Transporte</div>',
    conditionalRow(g.transportistaNombre, "Transportista", g.transportistaNombre || ""),
    conditionalRow(g.transportistaRuc, "RUC", g.transportistaRuc || ""),
    conditionalRow(g.transportistaPlaca, "Placa", g.transportistaPlaca || ""),
    conditionalRow(g.conductorNombre, "Conductor", g.conductorNombre || ""),
    conditionalRow(g.conductorDni, "DNI Conductor", g.conductorDni || ""),
    "</div>",
    '<div class="sep"></div>',
    '<div class="section">',
    '<div class="row"><span class="row-label">Punto de partida:</span><span class="row-value">' + g.puntoPartida + "</span></div>",
    '<div class="row"><span class="row-label">Punto de llegada:</span><span class="row-value">' + g.puntoLlegada + "</span></div>",
    '<div class="row"><span class="row-label">Fecha traslado:</span><span class="row-value">' + formatDate(g.fechaTraslado) + "</span></div>",
    '<div class="row"><span class="row-label">Motivo:</span><span class="row-value">' + g.motivoTraslado + "</span></div>",
    conditionalRow(g.documentoRef, "Doc. Referencia", g.documentoRef || ""),
    conditionalRow(g.bultos, "Bultos", String(g.bultos ?? "")),
    "</div>",
    '<div class="sep"></div>',
    "<table>",
    '<thead><tr><th>#</th><th>Descripcion</th><th>Unidad</th><th class="right">Cantidad</th><th class="right">Peso (kg)</th></tr></thead>',
    "<tbody>" + rowsHtml + "</tbody>",
    "</table>",
    '<div class="total-peso">Peso total: ' + (pesoTotal > 0 ? pesoTotal.toFixed(1) + " kg" : "N/A") + "</div>",
    g.pesoBruto ? '<div class="total-peso">Peso bruto: ' + Number(g.pesoBruto).toFixed(3) + " kg</div>" : "",
    '<div class="sep"></div>',
    '<div class="firmas">',
    '<div class="firma-box"><div class="firma-line">Firma remitente</div></div>',
    '<div class="firma-box"><div class="firma-line">Firma transportista</div></div>',
    "</div>",
    "</body></html>",
  ].join("\n");

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); w.print(); }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function GuiasRemisionModule() {
  // ── List state ──
  const [guias, setGuias] = useState<GuiaRemision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GuiaStatus | "">("");
  const [advFilters, _setAdvFilters] = useState<AdvancedFilters>({ from: "", to: "", transportistaRuc: "", puntoLlegada: "", vehiculoPlaca: "" });
  const [page, setPage] = useState(1);

  // ── Dashboard ──
  const [_resumen, setResumen] = useState<Resumen | null>(null);
  const [_resumenLoading, setResumenLoading] = useState(true);

  // ── Detail panel ──
  const [selected, setSelected] = useState<GuiaRemision | null>(null);
  const [_actionLoading, setActionLoading] = useState(false);
  const [showAnular, setShowAnular] = useState(false);
  const [_copiedLink, setCopiedLink] = useState(false);

  // ── New form ──
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    orderIds: "",
    motivoTraslado: "VENTA",
    destinatarioNombre: "",
    destinatarioRuc: "",
    destinatarioDireccion: "",
    transportistaNombre: "",
    transportistaRuc: "",
    vehiculoPlaca: "",
    conductorNombre: "",
    conductorDni: "",
    bultos: "",
    documentoRef: "",
    puntoPartida: "",
    puntoLlegada: "",
    fechaTraslado: "",
    pesoBruto: "",
    notas: "",
  });
  const [newItems, setNewItems] = useState<DraftItem[]>([emptyItem()]);

  // ── Order picker ──
  const [_orderSearch, setOrderSearch] = useState("");
  const [_orderResults, setOrderResults] = useState<OrderSummary[]>([]);
  const [_orderSearching, setOrderSearching] = useState(false);
  const [_selectedOrder, setSelectedOrder] = useState<OrderSummary | null>(null);
  const orderSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived validations ──
  const _rucStatus = validateRuc(form.transportistaRuc);
  const _placaStatus = validatePlaca(form.vehiculoPlaca);

  // ── Debounce search ──
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // ── Reset page ──
  useEffect(() => { setPage(1); }, [search, statusFilter, advFilters]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "Escape") {
        if (showAnular) { setShowAnular(false); return; }
        if (showNew) { setShowNew(false); return; }
        if (selected) { setSelected(null); return; }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        setShowNew(true);
        setCreateError(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showNew, selected, showAnular]);

  // ── Fetch guias ──
  const fetchGuias = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (advFilters.from) params.set("from", advFilters.from);
      if (advFilters.to) params.set("to", advFilters.to);
      if (advFilters.transportistaRuc) params.set("transportistaRuc", advFilters.transportistaRuc);
      if (advFilters.puntoLlegada) params.set("puntoLlegada", advFilters.puntoLlegada);
      if (advFilters.vehiculoPlaca) params.set("vehiculoPlaca", advFilters.vehiculoPlaca);
      const res = await fetch(`/api/guias-remision?${params}`);
      if (!res.ok) throw new Error("Error al cargar guías");
      const data: GuiaRemision[] = await res.json();
      setGuias(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedSearch, advFilters]);

  useEffect(() => { fetchGuias(); }, [fetchGuias]);

  // ── Fetch resumen ──
  const fetchResumen = useCallback(async () => {
    setResumenLoading(true);
    try {
      const res = await fetch("/api/guias-remision/resumen");
      if (!res.ok) return;
      const data: Resumen = await res.json();
      setResumen(data);
    } catch {
      // dashboard is non-critical
    } finally {
      setResumenLoading(false);
    }
  }, []);

  useEffect(() => { fetchResumen(); }, [fetchResumen]);

  // ── Order search ──
  const _searchOrders = useCallback((q: string) => {
    if (orderSearchTimer.current) clearTimeout(orderSearchTimer.current);
    if (!q.trim()) { setOrderResults([]); return; }
    orderSearchTimer.current = setTimeout(async () => {
      setOrderSearching(true);
      try {
        const res = await fetch(`/api/orders?limit=20&search=${encodeURIComponent(q.trim())}`);
        if (!res.ok) return;
        const data: OrderSummary[] = await res.json();
        setOrderResults(data);
      } catch {
        // non-critical
      } finally {
        setOrderSearching(false);
      }
    }, 300);
  }, []);

  const _handleSelectOrder = (order: OrderSummary) => {
    setSelectedOrder(order);
    setForm(prev => ({
      ...prev,
      orderIds: order.id,
      destinatarioNombre: order.customerName || prev.destinatarioNombre,
      destinatarioDireccion: order.shippingAddress || prev.destinatarioDireccion,
    }));
    if (order.items.length > 0) {
      setNewItems(order.items.map(it => ({
        descripcion: it.nombre,
        cantidad: String(it.cantidad),
        unidad: it.unidad || "NIU",
        pesoUnitario: "",
      })));
    }
    setOrderResults([]);
    setOrderSearch("");
  };

  // ── Create ──
  const handleCreate = async () => {
    setCreateError(null);
    if (!form.destinatarioNombre.trim()) { setCreateError("Destinatario requerido"); return; }
    if (!form.puntoPartida.trim() || !form.puntoLlegada.trim()) { setCreateError("Puntos de partida y llegada requeridos"); return; }
    if (!form.fechaTraslado) { setCreateError("Fecha de traslado requerida"); return; }
    const parsedItems = newItems
      .map(i => ({
        descripcion: i.descripcion,
        cantidad: parseFloat(i.cantidad) || 0,
        unidad: i.unidad,
        pesoUnitario: parseFloat(i.pesoUnitario) || undefined,
      }))
      .filter(i => i.descripcion.trim() && i.cantidad > 0);
    if (parsedItems.length === 0) { setCreateError("Agrega al menos un item"); return; }
    setCreating(true);
    try {
      const orderIds = form.orderIds.split(",").map(s => s.trim()).filter(Boolean);
      const res = await fetch("/api/guias-remision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          orderId: orderIds[0] || undefined,
          orderIds: orderIds.length > 0 ? orderIds : undefined,
          fechaTraslado: new Date(form.fechaTraslado).toISOString(),
          conductorNombre: form.conductorNombre || undefined,
          conductorDni: form.conductorDni || undefined,
          bultos: form.bultos ? parseInt(form.bultos) : undefined,
          documentoRef: form.documentoRef || undefined,
          pesoBruto: form.pesoBruto ? parseFloat(form.pesoBruto) : undefined,
          items: parsedItems,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al crear" }));
        throw new Error(typeof err.error === "string" ? err.error : "Error al crear guía");
      }
      setShowNew(false);
      resetForm();
      fetchGuias();
      fetchResumen();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setForm({ orderIds: "", motivoTraslado: "VENTA", destinatarioNombre: "", destinatarioRuc: "", destinatarioDireccion: "", transportistaNombre: "", transportistaRuc: "", vehiculoPlaca: "", conductorNombre: "", conductorDni: "", bultos: "", documentoRef: "", puntoPartida: "", puntoLlegada: "", fechaTraslado: "", pesoBruto: "", notas: "" });
    setNewItems([emptyItem()]);
    setSelectedOrder(null);
    setOrderResults([]);
    setOrderSearch("");
  };

  // ── Item helpers ──
  const updateItem = (idx: number, field: keyof DraftItem, value: string) =>
    setNewItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  const removeItem = (idx: number) => setNewItems(prev => prev.filter((_, i) => i !== idx));
  const addItem = () => setNewItems(prev => [...prev, emptyItem()]);

  // ── Actions ──
  const _handleAnular = async (motivo: string) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/guias-remision/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "anular", motivo }),
      });
      if (!res.ok) throw new Error("Error al anular");
      const updated: GuiaRemision = await res.json();
      setSelected(updated);
      setGuias(prev => prev.map(g => g.id === updated.id ? updated : g));
      setShowAnular(false);
      fetchResumen();
    } catch {
      // error shown in modal state
    } finally {
      setActionLoading(false);
    }
  };

  const handleDuplicate = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/guias-remision/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicar" }),
      });
      if (!res.ok) throw new Error("Error al duplicar");
      fetchGuias();
      fetchResumen();
    } catch {
      // non-critical
    } finally {
      setActionLoading(false);
    }
  };

  const _handleCopyReceptionLink = async () => {
    if (!selected) return;
    const url = `buleje.pe/recepcion/guia/${selected.id}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const _handleExport = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (advFilters.from) params.set("from", advFilters.from);
    if (advFilters.to) params.set("to", advFilters.to);
    window.open(`/api/guias-remision/exportar?${params}`, "_blank");
  };

  const _handlePrintSunat = (g: GuiaRemision) => {
    const placa = getPlaca(g);
    const items = g.items ?? [];
    const pesoTotal = items.reduce((sum, it) => sum + it.cantidad * (it.pesoUnitario || 0), 0);
    const verifyUrl = `buleje.pe/verify/guia/${g.id}`;
    const html = `<!DOCTYPE html><html><head><title>GRR ${g.numero}</title><style>
      @media print { @page { size: A4; margin: 15mm; } }
      body { font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; font-size: 13px; }
      h1 { text-align: center; font-size: 18px; margin: 0; }
      h2 { text-align: center; font-size: 14px; color: #555; margin: 4px 0 20px; }
      .sep { border-top: 1px solid #333; margin: 12px 0; }
      .sep-double { border-top: 3px double #333; margin: 12px 0; }
      .section { margin: 8px 0; }
      .section-title { font-weight: bold; font-size: 12px; text-transform: uppercase; color: #555; margin-bottom: 4px; }
      .row { display: flex; margin: 3px 0; }
      .row-label { width: 160px; font-weight: 600; color: #333; }
      .row-value { flex: 1; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0; }
      th { background: #f5f5f5; text-align: left; padding: 6px 8px; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #333; }
      td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 12px; }
      td.right, th.right { text-align: right; }
      .firmas { margin-top: 60px; display: flex; justify-content: space-between; }
      .firma-box { text-align: center; width: 200px; }
      .firma-line { border-top: 1px solid #000; padding-top: 5px; font-size: 11px; }
      .total-peso { text-align: right; font-weight: bold; font-size: 14px; margin-top: 8px; }
      .verify-box { margin-top: 16px; padding: 8px 12px; border: 1px dashed #999; font-size: 11px; color: #555; text-align: center; }
    </style></head><body>
      <div class="sep-double"></div>
      <h1>GUIA DE REMISION REMITENTE</h1>
      <h2>N.&deg; ${g.numero}</h2>
      <div class="sep-double"></div>
      <div class="section">
        <div class="section-title">Remitente</div>
        <div class="row"><span class="row-label">Nombre/Raz&oacute;n Social:</span><span class="row-value">Buleje</span></div>
        <div class="row"><span class="row-label">Direcci&oacute;n:</span><span class="row-value">${g.puntoPartida}</span></div>
      </div>
      <div class="sep"></div>
      <div class="section">
        <div class="section-title">Destinatario</div>
        <div class="row"><span class="row-label">Nombre/Raz&oacute;n Social:</span><span class="row-value">${g.destinatarioNombre}</span></div>
        ${g.destinatarioRuc ? `<div class="row"><span class="row-label">RUC/DNI:</span><span class="row-value">${g.destinatarioRuc}</span></div>` : ""}
        ${g.destinatarioDireccion ? `<div class="row"><span class="row-label">Direcci&oacute;n:</span><span class="row-value">${g.destinatarioDireccion}</span></div>` : ""}
      </div>
      <div class="sep"></div>
      <div class="section">
        <div class="section-title">Transporte</div>
        ${g.transportistaNombre ? `<div class="row"><span class="row-label">Transportista:</span><span class="row-value">${g.transportistaNombre}</span></div>` : ""}
        ${g.transportistaRuc ? `<div class="row"><span class="row-label">RUC:</span><span class="row-value">${g.transportistaRuc}</span></div>` : ""}
        ${placa ? `<div class="row"><span class="row-label">Placa:</span><span class="row-value">${placa}</span></div>` : ""}
        ${g.conductorNombre ? `<div class="row"><span class="row-label">Conductor:</span><span class="row-value">${g.conductorNombre}</span></div>` : ""}
        ${g.conductorDni ? `<div class="row"><span class="row-label">DNI Conductor:</span><span class="row-value">${g.conductorDni}</span></div>` : ""}
      </div>
      <div class="sep"></div>
      <div class="section">
        <div class="row"><span class="row-label">Punto de partida:</span><span class="row-value">${g.puntoPartida}</span></div>
        <div class="row"><span class="row-label">Punto de llegada:</span><span class="row-value">${g.puntoLlegada}</span></div>
        <div class="row"><span class="row-label">Fecha traslado:</span><span class="row-value">${formatDate(g.fechaTraslado)}</span></div>
        <div class="row"><span class="row-label">Motivo:</span><span class="row-value">${g.motivoTraslado}</span></div>
        ${g.documentoRef ? `<div class="row"><span class="row-label">Doc. Referencia:</span><span class="row-value">${g.documentoRef}</span></div>` : ""}
        ${g.bultos ? `<div class="row"><span class="row-label">Bultos:</span><span class="row-value">${g.bultos}</span></div>` : ""}
      </div>
      <div class="sep"></div>
      <table>
        <thead><tr><th>#</th><th>Descripci&oacute;n</th><th>Unidad</th><th class="right">Cantidad</th><th class="right">Peso unit. (kg)</th><th class="right">Peso total (kg)</th></tr></thead>
        <tbody>
          ${items.map((it, i) => `<tr><td>${i + 1}</td><td>${it.descripcion}</td><td>${it.unidad}</td><td class="right">${it.cantidad}</td><td class="right">${it.pesoUnitario ? it.pesoUnitario.toFixed(2) : "-"}</td><td class="right">${it.pesoUnitario ? (it.cantidad * it.pesoUnitario).toFixed(1) : "-"}</td></tr>`).join("")}
        </tbody>
      </table>
      <div class="total-peso">Peso total: ${pesoTotal > 0 ? pesoTotal.toFixed(1) + " kg" : "N/A"}</div>
      ${g.pesoBruto ? `<div class="total-peso">Peso bruto: ${Number(g.pesoBruto).toFixed(3)} kg</div>` : ""}
      <div class="verify-box">Verificar en: ${verifyUrl}</div>
      <div class="firmas">
        <div class="firma-box"><div class="firma-line">Firma remitente</div></div>
        <div class="firma-box"><div class="firma-line">Firma transportista</div></div>
      </div>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(guias.length / PER_PAGE));
  const paginated = guias.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header — Mejora 20 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary text-white flex items-center justify-center  shrink-0">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Guías de Remisión</h1>
            <p className="text-sm text-gray-500">Documentos de traslado de mercadería</p>
          </div>
        </div>
        <button
          onClick={() => { setShowNew(true); setCreateError(null); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark  transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nueva Guía
        </button>
      </div>

      {/* Mejora 11: KPI Cards */}
      {!loading && guias.length > 0 && (() => {
        const now = new Date();
        const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const emitidasMes = guias.filter(g => g.createdAt.startsWith(mesActual)).length;
        const enTransito = guias.filter(g => g.status === "EN_TRANSITO").length;
        const entregadas = guias.filter(g => g.status === "ENTREGADA").length;
        const anuladas = guias.filter(g => g.status === "ANULADA").length;
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Emitidas este mes", value: emitidasMes, icon: FileText, color: "text-emerald-600", bg: "bg-emerald-100" },
              { label: "En tránsito", value: enTransito, icon: Truck, color: "text-amber-600", bg: "bg-amber-100" },
              { label: "Entregadas", value: entregadas, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-100" },
              { label: "Anuladas", value: anuladas, icon: XCircle, color: anuladas > 0 ? "text-red-600" : "text-gray-400", bg: anuladas > 0 ? "bg-red-100" : "bg-gray-100" },
            ].map(card => {
              const CardIcon = card.icon;
              return (
                <div key={card.label} className="bg-white border border-[var(--rule-base)] rounded-xl  p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", card.bg)}>
                      <CardIcon className={cn("h-3.5 w-3.5", card.color)} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 font-bold">{card.label}</p>
                  <p className="text-2xl font-mono font-bold text-gray-900">{card.value}</p>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por destinatario..."
            aria-label="Buscar guías de remisión"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {/* Mejora 12: Pills coloreadas con count */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {(["", "BORRADOR", "EMITIDA", "EN_TRANSITO", "ENTREGADA", "ANULADA"] as const).map(s => {
            const count = s === "" ? guias.length : guias.filter(g => g.status === s).length;
            const pillColors: Record<string, { active: string; inactive: string }> = {
              "": { active: "bg-primary text-white", inactive: "bg-gray-100 text-gray-600" },
              BORRADOR: { active: "bg-gray-600 text-white", inactive: "bg-gray-100 text-gray-600" },
              EMITIDA: { active: "bg-emerald-600 text-white", inactive: "bg-emerald-50 text-emerald-700" },
              EN_TRANSITO: { active: "bg-amber-500 text-white", inactive: "bg-amber-50 text-amber-700" },
              ENTREGADA: { active: "bg-emerald-600 text-white", inactive: "bg-emerald-50 text-emerald-700" },
              ANULADA: { active: "bg-red-600 text-white", inactive: "bg-red-50 text-red-700" },
            };
            const colors = pillColors[s] ?? pillColors[""];
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5",
                  statusFilter === s ? colors.active : colors.inactive,
                  statusFilter !== s && "hover:opacity-80"
                )}
              >
                {s === "" ? "Todos" : STATUS_META[s].label}
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold min-w-5 text-center",
                  statusFilter === s ? "bg-white/20" : "bg-black/5"
                )}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[var(--rule-base)] rounded-xl overflow-hidden ">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={fetchGuias} className="text-xs text-primary hover:underline font-semibold mt-1">Reintentar</button>
          </div>
        ) : guias.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="text-6xl mb-4">🚚</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Sin guías de remisión</h3>
            <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">Documenta tus envíos de mercadería</p>
            <button onClick={() => { setShowNew(true); setCreateError(null); }} className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-dark">Crear guía</button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full min-w-150 sm:min-w-0 text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule-soft)] text-left">
                    <th className="px-4 py-3 font-semibold text-gray-500">N° GRR</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 hidden sm:table-cell">Fecha traslado</th>
                    <th className="px-4 py-3 font-semibold text-gray-500">Destinatario</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 hidden md:table-cell">Motivo</th>
                    <th className="px-4 py-3 font-semibold text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(g => {
                    const meta = STATUS_META[g.status];
                    return (
                      <tr
                        key={g.id}
                        onClick={() => setSelected(g)}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                          {/* Mejora 17: Preview al hover */}
                          <GuiaHoverRow preview={<GuiaPreview guia={g} />}>
                            <span>{g.numero}</span>
                          </GuiaHoverRow>
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{formatDate(g.fechaTraslado)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                              <Truck className="h-4 w-4 text-emerald-600" />
                            </div>
                            <p className="font-medium text-gray-900 truncate">{g.destinatarioNombre}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{g.motivoTraslado}</td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold", meta.bg, meta.color)}>
                            {meta.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)]">
                <p className="text-xs text-gray-500">
                  {guias.length} guía{guias.length !== 1 ? "s" : ""} — Pág. {page}/{totalPages}
                </p>
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detail Side Panel ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <>
            <m.div key="grr-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)} />
            <m.div key="grr-panel" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white border-l border-[var(--rule-base)] overflow-y-auto">
              <div className="p-4 sm:p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 font-mono">{selected.numero}</h3>
                    <p className="text-xs text-gray-400">Creada: {formatDateTime(selected.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selected.status === "BORRADOR" && (
                      <button onClick={handleDuplicate} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Duplicar">
                        <Copy className="h-4 w-4 text-gray-400" />
                      </button>
                    )}
                    {selected.status !== "ANULADA" && selected.status !== "ENTREGADA" && (
                      <button onClick={() => setShowAnular(true)} className="p-2 rounded-lg hover:bg-red-50 transition-colors" title="Anular">
                        <XCircle className="h-4 w-4 text-red-400" />
                      </button>
                    )}
                    <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                      <X className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900">{selected.destinatarioNombre}</p>
                    <span className={cn("px-2 py-1 rounded-lg text-xs font-bold", STATUS_META[selected.status].bg, STATUS_META[selected.status].color)}>
                      {STATUS_META[selected.status].label}
                    </span>
                  </div>
                  {selected.destinatarioRuc && <p className="text-xs text-gray-500">RUC: {selected.destinatarioRuc}</p>}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--rule-base)] text-xs text-gray-600">
                    <div><p className="font-bold text-gray-400 text-[length:var(--ts-2xs)] uppercase">Motivo</p><p>{selected.motivoTraslado}</p></div>
                    <div><p className="font-bold text-gray-400 text-[length:var(--ts-2xs)] uppercase">Fecha traslado</p><p>{formatDate(selected.fechaTraslado)}</p></div>
                    <div><p className="font-bold text-gray-400 text-[length:var(--ts-2xs)] uppercase">Origen</p><p>{selected.puntoPartida}</p></div>
                    <div><p className="font-bold text-gray-400 text-[length:var(--ts-2xs)] uppercase">Destino</p><p>{selected.puntoLlegada}</p></div>
                  </div>
                  {/* Mejora 8: Tracking mejorado — Transportista + Placa */}
                  <div className="pt-2 border-t border-[var(--rule-base)] space-y-2">
                    <p className="font-bold text-gray-400 text-[length:var(--ts-2xs)] uppercase">Transportista</p>
                    {selected.transportistaNombre ? (
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <Truck className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">{selected.transportistaNombre}</p>
                          {selected.transportistaRuc && <p className="text-[length:var(--ts-2xs)] text-gray-400">RUC: {selected.transportistaRuc}</p>}
                        </div>
                        {selected.transportistaPlaca ? (
                          <span className="px-2 py-1 rounded-lg bg-emerald-50 text-xs font-bold text-emerald-700 flex items-center gap-1">
                            {selected.transportistaPlaca}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-lg bg-amber-50 text-[length:var(--ts-2xs)] font-bold text-amber-700">
                            Agregar placa
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">Sin transportista asignado</p>
                    )}
                  </div>

                  {/* Conductor */}
                  {(selected.conductorNombre || selected.conductorDni) && (
                    <div className="pt-2 border-t border-[var(--rule-base)] space-y-1">
                      <p className="font-bold text-gray-400 text-[length:var(--ts-2xs)] uppercase">Conductor</p>
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        <div className="h-8 w-8 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-[var(--text-secondary)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {selected.conductorNombre && <p className="font-medium text-gray-900">{selected.conductorNombre}</p>}
                          {selected.conductorDni && <p className="text-[length:var(--ts-2xs)] text-gray-400">DNI: {selected.conductorDni}</p>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Detalles adicionales: bultos, doc ref, pesos */}
                  {(selected.bultos || selected.documentoRef || selected.pesoTotal || selected.pesoBruto) && (
                    <div className="pt-2 border-t border-[var(--rule-base)]">
                      <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                        {selected.bultos != null && (
                          <div>
                            <p className="font-bold text-gray-400 text-[length:var(--ts-2xs)] uppercase">Bultos</p>
                            <p className="font-semibold text-gray-900">{selected.bultos}</p>
                          </div>
                        )}
                        {selected.documentoRef && (
                          <div>
                            <p className="font-bold text-gray-400 text-[length:var(--ts-2xs)] uppercase">Doc. Referencia</p>
                            <p className="font-semibold text-gray-900">{selected.documentoRef}</p>
                          </div>
                        )}
                        {selected.pesoTotal != null && (
                          <div>
                            <p className="font-bold text-gray-400 text-[length:var(--ts-2xs)] uppercase">Peso Neto</p>
                            <p className="font-semibold text-gray-900">{Number(selected.pesoTotal).toFixed(2)} kg</p>
                          </div>
                        )}
                        {selected.pesoBruto != null && (
                          <div>
                            <p className="font-bold text-gray-400 text-[length:var(--ts-2xs)] uppercase">Peso Bruto</p>
                            <p className="font-semibold text-gray-900">{Number(selected.pesoBruto).toFixed(3)} kg</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Mejora 8: Timeline de estados */}
                  <div className="pt-2 border-t border-[var(--rule-base)]">
                    <p className="font-bold text-gray-400 text-[length:var(--ts-2xs)] uppercase mb-2">Timeline de estados</p>
                    <div className="space-y-0">
                      {(["BORRADOR", "EMITIDA", "EN_TRANSITO", "ENTREGADA"] as const).map((st, idx) => {
                        const statusOrder: GuiaStatus[] = ["BORRADOR", "EMITIDA", "EN_TRANSITO", "ENTREGADA"];
                        const currentIdx = statusOrder.indexOf(selected.status === "ANULADA" ? "BORRADOR" : selected.status);
                        const isDone = idx <= currentIdx && selected.status !== "ANULADA";
                        const meta = STATUS_META[st];
                        return (
                          <div key={st} className="flex gap-3 items-start">
                            <div className="flex flex-col items-center">
                              <div className={cn(
                                "h-5 w-5 rounded-full flex items-center justify-center",
                                isDone ? "bg-emerald-100" : "bg-gray-100"
                              )}>
                                {isDone ? (
                                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                ) : (
                                  <div className="h-2 w-2 rounded-full bg-gray-300" />
                                )}
                              </div>
                              {idx < 3 && <div className={cn("w-0.5 h-5", isDone ? "bg-emerald-200" : "bg-gray-200")} />}
                            </div>
                            <div className="pb-2">
                              <p className={cn("text-xs font-bold", isDone ? "text-gray-900" : "text-gray-400")}>{meta.label}</p>
                              {isDone && idx === 0 && <p className="text-[length:var(--ts-2xs)] text-gray-400">{formatDate(selected.createdAt)}</p>}
                              {isDone && idx === currentIdx && idx > 0 && <p className="text-[length:var(--ts-2xs)] text-gray-400">{formatDate(selected.updatedAt)}</p>}
                              {!isDone && <p className="text-[length:var(--ts-2xs)] text-gray-400 italic">pendiente</p>}
                            </div>
                          </div>
                        );
                      })}
                      {selected.status === "ANULADA" && (
                        <div className="flex gap-3 items-center mt-1">
                          <div className="h-5 w-5 rounded-full bg-red-100 flex items-center justify-center">
                            <div className="h-2 w-2 rounded-full bg-red-500" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-red-600">ANULADA</p>
                            <p className="text-[length:var(--ts-2xs)] text-gray-400">{formatDate(selected.updatedAt)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-3">Items</h4>
                  <div className="space-y-2">
                    {(selected.items ?? []).map((item, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.descripcion}</p>
                          <p className="text-xs text-gray-400">{item.cantidad} {item.unidad} {item.pesoUnitario ? `· ${item.pesoUnitario} kg` : ""}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mejora 11: Peso total calculado */}
                {(() => {
                  const items = selected.items ?? [];
                  const itemsConPeso = items.filter(it => it.pesoUnitario && it.pesoUnitario > 0);
                  const itemsSinPeso = items.filter(it => !it.pesoUnitario || it.pesoUnitario <= 0);
                  const pesoTotal = itemsConPeso.reduce((sum, it) => sum + (it.cantidad * (it.pesoUnitario || 0)), 0);
                  return (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-700">Peso total</span>
                        <span className="text-lg font-extrabold text-primary">
                          {pesoTotal > 0 ? `${pesoTotal.toFixed(1)} kg` : "Sin datos de peso"}
                        </span>
                      </div>
                      {itemsSinPeso.length > 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          {itemsSinPeso.length} item{itemsSinPeso.length !== 1 ? "s" : ""} sin peso registrado
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Mejora 12: Imprimir GRR formato SUNAT */}
                <div className="flex gap-2">
                  <button onClick={() => window.print()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                    <Printer className="h-4 w-4" /> Imprimir
                  </button>
                  <button
                    onClick={() => printGuiaSunat(selected, formatDate)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark  transition-colors"
                  >
                    <Printer className="h-4 w-4" /> GRR SUNAT
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* ── New Guía Modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNew && (
          <>
            <m.div key="ng-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setShowNew(false)} />
            <m.div
              key="ng-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
              onClick={e => e.target === e.currentTarget && setShowNew(false)}
            >
              <div className="w-full max-w-3xl bg-white border border-[var(--rule-base)] rounded-xl flex flex-col max-h-[90vh] my-8">
                {/* UX Mejora 12: Sticky header */}
                <div className="sticky top-0 z-10 bg-white border-b border-[var(--rule-base)] px-6 py-4 flex items-center justify-between rounded-t-2xl">
                  <h3 className="text-lg font-semibold text-gray-900">Nueva Guía de Remisión</h3>
                  <button onClick={() => setShowNew(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Order ID optional */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Vincular pedido (opcional)</label>
                    <input type="text" value={form.orderIds} onChange={e => setForm(p => ({ ...p, orderIds: e.target.value }))} placeholder="N° de orden"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  {/* Motivo */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Motivo de traslado</label>
                    <select value={form.motivoTraslado} onChange={e => setForm(p => ({ ...p, motivoTraslado: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30">
                      {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  {/* Destinatario */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Destinatario</label>
                    <input type="text" value={form.destinatarioNombre} onChange={e => setForm(p => ({ ...p, destinatarioNombre: e.target.value }))} placeholder="Nombre"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">RUC destinatario</label>
                    <input type="text" value={form.destinatarioRuc} onChange={e => setForm(p => ({ ...p, destinatarioRuc: e.target.value }))} placeholder="20XXXXXXXXX"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-600 mb-1">Dirección destinatario</label>
                    <input type="text" value={form.destinatarioDireccion} onChange={e => setForm(p => ({ ...p, destinatarioDireccion: e.target.value }))} placeholder="Dirección"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  {/* Transportista */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Transportista</label>
                    <input type="text" value={form.transportistaNombre} onChange={e => setForm(p => ({ ...p, transportistaNombre: e.target.value }))} placeholder="Nombre"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">RUC transp.</label>
                      <input type="text" value={form.transportistaRuc} onChange={e => setForm(p => ({ ...p, transportistaRuc: e.target.value }))} placeholder="RUC"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">Placa</label>
                      <input type="text" value={form.vehiculoPlaca} onChange={e => setForm(p => ({ ...p, vehiculoPlaca: e.target.value }))} placeholder="ABC-123"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                  {/* Partida / Llegada */}
                  {/* Conductor */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Conductor</label>
                    <input type="text" value={form.conductorNombre} onChange={e => setForm(p => ({ ...p, conductorNombre: e.target.value }))} placeholder="Nombre del conductor"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">DNI Conductor</label>
                    <input type="text" value={form.conductorDni} onChange={e => setForm(p => ({ ...p, conductorDni: e.target.value.replace(/\D/g, "").slice(0, 8) }))} placeholder="12345678" maxLength={8}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  {/* Bultos / Doc Referencia / Peso Bruto */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">N° Bultos</label>
                    <input type="number" min="0" value={form.bultos} onChange={e => setForm(p => ({ ...p, bultos: e.target.value }))} placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Doc. Referencia</label>
                    <input type="text" value={form.documentoRef} onChange={e => setForm(p => ({ ...p, documentoRef: e.target.value }))} placeholder="Factura, boleta u orden"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Peso Bruto (kg)</label>
                    <input type="number" min="0" step="0.001" value={form.pesoBruto} onChange={e => setForm(p => ({ ...p, pesoBruto: e.target.value }))} placeholder="0.000"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  {/* Ruta */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Punto de partida</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input type="text" value={form.puntoPartida} onChange={e => setForm(p => ({ ...p, puntoPartida: e.target.value }))} placeholder="Dirección origen"
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Punto de llegada</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input type="text" value={form.puntoLlegada} onChange={e => setForm(p => ({ ...p, puntoLlegada: e.target.value }))} placeholder="Dirección destino"
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                  {/* Fecha */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Fecha y hora de traslado</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input type="datetime-local" value={form.fechaTraslado} onChange={e => setForm(p => ({ ...p, fechaTraslado: e.target.value }))}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Items</h4>
                  <div className="space-y-2">
                    {newItems.map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input type="text" value={item.descripcion} onChange={e => updateItem(idx, "descripcion", e.target.value)} placeholder="Descripción"
                          className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        <input type="number" min="1" value={item.cantidad} onChange={e => updateItem(idx, "cantidad", e.target.value)} placeholder="Cant."
                          className="w-16 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-center text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        <input type="text" value={item.unidad} onChange={e => updateItem(idx, "unidad", e.target.value)} placeholder="Und"
                          className="w-16 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-center text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        <input type="number" min="0" step="0.1" value={item.pesoUnitario} onChange={e => updateItem(idx, "pesoUnitario", e.target.value)} placeholder="Peso kg"
                          className="w-20 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-center text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        {newItems.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={addItem} className="flex items-center gap-1 text-xs font-bold text-primary hover:underline mt-2">
                    <Plus className="h-3.5 w-3.5" /> Agregar item
                  </button>

                  {/* Mejora 11: Peso total calculado en formulario */}
                  {(() => {
                    const itemsConPeso = newItems.filter(it => parseFloat(it.pesoUnitario) > 0);
                    const itemsSinPeso = newItems.filter(it => it.descripcion.trim() && (!it.pesoUnitario || parseFloat(it.pesoUnitario) <= 0));
                    const pesoTotal = itemsConPeso.reduce((sum, it) => sum + ((parseFloat(it.cantidad) || 0) * (parseFloat(it.pesoUnitario) || 0)), 0);
                    return pesoTotal > 0 || itemsSinPeso.length > 0 ? (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-bold text-gray-700">Peso total:</span>
                          <span className="font-extrabold text-primary">{pesoTotal.toFixed(1)} kg</span>
                        </div>
                        {itemsSinPeso.length > 0 && (
                          <p className="text-[length:var(--ts-2xs)] text-amber-600 mt-1">
                            {itemsSinPeso.length} item{itemsSinPeso.length !== 1 ? "s" : ""} sin peso registrado
                          </p>
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>

                {createError && <p className="text-xs text-red-600 font-semibold">{createError}</p>}
                </div>
                {/* UX Mejora 12: Sticky footer */}
                <div className="sticky bottom-0 bg-white border-t border-[var(--rule-base)] px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
                  <button onClick={() => setShowNew(false)}
                    className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleCreate} disabled={creating}
                    className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 rounded-lg  transition-colors">
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Crear Guía
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
