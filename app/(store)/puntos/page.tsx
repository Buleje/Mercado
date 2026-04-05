"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft, Award, Star, Trophy,
  Loader2, ChevronRight,
} from "lucide-react";
import { useCustomer } from "@/contexts/customer-context";
import { cn } from "@/lib/utils";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

/* ── Types ───────────────────────────────────────────────────────── */

type AutoDiscountTier = {
  minPurchases: number;
  percent: number;
  label: string;
};

type AutoDiscountData = {
  totalOrders: number;
  currentTier: string;
  currentPercent: number;
  nextTier: { label: string; percent: number; ordersNeeded: number } | null;
  allTiers: AutoDiscountTier[];
};

type LoyaltyData = {
  phone?: string;
  name?: string;
  loyaltyPoints?: number;
  loyaltyTier: string;
  totalSpent?: number;
  tiers?: { name: string; minSpent: number }[];
  referralCode?: string | null;
  creditBalance?: number;
  autoDiscount?: AutoDiscountData;
};

type Reward = {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  type: string;
  value: number;
  icon: string;
};

/* ── Tier styles ─────────────────────────────────────────────────── */

const TIER_META: Record<string, { emoji: string; color: string; bg: string; border: string }> = {
  bronce:   { emoji: "🥉", color: "text-amber-700 dark:text-amber-300",   bg: "bg-amber-50 dark:bg-amber-900/20",   border: "border-amber-200 dark:border-amber-700" },
  plata:    { emoji: "🥈", color: "text-gray-600 dark:text-gray-300",     bg: "bg-gray-50 dark:bg-gray-800",         border: "border-gray-200 dark:border-gray-600" },
  oro:      { emoji: "🥇", color: "text-yellow-700 dark:text-yellow-300", bg: "bg-yellow-50 dark:bg-yellow-900/20",  border: "border-yellow-200 dark:border-yellow-700" },
  diamante: { emoji: "💎", color: "text-sky-700 dark:text-sky-300",       bg: "bg-sky-50 dark:bg-sky-900/20",        border: "border-sky-200 dark:border-sky-700" },
};

/* ── Main Page ───────────────────────────────────────────────────── */

