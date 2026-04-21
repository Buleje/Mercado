"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Check, X, Clock, ShoppingBag, ArrowLeft } from "@buleje/design-system/icons";
import Link from "next/link";

function PaymentResultContent() {
  const params = useSearchParams();
  const status = params.get("status"); // approved, rejected, pending
  const orderId = params.get("order") || "";

  useEffect(() => {
    if (status === "approved") {
      try {
        localStorage.setItem("buleje-first-purchase", "1");
      } catch { /* ignore */ }
    }
  }, [status]);

  const config = {
    approved: {
      icon: <Check className="h-12 w-12 text-green-600" strokeWidth={2.5} />,
      bg: "from-green-100 to-emerald-50 dark:from-green-900/40 dark:to-emerald-900/20",
      shadow: "shadow-green-200/50",
      title: "¡Pago exitoso!",
      subtitle: "Tu pago fue procesado correctamente. El vendedor ya está preparando tu pedido.",
      badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
      badgeText: "Pagado ✓",
    },
    rejected: {
      icon: <X className="h-12 w-12 text-red-600" strokeWidth={2.5} />,
      bg: "from-red-100 to-rose-50 dark:from-red-900/40 dark:to-rose-900/20",
      shadow: "shadow-red-200/50",
      title: "Pago rechazado",
      subtitle: "No se pudo procesar tu pago. Puedes intentar con otro método.",
      badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
      badgeText: "Rechazado",
    },
    pending: {
      icon: <Clock className="h-12 w-12 text-amber-600" strokeWidth={2.5} />,
      bg: "from-amber-100 to-yellow-50 dark:from-amber-900/40 dark:to-yellow-900/20",
      shadow: "shadow-amber-200/50",
      title: "Pago en proceso",
      subtitle: "Tu pago está siendo verificado. Te avisaremos cuando se confirme.",
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
      badgeText: "Pendiente",
    },
  }[status || "pending"] || {
    icon: <Clock className="h-12 w-12 text-gray-600" />,
    bg: "from-gray-100 to-gray-50",
    shadow: "",
    title: "Estado desconocido",
    subtitle: "No pudimos determinar el estado del pago.",
    badge: "bg-gray-100 text-gray-700",
    badgeText: "Desconocido",
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div
          className={`mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br ${config.bg} ${config.shadow} shadow-lg`}
        >
          {config.icon}
        </div>

        {/* Status */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {config.title}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {config.subtitle}
          </p>
        </div>

        {/* Order ID */}
        {orderId && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-2">
            <div className="flex items-center justify-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Pedido</span>
            </div>
            <p className="font-mono text-sm font-bold text-gray-900 dark:text-white">
              {orderId.slice(0, 8)}…
            </p>
            <span className={`inline-block text-xs font-bold rounded-full px-3 py-1 ${config.badge}`}>
              {config.badgeText}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Link
            href="/marketplace/my-orders"
            className="block w-full py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors shadow-md shadow-primary/25"
          >
            Ver mis pedidos
          </Link>
          <Link
            href="/marketplace"
            className="block w-full py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al marketplace
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
          <div className="animate-pulse text-gray-400">Cargando...</div>
        </div>
      }
    >
      <PaymentResultContent />
    </Suspense>
  );
}
