"use client";

import { useState, useEffect, useRef } from "react";
import { Clock, Hash, Copy, Check, CheckCircle2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type YapePaymentPanelProps = {
  yape: { enabled: boolean; image?: string; name?: string; phone?: string };
  finalTotal: number;
  yapeOpNumber: string;
  onOpNumberChange: (v: string) => void;
};

export function YapePaymentPanel({ yape, finalTotal, yapeOpNumber, onOpNumberChange }: YapePaymentPanelProps) {
  const [copied, setCopied] = useState<"amount" | "phone" | null>(null);
  const [countdown, setCountdown] = useState(600); // 10 min
  const opInputRef = useRef<HTMLInputElement>(null);
  const opEntered = /^\d{6,20}$/.test(yapeOpNumber.trim());

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
    } catch { /* fallback: user copies manually */ }
  };

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <div className="bg-linear-to-b from-purple-50 to-purple-100/50 rounded-2xl border border-purple-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Pago con Yape</p>
        <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
          countdown > 120 ? "bg-purple-200 text-[var(--accent)]" : "bg-red-100 text-red-600 animate-pulse")}>
          <Clock className="h-3 w-3" />
          {minutes}:{seconds.toString().padStart(2, "0")}
        </div>
      </div>

      {countdown === 0 && !opEntered && (
        <div className="flex flex-col items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-xs font-bold text-red-600">Tiempo expirado</p>
          <p className="text-xs text-red-500 text-center">El tiempo para completar el pago se agotó. Puedes reiniciar el temporizador.</p>
          <button
            type="button"
            onClick={() => setCountdown(600)}
            className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 transition-colors"
          >
            Reiniciar temporizador (10 min)
          </button>
        </div>
      )}

      <div className="bg-white/70 rounded-xl p-3 space-y-2">
        <div className="flex items-start gap-2">
          <span className="shrink-0 h-5 w-5 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center font-bold">1</span>
          <p className="text-xs text-gray-600">Abre tu app <strong className="text-[var(--accent)]">Yape</strong> y escanea el QR o yapea al número</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="shrink-0 h-5 w-5 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center font-bold">2</span>
          <p className="text-xs text-gray-600">Ingresa el monto <strong className="text-[var(--accent)]">exacto</strong> que se muestra abajo</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="shrink-0 h-5 w-5 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center font-bold">3</span>
          <p className="text-xs text-gray-600">Copia el <strong className="text-[var(--accent)]">número de operación</strong> e ingrésalo aquí</p>
        </div>
      </div>

      {!opEntered && (
        <div className="flex items-center gap-2 bg-purple-100/70 rounded-xl px-3 py-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-600" />
          </span>
          <p className="text-xs font-semibold text-[var(--accent)]">Esperando tu pago&hellip;</p>
        </div>
      )}
      {opEntered && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <p className="text-xs font-semibold text-emerald-700">Número ingresado! Ya puedes confirmar el pedido</p>
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        {yape.image && (
          <div className="relative w-44 h-44 rounded-2xl overflow-hidden border-2 border-purple-300 bg-white shadow-lg shadow-purple-200/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={yape.image} alt="Yape QR" className="w-full h-full object-contain p-1" />
          </div>
        )}
        <div className="text-center space-y-1">
          {yape.name && <p className="font-bold text-gray-900">{yape.name}</p>}
          {yape.phone && (
            <button
              type="button"
              onClick={() => copyText(yape.phone!, "phone")}
              className="inline-flex items-center gap-1.5 text-sm font-mono text-[var(--accent)] hover:text-purple-900 transition-colors"
            >
              {yape.phone}
              {copied === "phone" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 opacity-50" />}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => copyText(finalTotal.toFixed(2), "amount")}
          className="w-full bg-purple-200/80 hover:bg-purple-200 rounded-xl px-4 py-3 text-center transition-colors group relative"
        >
          <p className="text-xs text-purple-600 font-semibold">Monto exacto a yapear</p>
          <div className="flex items-center justify-center gap-2">
            <p className="text-3xl font-extrabold text-purple-800">S/{finalTotal.toFixed(2)}</p>
            {copied === "amount" ? (
              <Check className="h-5 w-5 text-green-500" />
            ) : (
              <Copy className="h-5 w-5 text-purple-400 group-hover:text-purple-600 transition-colors" />
            )}
          </div>
          <p className="text-[length:var(--ts-2xs)] text-purple-500 mt-0.5">{copied === "amount" ? "Copiado!" : "Toca para copiar"}</p>
        </button>
      </div>

      <div>
        <label className="block text-xs font-bold text-purple-600 mb-1.5 uppercase tracking-wider">Número de operación *</label>
        <div className="relative">
          <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400" />
          <input
            ref={opInputRef}
            value={yapeOpNumber}
            onChange={(e) => onOpNumberChange(e.target.value.replace(/\D/g, ""))}
            placeholder="Ej: 123456789"
            maxLength={20}
            inputMode="numeric"
            className={cn(
              "w-full pl-10 pr-10 py-3 rounded-xl border-2 text-gray-900 placeholder:text-purple-300 focus:ring-2 outline-none transition-all text-sm font-mono bg-white",
              opEntered
                ? "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-200"
                : "border-purple-200 focus:border-purple-500 focus:ring-purple-200"
            )}
          />
          {opEntered && (
            <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
          )}
        </div>
        <p className="text-[length:var(--ts-2xs)] text-purple-500 mt-1">
          {yapeOpNumber.trim().length > 0 && !opEntered
            ? "El número de operación debe tener entre 6 y 20 dígitos"
            : "Encuéntralo en tu comprobante de Yape - Solo números"}
        </p>
      </div>
    </div>
  );
}
