'use client';

import { useState, useEffect, useMemo } from "react";
import { m as motion } from "framer-motion";
import { Gift, Share2, Users, Copy, Check, TrendingUp, Crown } from "@buleje/design-system/icons";
import { useCustomerSafe } from "@/hooks/use-customer-safe";
import { useToast } from "@/contexts/toast-context";

type ReferralData = {
  code: string;
  referredCount: number;
  totalEarned: number;
  shareUrl: string;
  shareMessage: string;
};

// Tiers de recompensa — cuantos mas amigos refieras, mas gana tu vecino Y tu
const REFERRAL_TIERS = [
  { count: 1, bonus: 10, label: "Empezá", emoji: "" },
  { count: 3, bonus: 30, label: "Conector", emoji: "" },
  { count: 5, bonus: 60, label: "Influencer del barrio", emoji: "" },
  { count: 10, bonus: 150, label: "VIP — el/la embajador/a", emoji: "Crown" },
] as const;

function getTierInfo(referredCount: number) {
  const unlocked = REFERRAL_TIERS.filter((t) => referredCount >= t.count).length;
  const current = REFERRAL_TIERS[Math.max(0, unlocked - 1)];
  const next = REFERRAL_TIERS[unlocked] ?? null;
  const progress = next
    ? Math.min(100, Math.round(((referredCount - (current?.count ?? 0)) / (next.count - (current?.count ?? 0))) * 100))
    : 100;
  return { unlocked, current, next, progress };
}

export default function ReferralProgram() {
  const customer = useCustomerSafe();
  const { showToast } = useToast();
  const [data, setData] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const phone = customer?.phone || "";
    if (!phone) {
      setData(null);
      return;
    }
    setLoading(true);
    fetch(`/api/marketplace/referral?phone=${encodeURIComponent(phone)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customer?.phone]);

  const tierInfo = useMemo(
    () => (data ? getTierInfo(data.referredCount) : null),
    [data],
  );

  if (loading) {
    return (
      <div className="bg-[var(--surface-sunken)] rounded-2xl border border-[var(--accent)]/20 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-3" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    );
  }

  if (!data || !tierInfo) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      showToast("Código copiado", "");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("No se pudo copiar", "");
    }
  };

  const handleShareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(data.shareMessage)}`, "_blank");
  };

  const handleShareGeneric = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Invita a un amigo — Buleje",
          text: data.shareMessage,
          url: data.shareUrl,
        });
      } catch { /* silent cancel */ }
    } else {
      handleShareWhatsApp();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[var(--surface-sunken)] rounded-2xl border border-[var(--accent)]/20 p-5 sm:p-6"
    >
      {/* Header — tier-aware */}
      <div className="flex items-start gap-3 mb-4">
        <div className="h-11 w-11 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
          {tierInfo.unlocked >= 4 ? (
            <Crown className="h-5 w-5 text-[var(--accent)]" strokeWidth={1.75} />
          ) : (
            <Gift className="h-5 w-5 text-[var(--accent)]" strokeWidth={1.75} />
          )}
        </div>
        <div className="flex-1">
          <h3 className="text-base font-extrabold text-[var(--text-primary)]">
            {tierInfo.next
              ? `Te faltan ${tierInfo.next.count - data.referredCount} para ${tierInfo.next.label}`
              : "Sos VIP — máximo nivel desbloqueado"}
          </h3>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            {tierInfo.next
              ? `Próximo bonus: S/ ${tierInfo.next.bonus} extra`
              : "Gracias por invitar a tantos vecinos"}
          </p>
        </div>
      </div>

      {/* Progress bar — milestone actual → próximo tier */}
      {tierInfo.next && (
        <div className="mb-4 space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-bold text-[var(--text-secondary)] tabular-nums">
              {data.referredCount} / {tierInfo.next.count} amigos
            </span>
            <span className="font-bold uppercase tracking-wider text-[length:var(--ts-2xs)] text-[var(--accent)]">
              +S/ {tierInfo.next.bonus}
            </span>
          </div>
          <div aria-hidden className="h-1.5 w-full rounded-full bg-[var(--surface-raised)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-700 ease-out"
              style={{ width: `${tierInfo.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Code display */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-4 mb-4">
        <p className="text-xs text-[var(--text-tertiary)] mb-1.5 font-medium">Tu codigo de referido</p>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-extrabold text-[var(--accent)] dark:text-[#2dd4bf] tracking-wider flex-1">
            {data.code}
          </span>
          <button
            onClick={handleCopy}
            className="h-10 w-10 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="Copiar codigo"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-gray-500" />}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-3 text-center">
          <Users className="h-4 w-4 text-[var(--accent)] mx-auto mb-1" />
          <p className="text-lg font-extrabold text-[var(--text-primary)]">{data.referredCount}</p>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">Amigos referidos</p>
        </div>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-3 text-center">
          <TrendingUp className="h-4 w-4 text-[#f97316] mx-auto mb-1" />
          <p className="text-lg font-extrabold text-[var(--text-primary)]">S/ {data.totalEarned.toFixed(2)}</p>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">Ganado</p>
        </div>
      </div>

      {/* Share buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleShareWhatsApp}
          className="flex-1 py-3.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#25D366]/20 active:scale-[0.98]"
        >
          <Share2 className="h-4 w-4" />
          WhatsApp
        </button>
        <button
          onClick={handleShareGeneric}
          className="py-3.5 px-5 rounded-xl bg-[var(--surface-sunken)] hover:bg-gray-200 dark:hover:bg-gray-700 text-[var(--text-secondary)] font-bold text-sm flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
        >
          <Share2 className="h-4 w-4" />
          Compartir
        </button>
      </div>
    </motion.div>
  );
}
