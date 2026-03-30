'use client';

import { useState, useEffect } from "react";
import { X, Gift, Copy, Check, ShoppingCart } from "lucide-react";
import Link from "next/link";

const STORAGE_KEY = "first-visit-coupon-shown";
const COUPON_CODE = "BIENVENIDO";
const DELAY_MS = 5000;

export default function FirstVisitCouponModal() {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // If already shown, never show again
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") return;
    } catch { return; }

    const timer = setTimeout(() => {
      setShow(true);
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setShow(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch { /* silent */ }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(COUPON_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* silent */ }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fadeDown_0.25s_ease-out]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cupon de bienvenida"
        className="relative bg-white dark:bg-card rounded-3xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-[scaleIn_0.3s_ease-out]"
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5 text-white" />
        </button>

        {/* Gradient header */}
        <div className="relative h-36 bg-gradient-to-br from-[#0f766e] via-[#0d9488] to-[#f97316] overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.12)_1px,transparent_1px)] bg-[length:20px_20px] opacity-40" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <Gift className="h-14 w-14 mb-2 drop-shadow-lg" />
            <p className="text-lg font-black tracking-wide drop-shadow-md">Bienvenido!</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 text-center space-y-5">
          <div>
            <h2 className="text-2xl font-black text-foreground mb-2">
              Bienvenido a Buleje!
            </h2>
            <p className="text-muted text-sm">
              Usa este codigo para obtener <strong className="text-[#0f766e]">10% de descuento</strong> en tu primer pedido
            </p>
          </div>

          {/* Coupon code */}
          <div className="bg-gradient-to-r from-[#0f766e]/5 to-[#f97316]/10 rounded-2xl p-5 border-2 border-dashed border-[#0f766e]/20">
            <p className="text-xs font-semibold text-muted mb-2">Codigo de descuento</p>
            <div className="flex items-center justify-center gap-3">
              <p className="text-3xl font-black text-[#0f766e] tracking-[0.2em] select-all">{COUPON_CODE}</p>
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  copied
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-[#0f766e]/10 text-[#0f766e] hover:bg-[#0f766e]/20"
                }`}
              >
                {copied ? <><Check className="h-3.5 w-3.5" /> Copiado!</> : <><Copy className="h-3.5 w-3.5" /> Copiar</>}
              </button>
            </div>
            <p className="text-[10px] text-muted mt-2">Valido en tu primer pedido</p>
          </div>

          {/* CTA */}
          <div className="flex flex-col gap-3">
            <Link
              href="/tienda"
              onClick={handleClose}
              className="w-full flex items-center justify-center gap-2 bg-[#0f766e] text-white rounded-xl px-6 py-4 font-bold shadow-md hover:bg-[#0d5f58] transition-all"
            >
              <ShoppingCart className="h-5 w-5" />
              Ir a comprar
            </Link>
            <button
              onClick={handleClose}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Tal vez despues
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
