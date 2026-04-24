"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CheckCircle2, Package, Clock, Share2, Star,
  ArrowRight, Smartphone, ShoppingBag,
} from "@buleje/design-system/icons";

/**
 * /pedido/[id]/gracias — Order confirmation "thank you" page.
 *
 * Shown after successful checkout. Includes:
 * - Order confirmation with animated checkmark
 * - Estimated delivery time
 * - Share on WhatsApp button
 * - PWA install prompt
 * - Link to track order
 * - Referral code invite
 */

type OrderSummary = {
  id: string;
  total: number;
  itemCount: number;
  status: string;
  estimatedDelivery: string;
};

const CONFETTI_COLORS = ["#00B4A6", "#f97316", "#10b981", "#6366f1", "#ec4899"];

function generatePieces() {
  return Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    width: 6 + Math.random() * 6,
    height: 8 + Math.random() * 8,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    duration: 1.5 + Math.random(),
    delay: Math.random() * 0.5,
    rotation: Math.random() * 360,
  }));
}

function ConfettiEffect() {
  const [pieces] = useState(generatePieces);
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: 0,
            width: `${p.width}px`,
            height: `${p.height}px`,
            backgroundColor: p.color,
            borderRadius: "2px",
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export default function GraciasPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    // Marca la primera compra completada — desbloquea el InstallPrompt post-compra
    try {
      localStorage.setItem("buleje-first-purchase", "1");
    } catch { /* ignore quota/disabled storage */ }

    // Fetch basic order info
    (async () => {
      try {
        const res = await fetch(`/api/orders/${id}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setOrder({
            id: data.id ?? id,
            total: data.total ?? 0,
            itemCount: data.items?.length ?? 0,
            status: data.status ?? "pendiente",
            estimatedDelivery: "30-60 minutos",
          });
        }
      } catch { /* use defaults */ }
    })();

    // Hide confetti after 3s
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, [id]);

  const orderId = order?.id ?? id ?? "";
  const shortId = orderId.slice(-8).toUpperCase();

  const handleShare = () => {
    const text = `Acabo de hacer un pedido en Buleje! Prueba tu tambien: https://www.buleje.pe`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
      {/* Confetti effect — pieces generated once via useState to satisfy react-hooks/purity */}
      {showConfetti && <ConfettiEffect />}

      <div className="mx-auto max-w-lg px-4 py-12">
        {/* Success icon */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-4">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Pedido confirmado!
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            Tu pedido <span className="font-mono font-bold text-emerald-600">#{shortId}</span> fue recibido
          </p>
        </div>

        {/* Order summary card */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Package className="h-4 w-4" />
              <span>{order?.itemCount ?? "..."} productos</span>
            </div>
            <span className="text-lg font-bold text-emerald-700">
              S/{(order?.total ?? 0).toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
            <Clock className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Tiempo estimado: <strong>{order?.estimatedDelivery ?? "30-60 min"}</strong>
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3 mb-8">
          <Link
            href={`/pedido/${id}`}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-600 px-6 py-3 text-white font-semibold shadow-md hover:bg-emerald-700 transition-colors"
          >
            <Package className="h-5 w-5" />
            Seguir mi pedido
            <ArrowRight className="h-4 w-4" />
          </Link>

          <button
            onClick={handleShare}
            className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-[#25D366] px-6 py-3 text-[#25D366] font-semibold hover:bg-[#25D366]/5 transition-colors"
          >
            <Share2 className="h-5 w-5" />
            Compartir en WhatsApp
          </button>
        </div>

        {/* PWA install suggestion */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 mb-6">
          <div className="flex items-start gap-3">
            <Smartphone className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Instala Buleje en tu celular
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Agrega a tu pantalla de inicio para pedir mas rápido la próxima vez.
                Toca el menu del navegador y selecciona &quot;Agregar a inicio&quot;.
              </p>
            </div>
          </div>
        </div>

        {/* Referral invite */}
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-5 mb-6">
          <div className="flex items-start gap-3">
            <Star className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                Invita a un amigo y gana puntos
              </h3>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                Comparte tu codigo de referido y ambos ganan puntos de lealtad.
                Ve a Mi Cuenta para encontrar tu codigo.
              </p>
            </div>
          </div>
        </div>

        {/* Continue shopping */}
        <div className="text-center">
          <Link
            href="/tienda"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 transition-colors"
          >
            <ShoppingBag className="h-4 w-4" />
            Seguir comprando
          </Link>
        </div>
      </div>
    </div>
  );
}
