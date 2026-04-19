"use client";

import { useState, useEffect, useRef } from "react";
import { Clock, Hash, Copy, Check, CheckCircle2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type PlinPaymentPanelProps = {
  plin: { enabled: boolean; image?: string; name?: string; phone?: string };
  finalTotal: number;
  plinOpNumber: string;
  onOpNumberChange: (v: string) => void;
};

export function PlinPaymentPanel({ plin, finalTotal, plinOpNumber, onOpNumberChange }: PlinPaymentPanelProps) {
  const [copied, setCopied] = useState<"amount" | "phone" | null>(null);
  const [countdown, setCountdown] = useState(600);
  const opInputRef = useRef<HTMLInputElement>(null);
  const opEntered = /^\d{6,20}$/.test(plinOpNumber.trim());

  useEffect(() => {
    const t = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => opInputRef.current?.focus(), 600);
    return () => clearTimeout(t);
  }, []);

  const copyText = async (text: string, type: "amount" | "phone") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* fallback */ }
  };

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <div className="bg-linear-to-b from-cyan-50 to-cyan-100/50 rounded-2xl border border-cyan-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-cyan-600 uppercase tracking-wider">Pago con Plin</p>
        <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
          countdown > 120 ? "bg-cyan-200 text-cyan-700" : "bg-red-100 text-red-600 animate-pulse")}>
          <Clock className="h-3 w-3" />
          {minutes}:{seconds.toString().padStart(2, "0")}
        </div>
      </div>

      {/* QR or Phone */}
      <div className="bg-white rounded-xl p-4 text-center space-y-3">
        {plin.image && (
          <img src={plin.image} alt="QR Plin" className="w-40 h-40 mx-auto rounded-lg" />
        )}
        {plin.phone && (
          <button
            onClick={() => copyText(plin.phone!, "phone")}
            className="flex items-center gap-2 mx-auto px-3 py-1.5 rounded-lg bg-cyan-50 hover:bg-cyan-100 transition-colors"
          >
            <span className="text-sm font-bold text-gray-900">{plin.phone}</span>
            {copied === "phone" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
          </button>
        )}
        {plin.name && (
          <p className="text-xs text-gray-500">A nombre de: <span className="font-bold text-gray-700">{plin.name}</span></p>
        )}
      </div>

      {/* Amount to pay */}
      <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3">
        <span className="text-sm text-gray-500">Monto a pagar</span>
        <button
          onClick={() => copyText(finalTotal.toFixed(2), "amount")}
          className="flex items-center gap-2"
        >
          <span className="text-lg font-extrabold text-cyan-600">S/{finalTotal.toFixed(2)}</span>
          {copied === "amount" ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4 text-gray-400" />}
        </button>
      </div>

      {/* Operation number */}
      <div>
        <label className="text-xs font-bold text-gray-600 mb-1 block">
          <Hash className="h-3 w-3 inline mr-1" />
          Numero de operacion Plin
        </label>
        <div className="relative">
          <input
            ref={opInputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={20}
            value={plinOpNumber}
            onChange={(e) => onOpNumberChange(e.target.value.replace(/\D/g, ""))}
            placeholder="Ingresa el numero de operacion"
            className={cn(
              "w-full px-4 py-3 rounded-xl border-2 text-sm font-bold outline-none transition-colors",
              opEntered
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-900 focus:border-cyan-400"
            )}
          />
          {opEntered && (
            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-500" />
          )}
        </div>
      </div>

      {countdown === 0 && (
        <p className="text-xs text-red-600 font-bold text-center">
          Tiempo agotado. Si ya pagaste, ingresa el numero de operacion.
        </p>
      )}
    </div>
  );
}
