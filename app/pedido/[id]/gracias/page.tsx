"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Check, Package, Clock, Gift,
  ArrowRight, Smartphone, ShoppingBag, MessageCircle,
} from "@buleje/design-system/icons";

/**
 * /pedido/[id]/gracias — Order confirmation "thank you" page.
 *
 * Rediseño 2026-07-06 (Brandon): de plantilla genérica (emerald/slate hardcoded)
 * a confirmación editorial on-brand — teal del DS, tokens, tipografía suave,
 * mismo lenguaje visual que el checkout. Incluye: hero de éxito con check
 * animado + confeti de marca, tarjeta de resumen, seguir pedido, compartir por
 * WhatsApp, instalar PWA, referidos y seguir comprando.
 */

type OrderSummary = {
  id: string;
  total: number;
  itemCount: number;
  status: string;
  estimatedDelivery: string;
};

// Confeti anclado a la marca (teal + coral) — nada de arcoíris genérico.
const CONFETTI_COLORS = ["var(--accent)", "#ff6b5b", "#14C2C2"];

function generatePieces() {
  return Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    width: 6 + Math.random() * 6,
    height: 8 + Math.random() * 8,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    duration: 1.6 + Math.random(),
    delay: Math.random() * 0.5,
    rotation: Math.random() * 360,
  }));
}

