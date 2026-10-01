"use client";

import { useEffect } from "react";
import { m } from "framer-motion";
import {
  MapPin,
  ShoppingCart,
  ClipboardCheck,
  ChefHat,
  Truck,
  PackageCheck,
  Sparkles,
} from "@buleje/design-system/icons";
import { fireTenantPurchase } from "@/lib/tenant-pixels";

export interface CheckoutSuccessStepProps {
  orderId: string;
  /** Total del pedido — dispara el evento Purchase a los pixels del tenant. */
  value?: number;
  onClose: () => void;
}

/**
 * CheckoutSuccessStep — pantalla de éxito post-confirmación.
 *
 * Rediseño 2026-05-05 v3 — BRAND-FIRST: reemplaza emerald/green hardcoded
 * por el color de marca del negocio (`--color-primary`). Confetti, halo,
 * checkmark, timeline y CTAs usan brand. El "exito" ya no es genéricamente
 * verde — es el color de la tienda. Animación del ✓ con SVG path.
 */
export function CheckoutSuccessStep({
  orderId,
  value,
  onClose,
}: CheckoutSuccessStepProps) {
  // Conversión: al confirmarse el pedido disparamos Purchase a Meta/TikTok/GA4
  // del comerciante (si los configuró). Deduplicado por orderId en el helper.
  useEffect(() => {
    if (orderId) fireTenantPurchase({ orderId, value: value ?? 0 });
  }, [orderId, value]);

  return (
    <m.div
      key="exito"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", damping: 22, stiffness: 260 }}
    >
      <div className="px-5 py-8 flex flex-col items-center text-center space-y-5 relative overflow-hidden">
        {/* ─── Confetti brand-only ─── */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          {Array.from({ length: 14 }).map((_, i) => {
            // Tonos de marca: primary, primary-dark, white, accent suave
            const tones = [
              "var(--color-primary, #00A0A0)",
              "var(--color-primary-dark, #009690)",
              "color-mix(in oklch, var(--color-primary, #00A0A0) 60%, white)",
              "color-mix(in oklch, var(--color-primary, #00A0A0) 30%, white)",
              "var(--data-warning-400, #ff8676)",
            ];
            const isCircle = i % 3 === 0;
            return (
              <m.div
                key={i}
                initial={{ opacity: 0, y: -20 }}
                animate={{
                  opacity: [0, 1, 0],
                  y: ["-20%", "120%"],
                  rotate: [0, 360 * (i % 2 === 0 ? 1 : -1)],
                }}
                transition={{
                  duration: 2.6 + (i % 3) * 0.4,
                  delay: 0.15 + i * 0.12,
                  ease: "easeOut",
                }}
                className={isCircle ? "absolute h-2 w-2 rounded-full" : "absolute h-2.5 w-2 rounded-sm"}
                style={{
                  left: `${8 + (i * 7) % 84}%`,
                  background: tones[i % tones.length],
                }}
              />
            );
          })}
        </div>

        {/* ─── Checkmark brand con halo pulsante ─── */}
        <div className="relative">
          <m.div
            animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "color-mix(in oklch, var(--color-primary, #00A0A0) 35%, transparent)",
            }}
          />
          <m.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: "spring",
              damping: 11,
              stiffness: 180,
              delay: 0.1,
            }}
            className="relative h-24 w-24 rounded-full flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
              boxShadow:
                "0 16px 36px -8px color-mix(in oklch, var(--color-primary, #00A0A0) 50%, transparent)",
            }}
          >
            <svg viewBox="0 0 52 52" className="h-12 w-12">
              <m.path
                fill="none"
                stroke="white"
                strokeWidth={4.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14 27l7.8 7.8L38 17"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
              />
            </svg>
            {/* Sparkle decorativo */}
            <m.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
              transition={{
                delay: 1.2,
                duration: 1.2,
                repeat: Infinity,
                repeatDelay: 1.5,
              }}
              className="absolute -top-1 -right-1"
            >
              <Sparkles
                className="h-5 w-5 text-white"
                strokeWidth={2.5}
              />
            </m.div>
          </m.div>
        </div>

        {/* ─── Heading ─── */}
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-1"
        >
          <h3
            className="text-3xl font-extrabold tracking-tight"
            style={{ color: "var(--color-primary-dark, #009690)" }}
          >
            ¡Pedido confirmado!
          </h3>
          <p className="text-sm text-muted">
            Tu pedido se está preparando con mucho cariño
          </p>
        </m.div>

        {/* ─── Order number — card brand-tinted ─── */}
        {orderId && (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-2xl px-6 py-4 w-full max-w-xs"
            style={{
              background:
                "color-mix(in oklch, var(--color-primary, #00A0A0) 8%, var(--color-card))",
              border:
                "1px solid color-mix(in oklch, var(--color-primary, #00A0A0) 25%, transparent)",
            }}
          >
            <p
              className="text-xs font-extrabold uppercase tracking-wider"
              style={{ color: "var(--color-primary-dark, #009690)" }}
            >
              Número de pedido
            </p>
            <p
              className="text-3xl font-extrabold font-mono mt-1 tabular-nums"
              style={{ color: "var(--color-primary-dark, #009690)" }}
            >
              #{orderId}
            </p>
          </m.div>
        )}

        {/* ─── Timeline brand ─── */}
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="w-full max-w-sm"
        >
          <div className="flex items-start justify-between text-xs font-bold relative px-2">
            {/* Línea de fondo */}
            <div
              className="absolute top-4 left-[12%] right-[12%] h-0.5"
              style={{
                background:
                  "color-mix(in oklch, var(--color-primary, #00A0A0) 18%, transparent)",
              }}
            />
            {/* Línea de progreso */}
            <m.div
              className="absolute top-4 left-[12%] h-0.5"
              style={{
                background:
                  "linear-gradient(90deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
              }}
              initial={{ width: 0 }}
              animate={{ width: "20%" }}
              transition={{ duration: 1, delay: 0.8, ease: "easeOut" }}
            />
            {[
              { Icon: ClipboardCheck, label: "Confirmado", active: true },
              { Icon: ChefHat, label: "Preparando", sub: "~10 min", active: false },
              { Icon: Truck, label: "En camino", sub: "~20 min", active: false },
              { Icon: PackageCheck, label: "Entregado", active: false },
            ].map((s, i) => {
              const Icon = s.Icon;
              return (
                <div
                  key={i}
                  className="flex flex-col items-center gap-1.5 relative z-10"
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full"
                    style={
                      s.active
                        ? {
                            background:
                              "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                            color: "white",
                            boxShadow:
                              "0 4px 12px -2px color-mix(in oklch, var(--color-primary, #00A0A0) 45%, transparent)",
                          }
                        : {
                            background: "var(--color-card)",
                            color: "var(--color-muted)",
                            border:
                              "2px solid color-mix(in oklch, var(--color-primary, #00A0A0) 18%, transparent)",
                          }
                    }
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.25} />
                  </span>
                  <span
                    className="leading-tight"
                    style={{
                      color: s.active
                        ? "var(--color-primary-dark, #009690)"
                        : "var(--color-muted)",
                      fontWeight: s.active ? 800 : 600,
                    }}
                  >
                    {s.label}
                  </span>
                  {s.sub && (
                    <span className="text-[10px] text-muted font-medium">
                      {s.sub}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </m.div>

        {/* ─── CTAs ─── */}
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex flex-col sm:flex-row gap-2.5 w-full max-w-sm pt-2"
        >
          {orderId && (
            <a
              href={`/tracking?id=${orderId}`}
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-extrabold text-white transition-all active:scale-[0.98]"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                boxShadow:
                  "0 10px 24px -8px color-mix(in oklch, var(--color-primary, #00A0A0) 45%, transparent)",
              }}
            >
              <MapPin className="h-4 w-4" strokeWidth={2.5} /> Seguir mi pedido
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-extrabold transition-all active:scale-[0.98]"
            style={{
              background:
                "color-mix(in oklch, var(--color-primary, #00A0A0) 8%, var(--color-card))",
              border:
                "2px solid color-mix(in oklch, var(--color-primary, #00A0A0) 22%, transparent)",
              color: "var(--color-primary-dark, #009690)",
            }}
          >
            <ShoppingCart className="h-4 w-4" strokeWidth={2.5} /> Seguir comprando
          </button>
        </m.div>
      </div>
    </m.div>
  );
}
