'use client';

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Gift, Share2, Users, Copy, Check, TrendingUp } from "lucide-react";
import { useCustomerSafe } from "@/hooks/use-customer-safe";
import { useToast } from "@/contexts/toast-context";

type ReferralData = {
  code: string;
  referredCount: number;
  totalEarned: number;
  shareUrl: string;
  shareMessage: string;
};

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

  if (loading) {
    return (
      <div className="bg-[var(--surface-sunken)] rounded-2xl border border-[#00B4A6]/20 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-3" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    );
  }

  if (!data) return null;

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
      className="bg-[var(--surface-sunken)] rounded-2xl border border-[#00B4A6]/20 p-5 sm:p-6"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <div className="h-11 w-11 rounded-xl bg-[#f97316]/15 flex items-center justify-center flex-shrink-0">
          <Gift className="h-5 w-5 text-[#f97316]" />
        </div>
        <div>
          <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
            Invita a un amigo y ambos ganan S/5
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Comparte tu codigo y gana descuentos
          </p>
        </div>
      </div>

      {/* Code display */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-[var(--rule-base)] p-4 mb-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium">Tu codigo de referido</p>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-extrabold text-[#00B4A6] dark:text-[#2dd4bf] tracking-wider flex-1">
            {data.code}
          </span>
          <button
            onClick={handleCopy}
            className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            aria-label="Copiar codigo"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-gray-500" />}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-[var(--rule-base)] p-3 text-center">
          <Users className="h-4 w-4 text-[#00B4A6] mx-auto mb-1" />
          <p className="text-lg font-extrabold text-gray-900 dark:text-white">{data.referredCount}</p>
          <p className="text-[length:var(--ts-xs)] text-gray-500 dark:text-gray-400">Amigos referidos</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-[var(--rule-base)] p-3 text-center">
          <TrendingUp className="h-4 w-4 text-[#f97316] mx-auto mb-1" />
          <p className="text-lg font-extrabold text-gray-900 dark:text-white">S/ {data.totalEarned.toFixed(2)}</p>
          <p className="text-[length:var(--ts-xs)] text-gray-500 dark:text-gray-400">Ganado</p>
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
          className="py-3.5 px-5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-sm flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
        >
          <Share2 className="h-4 w-4" />
          Compartir
        </button>
      </div>
    </motion.div>
  );
}
