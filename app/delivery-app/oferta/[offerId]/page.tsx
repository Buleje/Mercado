"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CheckCircle2, XCircle, MapPin, Phone, Clock, Loader2,
  ArrowRight, AlertTriangle,
} from "@buleje/design-system/icons";

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

  // Cargar oferta del partner
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
      .catch(() => {
        if (!cancelled) setError("No pudimos cargar la oferta. Intenta de nuevo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [offerId]);

  // Countdown
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
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf(),
        },
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
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf(),
        },
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
      <main className="min-h-screen flex items-center justify-center bg-[var(--data-success)]/5 px-4">
        <div className="text-center">
          <CheckCircle2 className="h-20 w-20 mx-auto text-[var(--data-success)]" strokeWidth={2.25} />
          <h1 className="mt-4 text-3xl font-extrabold text-[var(--text-primary)]">¡Pedido aceptado!</h1>
          <p className="mt-2 text-[var(--text-secondary)]">Llevándote al panel…</p>
        </div>
      </main>
    );
  }

  if (outcome === "expired" || outcome === "lost" || outcome === "rejected") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] px-4">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-20 w-20 mx-auto text-amber-500" strokeWidth={2.25} />
          <h1 className="mt-4 text-2xl font-extrabold text-[var(--text-primary)]">
            {outcome === "expired" && "La oferta venció"}
            {outcome === "lost" && "Otro repartidor lo tomó"}
            {outcome === "rejected" && "Pedido rechazado"}
          </h1>
          <p className="mt-2 text-[var(--text-secondary)]">
            {error ?? "Te avisaremos cuando llegue el próximo pedido cerca tuyo."}
          </p>
          <button
            onClick={() => router.push("/delivery-app")}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 font-bold text-white"
          >
            Volver al panel
            <ArrowRight className="h-4 w-4" />
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
    <main className="min-h-screen bg-[var(--surface-canvas)] flex flex-col">
      {/* Countdown sticky top — color cambia con urgencia */}
      <div
        className={`sticky top-0 z-50 px-4 py-3 text-center text-white font-extrabold text-2xl tabular-nums shadow-md ${
          urgent ? "bg-red-600" : "bg-[var(--accent)]"
        }`}
      >
        <Clock className="inline h-5 w-5 mr-2 mb-0.5" strokeWidth={2.5} />
        {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        <span className="text-sm font-bold ml-2 opacity-80">para aceptar</span>
      </div>

      <section className="flex-1 px-4 pt-6 pb-32 max-w-2xl mx-auto w-full">
        <div className="text-center mb-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
            Oferta nueva · Intento #{offer.attempt}
          </span>
          <h1 className="mt-3 text-3xl font-extrabold text-[var(--text-primary)]">
            S/ {offer.feeOffered.toFixed(0)} <span className="text-base font-semibold text-[var(--text-tertiary)]">de envío</span>
          </h1>
          <p className="mt-1 text-[var(--text-secondary)]">
            <MapPin className="inline h-4 w-4 mb-1 mr-1" />
            {offer.distanceKm.toFixed(1)} km de distancia
          </p>
        </div>

        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Cliente</p>
            <p className="mt-1 text-base font-bold text-[var(--text-primary)]">{offer.order.customerName}</p>
            {offer.order.customerPhone && (
              <p className="text-sm text-[var(--text-secondary)] flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {offer.order.customerPhone}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Dirección</p>
            <p className="mt-1 text-base text-[var(--text-primary)]">{offer.order.customerLocation ?? "—"}</p>
            {offer.order.customerReference && (
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                Referencia: {offer.order.customerReference}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Pedido</p>
            <p className="mt-1 text-base font-bold text-[var(--text-primary)]">S/ {offer.order.total.toFixed(2)}</p>
            {offer.order.notes && (
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">{offer.order.notes}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </section>

      {/* Botones sticky bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--surface-canvas)] border-t border-[var(--rule-base)] p-4 flex gap-3 max-w-2xl mx-auto w-full">
        <button
          type="button"
          onClick={handleReject}
          disabled={submitting}
          className="inline-flex h-14 flex-[1] items-center justify-center gap-2 rounded-xl border-2 border-[var(--rule-strong)] bg-[var(--surface-raised)] text-base font-bold text-[var(--text-primary)] disabled:opacity-50"
        >
          <XCircle className="h-5 w-5" />
          Rechazar
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={submitting || secondsLeft === 0}
          className="inline-flex h-14 flex-[2] items-center justify-center gap-2 rounded-xl bg-[var(--data-success)] text-base font-extrabold text-white shadow-lg disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5" />
              Aceptar pedido
            </>
          )}
        </button>
      </div>
    </main>
  );
}