function ConfettiEffect() {
  // Generado SOLO en cliente (post-mount): Math.random en el render inicial
  // rompería la hidratación (SSR ≠ cliente). En SSR = sin piezas.
  const [pieces, setPieces] = useState<ReturnType<typeof generatePieces>>([]);
  useEffect(() => {
    setPieces(generatePieces());
  }, []);
  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none z-50 overflow-hidden motion-reduce:hidden"
    >
      <style>{`
        @keyframes bjConfettiFall {
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
            animation: `bjConfettiFall ${p.duration}s ease-in ${p.delay}s forwards`,
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

    // Datos del pedido SIN pegarle al endpoint privado (daba 401 a invitados).
    // 1) Snapshot local del pedido recién hecho (sin red) — caso común al venir
    //    desde el checkout: trae total + items + teléfono.
    // 2) Fallback (refresh / link): endpoint PÚBLICO probando propiedad con el
    //    teléfono. Nunca el privado → cero 401.
    let matchedSnapshot = false;
    let phone: string | null = null;
    try {
      const raw = localStorage.getItem("marketplace-last-order");
      if (raw) {
        const snap = JSON.parse(raw) as {
          orderIds?: Array<string | number>;
          total?: number;
          items?: unknown[];
          customer?: { phone?: string };
        };
        phone = snap.customer?.phone ?? null;
        if (snap.orderIds?.map(String).includes(String(id))) {
          matchedSnapshot = true;
          setOrder({
            id,
            total: snap.total ?? 0,
            itemCount: snap.items?.length ?? 0,
            status: "pendiente",
            estimatedDelivery: "30-60 minutos",
          });
        }
      }
    } catch { /* ignore parse/storage */ }

    if (!phone) {
      try {
        const raw = localStorage.getItem("buleje-last-order");
        if (raw) phone = (JSON.parse(raw) as { customerPhone?: string }).customerPhone ?? null;
      } catch { /* ignore */ }
    }

    if (!matchedSnapshot && phone) {
      const ph = phone;
      (async () => {
        try {
          const res = await fetch(
            `/api/orders/${id}/public?phone=${encodeURIComponent(ph)}`,
            { cache: "no-store" },
          );
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
    }

    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, [id]);

  const orderId = order?.id ?? id ?? "";
  const shortId = orderId.slice(-8).toUpperCase();
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

  const handleShare = () => {
    const text = `¡Acabo de hacer un pedido en Buleje! Probá vos también: https://www.buleje.pe`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="relative min-h-screen bg-[var(--surface-canvas)]">
      {/* Banda de color superior (sutil, teal) que enmarca el momento de éxito */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-linear-to-b from-[var(--accent-soft)] to-transparent"
      />
      {showConfetti && <ConfettiEffect />}

      <div className="relative mx-auto max-w-[30rem] px-4 py-10 sm:py-14">
        {/* ── Hero de éxito ─────────────────────────────────────────── */}
        <div className="text-center mb-7 sm:mb-8">
          <span className="relative mx-auto mb-5 inline-flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_14px_34px_-10px_var(--accent-glow)]">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-[var(--accent)]/25 animate-ping motion-reduce:hidden"
            />
            <Check
              className="relative h-10 w-10 animate-[bjCheckIn_0.5s_cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none"
              strokeWidth={2.75}
              aria-hidden
            />
            <style>{`
              @keyframes bjCheckIn {
                0% { transform: scale(0) rotate(-20deg); opacity: 0; }
                60% { transform: scale(1.15) rotate(0deg); opacity: 1; }
                100% { transform: scale(1) rotate(0deg); }
              }
            `}</style>
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">
            ¡Pedido confirmado!
          </h1>
          <p className="mt-2 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)] leading-snug">
            Tu pedido{" "}
            <span className="font-mono font-semibold text-[var(--accent-dark)] dark:text-[var(--accent)]">
              #{shortId}
            </span>{" "}
            fue recibido. Ya lo estamos preparando.
          </p>
        </div>

        {/* ── Resumen del pedido ────────────────────────────────────── */}
        <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6 mb-4">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[length:var(--ts-sm)] text-[var(--text-secondary)]">
              <Package className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={2} aria-hidden />
              {order ? `${order.itemCount} producto${order.itemCount === 1 ? "" : "s"}` : "Cargando…"}
            </span>
            <span className="text-2xl font-bold tabular-nums tracking-[-0.02em] text-[var(--text-primary)]">
              {fmt(order?.total ?? 0)}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-[var(--accent-soft)] px-4 py-3">
            <Clock className="h-4 w-4 shrink-0 text-[var(--accent-dark)] dark:text-[var(--accent)]" strokeWidth={2} aria-hidden />
            <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)]">
              Tiempo estimado:{" "}
              <strong className="font-semibold text-[var(--text-primary)]">
                {order?.estimatedDelivery ?? "30-60 min"}
              </strong>
            </p>
          </div>
        </div>

        {/* ── Acciones principales ──────────────────────────────────── */}
        <div className="space-y-2.5 mb-8">
          <Link
            href={`/pedido/${id}`}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 h-13 text-base font-bold text-white transition-opacity hover:opacity-90"
          >
            <Package className="h-5 w-5" strokeWidth={2} aria-hidden />
            Seguir mi pedido
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} aria-hidden />
          </Link>

          <button
            type="button"
            onClick={handleShare}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 h-13 text-base font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <MessageCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
            Compartir por WhatsApp
          </button>
        </div>

        {/* ── Extras: instalar app + referidos ──────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 sm:p-5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent-dark)] dark:text-[var(--accent)]">
              <Smartphone className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-[length:var(--ts-sm)] sm:text-base font-semibold text-[var(--text-primary)] leading-tight">
                Instalá Buleje en tu celular
              </h2>
              <p className="mt-1 text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-snug">
                Agregala a tu pantalla de inicio y pedí más rápido la próxima vez —
                desde el menú del navegador, &quot;Agregar a inicio&quot;.
              </p>
            </div>
          </div>

          <Link
            href="/marketplace/mi-cuenta"
            className="group flex items-start gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-soft)] p-4 sm:p-5 transition-colors hover:border-[var(--accent)]"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
              <Gift className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="inline-flex items-center gap-1 text-[length:var(--ts-sm)] sm:text-base font-semibold text-[var(--text-primary)] leading-tight">
                Invitá a un amigo y ganá puntos
                <ArrowRight className="h-4 w-4 text-[var(--accent-dark)] transition-transform group-hover:translate-x-0.5 dark:text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
              </h2>
              <p className="mt-1 text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-snug">
                Compartí tu código de referido y ambos ganan puntos de lealtad.
              </p>
            </div>
          </Link>
        </div>

        {/* ── Seguir comprando ──────────────────────────────────────── */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[length:var(--ts-sm)] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
          >
            <ShoppingBag className="h-4 w-4" strokeWidth={2} aria-hidden />
            Seguir comprando
          </Link>
        </div>
      </div>
    </div>
  );
}
