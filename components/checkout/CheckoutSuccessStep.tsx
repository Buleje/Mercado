"use client";

import { m } from "framer-motion";
import { MapPin, ShoppingCart } from "lucide-react";

export interface CheckoutSuccessStepProps {
  orderId: string;
  onClose: () => void;
}

export function CheckoutSuccessStep({ orderId, onClose }: CheckoutSuccessStepProps) {
  return (
    <m.div
      key="exito"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", damping: 20, stiffness: 250 }}
    >
      <div className="px-5 py-8 flex flex-col items-center text-center space-y-5 relative overflow-hidden">
        {/* Confetti CSS dots */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <m.div
              key={i}
              initial={{ opacity: 0, y: -20, x: `${10 + (i * 7) % 80}%` }}
              animate={{
                opacity: [0, 1, 0],
                y: ["-20%", "110%"],
                rotate: [0, 360 * (i % 2 === 0 ? 1 : -1)],
              }}
              transition={{
                duration: 2.5 + (i % 3) * 0.5,
                delay: 0.2 + i * 0.15,
                ease: "easeOut",
              }}
              className="absolute w-2 h-2 rounded-sm"
              style={{
                left: `${10 + (i * 7) % 80}%`,
                backgroundColor: [
                  "#00B4A6",
                  "#f97316",
                  "#e63946",
                  "#457b9d",
                  "#ffd60a",
                  "#9b5de5",
                ][i % 6],
              }}
            />
          ))}
        </div>

        {/* Animated checkmark with SVG */}
        <div className="relative">
          <m.div
            animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full bg-emerald-300/30"
          />
          <m.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", damping: 10, stiffness: 180, delay: 0.1 }}
            className="relative h-24 w-24 rounded-full bg-linear-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-xl shadow-emerald-300/40"
          >
            <svg viewBox="0 0 52 52" className="h-12 w-12">
              <m.path
                fill="none"
                stroke="white"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14 27l7.8 7.8L38 17"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
              />
            </svg>
          </m.div>
        </div>

        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="text-2xl font-extrabold text-gray-900 dark:text-foreground">
            Pedido confirmado!
          </h3>
          <p className="text-sm text-gray-500 mt-1.5">
            Tu pedido esta siendo preparado con mucho cariño
          </p>
        </m.div>

        {/* Order number - prominent */}
        {orderId && (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-linear-to-r from-primary/5 to-emerald-50 dark:from-primary/10 dark:to-emerald-900/20 rounded-2xl px-6 py-4 border border-primary/20 w-full max-w-xs"
          >
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
              Numero de pedido
            </p>
            <p className="text-2xl font-extrabold text-primary font-mono mt-1">#{orderId}</p>
          </m.div>
        )}

        {/* Timeline estimado */}
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="w-full max-w-sm"
        >
          <div className="flex items-center justify-between text-[10px] font-bold text-gray-500 relative">
            <div className="absolute top-3 left-[14%] right-[14%] h-0.5 bg-gray-200 dark:bg-gray-700" />
            <m.div
              className="absolute top-3 left-[14%] h-0.5 bg-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: "20%" }}
              transition={{ duration: 1, delay: 0.8, ease: "easeOut" }}
            />
            {[
              { icon: "📋", label: "Confirmado", active: true },
              { icon: "🍽", label: "Preparando", sub: "~10 min", active: false },
              { icon: "🚗", label: "En camino", sub: "~20 min", active: false },
              { icon: "✅", label: "Entregado", active: false },
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-1 relative z-10">
                <span className={`text-lg ${s.active ? "" : "opacity-40"}`}>{s.icon}</span>
                <span className={s.active ? "text-emerald-600 font-extrabold" : "text-gray-400"}>
                  {s.label}
                </span>
                {s.sub && <span className="text-[9px] text-gray-400">{s.sub}</span>}
              </div>
            ))}
          </div>
        </m.div>

        {/* Action buttons */}
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex flex-col sm:flex-row gap-2 w-full max-w-sm pt-2"
        >
          {orderId && (
            <a
              href={`/tracking?id=${orderId}`}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
            >
              <MapPin className="h-4 w-4" /> Seguir mi pedido
            </a>
          )}
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-gray-700 dark:text-foreground bg-gray-100 dark:bg-surface hover:bg-gray-200 transition-colors"
          >
            <ShoppingCart className="h-4 w-4" /> Seguir comprando
          </button>
        </m.div>
      </div>
    </m.div>
  );
}
