"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Gift, Loader2, CheckCircle, XCircle, Award, Star } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ──────────────────────────────────────────────────────────────────────

type Reward = {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  type: string;
  value: number;
  icon: string;
};

type CustomerLoyalty = {
  phone: string;
  name: string;
  loyaltyPoints: number;
  loyaltyTier: string;
  totalSpent: number;
};

type RedeemHistory = {
  phone: string;
  name: string;
  rewardName: string;
  rewardIcon: string;
  pointsCost: number;
  redeemedAt: string;
};

const TIER_STYLES: Record<string, string> = {
  bronce: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  plata: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  oro: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  diamante: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
};

// ── Componente principal ───────────────────────────────────────────────────────

export default function LoyaltyRedeemTab() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(true);

  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<CustomerLoyalty | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const [history, setHistory] = useState<RedeemHistory[]>([]);

  // ── Cargar recompensas ───────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/loyalty/redeem")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Reward[]) => setRewards(data))
      .catch(() => {})
      .finally(() => setLoadingRewards(false));
  }, []);

  // ── Mostrar toast ────────────────────────────────────────────────────────────

  const showToast = useCallback((type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Buscar cliente ───────────────────────────────────────────────────────────

  const searchCustomer = async () => {
    const normalized = phone.replace(/\D/g, "");
    if (normalized.length < 9) return;

    setSearching(true);
    setCustomer(null);
    setNotFound(false);

    try {
      const res = await fetch(`/api/loyalty/${encodeURIComponent(normalized)}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("error");
      const data: CustomerLoyalty = await res.json();
      setCustomer(data);
    } catch {
      showToast("err", "Error al buscar cliente");
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") searchCustomer();
  };

  // ── Canjear recompensa ───────────────────────────────────────────────────────

  const redeem = async (reward: Reward) => {
    if (!customer || redeeming) return;
    if (customer.loyaltyPoints < reward.pointsCost) return;

    setRedeeming(reward.id);
    try {
      const res = await fetch("/api/loyalty/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone: customer.phone,
          rewardId: reward.id,
          pointsCost: reward.pointsCost,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast("err", data.error ?? "Error al canjear");
        return;
      }

      // Actualizar puntos localmente
      setCustomer((prev) =>
        prev ? { ...prev, loyaltyPoints: data.remainingPoints } : prev,
      );

      // Agregar al historial local
      setHistory((prev) => [
        {
          phone: customer.phone,
          name: customer.name,
          rewardName: reward.name,
          rewardIcon: reward.icon,
          pointsCost: reward.pointsCost,
          redeemedAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      showToast(
        "ok",
        `${reward.icon} "${reward.name}" canjeado. Quedan ${data.remainingPoints} pts.`,
      );
    } catch {
      showToast("err", "Error de conexión al canjear");
    } finally {
      setRedeeming(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg transition",
            toast.type === "ok"
              ? "bg-[#00B4A6] text-white"
              : "bg-red-600 text-white",
          )}
        >
          {toast.type === "ok" ? (
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {toast.msg}
        </div>
      )}

      {/* Buscador de cliente */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-100">
          <Search className="h-5 w-5 text-[#00B4A6]" />
          Buscar cliente
        </h3>
        <div className="flex gap-2">
          <input
            type="tel"
            placeholder="Teléfono (ej. 987654321)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={12}
            className="min-h-[44px] flex-1 rounded-xl border border-gray-200 px-4 text-sm text-gray-800 outline-none transition focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6] dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          <button
            onClick={searchCustomer}
            disabled={searching || phone.replace(/\D/g, "").length < 9}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-[#00B4A6] px-4 text-sm font-medium text-white transition hover:bg-[#009690] disabled:opacity-50"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
          </button>
        </div>

        {/* Info del cliente */}
        {notFound && (
          <p className="mt-3 text-sm text-red-500">Cliente no encontrado</p>
        )}
        {customer && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00B4A6] text-base font-bold text-white">
              {customer.name
                .split(" ")
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("")}
            </div>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100">
                {customer.name}
              </p>
              <p className="text-sm text-gray-500">{customer.phone}</p>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5">
                <Star className="h-4 w-4 text-yellow-500" />
                <span className="text-lg font-bold text-[#00B4A6]">
                  {customer.loyaltyPoints.toLocaleString()} pts
                </span>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                  TIER_STYLES[customer.loyaltyTier] ?? TIER_STYLES.bronce,
                )}
              >
                {customer.loyaltyTier}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Grid de recompensas */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-100">
          <Gift className="h-5 w-5 text-[#f4a261]" />
          Recompensas disponibles
        </h3>

        {loadingRewards ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-[#00B4A6]" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rewards.map((reward) => {
              const hasEnough =
                customer !== null && customer.loyaltyPoints >= reward.pointsCost;
              const isRedeeming = redeeming === reward.id;

              return (
                <div
                  key={reward.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border p-5 transition",
                    hasEnough
                      ? "border-[#00B4A6]/30 bg-green-50 dark:border-[#00B4A6]/40 dark:bg-green-900/10"
                      : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900",
                  )}
                >
                  <div className="text-3xl">{reward.icon}</div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">
                      {reward.name}
                    </p>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                      {reward.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-[#00B4A6]/10 px-3 py-1 text-sm font-bold text-[#00B4A6] dark:bg-[#00B4A6]/20">
                      {reward.pointsCost.toLocaleString()} pts
                    </span>
                    <button
                      onClick={() => redeem(reward)}
                      disabled={!hasEnough || isRedeeming || !customer}
                      className={cn(
                        "flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-medium transition",
                        hasEnough && customer
                          ? "bg-[#00B4A6] text-white hover:bg-[#009690]"
                          : "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800",
                      )}
                    >
                      {isRedeeming ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Canjear"
                      )}
                    </button>
                  </div>
                  {customer && !hasEnough && (
                    <p className="text-xs text-gray-400">
                      Faltan{" "}
                      {(reward.pointsCost - customer.loyaltyPoints).toLocaleString()} pts
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Historial de canjes recientes */}
      {history.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-100">
            <Award className="h-5 w-5 text-[#00B4A6]" />
            Canjes recientes (esta sesión)
          </h3>
          <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {history.map((h, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-white px-4 py-3 dark:bg-gray-900"
              >
                <span className="text-2xl">{h.rewardIcon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                    {h.name}
                  </p>
                  <p className="text-xs text-gray-500">{h.rewardName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#00B4A6]">
                    -{h.pointsCost.toLocaleString()} pts
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(h.redeemedAt).toLocaleTimeString("es-PE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
