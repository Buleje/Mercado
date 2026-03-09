﻿"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  Trash2, Pencil, Check, X, AlertTriangle,
  Users, Star, LogOut, ShoppingBasket, MessageCircle, ShoppingCart,
  Loader2, Truck, HandCoins, FileText, Settings, Menu, Store,
  MapPin, Clock, Phone, Image as ImageIcon, AlignLeft, ExternalLink, Search, User, Megaphone,
  BarChart3, Upload, ArrowUp, ArrowDown, Eye, EyeOff, Link as LinkIcon,
  Monitor, Boxes, Calculator, Lock, ChevronRight, Activity,
  Ticket, RotateCcw, TrendingUp, Brain, CalendarDays, MessageSquare, FileBarChart,
  Heart, RefreshCw, Wallet, Package, Bell, UserCog,
} from "lucide-react";
import type { DbCustomer, DbReview, DbOrder, OrderStatus, StoreMode } from "@/lib/jsondb";
import { googleMapsUrl } from "@/lib/order-utils";
import { cn } from "@/lib/utils";

// Lazy-load heavy admin tabs for better initial load performance
const TabSpinner = () => (
  <div className="space-y-4 animate-pulse">
    <div className="flex items-center gap-3">
      <div className="h-8 w-48 bg-gray-200 dark:bg-surface rounded-lg" />
      <div className="h-8 w-32 bg-gray-200 dark:bg-surface rounded-lg ml-auto" />
    </div>
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-surface rounded w-1/3" />
            <div className="h-6 bg-gray-200 dark:bg-surface rounded w-2/3" />
          </div>
        ))}
      </div>
    </div>
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6 space-y-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-10 w-10 bg-gray-200 dark:bg-surface rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-surface rounded w-1/2" />
            <div className="h-3 bg-gray-200 dark:bg-surface rounded w-1/3" />
          </div>
          <div className="h-8 w-20 bg-gray-200 dark:bg-surface rounded-lg" />
        </div>
      ))}
    </div>
  </div>
);
const SuppliersTab = dynamic(() => import("@/components/admin/SuppliersTab"), { loading: TabSpinner });
const PurchaseOrdersTab = dynamic(() => import("@/components/admin/PurchaseOrdersTab"), { loading: TabSpinner });
const PayablesTab = dynamic(() => import("@/components/admin/PayablesTab"), { loading: TabSpinner });
const PromotionsTab = dynamic(() => import("@/components/admin/PromotionsTab"), { loading: TabSpinner });
const DashboardTab = dynamic(() => import("@/components/admin/DashboardTab"), { loading: TabSpinner });
const POSView = dynamic(() => import("@/components/admin/POSView"), { loading: TabSpinner });
const InventoryTab = dynamic(() => import("@/components/admin/InventoryTab"), { loading: TabSpinner });
const CashRegisterTab = dynamic(() => import("@/components/admin/CashRegisterTab"), { loading: TabSpinner });
const ActivityLogTab = dynamic(() => import("@/components/admin/ActivityLogTab"), { loading: TabSpinner });
const CouponsTab = dynamic(() => import("@/components/admin/CouponsTab"), { loading: TabSpinner });
const ReturnsTab = dynamic(() => import("@/components/admin/ReturnsTab"), { loading: TabSpinner });
const PriceHistoryTab = dynamic(() => import("@/components/admin/PriceHistoryTab"), { loading: TabSpinner });
const DemandPredictionTab = dynamic(() => import("@/components/admin/DemandPredictionTab"), { loading: TabSpinner });
const DeliveryCalendarTab = dynamic(() => import("@/components/admin/DeliveryCalendarTab"), { loading: TabSpinner });
const AdminChatTab = dynamic(() => import("@/components/admin/AdminChatTab"), { loading: TabSpinner });
const SupplierEvaluationsTab = dynamic(() => import("@/components/admin/SupplierEvaluationsTab"), { loading: TabSpinner });
const ReportsTab = dynamic(() => import("@/components/admin/ReportsTab"), { loading: TabSpinner });
const LoyaltyTab = dynamic(() => import("@/components/admin/LoyaltyTab"), { loading: TabSpinner });
const AutoReorderTab = dynamic(() => import("@/components/admin/AutoReorderTab"), { loading: TabSpinner });
const ExpensesTab = dynamic(() => import("@/components/admin/ExpensesTab"), { loading: TabSpinner });
const BundlesTab = dynamic(() => import("@/components/admin/BundlesTab"), { loading: TabSpinner });
const NotificationsTab = dynamic(() => import("@/components/admin/NotificationsTab"), { loading: TabSpinner });
const AdminUsersTab = dynamic(() => import("@/components/admin/AdminUsersTab"), { loading: TabSpinner });

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

type Tab = "dashboard" | "pos" | "inventario" | "clientes" | "reseñas" | "pedidos" | "proveedores" | "compras" | "cuentas" | "caja" | "promociones" | "actividad" | "configuracion" | "cupones" | "devoluciones" | "historial-precios" | "prediccion" | "entregas" | "chat" | "evaluaciones" | "reportes" | "fidelizacion" | "auto-reorden" | "gastos" | "combos" | "notificaciones" | "usuarios-admin";

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};
const STATUS_COLORS: Record<OrderStatus, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  confirmado: "bg-blue-100 text-blue-700",
  en_camino: "bg-purple-100 text-purple-700",
  entregado: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-red-100 text-red-500",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function Stars({ rating }: { rating: number }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? "text-amber-400" : "text-gray-200"}>★</span>
      ))}
    </span>
  );
}