export default function PuntosPage() {
  const { customer, openModal: openCustomerModal } = useCustomer();

  const [loyalty, setLoyalty] = useState<LoyaltyData | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async (phone: string) => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 6) return;
    setLoading(true);
    setError("");
    try {
      const [loyaltyRes, rewardsRes] = await Promise.all([
        fetch(`/api/loyalty/${encodeURIComponent(clean)}`),
        fetch("/api/loyalty/redeem"),
      ]);
      if (loyaltyRes.ok) {
        const data: LoyaltyData = await loyaltyRes.json();
        startTransition(() => setLoyalty(data));
      }
      if (rewardsRes.ok) {
        const data: Reward[] = await rewardsRes.json();
        startTransition(() => setRewards(data));
      }
    } catch {
      setError("No pudimos cargar tus puntos. Intenta de nuevo.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (customer?.phone) {
      loadData(customer.phone);
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.phone]);

  // Prompt login if no customer
  useEffect(() => {
    if (!customer?.phone && !loading) {
      const t = setTimeout(() => openCustomerModal("profile"), 400);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tier = loyalty?.loyaltyTier ?? "bronce";
  const tierStyle = TIER_META[tier] ?? TIER_META.bronce;
  const points = loyalty?.loyaltyPoints ?? 0;
  const tiers = loyalty?.tiers ?? [
    { name: "bronce", minSpent: 0 },
    { name: "plata", minSpent: 200 },
    { name: "oro", minSpent: 500 },
    { name: "diamante", minSpent: 1500 },
  ];
  const currentTierIdx = tiers.findIndex((t) => t.name === tier);
  const nextTier = tiers[currentTierIdx + 1];
  const totalSpent = loyalty?.totalSpent ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mis Puntos", url: "https://www.buleje.pe/puntos" },
        ]}
      />
      <AnnouncementBar />
      <Header />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div
        className="pt-32 sm:pt-36 pb-10 sm:pb-14"
        style={{ background: "linear-gradient(135deg, #009690 0%, #00B4A6 50%, #33C4B8 100%)" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 mb-6">
            <Link
              href="/cuenta"
              className="p-2 -ml-1 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-white/80 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Mis Puntos</h1>
              <p className="text-xs text-white/60 mt-0.5">Programa de fidelidad Buleje</p>
            </div>
          </div>

          {/* Points card */}
          {loyalty && (
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/15 p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-white/15 flex items-center justify-center text-3xl">
                  {tierStyle.emoji}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-white/60 font-medium">Tu saldo</p>
                  <p className="text-3xl sm:text-4xl font-black text-white leading-none">{points}</p>
                  <p className="text-xs text-white/50 mt-0.5">puntos acumulados</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/50">Nivel</p>
                  <p className="text-lg font-bold text-white capitalize">{tier}</p>
                  <p className="text-xs text-white/40">S/ {totalSpent.toFixed(0)} gastados</p>
                </div>
              </div>

              {/* Progress to next tier */}
              {nextTier && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between text-xs text-white/60 mb-1.5">
                    <span>Progreso a <span className="font-bold capitalize text-white/80">{nextTier.name}</span></span>
                    <span>S/ {totalSpent.toFixed(0)} / S/ {nextTier.minSpent}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-secondary rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (totalSpent / nextTier.minSpent) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-white/40 mt-1">
                    Te faltan S/ {Math.max(0, nextTier.minSpent - totalSpent).toFixed(0)} para subir de nivel
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 -mt-2 pb-16">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={() => customer?.phone && loadData(customer.phone)}
              className="mt-3 text-sm font-bold text-primary hover:underline"
            >
              Reintentar
            </button>
          </div>
        ) : !customer?.phone ? (
          <div className="text-center py-16">
            <Award className="h-12 w-12 text-muted mx-auto mb-3" />
            <p className="text-sm text-muted">Identifícate para ver tus puntos</p>
            <button
              onClick={() => openCustomerModal("profile")}
              className="mt-3 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
            >
              Ingresar mi teléfono
            </button>
          </div>
        ) : (
          <div className="space-y-6 mt-6">
            {/* ── How it works ───────────────────────────────────── */}
            <section>
              <h2 className="text-lg font-bold text-foreground mb-3">¿Cómo funciona?</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: "🛒", title: "Compra", desc: "Ganas 1 punto por cada S/ 1 que gastas" },
                  { icon: "⭐", title: "Acumula", desc: "Sube de nivel comprando más: Bronce → Plata → Oro → Diamante" },
                  { icon: "🎁", title: "Canjea", desc: "Usa tus puntos por descuentos, delivery gratis o productos" },
                ].map((step) => (
                  <div key={step.title} className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4 text-center">
                    <span className="text-2xl">{step.icon}</span>
                    <p className="text-sm font-bold text-foreground mt-2">{step.title}</p>
                    <p className="text-xs text-muted mt-1">{step.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Tier ladder ────────────────────────────────────── */}
            <section>
              <h2 className="text-lg font-bold text-foreground mb-3">Niveles</h2>
              <div className="space-y-2">
                {tiers.map((t) => {
                  const style = TIER_META[t.name] ?? TIER_META.bronce;
                  const isActive = t.name === tier;
                  return (
                    <div
                      key={t.name}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                        isActive
                          ? `${style.bg} ${style.border} ring-2 ring-primary/20`
                          : "bg-white dark:bg-card border-gray-100 dark:border-card-border"
                      )}
                    >
                      <span className="text-xl">{style.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-bold capitalize", isActive ? style.color : "text-foreground")}>
                          {t.name}
                          {isActive && <span className="ml-2 text-xs font-medium text-primary">(Tu nivel)</span>}
                        </p>
                        <p className="text-xs text-muted">
                          {t.minSpent === 0 ? "Nivel inicial" : `Gasta S/ ${t.minSpent}+`}
                        </p>
                      </div>
                      {isActive && <Star className="h-4 w-4 text-primary fill-primary" />}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── Auto-discount by purchase frequency ────────── */}
            {loyalty?.autoDiscount && (
              <section>
                <h2 className="text-lg font-bold text-foreground mb-3">🎉 Tu descuento por compras frecuentes</h2>
                <div className="bg-linear-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 rounded-xl border border-primary/20 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center text-lg">🏷️</div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">
                        {loyalty.autoDiscount.currentPercent > 0
                          ? `¡Tienes ${loyalty.autoDiscount.currentPercent}% de descuento automático!`
                          : "Aún no tienes descuento automático"}
                      </p>
                      <p className="text-xs text-muted">
                        {loyalty.autoDiscount.totalOrders} {loyalty.autoDiscount.totalOrders === 1 ? "compra" : "compras"} realizadas · Nivel: {loyalty.autoDiscount.currentTier}
                      </p>
                    </div>
                  </div>

                  {loyalty.autoDiscount.nextTier && (
                    <div className="bg-white/60 dark:bg-card/60 rounded-lg p-3 mb-3">
                      <p className="text-xs text-muted mb-1">
                        Haz <span className="font-bold text-primary">{loyalty.autoDiscount.nextTier.ordersNeeded}</span> {loyalty.autoDiscount.nextTier.ordersNeeded === 1 ? "compra más" : "compras más"} y sube a <span className="font-bold text-foreground">{loyalty.autoDiscount.nextTier.label}</span> ({loyalty.autoDiscount.nextTier.percent}% de descuento)
                      </p>
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, ((loyalty.autoDiscount.totalOrders) / (loyalty.autoDiscount.totalOrders + loyalty.autoDiscount.nextTier.ordersNeeded)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {loyalty.autoDiscount.allTiers.filter(t => t.percent > 0).map((t) => {
                      const isActive = loyalty.autoDiscount!.totalOrders >= t.minPurchases;
                      return (
                        <div
                          key={t.label}
                          className={cn(
                            "rounded-lg border p-2 text-center transition-colors",
                            isActive
                              ? "bg-primary/10 border-primary/30 dark:bg-primary/20"
                              : "bg-white/40 dark:bg-card/40 border-gray-200 dark:border-card-border opacity-60"
                          )}
                        >
                          <p className={cn("text-lg font-black", isActive ? "text-primary" : "text-muted")}>{t.percent}%</p>
                          <p className="text-[10px] font-bold text-foreground">{t.label}</p>
                          <p className="text-[10px] text-muted">{t.minPurchases}+ compras</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* ── Rewards catalog ────────────────────────────────── */}
            {rewards.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-foreground mb-3">Canjea tus puntos</h2>
                <div className="space-y-2">
                  {rewards.map((r) => {
                    const canRedeem = points >= r.pointsCost;
                    return (
                      <div
                        key={r.id}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border p-4 transition-colors",
                          canRedeem
                            ? "bg-white dark:bg-card border-gray-100 dark:border-card-border"
                            : "bg-gray-50 dark:bg-surface/50 border-gray-100 dark:border-card-border opacity-60"
                        )}
                      >
                        <span className="text-2xl">{r.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground">{r.name}</p>
                          <p className="text-xs text-muted">{r.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn("text-sm font-bold", canRedeem ? "text-primary" : "text-muted")}>
                            {r.pointsCost} pts
                          </p>
                          {canRedeem ? (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Disponible</span>
                          ) : (
                            <span className="text-[10px] text-muted">Faltan {r.pointsCost - points}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted mt-3 text-center">
                  Para canjear una recompensa, pídelo al momento de pagar o escríbenos por WhatsApp.
                </p>
              </section>
            )}

            {/* ── CTA ────────────────────────────────────────────── */}
            <div className="text-center pt-4">
              <Link
                href="/tienda"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                <Trophy className="h-4 w-4" />
                Seguir comprando para ganar puntos
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
