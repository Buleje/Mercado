"use client";

/**
 * SponsoredAdminPanel
 * Panel de gestión de boosts patrocinados para el vendor.
 * Tabla en desktop, cards en mobile.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Pause,
  Play,
  X,
  Loader2,
  AlertCircle,
  TrendingUp,
  Eye,
  MousePointerClick,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import SponsoredCreateModal from "@/components/marketplace/SponsoredCreateModal";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type BoostStatus = "active" | "paused" | "cancelled" | "expired" | "scheduled";

interface SponsoredBoost {
  id: string;
  productId: string;
  productName: string;
  bidAmount: number;
  maxBudgetPen: number;
  spentPen: number;
  startDate: string;
  endDate: string;
  status: BoostStatus;
  impressions: number;
  clicks: number;
  conversions: number;
  storeId: string;
}

interface Props {
  storeSlug: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BoostStatus, { label: string; className: string }> = {
  active: { label: "Activo", className: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" },
  paused: { label: "Pausado", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400" },
  cancelled: { label: "Cancelado", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  expired: { label: "Expirado", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  scheduled: { label: "Programado", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
};

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function ctr(clicks: number, impressions: number) {
  if (!impressions) return "—";
  return ((clicks / impressions) * 100).toFixed(1) + "%";
}

// ── Row Actions ───────────────────────────────────────────────────────────────

function ActionButtons({
  boost,
  onAction,
  loading,
}: {
  boost: SponsoredBoost;
  onAction: (id: string, action: "pause" | "resume" | "cancel") => void;
  loading: string | null;
}) {
  const isLoading = loading === boost.id;
  const canPause = boost.status === "active";
  const canResume = boost.status === "paused";
  const canCancel = boost.status === "active" || boost.status === "paused" || boost.status === "scheduled";

  return (
    <div className="flex items-center gap-1.5">
      {canPause && (
        <button
          onClick={() => onAction(boost.id, "pause")}
          disabled={isLoading}
          aria-label="Pausar boost"
          title="Pausar"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-50 dark:bg-yellow-950/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-100 disabled:opacity-50 transition-colors"
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
      )}
      {canResume && (
        <button
          onClick={() => onAction(boost.id, "resume")}
          disabled={isLoading}
          aria-label="Reanudar boost"
          title="Reanudar"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 hover:bg-green-100 disabled:opacity-50 transition-colors"
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        </button>
      )}
      {canCancel && (
        <button
          onClick={() => onAction(boost.id, "cancel")}
          disabled={isLoading}
          aria-label="Cancelar boost"
          title="Cancelar"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400 hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Mobile Card ───────────────────────────────────────────────────────────────

function BoostCard({
  boost,
  onAction,
  actionLoading,
}: {
  boost: SponsoredBoost;
  onAction: (id: string, action: "pause" | "resume" | "cancel") => void;
  actionLoading: string | null;
}) {
  const status = STATUS_CONFIG[boost.status] ?? STATUS_CONFIG.expired;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white line-clamp-2 leading-tight">
            {boost.productName}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {formatDate(boost.startDate)} – {formatDate(boost.endDate)}
          </p>
        </div>
        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0", status.className)}>
          {status.label}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { icon: Eye, label: "Impresiones", value: boost.impressions.toLocaleString("es-PE") },
          { icon: MousePointerClick, label: "Clicks", value: boost.clicks.toLocaleString("es-PE") },
          { icon: ShoppingCart, label: "Ventas", value: boost.conversions.toLocaleString("es-PE") },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="text-center rounded-xl bg-gray-50 dark:bg-gray-800 py-2">
            <Icon className="h-3.5 w-3.5 text-gray-400 mx-auto mb-0.5" />
            <p className="text-xs font-bold text-gray-900 dark:text-white">{value}</p>
            <p className="text-[9px] text-gray-400 dark:text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Budget + actions */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Gasto: <strong className="text-gray-900 dark:text-white">{fmt(boost.spentPen)}</strong>
            {" "}/ {fmt(boost.maxBudgetPen)}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Puja: {fmt(boost.bidAmount)}/1000 · CTR: {ctr(boost.clicks, boost.impressions)}
          </p>
        </div>
        <ActionButtons boost={boost} onAction={onAction} loading={actionLoading} />
      </div>
    </motion.div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SponsoredAdminPanel({ storeSlug }: Props) {
  const [boosts, setBoosts] = useState<SponsoredBoost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Inferir storeId del primer boost (en produccion vendria de un prop o context)
  const storeId = boosts[0]?.storeId ?? storeSlug;

  const fetchBoosts = useCallback(async () => {
    if (!storeSlug) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/sponsored?storeId=${encodeURIComponent(storeSlug)}`);
      if (!res.ok) {
        // 400 sin storeId o 401/403 sin auth — tratar como sin boosts
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          setBoosts([]);
          return;
        }
        throw new Error("Error cargando boosts");
      }
      const json = await res.json() as { data: SponsoredBoost[] };
      setBoosts(json.data ?? []);
    } catch {
      setError("No se pudieron cargar los boosts patrocinados.");
    } finally {
      setLoading(false);
    }
  }, [storeSlug]);

  useEffect(() => {
    fetchBoosts();
  }, [fetchBoosts]);

  const handleAction = async (id: string, action: "pause" | "resume" | "cancel") => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/marketplace/sponsored/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchBoosts();
      }
    } catch {
      /* silent */
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary shrink-0" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Productos patrocinados</h2>
            {boosts.length > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                · {boosts.length} boost{boosts.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo boost
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {/* Loading */}
          {loading && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-gray-50 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 py-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
              <button onClick={fetchBoosts} className="underline font-semibold ml-1">Reintentar</button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && boosts.length === 0 && (
            <div className="py-8 text-center">
              <TrendingUp className="h-8 w-8 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                Aun no tienes productos patrocinados
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Crea un boost para destacar tus productos en el marketplace.
              </p>
              <button
                onClick={() => setCreateOpen(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Crear primer boost
              </button>
            </div>
          )}

          {/* Mobile: cards */}
          {!loading && !error && boosts.length > 0 && (
            <>
              {/* Cards mobile */}
              <div className="sm:hidden space-y-3">
                <AnimatePresence>
                  {boosts.map((b) => (
                    <BoostCard key={b.id} boost={b} onAction={handleAction} actionLoading={actionLoading} />
                  ))}
                </AnimatePresence>
              </div>

              {/* Tabla desktop */}
              <div className="hidden sm:block overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      {["Producto", "Estado", "Fechas", "Impresiones", "Clicks", "Ventas", "Gasto / Max", "Acciones"].map((h) => (
                        <th key={h} className="pb-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 pr-4 last:pr-0">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {boosts.map((b) => {
                      const status = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.expired;
                      return (
                        <tr key={b.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                          <td className="py-3 pr-4">
                            <p className="font-semibold text-gray-900 dark:text-white line-clamp-1 max-w-36">
                              {b.productName}
                            </p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">
                              Puja: {fmt(b.bidAmount)} · CTR: {ctr(b.clicks, b.impressions)}
                            </p>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", status.className)}>
                              {status.label}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {formatDate(b.startDate)}<br />
                            {formatDate(b.endDate)}
                          </td>
                          <td className="py-3 pr-4 text-xs font-semibold text-gray-900 dark:text-white">
                            {b.impressions.toLocaleString("es-PE")}
                          </td>
                          <td className="py-3 pr-4 text-xs font-semibold text-gray-900 dark:text-white">
                            {b.clicks.toLocaleString("es-PE")}
                          </td>
                          <td className="py-3 pr-4 text-xs font-semibold text-gray-900 dark:text-white">
                            {b.conversions.toLocaleString("es-PE")}
                          </td>
                          <td className="py-3 pr-4 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {fmt(b.spentPen)} / {fmt(b.maxBudgetPen)}
                          </td>
                          <td className="py-3">
                            <ActionButtons boost={b} onAction={handleAction} loading={actionLoading} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal crear boost */}
      <SponsoredCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={fetchBoosts}
        storeSlug={storeSlug}
        storeId={storeId}
      />
    </>
  );
}
