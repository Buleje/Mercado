'use client';

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Gift, Share2, Users, Copy, Check, TrendingUp } from "lucide-react";
import { useCustomer } from "@/contexts/customer-context";
import { useToast } from "@/contexts/toast-context";

type ReferralData = {
  code: string;
  referredCount: number;
  totalEarned: number;
};

function generateCode(phone: string): string {
  const last4 = phone.replace(/\D/g, "").slice(-4) || "0000";
  return `REF-${last4}`;
}

export default function ReferralProgram() {
  const { customer } = useCustomer();
  const { showToast } = useToast();
  const [data, setData] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const phone = customer?.phone || "";
    if (!phone) {
      setData(null);
      return;
    }
    try {
      const saved = localStorage.getItem(`bsm-referral-${phone}`);
      if (saved) {
        setData(JSON.parse(saved));
      } else {
        const newData: ReferralData = {
          code: generateCode(phone),
          referredCount: 0,
          totalEarned: 0,
        };
        localStorage.setItem(`bsm-referral-${phone}`, JSON.stringify(newData));
        setData(newData);
      }
    } catch {
      setData({ code: generateCode(phone), referredCount: 0, totalEarned: 0 });
    }
  }, [customer?.phone]);

  if (!data) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      showToast("Codigo copiado", "");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("No se pudo copiar", "");
    }
  };

  const handleShareWhatsApp = () => {
    const msg = `Compra en Buleje y usa mi codigo ${data.code} para S/5 de descuento! Delivery en Pucallpa. https://www.buleje.pe/tienda`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-[#0f766e]/5 to-[#f97316]/5 dark:from-[#0f766e]/10 dark:to-[#f97316]/10 rounded-2xl border border-[#0f766e]/15 dark:border-[#0f766e]/25 p-5 sm:p-6"
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
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium">Tu codigo de referido</p>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-extrabold text-[#0f766e] dark:text-[#14b8a6] tracking-wider flex-1">
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
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
          <Users className="h-4 w-4 text-[#0f766e] mx-auto mb-1" />
          <p className="text-lg font-extrabold text-gray-900 dark:text-white">{data.referredCount}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Amigos referidos</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
          <TrendingUp className="h-4 w-4 text-[#f97316] mx-auto mb-1" />
          <p className="text-lg font-extrabold text-gray-900 dark:text-white">S/ {data.totalEarned.toFixed(2)}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Ganado</p>
        </div>
      </div>

      {/* Share button */}
      <button
        onClick={handleShareWhatsApp}
        className="w-full py-3.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#25D366]/20 active:scale-[0.98]"
      >
        <Share2 className="h-4 w-4" />
        Compartir por WhatsApp
      </button>
    </motion.div>
  );
}