function parseGps(loc: string): { lat: number; lon: number } | null {
  const m = loc.match(/GPS:\s*([\d.-]+),\s*([\d.-]+)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function avatarColor(name: string): string {
  const colors = ["#ef4444","#f97316","#f59e0b","#65a30d","#16a34a","#14b8a6","#0891b2","#0ea5e9","#3b82f6","#6366f1","#8b5cf6","#a855f7","#ec4899","#f43f5e"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const safe = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rich = safe
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-gray-900 dark:text-foreground">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em class="italic text-gray-600 dark:text-muted">$1</em>');
    const isList = /^[-*] /.test(line) || /^\d+\. /.test(line);
    if (!isList && inList) { out.push("</ul>"); inList = false; }
    if (line.startsWith("#### ")) {
      out.push(`<div class="mt-4 mb-1.5 flex items-center gap-2"><span class="w-1 h-4 rounded-full bg-violet-400 shrink-0 inline-block"></span><h4 class="text-xs font-bold text-violet-700 uppercase tracking-wider">${rich.slice(5)}</h4></div>`);
    } else if (line.startsWith("### ")) {
      out.push(`<div class="mt-3 mb-1 flex items-center gap-2"><span class="w-1 h-4 rounded-full bg-indigo-400 shrink-0 inline-block"></span><h3 class="text-xs font-bold text-indigo-700 uppercase tracking-wider">${rich.slice(4)}</h3></div>`);
    } else if (line.startsWith("## ")) {
      out.push(`<h2 class="text-sm font-bold text-gray-900 dark:text-foreground mt-5 mb-2 pb-1 border-b-2 border-violet-200">${rich.slice(3)}</h2>`);
    } else if (line.startsWith("# ")) {
      out.push(`<h1 class="text-base font-extrabold text-gray-900 dark:text-foreground mt-4 mb-2">${rich.slice(2)}</h1>`);
    } else if (/^[-*] /.test(line)) {
      if (!inList) { out.push(`<ul class="space-y-1 my-1.5">`); inList = true; }
      out.push(`<li class="flex items-start gap-2 text-sm text-gray-700 dark:text-foreground leading-relaxed"><span class="text-violet-400 shrink-0 mt-0.5">▸</span><span>${rich.slice(2)}</span></li>`);
    } else if (/^\d+\. /.test(line)) {
      if (!inList) { out.push(`<ul class="space-y-1 my-1.5">`); inList = true; }
      const num = line.match(/^(\d+)\./)?.[1] ?? "•";
      out.push(`<li class="flex items-start gap-2 text-sm text-gray-700 dark:text-foreground leading-relaxed"><span class="text-violet-500 font-bold shrink-0 text-xs mt-0.5">${num}.</span><span>${rich.replace(/^\d+\.\s/, "")}</span></li>`);
    } else if (line === "") {
      out.push('<div class="h-1.5"></div>');
    } else {
      out.push(`<p class="text-sm text-gray-700 dark:text-foreground leading-relaxed">${rich}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

// ── Customers Tab ─────────────────────────────────────────────────────────────

type CustomerStats = { phone: string; name: string; orderCount: number; totalSpent: number; stars: number };

function computeStars(totalSpent: number): number {
  if (totalSpent >= 500) return 5;
  if (totalSpent >= 300) return 4;
  if (totalSpent >= 150) return 3;
  if (totalSpent >= 50) return 2;
  if (totalSpent > 0) return 1;
  return 0;
}

function CustomersTab() {
  const [customers, setCustomers] = useState<DbCustomer[]>([]);
  const [orders, setOrders] = useState<DbOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<"stars" | "orders" | "spent" | "name">("stars");

  // Customer detail side-panel
  const [selectedCustomer, setSelectedCustomer] = useState<DbCustomer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<DbOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Order detail modal
  const [detailOrder, setDetailOrder] = useState<DbOrder | null>(null);

  // AI analysis
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [aiAnalysisSaved, setAiAnalysisSaved] = useState(false);

  // Delete confirm
  const [confirmDeletePhone, setConfirmDeletePhone] = useState<string | null>(null);

  useScrollLock(!!selectedCustomer || !!detailOrder || showAiModal || !!confirmDeletePhone);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, oRes] = await Promise.all([
        fetch("/api/customers"),
        fetch("/api/orders"),
      ]);
      if (cRes.ok) setCustomers(await cRes.json());
      if (oRes.ok) setOrders(await oRes.json());
    } catch {}
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // Compute stats for each customer
  const statsMap = new Map<string, CustomerStats>();
  for (const c of customers) {
    statsMap.set(c.phone, { phone: c.phone, name: c.name, orderCount: 0, totalSpent: 0, stars: 0 });
  }
  for (const o of orders) {
    const ph = o.customer.phone;
    if (!ph) continue;
    const stat = statsMap.get(ph);
    if (stat) {
      stat.orderCount += 1;
      stat.totalSpent += o.total;
    }
  }
  for (const s of statsMap.values()) {
    s.stars = computeStars(s.totalSpent);
  }

  const q = searchText.toLowerCase();
  const filtered = customers
    .filter(c => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q))
    .sort((a, b) => {
      const sa = statsMap.get(a.phone)!;
      const sb = statsMap.get(b.phone)!;
      if (sortBy === "stars") return sb.stars - sa.stars || sb.totalSpent - sa.totalSpent;
      if (sortBy === "spent") return sb.totalSpent - sa.totalSpent;
      if (sortBy === "orders") return sb.orderCount - sa.orderCount;
      return a.name.localeCompare(b.name);
    });

  const openCustomerDetail = async (c: DbCustomer) => {
    setSelectedCustomer(c);
    setAiAnalysis(c.aiNotes ?? null);
    setAiAnalysisSaved(!!c.aiNotes);
    setLoadingOrders(true);
    try {
      const r = await fetch(`/api/customers/${encodeURIComponent(c.phone)}/orders`);
      if (r.ok) setCustomerOrders(await r.json());
      else setCustomerOrders([]);
    } catch { setCustomerOrders([]); }
    setLoadingOrders(false);
  };

  const requestAiAnalysis = async (phone: string) => {
    setLoadingAi(true);
    setAiAnalysis(null);
    setAiAnalysisSaved(false);
    setShowAiModal(true);
    try {
      const r = await fetch(`/api/customers/${encodeURIComponent(phone)}/ai-analysis`, { method: "POST" });
      const data = await r.json();
      if (data.error) setAiAnalysis(`⚠️ ${data.error}`);
      else setAiAnalysis(data.analysis);
    } catch { setAiAnalysis("Error al conectar con el servicio de IA."); }
    setLoadingAi(false);
  };

  const saveAiAnalysis = async () => {
    if (!selectedCustomer || !aiAnalysis || savingAi) return;
    setSavingAi(true);
    try {
      const r = await fetch(`/api/customers/${encodeURIComponent(selectedCustomer.phone)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiNotes: aiAnalysis }),
      });
      if (r.ok) {
        const now = new Date().toISOString();
        setSelectedCustomer(prev => prev ? { ...prev, aiNotes: aiAnalysis, aiNotesDate: now } : prev);
        setCustomers(prev => prev.map(c => c.phone === selectedCustomer.phone ? { ...c, aiNotes: aiAnalysis, aiNotesDate: now } : c));
        setAiAnalysisSaved(true);
      }
    } catch {}
    setSavingAi(false);
  };

  const confirmDelete = async () => {
    if (!confirmDeletePhone) return;
    await fetch(`/api/customers/${encodeURIComponent(confirmDeletePhone)}`, { method: "DELETE" });
    setConfirmDeletePhone(null);
    if (selectedCustomer?.phone === confirmDeletePhone) setSelectedCustomer(null);
    load();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">Clientes</h2>
          <p className="text-sm text-gray-500 dark:text-muted">{customers.length} registrados</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center w-10 pointer-events-none">
              <Search className="h-4 w-4 text-violet-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar cliente…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="pl-10 pr-8 py-2.5 text-sm rounded-2xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface outline-none focus:bg-white dark:focus:bg-card focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all w-56 placeholder:text-gray-400 dark:placeholder:text-muted font-medium text-gray-700 dark:text-foreground"
            />
            {searchText && (
              <button onClick={() => setSearchText("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-300 hover:bg-gray-400 flex items-center justify-center transition-colors">
                <X className="h-3 w-3 text-white" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-accent rounded-xl p-1">
            {(["stars","spent","orders","name"] as const).map(v => {
              const labels: Record<string, string> = { stars: "â­ Estrellas", spent: "💰 Gasto", orders: "📦 Pedidos", name: "🗤 Nombre" };
              return (
                <button key={v} onClick={() => setSortBy(v)}
                  className={cn("px-3 py-1 rounded-lg text-xs font-semibold transition-all",
                    sortBy === v ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm" : "text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground"
                  )}>{labels[v]}</button>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">
          {searchText ? "Sin resultados" : "No hay clientes registrados"}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((c) => {
            const stat = statsMap.get(c.phone)!;
            return (
              <div
                key={c.phone}
                className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:border-gray-300 transition-all"
                onClick={() => openCustomerDetail(c)}
              >
                <div className="flex items-center gap-2.5 px-3 py-2">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{background: avatarColor(c.name)}}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-gray-900 dark:text-foreground">{c.name}</p>
                      {stat.stars > 0 && (
                        <span className="text-xs font-bold tracking-wider">
                          <span className="text-amber-400">{"★".repeat(stat.stars)}</span><span className="text-gray-200">{"★".repeat(5 - stat.stars)}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-400 dark:text-muted font-mono">{c.phone}</span>
                      {stat.orderCount > 0 && (
                        <>
                          <span className="text-gray-300 dark:text-muted text-xs">•</span>
                          <span className="text-xs text-gray-500 dark:text-muted">{stat.orderCount} pedido{stat.orderCount !== 1 ? "s" : ""}</span>
                          <span className="text-gray-300 dark:text-muted text-xs">•</span>
                          <span className="text-xs font-bold text-emerald-600">S/{stat.totalSpent.toFixed(2)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => { openCustomerDetail(c); setTimeout(() => { requestAiAnalysis(c.phone); }, 50); }}
                      className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors",
                        c.aiNotes ? "text-violet-600 hover:bg-violet-100" : "text-gray-400 dark:text-muted hover:text-violet-600 hover:bg-violet-50"
                      )}
                      title={c.aiNotes ? "Ver análisis guardado" : "Generar análisis IA"}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>Análisis IA</span>
                      {c.aiNotes && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />}
                    </button>
                    <a
                      href={`https://wa.me/51${c.phone.replace(/\D/g, "")}`}
                      target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-green-500 hover:bg-green-50 transition-colors"
                      title="WhatsApp"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                    {c.location && (
                      <a
                        href={googleMapsUrl(c.location)}
                        target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"
                        title="Ver en Maps"
                      >
                        <MapPin className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      onClick={() => setConfirmDeletePhone(c.phone)}
                      className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Customer Detail Modal ─────────────────────────────────────────── */}
      {selectedCustomer && (
        <div className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/50" style={{ zIndex: 100 }} onClick={() => setSelectedCustomer(null)}>
          <div className="bg-white dark:bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Colored header */}
            <div className="rounded-t-2xl sm:rounded-t-2xl px-5 py-4 shrink-0" style={{ background: 'linear-gradient(to right, #6366f1, #7c3aed)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0" style={{background: avatarColor(selectedCustomer.name), boxShadow:'0 0 0 2px rgba(255,255,255,0.35)'}}>
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-base leading-tight">{selectedCustomer.name}</h3>
                    <p className="text-xs font-mono" style={{color:'rgba(199,210,254,0.9)'}}>{selectedCustomer.phone}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="p-1.5 rounded-lg transition-colors" style={{color:'rgba(255,255,255,0.65)'}}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* Stats inline */}
              {(() => {
                const stat = statsMap.get(selectedCustomer.phone)!;
                return (
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex-1 rounded-xl px-3 py-2 text-center" style={{background:'rgba(255,255,255,0.15)'}}>
                      <div className="flex justify-center">
                        {[1,2,3,4,5].map(n => (
                          <span key={n} className="text-xs" style={{color: n <= stat.stars ? '#fcd34d' : 'rgba(255,255,255,0.2)'}}>★</span>
                        ))}
                      </div>
                      <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.7)'}}>Rating</p>
                    </div>
                    <div className="flex-1 rounded-xl px-3 py-2 text-center" style={{background:'rgba(255,255,255,0.15)'}}>
                      <p className="text-white font-extrabold text-base leading-none">{stat.orderCount}</p>
                      <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.7)'}}>Pedidos</p>
                    </div>
                    <div className="flex-1 rounded-xl px-3 py-2 text-center" style={{background:'rgba(255,255,255,0.15)'}}>
                      <p className="text-white font-extrabold text-sm leading-none">S/{stat.totalSpent.toFixed(2)}</p>
                      <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.7)'}}>Gastado</p>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

              {/* Location */}
              {selectedCustomer.location && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Dirección</p>
                  <div className="flex items-start gap-2">
                    <p className="text-sm text-gray-700 dark:text-foreground">{selectedCustomer.location}</p>
                    <a
                      href={googleMapsUrl(selectedCustomer.location)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-1 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                  {selectedCustomer.reference && (
                    <p className="text-xs text-gray-500 dark:text-muted">Ref: {selectedCustomer.reference}</p>
                  )}
                </div>
              )}

              {/* AI Analysis CTA */}
              <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(to bottom right, #8b5cf6, #9333ea)' }}>
                    <MessageCircle className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-violet-800">Análisis IA</p>
                    {selectedCustomer.aiNotesDate ? (
                      <p className="text-xs text-violet-500">Guardado el {formatDate(selectedCustomer.aiNotesDate)}</p>
                    ) : (
                      <p className="text-xs text-violet-400">Sin análisis guardado</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedCustomer.aiNotes && (
                    <button
                      onClick={() => { setAiAnalysis(selectedCustomer.aiNotes!); setAiAnalysisSaved(true); setShowAiModal(true); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-card border border-violet-200 text-violet-700 hover:bg-violet-50 transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Ver guardado
                    </button>
                  )}
                  <button
                    onClick={() => requestAiAnalysis(selectedCustomer.phone)}
                    disabled={loadingAi}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-white hover:brightness-110 transition-all disabled:opacity-60"
                    style={{ background: 'linear-gradient(to right, #8b5cf6, #9333ea)' }}
                  >
                    {loadingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                    {selectedCustomer.aiNotes ? "Generar nuevo" : "Generar análisis"}
                  </button>
                </div>
              </div>

              {/* Purchase history */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Historial de compras</p>
                {loadingOrders ? (
                  <div className="h-20 flex items-center justify-center text-gray-400 dark:text-muted text-sm"><Loader2 className="h-4 w-4 animate-spin mr-2" />Cargando…</div>
                ) : customerOrders.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-muted py-4 text-center">Sin compras registradas</p>
                ) : (
                  <div className="space-y-2">
                    {customerOrders.map(o => (
                      <div
                        key={o.id}
                        className="bg-gray-50 dark:bg-surface rounded-xl p-3 border border-gray-100 dark:border-card-border cursor-pointer hover:bg-gray-100 dark:hover:bg-accent transition-colors"
                        onClick={() => setDetailOrder(o)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-gray-900 dark:text-foreground">{formatDate(o.createdAt)}</span>
                              <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                                {STATUS_LABELS[o.status]}
                              </span>
                              {o.paymentMethod && (
                                <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold",
                                  o.paymentMethod === "yape" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
                                )}>
                                  {o.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-muted mt-1 truncate">
                              {o.items.map(i => `${i.quantity}Ã— ${i.name}`).join(", ")}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-primary shrink-0">S/{o.total.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Saved locations */}
              {selectedCustomer.locations && selectedCustomer.locations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Direcciones guardadas</p>
                  {selectedCustomer.locations.map(loc => (
                    <div key={loc.id} className="flex items-start gap-2 bg-gray-50 dark:bg-surface rounded-xl px-3 py-2 border border-gray-100 dark:border-card-border">
                      <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-foreground">{loc.location}</p>
                        {loc.reference && <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{loc.reference}</p>}
                      </div>
                      <a href={googleMapsUrl(loc.location)} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1">
                        <ExternalLink className="h-3.5 w-3.5" /> Maps
                      </a>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-gray-400 dark:text-muted">Registrado: {formatDate(selectedCustomer.createdAt)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Order Detail Modal (from customer history) ────────────────────── */}
      {detailOrder && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 200 }} onClick={() => setDetailOrder(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Detalle del pedido</h3>
              <button onClick={() => setDetailOrder(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Cliente</p>
                <p className="font-bold text-gray-900 dark:text-foreground">{detailOrder.customer.name}</p>
                {detailOrder.customer.phone && (
                  <p className="text-sm text-gray-500 dark:text-muted flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0" /> {detailOrder.customer.phone}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Dirección</p>
                <div className="flex items-start gap-2">
                  <p className="text-sm text-gray-700 dark:text-foreground flex-1">{detailOrder.customer.location}</p>
                  <a href={googleMapsUrl(detailOrder.customer.location)} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 p-1 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                {detailOrder.customer.reference && (
                  <p className="text-xs text-gray-500 dark:text-muted">Ref: {detailOrder.customer.reference}</p>
                )}
              </div>
              {detailOrder.paymentMethod && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Pago</p>
                  <p className="text-sm text-gray-700 dark:text-foreground font-semibold">
                    {detailOrder.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                    {detailOrder.yapeOperationNumber && (
                      <span className="text-gray-400 dark:text-muted font-mono ml-2">Nº Op. {detailOrder.yapeOperationNumber}</span>
                    )}
                  </p>
                </div>
              )}
              {detailOrder.notes && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Notas</p>
                  <p className="text-sm text-gray-600 dark:text-muted italic">{detailOrder.notes}</p>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Productos</p>
                <div className="rounded-xl border border-gray-100 dark:border-card-border divide-y divide-gray-100 overflow-hidden">
                  {detailOrder.items.map((item, i) => (
                    <div key={i} className="flex justify-between items-center px-3 py-2 text-sm">
                      <span className="text-gray-700 dark:text-foreground">{item.quantity}Ã— {item.name} <span className="text-gray-400 dark:text-muted">({item.unit})</span></span>
                      <span className="font-semibold text-gray-900 dark:text-foreground">S/{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center px-3 py-2 bg-gray-50 dark:bg-surface font-bold text-sm">
                    <span className="text-gray-800 dark:text-foreground">Total</span>
                    <span className="text-primary">S/{detailOrder.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 items-center text-xs text-gray-400 dark:text-muted">
                <span>ID: {detailOrder.id}</span>
                <span>Fecha: {formatDate(detailOrder.createdAt)}</span>
                <span className={cn("inline-flex px-2 py-0.5 rounded-full font-bold", STATUS_COLORS[detailOrder.status])}>
                  {STATUS_LABELS[detailOrder.status]}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Analysis Modal ─────────────────────────────────────────────── */}
      {showAiModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 300 }} onClick={() => setShowAiModal(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="rounded-t-2xl px-5 py-4 shrink-0" style={{ background: 'linear-gradient(to right, #8b5cf6, #9333ea)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-card/20 flex items-center justify-center">
                    <MessageCircle className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-base">Análisis IA</h3>
                    {selectedCustomer && (
                      <p className="text-violet-200 text-xs">{selectedCustomer.name}</p>
                    )}
                  </div>
                </div>
                <button onClick={() => setShowAiModal(false)} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white dark:bg-card/10 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* Status bar */}
              {!loadingAi && aiAnalysis && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-violet-200">
                    {aiAnalysisSaved ? `✓ Guardado el ${selectedCustomer?.aiNotesDate ? formatDate(selectedCustomer.aiNotesDate) : "hoy"}` : "âš¡ Análisis recién generado"}
                  </span>
                  {!aiAnalysisSaved && (
                    <button
                      onClick={saveAiAnalysis}
                      disabled={savingAi}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-card text-violet-700 text-xs font-bold hover:bg-violet-50 transition-colors disabled:opacity-60"
                    >
                      {savingAi ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      {savingAi ? "Guardando…" : "Guardar análisis"}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {loadingAi ? (
                <div className="h-40 flex flex-col items-center justify-center text-gray-400 dark:text-muted">
                  <Loader2 className="h-6 w-6 animate-spin mb-3" />
                  <p className="text-sm font-semibold">Analizando historial de compras…</p>
                  <p className="text-xs mt-1 text-gray-300 dark:text-muted">Esto puede tomar unos segundos</p>
                </div>
              ) : aiAnalysis ? (
                <div className="space-y-0.5" dangerouslySetInnerHTML={{ __html: mdToHtml(aiAnalysis) }} />
              ) : (
                <p className="text-sm text-gray-400 dark:text-muted text-center py-10">No hay análisis disponible.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
      {confirmDeletePhone && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 300 }} onClick={() => setConfirmDeletePhone(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">¿Eliminar cliente?</h3>
                <p className="text-sm text-gray-500 dark:text-muted">Se eliminará el cliente y sus datos.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeletePhone(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reviews Tab ───────────────────────────────────────────────────────────────
function ReviewsTab() {
  const [reviews, setReviews] = useState<DbReview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/reviews");
      if (r.ok) setReviews(await r.json());
    } catch {}
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const deleteReview = async (id: string) => {
    if (!confirm("¿Eliminar esta reseña?")) return;
    await fetch(`/api/reviews/${id}`, { method: "DELETE" });
    load();
  };

  const avg = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "—";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">Reseñas</h2>
        <p className="text-sm text-gray-500 dark:text-muted">{reviews.length} · promedio {avg} ★</p>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">Cargando…</div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 shadow-sm flex gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <p className="font-bold text-gray-900 dark:text-foreground text-sm">{r.name}</p>
                    <p className="text-xs text-gray-400 dark:text-muted">{r.location} · {formatDate(r.date)}</p>
                  </div>
                  <Stars rating={r.rating} />
                </div>
                <p className="text-sm text-gray-600 dark:text-muted mt-1.5 line-clamp-3">{r.text}</p>
                {r.phone && <p className="text-xs text-gray-400 dark:text-muted mt-1 font-mono">{r.phone}</p>}
              </div>
              <button onClick={() => deleteReview(r.id)} className="self-start p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors shrink-0" title="Eliminar">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {reviews.length === 0 && (
            <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">No hay reseñas</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Orders Tab ────────────────────────────────────────────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState<DbOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeLat, setStoreLat] = useState<number | null>(null);
  const [storeLon, setStoreLon] = useState<number | null>(null);

  // Detail modal
  const [detailOrder, setDetailOrder] = useState<DbOrder | null>(null);

  // Archive modal (Cancelados + Entregados)
  const [showArchive, setShowArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveDateFrom, setArchiveDateFrom] = useState("");
  const [archiveDateTo, setArchiveDateTo] = useState("");

  // Delete confirmation modal
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useScrollLock(!!detailOrder || showArchive || !!confirmDeleteId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/orders");
      if (r.ok) setOrders(await r.json());
    } catch {}
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.businessLat) setStoreLat(d.businessLat);
      if (d?.businessLon) setStoreLon(d.businessLon);
    }).catch(() => {});
  }, []);

  const updateStatus = async (id: string, status: OrderStatus) => {
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    // Open WhatsApp notification link if available
    if (res.ok) {
      const data = await res.json();
      if (data.whatsappLink) {
        window.open(data.whatsappLink, "_blank", "noopener,noreferrer");
      }
    }
  };

  const patchOrder = async (id: string, patch: Partial<DbOrder>) => {
    await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o));
    setDetailOrder(prev => prev?.id === id ? { ...prev, ...patch } : prev);
  };

  const verifyYape = (id: string) => patchOrder(id, { status: "confirmado" });

  const rejectYape = async (id: string) => {
    if (!confirm("¿Rechazar este pedido? El Yape es inválido y se eliminará el pedido.")) return;
    await fetch(`/api/orders/${id}`, { method: "DELETE" });
    setOrders(prev => prev.filter(o => o.id !== id));
    setDetailOrder(prev => prev?.id === id ? null : prev);
  };

  const markDeudaPaid = (id: string) => patchOrder(id, { deuda: false });

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    await fetch(`/api/orders/${confirmDeleteId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    load();
  };

  // Active orders (exclude entregado / cancelado)
  const activeOrders = orders.filter(o => o.status !== "entregado" && o.status !== "cancelado");
  const archivedOrders = orders.filter(o => o.status === "entregado" || o.status === "cancelado");

  // Archive search + date filters
  const filteredArchive = archivedOrders.filter(o => {
    const q = archiveSearch.toLowerCase();
    const matchSearch = !q || o.customer.name.toLowerCase().includes(q) || (o.customer.phone ?? "").includes(q);
    const date = o.createdAt.slice(0, 10);
    const matchFrom = !archiveDateFrom || date >= archiveDateFrom;
    const matchTo = !archiveDateTo || date <= archiveDateTo;
    return matchSearch && matchFrom && matchTo;
  });

  const total = activeOrders.reduce((s, o) => s + o.total, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">Pedidos</h2>
          <p className="text-sm text-gray-500 dark:text-muted">{activeOrders.length} activos · S/{total.toFixed(2)} total</p>
        </div>
        <button
          onClick={() => setShowArchive(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
        >
          <FileText className="h-4 w-4" />
          Cancelados y Entregados
          {archivedOrders.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-gray-300 text-gray-700 dark:text-foreground text-xs font-bold">{archivedOrders.length}</span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">Cargando…</div>
      ) : activeOrders.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">
          No hay pedidos activos
        </div>
      ) : (
        <div className="space-y-3">
          {activeOrders.map((o) => (
            <div key={o.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden">
              <div
                className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                onClick={() => setDetailOrder(o)}
              >
                {/* Left: customer info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 dark:text-foreground">{o.customer.name}</span>
                    {o.customer.phone && <span className="text-xs font-mono text-gray-400 dark:text-muted">{o.customer.phone}</span>}
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                      {STATUS_LABELS[o.status]}
                    </span>
                    {o.paymentMethod && (
                      <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold",
                        o.paymentMethod === "yape" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
                      )}>
                        {o.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                      </span>
                    )}
                    {o.paymentMethod === "efectivo" && o.deuda && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">
                        💰 Deuda pendiente
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-muted mt-0.5 truncate">{o.customer.location}</p>
                  {(() => {
                    if (storeLat === null || storeLon === null) return null;
                    const gps = parseGps(o.customer.location);
                    if (!gps) return null;
                    const km = haversineKm(storeLat, storeLon, gps.lat, gps.lon);
                    const label = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
                    return <span className="inline-flex items-center gap-1 text-xs text-blue-500 font-semibold"><MapPin className="h-3 w-3 shrink-0" />{label}</span>;
                  })()}
                  <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{formatDate(o.createdAt)} · {o.items.length} producto{o.items.length !== 1 ? "s" : ""} · <span className="font-bold text-primary">S/{o.total.toFixed(2)}</span></p>
                </div>

                {/* Right: controls "— stop propagation so clicks here don't open modal */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                  {o.paymentMethod === "yape" && o.status === "pendiente" && (
                    <>
                      <button
                        onClick={() => verifyYape(o.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-200"
                        title="Confirmar Yape como válido"
                      >
                        <Check className="h-3.5 w-3.5" /> Confirmar Yape
                      </button>
                      <button
                        onClick={() => rejectYape(o.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors border border-red-200"
                        title="Rechazar Yape (pago falso)"
                      >
                        <X className="h-3.5 w-3.5" /> Falso
                      </button>
                    </>
                  )}
                  {o.paymentMethod === "efectivo" && o.deuda && (
                    <button
                      onClick={() => markDeudaPaid(o.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-200"
                      title="Marcar deuda como cobrada"
                    >
                      <Check className="h-3.5 w-3.5" /> Cobrado
                    </button>
                  )}
                  <a
                    href={googleMapsUrl(o.customer.location)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"
                    title="Ver en Google Maps"
                  >
                    <MapPin className="h-4 w-4" />
                  </a>
                  <select
                    value={o.status}
                    onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}
                    className="text-xs font-semibold rounded-lg border border-gray-200 dark:border-card-border px-2 py-1.5 outline-none focus:border-primary text-gray-700 dark:text-foreground bg-white dark:bg-card"
                  >
                    {(Object.keys(STATUS_LABELS) as OrderStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setConfirmDeleteId(o.id)}
                    className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Order Detail Modal ──────────────────────────────────────────────── */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setDetailOrder(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Detalle del pedido</h3>
                <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{detailOrder.customer.name} · {formatDate(detailOrder.createdAt)}</p>
              </div>
              <button onClick={() => setDetailOrder(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
              <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
                {/* Customer */}
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Cliente</p>
                  <p className="font-bold text-gray-900 dark:text-foreground">{detailOrder.customer.name}</p>
                  {detailOrder.customer.phone && (
                    <p className="text-sm text-gray-500 dark:text-muted flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0" /> {detailOrder.customer.phone}
                    </p>
                  )}
                </div>
                {/* Location */}
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Dirección</p>
                  <div className="flex items-start gap-2">
                    <p className="text-sm text-gray-700 dark:text-foreground flex-1">{detailOrder.customer.location}</p>
                    <a
                      href={googleMapsUrl(detailOrder.customer.location)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-1 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                      title="Abrir en Google Maps"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                  {detailOrder.customer.reference && (
                    <p className="text-xs text-gray-500 dark:text-muted">Ref: {detailOrder.customer.reference}</p>
                  )}
                </div>
                {/* Payment */}
                {detailOrder.paymentMethod && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Pago</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold",
                        detailOrder.paymentMethod === "yape" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
                      )}>
                        {detailOrder.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                      </span>
                      {detailOrder.yapeOperationNumber && (
                        <span className="text-gray-500 dark:text-muted font-mono text-xs">Nº Op. {detailOrder.yapeOperationNumber}</span>
                      )}
                      {detailOrder.paymentMethod === "efectivo" && detailOrder.deuda && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">💰 Deuda pendiente</span>
                      )}
                      {detailOrder.paymentMethod === "efectivo" && detailOrder.deuda === false && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">✓ Cobrado</span>
                      )}
                    </div>
                    {detailOrder.paymentMethod === "yape" && detailOrder.status === "pendiente" && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => verifyYape(detailOrder.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-200"
                        >
                          <Check className="h-3.5 w-3.5" /> Confirmar Yape
                        </button>
                        <button
                          onClick={() => rejectYape(detailOrder.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors border border-red-200"
                        >
                          <X className="h-3.5 w-3.5" /> Yape falso
                        </button>
                      </div>
                    )}
                    {detailOrder.paymentMethod === "efectivo" && detailOrder.deuda && (
                      <button
                        onClick={() => markDeudaPaid(detailOrder.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-200 mt-1"
                      >
                        <Check className="h-3.5 w-3.5" /> Marcar como cobrado
                      </button>
                    )}
                  </div>
                )}
                {/* Notes */}
                {detailOrder.notes && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Notas</p>
                    <p className="text-sm text-gray-600 dark:text-muted italic">{detailOrder.notes}</p>
                  </div>
                )}
                {/* Items */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wide">Productos</p>
                  <div className="rounded-xl border border-gray-100 dark:border-card-border divide-y divide-gray-100 overflow-hidden">
                    {detailOrder.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-center px-3 py-2 text-sm">
                        <span className="text-gray-700 dark:text-foreground">{item.quantity}Ã— {item.name} <span className="text-gray-400 dark:text-muted">({item.unit})</span></span>
                        <span className="font-semibold text-gray-900 dark:text-foreground">S/{(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center px-3 py-2 bg-gray-50 dark:bg-surface font-bold text-sm">
                      <span className="text-gray-800 dark:text-foreground">Total</span>
                      <span className="text-primary">S/{detailOrder.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                {/* Meta */}
                <div className="flex flex-wrap gap-3 items-center text-xs text-gray-400 dark:text-muted">
                  <span>ID: {detailOrder.id}</span>
                  <span>Fecha: {formatDate(detailOrder.createdAt)}</span>
                  <span className={cn("inline-flex px-2 py-0.5 rounded-full font-bold", STATUS_COLORS[detailOrder.status])}>
                    {STATUS_LABELS[detailOrder.status]}
                  </span>
                </div>
              </div>
          </div>
        </div>
      )}

      {/* ── Archive Modal (Cancelados + Entregados) ─────────────────────────── */}
      {showArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowArchive(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Cancelados y Entregados</h3>
              <button onClick={() => setShowArchive(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Filters */}
            <div className="px-5 py-3 border-b border-gray-100 dark:border-card-border shrink-0 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar cliente o teléfono…"
                  value={archiveSearch}
                  onChange={e => setArchiveSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-card-border outline-none focus:border-primary"
                />
              </div>
              <input
                type="date"
                value={archiveDateFrom}
                onChange={e => setArchiveDateFrom(e.target.value)}
                title="Desde"
                className="text-sm rounded-lg border border-gray-200 dark:border-card-border px-3 py-2 outline-none focus:border-primary text-gray-600 dark:text-muted"
              />
              <input
                type="date"
                value={archiveDateTo}
                onChange={e => setArchiveDateTo(e.target.value)}
                title="Hasta"
                className="text-sm rounded-lg border border-gray-200 dark:border-card-border px-3 py-2 outline-none focus:border-primary text-gray-600 dark:text-muted"
              />
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {filteredArchive.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-gray-400 dark:text-muted text-sm">No se encontraron pedidos</div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden sm:block rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-muted">Cliente</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-muted">Estado</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-muted">Total</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 dark:text-muted">Fecha</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredArchive.map(o => (
                          <tr
                            key={o.id}
                            className="hover:bg-gray-50 dark:hover:bg-surface cursor-pointer"
                            onClick={() => { setDetailOrder(o); setShowArchive(false); }}
                          >
                            <td className="px-4 py-3">
                              <p className="font-semibold text-gray-900 dark:text-foreground">{o.customer.name}</p>
                              {o.customer.phone && <p className="text-xs text-gray-400 dark:text-muted font-mono">{o.customer.phone}</p>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                                {STATUS_LABELS[o.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-primary">S/{o.total.toFixed(2)}</td>
                            <td className="px-4 py-3 text-gray-500 dark:text-muted">{formatDate(o.createdAt)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <a
                                  href={googleMapsUrl(o.customer.location)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                  title="Ver en Maps"
                                >
                                  <MapPin className="h-4 w-4" />
                                </a>
                                <button
                                  onClick={() => setConfirmDeleteId(o.id)}
                                  className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-3">
                    {filteredArchive.map(o => (
                      <div
                        key={o.id}
                        className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                        onClick={() => { setDetailOrder(o); setShowArchive(false); }}
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-900 dark:text-foreground">{o.customer.name}</p>
                            {o.customer.phone && <p className="text-xs text-gray-400 dark:text-muted font-mono">{o.customer.phone}</p>}
                            <p className="text-sm text-gray-500 dark:text-muted mt-0.5 truncate">{o.customer.location}</p>
                            <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{formatDate(o.createdAt)}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                              {STATUS_LABELS[o.status]}
                            </span>
                            <p className="text-sm font-bold text-primary mt-1">S/{o.total.toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-card-border" onClick={e => e.stopPropagation()}>
                          <a
                            href={googleMapsUrl(o.customer.location)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                          >
                            <MapPin className="h-3.5 w-3.5" /> Maps
                          </a>
                          <button
                            onClick={() => setConfirmDeleteId(o.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ───────────────────────────────────────── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 200 }} onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">¿Eliminar pedido?</h3>
                <p className="text-sm text-gray-500 dark:text-muted">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsSaveBtn({ section, data, extra, saving, savedSection, onSave }: {
  section: string;
  data: Record<string, unknown>;
  extra?: () => void;
  saving: boolean;
  savedSection: string | null;
  onSave: (section: string, data: Record<string, unknown>, extra?: () => void) => void;
}) {
  return (
    <button
      type="button"
      disabled={saving}
      onClick={() => onSave(section, data, extra)}
      className={cn(
        "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all",
        savedSection === section ? "bg-emerald-500 text-white" : "bg-gray-900 text-white hover:bg-gray-800"
      )}
    >
      {saving && savedSection !== section ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> :
       savedSection === section ? <><Check className="h-4 w-4" /> ¡Guardado!</> :
       "Guardar"}
    </button>
  );
}

type NavLinkItem = { id: string; visible: boolean };
const NAV_LABEL: Record<string, string> = {
  inicio: "Inicio",
  productos: "Productos",
  beneficios: "Beneficios",
  contacto: "Contacto",
};
const DEFAULT_NAV_LINKS: NavLinkItem[] = [
  { id: "inicio", visible: true },
  { id: "productos", visible: true },
  { id: "beneficios", visible: true },
  { id: "contacto", visible: true },
];

function SettingsTab({ storeMode, onModeChange }: { storeMode: StoreMode; onModeChange: (m: StoreMode) => void }) {
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState<"mode" | "business" | "payment" | "nav" | "password" | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState<string | null>(null);

  // Mode
  const [mode, setMode] = useState<StoreMode>(storeMode);
  // Business
  const [businessName, setBusinessName] = useState("Bodega San Martín");
  const [businessPhone, setBusinessPhone] = useState("51916409675");
  const [businessAddress, setBusinessAddress] = useState("Pucallpa, Ucayali");
  const [logoUrl, setLogoUrl] = useState("");
  const [description, setDescription] = useState("Productos frescos, precios justos y entrega directa a tu puerta.");
  const [hours, setHours] = useState("Lun - Sáb: 7am - 9pm");
  const [deliveryZone, setDeliveryZone] = useState("Pucallpa");
  const [businessLat, setBusinessLat] = useState<number | null>(null);
  const [businessLon, setBusinessLon] = useState<number | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [pickerLat, setPickerLat] = useState(-8.38001);
  const [pickerLon, setPickerLon] = useState(-74.53551);
  // Payment
  const [yapeEnabled, setYapeEnabled] = useState(true);
  const [yapeImage, setYapeImage] = useState("");
  const [yapeName, setYapeName] = useState("");
  const [yapePhone, setYapePhone] = useState("");
  const [cashEnabled, setCashEnabled] = useState(true);
  // Nav
  const [navLinks, setNavLinks] = useState<NavLinkItem[]>(DEFAULT_NAV_LINKS);
  // Password
  const [currentPwInput, setCurrentPwInput] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwChangeError, setPwChangeError] = useState("");
  const [storedAdminPw, setStoredAdminPw] = useState("admin2024");
  // Maintenance
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState("");

  const yapeImgRef = useRef<HTMLInputElement>(null);
  const logoImgRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          if (d.mode) setMode(d.mode);
          if (d.businessName) setBusinessName(d.businessName);
          if (d.businessPhone) setBusinessPhone(d.businessPhone);
          if (d.businessAddress) setBusinessAddress(d.businessAddress);
          if (d.logoUrl) setLogoUrl(d.logoUrl);
          if (d.description) setDescription(d.description);
          if (d.hours) setHours(d.hours);
          if (d.deliveryZone) setDeliveryZone(d.deliveryZone);
          if (d.businessLat) { setBusinessLat(d.businessLat); setPickerLat(d.businessLat); }
          if (d.businessLon) { setBusinessLon(d.businessLon); setPickerLon(d.businessLon); }
          if (d.yapeEnabled !== undefined) setYapeEnabled(d.yapeEnabled);
          if (d.yapeImage) setYapeImage(d.yapeImage);
          if (d.yapeName) setYapeName(d.yapeName);
          if (d.yapePhone) setYapePhone(d.yapePhone);
          if (d.cashEnabled !== undefined) setCashEnabled(d.cashEnabled);
          if (Array.isArray(d.navLinks) && d.navLinks.length > 0) setNavLinks(d.navLinks);
          if (d.adminPassword) setStoredAdminPw(d.adminPassword);
          if (d.maintenanceMode !== undefined) setMaintenanceMode(d.maintenanceMode);
          if (d.maintenanceMessage) setMaintenanceMsg(d.maintenanceMessage);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const patch = async (data: Record<string, unknown>) => {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  };

  const saveSection = async (section: string, data: Record<string, unknown>, extraAction?: () => void) => {
    setSaving(true);
    try {
      await patch(data);
      if (extraAction) extraAction();
      setSavedSection(section);
      setTimeout(() => { setSavedSection(null); setOpenModal(null); }, 1300);
    } catch {}
    setSaving(false);
  };

  const handleFileUpload = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(reader.result as string);
    reader.readAsDataURL(file);
  };

  const moveNavLink = (idx: number, dir: -1 | 1) => {
    const next = [...navLinks];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setNavLinks(next);
  };

  const toggleNavVis = (idx: number) =>
    setNavLinks(prev => prev.map((l, i) => i === idx ? { ...l, visible: !l.visible } : l));

  if (loading) return <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>;

  const sections = [
    {
      id: "mode" as const,
      icon: <ShoppingCart className="h-6 w-6 text-blue-500" />,
      bg: "bg-blue-50",
      title: "Modo de tienda",
      desc: "Cómo reciben pedidos tus clientes",
      badge: mode === "whatsapp" ? "WhatsApp" : "Checkout",
      badgeColor: mode === "whatsapp" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700",
    },
    {
      id: "business" as const,
      icon: <Store className="h-6 w-6 text-orange-500" />,
      bg: "bg-orange-50",
      title: "Información del negocio",
      desc: "Nombre, teléfono, horario y logo",
      badge: businessName,
      badgeColor: "bg-orange-100 text-orange-700",
    },
    {
      id: "payment" as const,
      icon: <HandCoins className="h-6 w-6 text-purple-500" />,
      bg: "bg-purple-50",
      title: "Métodos de pago",
      desc: "Efectivo y Yape",
      badge: [cashEnabled && "Efectivo", yapeEnabled && "Yape"].filter(Boolean).join(" · ") || "Ninguno",
      badgeColor: "bg-purple-100 text-purple-700",
    },
    {
      id: "nav" as const,
      icon: <LinkIcon className="h-6 w-6 text-indigo-500" />,
      bg: "bg-indigo-50",
      title: "Navegación del sitio",
      desc: "Orden y visibilidad de los enlaces",
      badge: `${navLinks.filter(l => l.visible).length} de ${navLinks.length} visibles`,
      badgeColor: "bg-indigo-100 text-indigo-700",
    },
    {
      id: "password" as const,
      icon: <Lock className="h-6 w-6 text-red-500" />,
      bg: "bg-red-50",
      title: "Contraseña de admin",
      desc: "Cambia la contraseña de acceso al panel",
      badge: "••••••",
      badgeColor: "bg-red-100 text-red-700",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">Configuración</h2>
        <p className="text-sm text-gray-500 dark:text-muted">Personaliza tu tienda, pagos y navegación</p>
      </div>

      {/* Section cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map(s => (
          <div key={s.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 shadow-sm flex flex-col gap-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", s.bg)}>
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-foreground text-sm">{s.title}</p>
                <p className="text-xs text-gray-500 dark:text-muted">{s.desc}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-semibold truncate max-w-[58%]", s.badgeColor)}>
                {s.badge}
              </span>
              <button
                onClick={() => setOpenModal(s.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Maintenance mode toggle */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 dark:text-foreground text-sm">Modo mantenimiento</p>
            <p className="text-xs text-gray-500 dark:text-muted">Bloquea la tienda para los clientes</p>
          </div>
          <button
            onClick={async () => {
              const next = !maintenanceMode;
              setMaintenanceMode(next);
              await patch({ maintenanceMode: next, maintenanceMessage: maintenanceMsg || undefined });
            }}
            className={cn(
              "relative w-12 h-6 rounded-full transition-colors",
              maintenanceMode ? "bg-amber-500" : "bg-gray-200 dark:bg-surface"
            )}
          >
            <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform", maintenanceMode && "translate-x-6")} />
          </button>
        </div>
        {maintenanceMode && (
          <div className="mt-3">
            <input
              type="text"
              value={maintenanceMsg}
              onChange={e => setMaintenanceMsg(e.target.value)}
              onBlur={() => patch({ maintenanceMessage: maintenanceMsg || undefined })}
              placeholder="Mensaje personalizado (opcional)"
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-surface border border-gray-200 dark:border-card-border rounded-xl outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>
        )}
      </div>

      {/* Backup card */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
            <Upload className="h-6 w-6 text-teal-500" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 dark:text-foreground text-sm">Backup de datos</p>
            <p className="text-xs text-gray-500 dark:text-muted">Descarga todos los datos como JSON</p>
          </div>
          <a
            href="/api/backup"
            download
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors shrink-0 shadow-sm"
          >
            <Upload className="h-3.5 w-3.5" /> Descargar backup
          </a>
        </div>
      </div>

      {/* ── Modal: Modo de tienda ───────────────────────────────────────────── */}
      {openModal === "mode" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpenModal(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Modo de tienda</h3>
              <button onClick={() => setOpenModal(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-500 dark:text-muted">Elige cómo tus clientes realizan pedidos</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setMode("whatsapp")}
                  className={cn("flex flex-col items-center gap-2 py-5 px-3 rounded-xl border-2 transition-all",
                    mode === "whatsapp" ? "border-emerald-400 bg-emerald-50" : "border-gray-200 dark:border-card-border hover:border-gray-300")}>
                  <MessageCircle className={cn("h-8 w-8", mode === "whatsapp" ? "text-emerald-600" : "text-gray-300 dark:text-muted")} />
                  <span className={cn("font-bold text-sm", mode === "whatsapp" ? "text-emerald-700" : "text-gray-400 dark:text-muted")}>WhatsApp</span>
                  <span className="text-xs text-gray-400 dark:text-muted text-center leading-tight">Pedidos via mensaje</span>
                </button>
                <button type="button" onClick={() => setMode("checkout")}
                  className={cn("flex flex-col items-center gap-2 py-5 px-3 rounded-xl border-2 transition-all",
                    mode === "checkout" ? "border-primary bg-primary/5" : "border-gray-200 dark:border-card-border hover:border-gray-300")}>
                  <ShoppingCart className={cn("h-8 w-8", mode === "checkout" ? "text-primary" : "text-gray-300 dark:text-muted")} />
                  <span className={cn("font-bold text-sm", mode === "checkout" ? "text-primary" : "text-gray-400 dark:text-muted")}>Checkout</span>
                  <span className="text-xs text-gray-400 dark:text-muted text-center leading-tight">Formulario integrado</span>
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-card-border">
              <button onClick={() => setOpenModal(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
              <SettingsSaveBtn section="mode" data={{ mode }} extra={() => onModeChange(mode)} saving={saving} savedSection={savedSection} onSave={saveSection} />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Información del negocio ─────────────────────────────────── */}
      {openModal === "business" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpenModal(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Información del negocio</h3>
              <button onClick={() => setOpenModal(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto px-6 py-5 flex-1 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><Store className="h-3.5 w-3.5" /> Nombre del negocio</label>
                  <input value={businessName} onChange={e => setBusinessName(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><Phone className="h-3.5 w-3.5" /> WhatsApp (con código país)</label>
                  <input value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} placeholder="51916409675" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm font-mono" />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5">
                    <MapPin className="h-3.5 w-3.5" /> Dirección / Ciudad
                    <button type="button" onClick={() => setShowMapPicker(true)} className="ml-auto inline-flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg transition-colors" title="Seleccionar en mapa">
                      <MapPin className="h-3 w-3" /> Abrir mapa
                    </button>
                  </label>
                  <input value={businessAddress} onChange={e => setBusinessAddress(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                  <button type="button"
                    onClick={() => {
                      if (!navigator.geolocation) return;
                      navigator.geolocation.getCurrentPosition(pos => {
                        const lat = pos.coords.latitude;
                        const lon = pos.coords.longitude;
                        setBusinessLat(lat);
                        setBusinessLon(lon);
                        setPickerLat(lat);
                        setPickerLon(lon);
                        setBusinessAddress(`GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
                      });
                    }}
                    className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors py-1"
                  >
                    <MapPin className="h-3 w-3" /> Usar ubicación actual
                  </button>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><Truck className="h-3.5 w-3.5" /> Zona de delivery</label>
                  <input value={deliveryZone} onChange={e => setDeliveryZone(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><Clock className="h-3.5 w-3.5" /> Horario de atención</label>
                  <input value={hours} onChange={e => setHours(e.target.value)} placeholder="Lun - Sáb: 7am - 9pm" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><AlignLeft className="h-3.5 w-3.5" /> Descripción del negocio</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm resize-none" />
              </div>
              {/* Logo */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-2"><ImageIcon className="h-3.5 w-3.5" /> Logo del negocio</label>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => logoImgRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-primary text-sm font-semibold text-gray-500 dark:text-muted hover:text-primary bg-gray-50 dark:bg-surface hover:bg-primary/5 transition-colors">
                    <Upload className="h-4 w-4" /> Subir imagen desde dispositivo
                  </button>
                  <input ref={logoImgRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload(setLogoUrl)} />
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 dark:text-muted">o URL</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  <input value={logoUrl.startsWith("data:") ? "" : logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://… o /logo.png" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-primary outline-none text-sm" />
                </div>
                {logoUrl && (
                  <div className="flex items-center gap-3 mt-3 p-3 bg-gray-50 dark:bg-surface rounded-xl border border-gray-100 dark:border-card-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="Logo preview" className="h-14 w-14 object-contain rounded-xl bg-white dark:bg-card border border-gray-100 dark:border-card-border" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    <span className="text-xs text-gray-500 dark:text-muted flex-1">Vista previa del logo</span>
                    <button type="button" onClick={() => setLogoUrl("")} className="text-xs text-red-400 hover:text-red-600 transition-colors">Quitar</button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-card-border shrink-0">
              <button onClick={() => setOpenModal(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
              <SettingsSaveBtn section="business" data={{ businessName, businessPhone, businessAddress, businessLat, businessLon, logoUrl, description, hours, deliveryZone }} saving={saving} savedSection={savedSection} onSave={saveSection} />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Métodos de pago ──────────────────────────────────────────── */}
      {openModal === "payment" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpenModal(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Métodos de pago</h3>
              <button onClick={() => setOpenModal(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto px-6 py-5 flex-1 space-y-4">
              {/* Cash */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-surface rounded-xl border border-gray-100 dark:border-card-border">
                <div className="flex items-center gap-3">
                  <HandCoins className="h-6 w-6 text-emerald-600" />
                  <div>
                    <p className="font-bold text-sm text-gray-900 dark:text-foreground">Efectivo</p>
                    <p className="text-xs text-gray-500 dark:text-muted">Pago contra entrega</p>
                  </div>
                </div>
                <button type="button" onClick={() => setCashEnabled(!cashEnabled)}
                  className={cn("relative w-11 h-6 rounded-full transition-colors", cashEnabled ? "bg-primary" : "bg-gray-300")}>
                  <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white dark:bg-card shadow transition-transform", cashEnabled && "translate-x-5")} />
                </button>
              </div>
              {/* Yape */}
              <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold text-sm">Y</div>
                    <div>
                      <p className="font-bold text-sm text-gray-900 dark:text-foreground">Yape</p>
                      <p className="text-xs text-gray-500 dark:text-muted">QR de cobro antes de entrega</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setYapeEnabled(!yapeEnabled)}
                    className={cn("relative w-11 h-6 rounded-full transition-colors", yapeEnabled ? "bg-purple-600" : "bg-gray-300")}>
                    <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white dark:bg-card shadow transition-transform", yapeEnabled && "translate-x-5")} />
                  </button>
                </div>
                {yapeEnabled && (
                  <div className="space-y-3">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><User className="h-3.5 w-3.5" /> Nombre del titular</label>
                      <input value={yapeName} onChange={e => setYapeName(e.target.value)} placeholder="Juan Pérez" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-gray-900 dark:text-foreground focus:border-purple-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5"><Phone className="h-3.5 w-3.5" /> Número de Yape</label>
                      <input value={yapePhone} onChange={e => setYapePhone(e.target.value)} placeholder="987654321" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-gray-900 dark:text-foreground focus:border-purple-500 outline-none text-sm font-mono" />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-2"><ImageIcon className="h-3.5 w-3.5" /> Imagen / QR de Yape</label>
                      <div className="flex flex-col gap-2">
                        <button type="button" onClick={() => yapeImgRef.current?.click()}
                          className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-purple-300 hover:border-purple-500 text-sm font-semibold text-purple-600 hover:text-purple-700 bg-white dark:bg-card hover:bg-purple-50 transition-colors">
                          <Upload className="h-4 w-4" /> Subir desde dispositivo o celular
                        </button>
                        <input ref={yapeImgRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload(setYapeImage)} />
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-xs text-gray-400 dark:text-muted">o URL</span>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>
                        <input value={yapeImage.startsWith("data:") ? "" : yapeImage} onChange={e => setYapeImage(e.target.value)} placeholder="https://…" className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-gray-900 dark:text-foreground focus:border-purple-500 outline-none text-sm" />
                      </div>
                      {yapeImage && (
                        <div className="flex items-center gap-3 mt-3 p-3 bg-white dark:bg-card rounded-xl border border-purple-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={yapeImage} alt="Yape QR" className="h-24 w-24 object-contain rounded-xl border border-gray-100 dark:border-card-border" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          <div className="text-xs text-gray-500 dark:text-muted">
                            <p className="font-semibold text-gray-700 dark:text-foreground">{yapeName || "Titular"}</p>
                            <p className="font-mono mt-0.5">{yapePhone || "Número"}</p>
                            <button type="button" onClick={() => setYapeImage("")} className="mt-2 text-red-400 hover:text-red-600 transition-colors">Quitar imagen</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-card-border shrink-0">
              <button onClick={() => setOpenModal(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
              <SettingsSaveBtn section="payment" data={{ yapeEnabled, yapeImage, yapeName, yapePhone, cashEnabled }} saving={saving} savedSection={savedSection} onSave={saveSection} />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Navegación del sitio ────────────────────────────────────── */}
      {openModal === "nav" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpenModal(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">Navegación del sitio</h3>
                <p className="text-xs text-gray-500 dark:text-muted mt-0.5">Reordena y oculta los enlaces del menú</p>
              </div>
              <button onClick={() => setOpenModal(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-6 py-4 space-y-2">
              {navLinks.map((link, idx) => (
                <div key={link.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-surface rounded-xl border border-gray-100 dark:border-card-border">
                  <div className="flex flex-col gap-0.5">
                    <button type="button" disabled={idx === 0} onClick={() => moveNavLink(idx, -1)}
                      className="p-0.5 rounded text-gray-400 dark:text-muted hover:text-gray-800 dark:hover:text-foreground disabled:opacity-25 transition-colors">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" disabled={idx === navLinks.length - 1} onClick={() => moveNavLink(idx, 1)}
                      className="p-0.5 rounded text-gray-400 dark:text-muted hover:text-gray-800 dark:hover:text-foreground disabled:opacity-25 transition-colors">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="flex-1 font-semibold text-sm text-gray-800 dark:text-foreground">{NAV_LABEL[link.id] || link.id}</span>
                  <span className="text-xs text-gray-400 dark:text-muted font-mono">#{idx + 1}</span>
                  <button type="button" onClick={() => toggleNavVis(idx)}
                    className={cn("p-1.5 rounded-lg transition-colors", link.visible ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-gray-300 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent")}>
                    {link.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              ))}
              <p className="text-xs text-gray-400 dark:text-muted pt-1">ðŸ’¡ Los cambios se reflejarán en el menú de clientes al guardar.</p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-card-border">
              <button onClick={() => setOpenModal(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
              <SettingsSaveBtn section="nav" data={{ navLinks }} saving={saving} savedSection={savedSection} onSave={saveSection} />
            </div>
          </div>
        </div>
      )}

      {/* ── Password change modal ─────────────────────────────── */}
      {openModal === "password" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpenModal(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Cambiar contraseña</h3>
              <button onClick={() => setOpenModal(null)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <form className="px-6 py-5 space-y-4" onSubmit={async (e) => {
              e.preventDefault();
              setPwChangeError("");
              if (currentPwInput !== storedAdminPw) { setPwChangeError("La contraseña actual es incorrecta"); return; }
              if (newPw.length < 4) { setPwChangeError("La nueva contraseña debe tener al menos 4 caracteres"); return; }
              if (newPw !== confirmPw) { setPwChangeError("Las contraseñas no coinciden"); return; }
              await saveSection("password", { adminPassword: newPw });
              setStoredAdminPw(newPw);
              setCurrentPwInput(""); setNewPw(""); setConfirmPw(""); setPwChangeError("");
              // Re-issue cookie session with new password so the user stays logged in
              await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: newPw }) });
            }}>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-foreground mb-1">Contraseña actual</label>
                <input type="password" value={currentPwInput} onChange={e => setCurrentPwInput(e.target.value)} required autoFocus
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted outline-none focus:border-primary transition-colors" placeholder="••••••" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-foreground mb-1">Nueva contraseña</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted outline-none focus:border-primary transition-colors" placeholder="Mínimo 4 caracteres" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-foreground mb-1">Confirmar nueva contraseña</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted outline-none focus:border-primary transition-colors" placeholder="Repite la contraseña" />
              </div>
              {pwChangeError && <p className="text-sm text-red-500 font-semibold">{pwChangeError}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setOpenModal(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shadow-md shadow-primary/20 disabled:opacity-50 flex items-center gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  {savedSection === "password" ? "¡Guardado!" : "Cambiar contraseña"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Mapa picker: ubicación del negocio ─────────────────────────────── */}
      {showMapPicker && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowMapPicker(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">Ubicación del negocio</h3>
                <p className="text-xs text-gray-500 dark:text-muted mt-0.5">Haz clic en el mapa o arrastra el marcador para seleccionar la ubicación exacta</p>
              </div>
              <button onClick={() => setShowMapPicker(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <button type="button"
                onClick={() => {
                  if (!navigator.geolocation) return;
                  navigator.geolocation.getCurrentPosition(pos => {
                    setPickerLat(pos.coords.latitude);
                    setPickerLon(pos.coords.longitude);
                    setBusinessLat(pos.coords.latitude);
                    setBusinessLon(pos.coords.longitude);
                    setBusinessAddress(`GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
                  });
                }}
                className="self-start inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
              >
                <MapPin className="h-4 w-4" /> Usar ubicación actual
              </button>
              <LeafletMap
                lat={pickerLat}
                lon={pickerLon}
                zoom={15}
                height={340}
                onPick={(lat, lon, address) => {
                  setPickerLat(lat);
                  setPickerLon(lon);
                  setBusinessLat(lat);
                  setBusinessLon(lon);
                  setBusinessAddress(address);
                }}
              />
              {businessLat !== null && businessLon !== null && (
                <p className="text-xs text-gray-500 dark:text-muted font-mono">GPS: {businessLat.toFixed(5)}, {businessLon.toFixed(5)}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100 dark:border-card-border shrink-0">
              <button onClick={() => setShowMapPicker(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
              <button onClick={() => setShowMapPicker(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors">Confirmar ubicación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [storeMode, setStoreModeState] = useState<StoreMode>("whatsapp");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [userRole, setUserRole] = useState<"admin" | "cajero" | "almacenero">("admin");
  const [userName, setUserName] = useState("Admin");
  const [authReady, setAuthReady] = useState(false);
  useScrollLock(mobileNavOpen);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.mode) setStoreModeState(d.mode); })
      .catch(() => {});
    fetch("/api/auth/me")
      .then(r => { if (!r.ok) throw new Error("unauth"); return r.json(); })
      .then(d => {
        if (d?.role) { setUserRole(d.role); setUserName(d.username ?? "admin"); }
        setAuthReady(true);
      })
      .catch(() => { router.push("/admin/login"); });
  }, [router]);

  // Keyboard shortcuts: Alt+1..9,0 for tabs, Alt+? for help
  const SHORTCUT_MAP: Record<string, Tab> = {
    "1": "dashboard", "2": "pos", "3": "inventario", "4": "pedidos",
    "5": "proveedores", "6": "compras", "7": "cuentas", "8": "caja",
    "9": "clientes", "0": "configuracion",
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.altKey && SHORTCUT_MAP[e.key]) {
        e.preventDefault();
        setTab(SHORTCUT_MAP[e.key]);
      }
      if (e.key === "?" && e.altKey) {
        e.preventDefault();
        setShowShortcuts(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Alert badges + quick stats powered by /api/admin/stats (lightweight aggregate endpoint)
  const [alerts, setAlerts] = useState<Record<string, number>>({});
  const [quickStats, setQuickStats] = useState<{ pendingOrders: number; todayRevenue: number; lowStockProducts: number } | null>(null);
  useEffect(() => {
    const fetchAlerts = () => {
      fetch("/api/admin/stats")
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d) return;
          const a: Record<string, number> = {};
          if (d.lowStockProducts > 0) a.inventario = d.lowStockProducts;
          if (d.pendingOrders > 0) a.pedidos = d.pendingOrders;
          setAlerts(a);
          setQuickStats({ pendingOrders: d.pendingOrders, todayRevenue: d.todayRevenue, lowStockProducts: d.lowStockProducts });
        })
        .catch(() => {});
    };
    // Delay first alert fetch to avoid competing with DashboardTab's initial load
    const t = setTimeout(fetchAlerts, 3000);
    const interval = setInterval(fetchAlerts, 60_000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/admin/login");
  };

  const ALL_TABS = [
    { id: "dashboard" as Tab,       label: "Dashboard",    icon: BarChart3 },
    { id: "pos" as Tab,            label: "Punto de Venta",icon: Monitor },
    { id: "inventario" as Tab,     label: "Inventario",   icon: Boxes },
    { id: "pedidos" as Tab,        label: "Pedidos",      icon: ShoppingCart },
    { id: "proveedores" as Tab,    label: "Proveedores",  icon: Truck },
    { id: "compras" as Tab,        label: "Compras",      icon: FileText },
    { id: "cuentas" as Tab,        label: "Cuentas",      icon: HandCoins },
    { id: "caja" as Tab,           label: "Caja",         icon: Calculator },
    { id: "clientes" as Tab,       label: "Clientes",     icon: Users },
    { id: "promociones" as Tab,    label: "Promociones",  icon: Megaphone },
    { id: "reseñas" as Tab,        label: "Reseñas",      icon: Star },
    { id: "actividad" as Tab,      label: "Actividad",    icon: Activity },
  { id: "cupones" as Tab,        label: "Cupones",      icon: Ticket },
  { id: "devoluciones" as Tab,   label: "Devoluciones", icon: RotateCcw },
  { id: "reportes" as Tab,       label: "Reportes",     icon: FileBarChart },
  { id: "historial-precios" as Tab, label: "Historial Precios", icon: TrendingUp },
  { id: "prediccion" as Tab,     label: "Predicción IA",icon: Brain },
  { id: "entregas" as Tab,       label: "Entregas",     icon: CalendarDays },
  { id: "chat" as Tab,           label: "Chat Interno", icon: MessageSquare },
  { id: "evaluaciones" as Tab,   label: "Evaluaciones", icon: Star },
  { id: "fidelizacion" as Tab,   label: "Fidelización", icon: Heart },
  { id: "auto-reorden" as Tab,   label: "Auto-Reorden", icon: RefreshCw },
  { id: "gastos" as Tab,          label: "Gastos",       icon: Wallet },
  { id: "combos" as Tab,          label: "Combos",       icon: Package },
  { id: "notificaciones" as Tab,  label: "Notificaciones",icon: Bell },
  { id: "configuracion" as Tab,   label: "Configuración", icon: Settings },
  { id: "usuarios-admin" as Tab,  label: "Usuarios Admin", icon: UserCog },
  ] as const;

  // Role-based tab filtering
  const ROLE_TABS: Record<string, Tab[]> = {
    admin: ALL_TABS.map(t => t.id),
    cajero: ["dashboard", "pos", "caja", "pedidos", "clientes"],
    almacenero: ["dashboard", "inventario", "proveedores", "compras", "cuentas"],
  };
  const allowedTabs = ROLE_TABS[userRole] ?? ROLE_TABS.admin;
  const filteredTabs = ALL_TABS.filter(t => allowedTabs.includes(t.id));

  const currentTab = filteredTabs.find(t => t.id === tab) ?? filteredTabs[0];

  if (!authReady) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 sm:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 bottom-0 w-72 z-50 bg-white dark:bg-card shadow-2xl flex flex-col transition-transform duration-300 sm:hidden",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-card-border bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-primary text-white flex items-center justify-center">
              <ShoppingBasket className="h-4 w-4" />
            </div>
            <span className="font-extrabold text-gray-900 dark:text-foreground text-sm">Bodega San Martín</span>
          </div>
          <button onClick={() => setMobileNavOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
            <X className="h-5 w-5 text-gray-500 dark:text-muted" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {filteredTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setTab(id); setMobileNavOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all mb-1",
                tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
              {alerts[id] && <span className={cn("ml-auto text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center", tab === id ? "bg-white/20 text-white" : "bg-red-500 text-white")}>{alerts[id]}</span>}
            </button>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-gray-200 dark:border-card-border space-y-1">
          <Link href="/" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-all">
            <Store className="h-5 w-5" /> Ver tienda
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 dark:text-muted hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 transition-all"
          >
            <LogOut className="h-5 w-5" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Desktop permanent sidebar */}
      <aside className="hidden sm:flex fixed top-0 left-0 bottom-0 w-64 z-40 bg-white dark:bg-card border-r border-gray-200 dark:border-card-border flex-col">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-200 dark:border-card-border bg-primary/5">
          <div className="h-9 w-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm shrink-0">
            <ShoppingBasket className="h-5 w-5" />
          </div>
          <div>
            <p className="font-extrabold text-gray-900 dark:text-foreground text-sm leading-tight">Bodega San Martín</p>
            <p className="text-xs text-gray-400 dark:text-muted"><span className="capitalize">{userName}</span> · <span className="uppercase text-[10px] font-bold text-primary">{userRole}</span></p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {filteredTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all mb-1",
                tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
              {alerts[id] && <span className={cn("ml-auto text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center", tab === id ? "bg-white/20 text-white" : "bg-red-500 text-white")}>{alerts[id]}</span>}
            </button>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-gray-200 dark:border-card-border space-y-1">
          <Link href="/" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-all">
            <Store className="h-5 w-5" /> Ver tienda
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 dark:text-muted hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 transition-all"
          >
            <LogOut className="h-5 w-5" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Content area */}
      <div className="sm:ml-64 flex flex-col min-h-screen">
      {/* Top bar */}
      <header className="bg-white dark:bg-card border-b border-gray-200 dark:border-card-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileNavOpen(true)}
            className="sm:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"
            aria-label="Menú"
          >
            <Menu className="h-5 w-5 text-gray-600 dark:text-muted" />
          </button>
          <div className="h-9 w-9 rounded-xl bg-primary text-white items-center justify-center shadow-sm shrink-0 hidden sm:flex">
            <ShoppingBasket className="h-5 w-5" />
          </div>
          <div>
            {/* Mobile: show current tab name */}
            <h1 className="font-extrabold text-gray-900 dark:text-foreground text-base leading-tight sm:hidden">{currentTab.label}</h1>
            <h1 className="font-extrabold text-gray-900 dark:text-foreground text-base leading-tight hidden sm:block">Panel de administración</h1>
            <p className="text-xs text-gray-400 dark:text-muted hidden sm:block">Bodega San Martín</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowShortcuts(v => !v)}
            title="Atajos de teclado (Alt+?)"
            className="hidden sm:flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors text-xs font-bold"
          >
            ⌨
          </button>
          <Link href="/" className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-muted hover:text-primary transition-colors hidden sm:block">Ver tienda â†’</Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 dark:text-muted hover:text-red-500 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 px-6 py-2 text-xs text-gray-400 dark:text-muted bg-gray-50 dark:bg-surface border-b border-gray-100 dark:border-card-border">
        <span>Panel</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-gray-700 dark:text-foreground font-semibold">{currentTab.label}</span>
      </nav>

      {/* Quick stats bar — updates every 60 s via /api/admin/stats */}
      {quickStats && (
        <div className="hidden sm:flex items-center gap-1 px-6 py-1.5 bg-white dark:bg-card border-b border-gray-100 dark:border-card-border text-xs">
          <button
            onClick={() => setTab("pedidos")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold transition-colors",
              quickStats.pendingOrders > 0
                ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            )}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            {quickStats.pendingOrders} pendiente{quickStats.pendingOrders !== 1 ? "s" : ""}
          </button>
          <span className="text-gray-200 dark:text-card-border">|</span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
            <TrendingUp className="h-3.5 w-3.5" />
            S/{quickStats.todayRevenue.toFixed(2)} hoy
          </span>
          {quickStats.lowStockProducts > 0 && (
            <>
              <span className="text-gray-200 dark:text-card-border">|</span>
              <button
                onClick={() => setTab("inventario")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-600 font-semibold hover:bg-red-200 transition-colors"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {quickStats.lowStockProducts} stock bajo
              </button>
            </>
          )}
          <span className="ml-auto text-gray-300 text-[10px]">Actualizado hace &lt;1 min</span>
        </div>
      )}

      {/* Body */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-3 sm:px-6 py-4 sm:py-8">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "pos" && <POSView />}
        {tab === "inventario" && <InventoryTab />}
        {tab === "clientes" && <CustomersTab />}
        {tab === "reseñas" && <ReviewsTab />}
        {tab === "pedidos" && <OrdersTab />}
        {tab === "proveedores" && <SuppliersTab />}
        {tab === "compras" && <PurchaseOrdersTab />}
        {tab === "cuentas" && <PayablesTab />}
        {tab === "caja" && <CashRegisterTab />}
        {tab === "promociones" && <PromotionsTab />}
        {tab === "actividad" && <ActivityLogTab />}
        {tab === "cupones" && <CouponsTab />}
        {tab === "devoluciones" && <ReturnsTab />}
        {tab === "reportes" && <ReportsTab />}
        {tab === "historial-precios" && <PriceHistoryTab />}
        {tab === "prediccion" && <DemandPredictionTab />}
        {tab === "entregas" && <DeliveryCalendarTab />}
        {tab === "chat" && <AdminChatTab />}
        {tab === "evaluaciones" && <SupplierEvaluationsTab />}
        {tab === "fidelizacion" && <LoyaltyTab />}
        {tab === "auto-reorden" && <AutoReorderTab />}
        {tab === "gastos" && <ExpensesTab />}
        {tab === "combos" && <BundlesTab />}
        {tab === "notificaciones" && <NotificationsTab />}
        {tab === "configuracion" && <SettingsTab storeMode={storeMode} onModeChange={setStoreModeState} />}
        {tab === "usuarios-admin" && <AdminUsersTab />}
      </main>

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-card-border" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-foreground mb-4">⌨ Atajos de teclado</h3>
            <div className="space-y-2 text-sm">
              {[
                ["Alt + 1", "Dashboard"],
                ["Alt + 2", "Punto de Venta"],
                ["Alt + 3", "Inventario"],
                ["Alt + 4", "Pedidos"],
                ["Alt + 5", "Proveedores"],
                ["Alt + 6", "Compras"],
                ["Alt + 7", "Cuentas"],
                ["Alt + 8", "Caja"],
                ["Alt + 9", "Clientes"],
                ["Alt + 0", "Configuración"],
                ["Alt + ?", "Mostrar atajos"],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-muted">{label}</span>
                  <kbd className="bg-gray-100 dark:bg-surface text-foreground px-2 py-0.5 rounded text-xs font-mono">{key}</kbd>
                </div>
              ))}
            </div>
            <button onClick={() => setShowShortcuts(false)} className="mt-5 w-full py-2.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors">Cerrar</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// Export as client-only (no SSR) to prevent hydration mismatches.
// Admin dashboard is auth-gated and fully dynamic — SSR provides no benefit.
const AdminPageNoSSR = dynamic(
  () => Promise.resolve({ default: AdminPage }),
  { ssr: false }
);
export default AdminPageNoSSR;
