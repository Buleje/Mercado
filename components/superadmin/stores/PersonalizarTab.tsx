"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Eye, EyeOff, Percent, Globe, RefreshCw, Check, X,
  ShoppingBag, Star, Crown, Palette, Image as ImageIcon,
  ToggleRight, GripVertical,
} from "lucide-react";
import { PlanBadge } from "@/components/superadmin/_shared/SABadge";
import { TableSkeleton } from "@/components/superadmin/_shared/SASkeleton";
import { StatCard } from "./StatCard";
import { useStoreActions } from "./useStoreActions";
import type { StoreRow } from "./types";

interface PersonalizarTabProps {
  stores: StoreRow[] | undefined;
  onRefresh: () => void;
}

export function PersonalizarTab({ stores, onRefresh }: PersonalizarTabProps) {
  const [saving, setSaving] = useState<string | null>(null);
  const [editCommission, setEditCommission] = useState<{ id: string; value: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const { togglePublished, saveCommission } = useStoreActions({
    setSaving,
    showToast,
    onRefresh,
    editCommission,
    setEditCommission,
  });

  const published = stores?.filter((s) => s.isPublished) ?? [];
  const hidden = stores?.filter((s) => !s.isPublished) ?? [];
  const avgCommission = stores?.length
    ? (stores.reduce((s, r) => s + r.commission, 0) / stores.length).toFixed(1)
    : "0";

  if (!stores) return <TableSkeleton count={4} />;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg transition-all ${
            toast.ok
              ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/80 dark:text-green-300 dark:border-green-800"
              : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/80 dark:text-red-300 dark:border-red-800"
          }`}
        >
          {toast.ok ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Eye className="w-5 h-5" />}
          label="Tiendas visibles"
          value={published.length}
          sub={`de ${stores.length} totales`}
          trend="up"
        />
        <StatCard
          icon={<EyeOff className="w-5 h-5" />}
          label="Tiendas ocultas"
          value={hidden.length}
          sub="No aparecen en marketplace"
        />
        <StatCard
          icon={<Percent className="w-5 h-5" />}
          label="Comisión promedio"
          value={`${avgCommission}%`}
          sub="Sobre cada venta"
        />
        <StatCard
          icon={<Globe className="w-5 h-5" />}
          label="Categorías"
          value={new Set(stores.map((s) => s.category)).size}
          sub="Tipos de tienda"
        />
      </div>

      {/* Published Stores */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Eye className="w-4 h-4 text-green-500" />
          Tiendas visibles en el Marketplace
          <span className="ml-auto text-xs font-normal text-gray-400">{published.length} tiendas</span>
        </h3>

        {published.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No hay tiendas publicadas</p>
        ) : (
          <div className="space-y-3">
            {published.map((store, i) => (
              <div
                key={store.id}
                className="flex items-center gap-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 p-4 transition-all hover:border-primary/30"
              >
                {/* Position */}
                <div className="flex items-center gap-1 text-gray-400">
                  <GripVertical className="w-4 h-4" />
                  <span className="text-xs font-bold tabular-nums w-5 text-center">{i + 1}</span>
                </div>

                {/* Logo */}
                <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                  {store.logo ? (
                    <Image src={store.logo} alt={store.name} width={40} height={40} className="object-cover" />
                  ) : (
                    <ShoppingBag className="w-5 h-5 text-primary" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {store.name}
                    </span>
                    {i === 0 && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                    <PlanBadge plan={store.tenant.plan as "free" | "pro" | "business" | "enterprise"} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-400 capitalize">{store.category}</span>
                    <span className="text-xs text-amber-500 flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-current" /> {store.rating.toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-400">{store._count.products} productos</span>
                  </div>
                </div>

                {/* Commission */}
                <div className="shrink-0">
                  {editCommission?.id === store.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={editCommission.value}
                        onChange={(e) => setEditCommission({ id: store.id, value: e.target.value })}
                        className="w-16 rounded-lg border border-primary/30 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-center font-bold focus:border-primary focus:ring-1 focus:ring-primary/30"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveCommission(store.id);
                          if (e.key === "Escape") setEditCommission(null);
                        }}
                        autoFocus
                      />
                      <span className="text-xs text-gray-400">%</span>
                      <button
                        onClick={() => void saveCommission(store.id)}
                        disabled={saving === store.id}
                        className="p-1 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditCommission(null)}
                        className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        setEditCommission({ id: store.id, value: String(store.commission) })
                      }
                      className="flex items-center gap-1 text-xs font-bold text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors"
                      title="Editar comisión"
                    >
                      <Percent className="w-3 h-3" />
                      {store.commission}%
                    </button>
                  )}
                </div>

                {/* Toggle visibility */}
                <button
                  onClick={() => void togglePublished(store)}
                  disabled={saving === store.id}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40"
                  title="Ocultar del marketplace"
                >
                  {saving === store.id ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <EyeOff className="w-3 h-3" />
                  )}
                  Ocultar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hidden Stores */}
      {hidden.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <EyeOff className="w-4 h-4 text-gray-400" />
            Tiendas ocultas
            <span className="ml-auto text-xs font-normal text-gray-400">{hidden.length} tiendas</span>
          </h3>

          <div className="space-y-3">
            {hidden.map((store) => (
              <div
                key={store.id}
                className="flex items-center gap-4 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20 p-4 opacity-70 hover:opacity-100 transition-all"
              >
                {/* Logo */}
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                  {store.logo ? (
                    <Image
                      src={store.logo}
                      alt={store.name}
                      width={40}
                      height={40}
                      className="w-full h-full object-cover grayscale"
                    />
                  ) : (
                    <ShoppingBag className="w-5 h-5 text-gray-400" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 truncate block">
                    {store.name}
                  </span>
                  <span className="text-xs text-gray-400 capitalize">
                    {store.category} · {store._count.products} productos
                  </span>
                </div>

                {/* Commission */}
                <span className="text-xs font-semibold text-gray-400 tabular-nums">
                  {store.commission}%
                </span>

                {/* Toggle */}
                <button
                  onClick={() => void togglePublished(store)}
                  disabled={saving === store.id}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 transition-colors disabled:opacity-40"
                  title="Publicar en marketplace"
                >
                  {saving === store.id ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                  Publicar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Marketplace Appearance Settings */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Palette className="w-4 h-4 text-purple-500" />
          Apariencia del Marketplace
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Hero Banner</span>
            </div>
            <p className="text-xs text-gray-400">
              El banner grande que se muestra arriba del marketplace
            </p>
            <p className="text-[10px] text-primary mt-2 font-medium">
              Se configura desde cada tienda individual → pestaña Mi Tienda
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                Tiendas Destacadas
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Las tiendas en posición 1-3 arriba aparecen primero en el marketplace
            </p>
            <p className="text-[10px] text-green-600 mt-2 font-medium">
              Reordena la lista de arriba para priorizar tiendas
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="flex items-center gap-2 mb-2">
              <Percent className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Comisiones</span>
            </div>
            <p className="text-xs text-gray-400">
              Haz clic en el porcentaje de cada tienda para editar su comisión por venta
            </p>
            <p className="text-[10px] text-amber-600 mt-2 font-medium">
              Promedio actual: {avgCommission}%
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="flex items-center gap-2 mb-2">
              <ToggleRight className="w-4 h-4 text-green-500" />
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Visibilidad</span>
            </div>
            <p className="text-xs text-gray-400">
              Controla qué tiendas aparecen en el marketplace con los botones Publicar/Ocultar
            </p>
            <p className="text-[10px] text-primary mt-2 font-medium">
              {published.length} visibles · {hidden.length} ocultas
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
