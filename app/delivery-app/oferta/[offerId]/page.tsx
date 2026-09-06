"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowRight, X, Check, AlertTriangle } from "@buleje/design-system/icons";
import {
  TimerIcon,
  PinIcon,
  CashIcon,
  PhoneRing,
  CheckBadge,
  HeroDeliveryIllustration,
} from "@/components/delivery/icons";

interface OfferData {
  id: string;
  orderId: string;
  status: string;
  offeredAt: string;
  expiresAt: string;
  distanceKm: number;
  feeOffered: number;
  attempt: number;
  order: {
    id: string;
    customerName: string;
    customerPhone: string | null;
    customerLocation: string | null;
    customerReference: string | null;
    total: number;
    notes: string | null;
  };
}

export default function OfferPage() {
  const router = useRouter();
  const params = useParams<{ offerId: string }>();
  const offerId = params?.offerId;

  const [offer, setOffer] = useState<OfferData | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<"none" | "accepted" | "rejected" | "expired" | "lost">("none");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!offerId) return;
    let cancelled = false;
    fetch("/api/delivery/me/offers", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { offers: OfferData[] }) => {
        if (cancelled) return;
        const target = data.offers.find((o) => o.id === offerId);
        if (!target) {
          setOutcome("lost");
          setError("Esta oferta ya no está disponible.");
          return;
        }
        setOffer(target);
      })
      .catch(() => { if (!cancelled) setError("No pudimos cargar la oferta. Intenta de nuevo."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [offerId]);

  useEffect(() => {
    if (!offer || outcome !== "none") return;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(offer.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining === 0) setOutcome("expired");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offer, outcome]);

  const csrf = useCallback(() => {
    return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
  }, []);

  const handleAccept = async () => {
    if (!offerId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/delivery/offers/${offerId}/accept`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 || res.status === 410) {
          setOutcome("lost");
          setError(data.error ?? "Otro repartidor tomó este pedido.");
        } else {
          setError(data.error ?? "No pudimos aceptar la oferta.");
        }
        return;
      }
      setOutcome("accepted");
      setTimeout(() => router.push("/delivery-app"), 1500);
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!offerId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await fetch(`/api/delivery/offers/${offerId}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
      });
      setOutcome("rejected");
      setTimeout(() => router.push("/delivery-app"), 800);
    } catch {
      setError("Error al rechazar.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  if (outcome === "accepted") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] px-4">
        <div className="text-center">
          <div className="inline-flex h-24 w-24 items-center justify-center rounded-full bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]">
            <CheckBadge className="h-14 w-14" />
          </div>
          <h1 className="mt-5 text-3xl lg:text-4xl font-extrabold text-[var(--text-primary)]">
            ¡Pedido aceptado!
          </h1>
          <p className="mt-2 text-base text-[var(--text-secondary)]">Llevándote al panel…</p>
        </div>
      </main>
    );
  }

  if (outcome === "expired" || outcome === "lost" || outcome === "rejected") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] px-4">
        <div className="text-center max-w-md">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)]">
            <AlertTriangle className="h-10 w-10" strokeWidth={2.25} />
          </div>
          <h1 className="mt-5 text-2xl lg:text-3xl font-extrabold text-[var(--text-primary)]">
            {outcome === "expired" && "La oferta venció"}
            {outcome === "lost" && "Otro repartidor lo tomó"}
            {outcome === "rejected" && "Pedido rechazado"}
          </h1>
          <p className="mt-2 text-base text-[var(--text-secondary)]">
            {error ?? "Te avisaremos cuando llegue el próximo pedido cerca tuyo."}
          </p>
          <button
            type="button"
            onClick={() => router.push("/delivery-app")}
            className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[var(--accent)] font-extrabold text-white shadow-lg shadow-[var(--accent)]/25"
          >
            Volver al panel
            <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>
      </main>
    );
  }

  if (!offer) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const urgent = secondsLeft <= 30;

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      {/* Countdown sticky */}
      <div
        className={`sticky top-0 z-50 px-4 py-3 text-center text-white font-extrabold tabular-nums shadow-md transition-colors ${
          urgent ? "bg-[var(--brand-danger)]" : "bg-[var(--accent)]"
        }`}
        role="timer"
        aria-live="polite"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-center gap-3">
          <TimerIcon className="h-6 w-6" />
          <span className="text-2xl lg:text-3xl">
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </span>
          <span className="text-sm lg:text-base font-bold opacity-90">para aceptar</span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-6 lg:py-10 pb-40 lg:pb-10 grid lg:grid-cols-[1.1fr_1fr] gap-6 lg:gap-10">
        {/* ── Info principal ─────────────────────────────── */}
        <section className="space-y-5">
          <header>
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] px-3 h-8 text-xs font-extrabold uppercase tracking-wider">
              Oferta nueva · Intento #{offer.attempt}
            </span>
            <h1 className="mt-3 text-4xl lg:text-5xl font-extrabold text-[var(--text-primary)] tabular-nums">
              S/ {Number(offer.feeOffered).toFixed(2)}
              <span className="ml-3 text-base lg:text-lg font-bold text-[var(--text-tertiary)] align-middle">
                tu pago
              </span>
            </h1>
            <p className="mt-2 text-base lg:text-lg text-[var(--text-secondary)] flex items-center gap-2">
              <PinIcon className="h-5 w-5 text-[var(--accent)]" />
              <span className="font-bold text-[var(--text-primary)]">
                {Number(offer.distanceKm).toFixed(1)} km
              </span>
              <span className="text-[var(--text-tertiary)]">de distancia</span>
            </p>
          </header>

          <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] divide-y divide-[var(--rule-base)]">
            <Block
              icon={<PinIcon className="h-6 w-6" />}
              title="Cliente"
              big={offer.order.customerName}
              extras={[
                offer.order.customerPhone
                  ? { icon: <PhoneRing className="h-4 w-4" />, text: offer.order.customerPhone }
                  : null,
              ]}
            />
            <Block
              icon={<PinIcon className="h-6 w-6" />}
              title="Dirección de entrega"
              big={offer.order.customerLocation ?? "Sin dirección"}
              extras={[
                offer.order.customerReference
                  ? { icon: null, text: `Referencia: ${offer.order.customerReference}` }
                  : null,
              ]}
            />
            <Block
              icon={<CashIcon className="h-6 w-6" />}
              title="Total del pedido"
              big={`S/ ${Number(offer.order.total).toFixed(2)}`}
              extras={[
                offer.order.notes ? { icon: null, text: offer.order.notes } : null,
              ]}
            />
          </div>

          {error && (
            <div role="alert" className="rounded-2xl bg-[var(--brand-danger)]/10 border-2 border-[var(--brand-danger)]/30 px-4 py-3 text-base font-bold text-[var(--brand-danger)]">
              {error}
            </div>
          )}
        </section>

        {/* ── Lateral: ilustración + acciones (desktop) ──── */}
        <aside className="hidden lg:flex lg:flex-col gap-5">
          <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-gradient-to-br from-[var(--accent-soft)] to-transparent p-8 text-center text-[var(--accent)]">
            <HeroDeliveryIllustration className="h-48 w-auto mx-auto" />
            <p className="mt-4 text-base font-bold text-[var(--text-primary)]">
              {Number(offer.distanceKm).toFixed(1)} km hasta {offer.order.customerName}
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Tu base + propina llegan al instante a tu cuenta.
            </p>
          </div>

          <div className="space-y-3">
            <ActionButtons
              onAccept={handleAccept}
              onReject={handleReject}
              submitting={submitting}
              expired={secondsLeft === 0}
              fee={offer.feeOffered}
            />
          </div>
        </aside>
      </div>

      {/* Botones sticky bottom (mobile) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--surface-canvas)] border-t border-[var(--rule-base)] p-4">
        <div className="max-w-3xl mx-auto">
          <ActionButtons
            onAccept={handleAccept}
            onReject={handleReject}
            submitting={submitting}
            expired={secondsLeft === 0}
            fee={offer.feeOffered}
          />
        </div>
      </div>
    </main>
  );
}

function ActionButtons({
  onAccept,
  onReject,
  submitting,
  expired,
  fee,
}: {
  onAccept: () => void;
  onReject: () => void;
  submitting: boolean;
  expired: boolean;
  fee: number;
}) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onReject}
        disabled={submitting}
        className="inline-flex h-14 flex-[1] items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-extrabold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
      >
        <X className="h-5 w-5" strokeWidth={2.5} />
        Rechazar
      </button>
      <button
        type="button"
        onClick={onAccept}
        disabled={submitting || expired}
        className="inline-flex h-14 flex-[2] items-center justify-center gap-2 rounded-2xl bg-[var(--data-success-500)] text-base lg:text-lg font-extrabold text-white shadow-lg shadow-[var(--data-success)]/30 disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <Check className="h-5 w-5" strokeWidth={2.5} />
            Aceptar · S/ {fee.toFixed(2)}
          </>
        )}
      </button>
    </div>
  );
}

function Block({
  icon,
  title,
  big,
  extras,
}: {
  icon: React.ReactNode;
  title: string;
  big: string;
  extras: ({ icon: React.ReactNode | null; text: string } | null)[];
}) {
  return (
    <div className="p-5 lg:p-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[var(--accent)]">{icon}</span>
        <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          {title}
        </p>
      </div>
      <p className="text-lg lg:text-xl font-extrabold text-[var(--text-primary)]">{big}</p>
      {extras
        .filter((e): e is { icon: React.ReactNode | null; text: string } => Boolean(e))
        .map((e, i) => (
          <div key={i} className="mt-1 text-sm font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
            {e.icon && <span className="text-[var(--text-tertiary)]">{e.icon}</span>}
            {e.text}
          </div>
        ))}
    </div>
  );
}
