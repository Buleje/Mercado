"use client";

/**
 * PartnerDashboard — pantalla principal del repartidor tras login.
 * Online toggle vive en el shell. Esta vista muestra ofertas + pedido activo + stats.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowRight, RefreshCw, AlertTriangle } from "@buleje/design-system/icons";
import {
  MotoIcon,
  PackageIcon,
  PinIcon,
  TimerIcon,
  StarBadge,
  CheckBadge,
  CashIcon,
  EmptyRoadIllustration,
  LiveSignal,
} from "./icons";
import EarningsTodayHero from "./EarningsTodayHero";
import ChatAndSOSPanel from "./ChatAndSOSPanel";
import StreaksAndBonusCard from "./StreaksAndBonusCard";
import HotZonesPanel from "./HotZonesPanel";
import RiderScoreCard from "./RiderScoreCard";

interface MeResp {
  partner: {
    id: string;
    name: string;
    phone: string;
    isActive: boolean;
    isOnline: boolean;
    rating: number;
    acceptanceRate: number;
    totalOffers: number;
    totalAccepted: number;
    currentOrderId: string | null;
    lat: number | null;
    lng: number | null;
  };
}

interface Offer {
  id: string;
  orderId: string;
  status: string;
  expiresAt: string;
  distanceKm: number;
  feeOffered: number;
  attempt: number;
  order: {
    id: string;
    customerName: string;
    customerLocation: string | null;
    total: number;
  };
}

const PING_INTERVAL_MS = 30_000;
const OFFERS_POLL_MS = 10_000;

function csrf(): string {
  return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
}

export default function PartnerDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<MeResp["partner"] | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  // Captura el momento en que se conectó hoy — para "horas online hoy"
  // en el EarningsTodayHero. Se mantiene durante la sesión del cliente.
  const [onlineSinceMs, setOnlineSinceMs] = useState<number | null>(null);
  useEffect(() => {
    if (me?.isOnline && onlineSinceMs === null) {
      setOnlineSinceMs(Date.now());
    } else if (!me?.isOnline && onlineSinceMs !== null) {
      setOnlineSinceMs(null);
    }
  }, [me?.isOnline, onlineSinceMs]);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/delivery/me/me", { credentials: "include" });
      if (res.status === 401) {
        router.push("/delivery-app/login");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MeResp = await res.json();
      setMe(data.partner);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadOffers = useCallback(async () => {
    try {
      const res = await fetch("/api/delivery/me/offers", { credentials: "include" });
      if (!res.ok) return;
      const data: { offers: Offer[] } = await res.json();
      setOffers(data.offers);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  useEffect(() => {
    if (!me?.isOnline) return;
    loadOffers();
    const id = setInterval(loadOffers, OFFERS_POLL_MS);
    return () => clearInterval(id);
  }, [me?.isOnline, loadOffers]);

  useEffect(() => {
    if (!me?.isOnline) return;
    const sendPing = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          lastCoordsRef.current = { lat: latitude, lng: longitude };
          fetch("/api/delivery/me/ping", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
            body: JSON.stringify({ lat: latitude, lng: longitude }),
          }).catch(() => { /* ping fire-and-forget: si la red falla, el siguiente tick reintenta */ });
        },
        () => setGeoError("No pudimos leer tu ubicación. Verifica los permisos."),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      );
    };
    sendPing();
    const id = setInterval(sendPing, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [me?.isOnline]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  if (!me) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-[var(--text-secondary)] text-base">No pudimos cargar tu cuenta. {error}</p>
      </main>
    );
  }

  if (!me.isActive) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)]">
            <AlertTriangle className="h-10 w-10" strokeWidth={2.25} />
          </div>
          <h1 className="mt-5 text-3xl font-extrabold text-[var(--text-primary)]">Cuenta pendiente</h1>
          <p className="mt-2 text-base text-[var(--text-secondary)]">
            Tu inscripción está en revisión. Te avisamos por WhatsApp cuando esté lista.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-6 lg:py-10 space-y-8">
      {/* ── Hero status (solo desktop) ───────────────────────── */}
      <header className="hidden lg:flex items-center justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Panel del repartidor
          </p>
          <h1 className="mt-1 text-3xl font-extrabold text-[var(--text-primary)]">
            {me.isOnline ? "Estás disponible" : "Conéctate para empezar a ganar"}
          </h1>
          <p className="mt-1 text-base text-[var(--text-secondary)] flex items-center gap-2">
            <LiveSignal className="h-2.5 w-2.5" active={me.isOnline} />
            {me.isOnline
              ? "Recibes ofertas en tiempo real cuando hay pedidos cerca de ti."
              : "Activa el modo en línea desde la barra lateral."}
          </p>
        </div>
      </header>

      {geoError && (
        <div role="alert" className="rounded-2xl bg-[var(--brand-secondary)]/10 border-2 border-[var(--brand-secondary)]/30 px-4 py-3 text-base font-bold text-[var(--brand-secondary)] flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {geoError}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECCIÓN 1 — HOY · datos del momento
          ══════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        {/* Hero ganancias — full-width, lo más visible */}
        <EarningsTodayHero
          isOnline={me.isOnline}
          onlineSinceMs={onlineSinceMs}
          goal={80}
        />

        {/* Chat + SOS — solo si hay pedido activo (acción inmediata) */}
        {me.currentOrderId && <ChatAndSOSPanel currentOrderId={me.currentOrderId} />}
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECCIÓN 2 — OPORTUNIDADES · dónde ganar más
          ══════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <SectionHeader
          eyebrow="Oportunidades"
          title="Maximizá tus ganancias"
          desc="Bonus activos y zonas con más demanda"
        />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">
          <div className="lg:col-span-7">
            <StreaksAndBonusCard isOnline={me.isOnline} />
          </div>
          <div className="lg:col-span-5">
            <HotZonesPanel
              isOnline={me.isOnline}
              currentLat={me.lat}
              currentLng={me.lng}
            />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECCIÓN 3 — PROGRESO · tu carrera como repartidor
          ══════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <SectionHeader
          eyebrow="Tu progreso"
          title="Score y logros"
          desc="Subí de nivel completando viajes a tiempo"
        />
        <RiderScoreCard
          rating={me.rating}
          totalAccepted={me.totalAccepted}
          acceptanceRate={me.acceptanceRate}
        />
      </section>

      {/* ── Pedido activo (callout) ─────────────────────────── */}
      {me.currentOrderId && (
        <Link
          href={`/delivery-app/pedido/${me.currentOrderId}`}
          className="block group rounded-3xl border-2 border-[var(--accent)] bg-gradient-to-br from-[var(--accent-soft)] to-transparent p-5 lg:p-6 transition-transform hover:translate-y-[-2px]"
        >
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-[var(--accent)] text-white flex items-center justify-center shrink-0">
              <PackageIcon className="h-7 w-7" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold uppercase tracking-wider text-[var(--accent)]">
                Pedido en curso
              </p>
              <p className="mt-1 text-xl font-extrabold text-[var(--text-primary)]">
                #{me.currentOrderId.slice(-8)}
              </p>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                Tocá para continuar la entrega
              </p>
            </div>
            <ArrowRight className="h-6 w-6 text-[var(--accent)] mt-2 group-hover:translate-x-1 transition-transform" strokeWidth={2.5} />
          </div>
        </Link>
      )}

      {/* ── Ofertas ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg lg:text-xl font-extrabold text-[var(--text-primary)]">
            {offers.length === 0
              ? "Esperando pedidos cerca de ti"
              : `${offers.length} pedido${offers.length !== 1 ? "s" : ""} disponible${offers.length !== 1 ? "s" : ""}`}
          </h2>
          <button
            type="button"
            onClick={loadOffers}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </div>

        {!me.isOnline && (
          <EmptyState
            illustrationTone="muted"
            title="Estás desconectado"
            text="Activa el modo en línea para empezar a recibir ofertas."
          />
        )}

        {me.isOnline && offers.length === 0 && (
          <EmptyState
            illustrationTone="accent"
            title="Sin pedidos por ahora"
            text="Te avisamos cuando llegue uno cerca de tu zona."
          />
        )}

        {offers.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-3 lg:gap-4">
            {offers.map((o) => (
              <OfferCard key={o.id} offer={o} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function OfferCard({ offer }: { offer: Offer }) {
  const [secs, setSecs] = useState(() =>
    Math.max(0, Math.floor((new Date(offer.expiresAt).getTime() - Date.now()) / 1000)),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setSecs(Math.max(0, Math.floor((new Date(offer.expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [offer.expiresAt]);

  const urgent = secs <= 30;
  const mins = Math.floor(secs / 60);
  const ss = secs % 60;

  return (
    <Link
      href={`/delivery-app/oferta/${offer.id}`}
      className={`group block rounded-3xl border-2 bg-[var(--surface-raised)] p-5 transition-all hover:translate-y-[-2px] hover:shadow-lg ${
        urgent ? "border-[var(--brand-danger)]" : "border-[var(--accent)]"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
            Pago al repartidor
          </p>
          <p className="mt-1 text-3xl lg:text-4xl font-extrabold text-[var(--text-primary)] tabular-nums">
            S/ {Number(offer.feeOffered).toFixed(2)}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-sm font-extrabold tabular-nums ${
            urgent
              ? "bg-[var(--brand-danger)] text-white"
              : "bg-[var(--accent-soft)] text-[var(--accent)]"
          }`}
        >
          <TimerIcon className="h-4 w-4" />
          {String(mins).padStart(2, "0")}:{String(ss).padStart(2, "0")}
        </span>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="flex items-start gap-2 text-sm">
          <PinIcon className="h-4 w-4 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
          <span className="text-[var(--text-primary)] font-semibold line-clamp-2">
            {offer.order.customerLocation ?? "Sin dirección"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <MotoIcon className="h-4 w-4 shrink-0" />
          <span className="font-semibold">{Number(offer.distanceKm).toFixed(1)} km</span>
          <span className="text-[var(--text-tertiary)]">·</span>
          <span className="font-semibold">{offer.order.customerName}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[var(--rule-base)]">
        <span className="text-sm font-bold text-[var(--text-secondary)]">
          Total cliente: S/ {Number(offer.order.total).toFixed(2)}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-extrabold text-[var(--accent)] group-hover:translate-x-1 transition-transform">
          Aceptar
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}

function Stat({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone: "accent" | "success" | "amber";
}) {
  const toneRing: Record<typeof tone, string> = {
    accent: "bg-[var(--accent-soft)]",
    success: "bg-[var(--data-success-500)]/10",
    amber: "bg-[var(--brand-secondary)]/10",
  } as const;
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 lg:p-5 text-center">
      <div className={`mx-auto h-10 w-10 rounded-xl flex items-center justify-center mb-2 ${toneRing[tone]}`}>
        {icon}
      </div>
      <div className="text-2xl lg:text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-xs lg:text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

function EmptyState({
  illustrationTone,
  title,
  text,
}: {
  illustrationTone: "muted" | "accent";
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 lg:p-12 text-center">
      <div
        className={`mx-auto ${
          illustrationTone === "accent"
            ? "text-[var(--accent)]"
            : "text-[var(--text-tertiary)]"
        }`}
      >
        <EmptyRoadIllustration className="h-32 w-32 lg:h-40 lg:w-40 mx-auto" />
      </div>
      <h3 className="mt-4 text-lg lg:text-xl font-extrabold text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="mt-2 text-base text-[var(--text-secondary)] max-w-sm mx-auto">
        {text}
      </p>
    </div>
  );
}

// ─── SectionHeader — eyebrow + title + descripción ────────────────────────
function SectionHeader({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3 pb-1">
      <div>
        <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-[0.14em] text-[var(--accent)]">
          <span aria-hidden className="inline-flex h-[2px] w-6 rounded-full bg-[var(--accent)]" />
          {eyebrow}
        </p>
        <h2 className="mt-1.5 text-xl lg:text-2xl font-black tracking-tight text-[var(--text-primary)]">
          {title}
        </h2>
        {desc && (
          <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
            {desc}
          </p>
        )}
      </div>
    </div>
  );
}
