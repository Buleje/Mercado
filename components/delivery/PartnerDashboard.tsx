"use client";

/**
 * PartnerDashboard — pantalla principal del repartidor tras login.
 *
 * Funciones:
 *   - Toggle online/offline (con permiso de geolocation)
 *   - Auto-ping cada 30s mientras online (heartbeat GPS)
 *   - Lista de offers pending — al click va a /delivery-app/oferta/[id]
 *   - Stats: rating, acceptance rate, totales
 *   - Logout
 *
 * Usa la cookie buleje-partner-sess. Si no hay sesión, redirige a /login.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bike, Wifi, WifiOff, Star, CheckCircle2, Clock, MapPin,
  Loader2, ArrowRight, LogOut, AlertTriangle, RefreshCw,
} from "@buleje/design-system/icons";

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
  const [toggling, setToggling] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // Cargar perfil
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
    } catch {
      // Silencioso — el polling seguirá.
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  // Polling de offers cada 10s mientras online.
  useEffect(() => {
    if (!me?.isOnline) return;
    loadOffers();
    const id = setInterval(loadOffers, OFFERS_POLL_MS);
    return () => clearInterval(id);
  }, [me?.isOnline, loadOffers]);

  // Auto-ping GPS cada 30s mientras online.
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
          }).catch(() => {});
        },
        () => setGeoError("No pudimos leer tu ubicación. Verificá permisos."),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      );
    };
    sendPing();
    const id = setInterval(sendPing, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [me?.isOnline]);

  const handleToggleOnline = async () => {
    if (toggling) return;
    setToggling(true);
    setGeoError(null);
    try {
      const goingOnline = !me?.isOnline;
      let coords: { lat: number; lng: number } | null = lastCoordsRef.current;
      if (goingOnline && !coords) {
        coords = await new Promise((resolve) => {
          if (!navigator.geolocation) { resolve(null); return; }
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10_000 },
          );
        });
      }
      if (goingOnline && !coords) {
        setGeoError("Necesitamos tu ubicación para activar el modo online.");
        return;
      }
      const body: Record<string, unknown> = { isOnline: goingOnline };
      if (coords) Object.assign(body, coords);
      const res = await fetch("/api/delivery/me/online", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("toggle failed");
      await loadMe();
    } catch {
      setError("No pudimos cambiar tu estado. Intenta de nuevo.");
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  if (!me) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)]">
        <p className="text-[var(--text-secondary)]">No pudimos cargar tu cuenta. {error}</p>
      </main>
    );
  }

  if (!me.isActive) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] px-4">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-16 w-16 mx-auto text-amber-500" strokeWidth={2.25} />
          <h1 className="mt-4 text-2xl font-extrabold text-[var(--text-primary)]">Cuenta pendiente</h1>
          <p className="mt-2 text-[var(--text-secondary)]">
            Tu inscripción está en revisión. Te avisaremos por WhatsApp cuando esté lista.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      <header className="sticky top-0 z-30 border-b border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bike className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.25} />
            <span className="font-extrabold text-[var(--text-primary)]">Hola, {me.name}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              fetch("/api/delivery/me/online", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
                body: JSON.stringify({ isOnline: false }),
              }).finally(() => router.push("/delivery-app/login"));
            }}
            className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center gap-1"
          >
            <LogOut className="h-4 w-4" /> Salir
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Toggle online — botón grande, color cambia con estado */}
        <button
          type="button"
          onClick={handleToggleOnline}
          disabled={toggling}
          className={`w-full h-20 rounded-2xl text-lg font-extrabold text-white shadow-lg transition-all ${
            me.isOnline ? "bg-[var(--data-success)]" : "bg-[var(--text-tertiary)]"
          } disabled:opacity-50 hover:scale-[1.01]`}
        >
          {toggling ? (
            <Loader2 className="h-6 w-6 animate-spin mx-auto" strokeWidth={2.5} />
          ) : me.isOnline ? (
            <span className="inline-flex items-center gap-2">
              <Wifi className="h-6 w-6" strokeWidth={2.5} />
              Estás en línea — recibiendo pedidos
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <WifiOff className="h-6 w-6" strokeWidth={2.5} />
              Tocá para empezar a recibir pedidos
            </span>
          )}
        </button>

        {geoError && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <AlertTriangle className="inline h-4 w-4 mr-1.5 mb-0.5" />
            {geoError}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Rating" value={me.rating.toFixed(1)} icon={<Star className="h-4 w-4 text-amber-500" />} />
          <Stat label="Aceptación" value={`${Math.round(me.acceptanceRate * 100)}%`} icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} />
          <Stat label="Pedidos" value={String(me.totalAccepted)} icon={<Bike className="h-4 w-4 text-[var(--accent)]" />} />
        </div>

        {/* Pedido activo */}
        {me.currentOrderId && (
          <div className="rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent)]/5 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">Pedido en curso</p>
            <p className="mt-1 font-extrabold text-[var(--text-primary)]">#{me.currentOrderId.slice(-8)}</p>
            <Link
              href={`/delivery-app/pedido/${me.currentOrderId}`}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
            >
              Ver detalles
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {/* Lista offers pending */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              {offers.length === 0 ? "Esperando pedidos cerca tuyo" : `${offers.length} pedido${offers.length !== 1 ? "s" : ""} para vos`}
            </h2>
            <button
              type="button"
              onClick={loadOffers}
              className="text-xs text-[var(--text-tertiary)] inline-flex items-center gap-1 hover:text-[var(--text-primary)]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </button>
          </div>

          {!me.isOnline && (
            <div className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-6 text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                Activá el modo en línea arriba para empezar a recibir ofertas.
              </p>
            </div>
          )}

          {me.isOnline && offers.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-6 text-center">
              <Clock className="h-6 w-6 mx-auto text-[var(--text-tertiary)] mb-2" />
              <p className="text-sm text-[var(--text-secondary)]">
                Estás disponible. Te avisaremos cuando llegue un pedido cerca tuyo.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {offers.map((o) => {
              const expSec = Math.max(0, Math.floor((new Date(o.expiresAt).getTime() - Date.now()) / 1000));
              return (
                <Link
                  key={o.id}
                  href={`/delivery-app/oferta/${o.id}`}
                  className="block rounded-2xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] p-4 hover:scale-[1.01] transition-transform"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-extrabold text-[var(--text-primary)]">S/ {o.feeOffered.toFixed(0)}</p>
                    <span className={`text-sm font-bold tabular-nums ${expSec <= 30 ? "text-red-600" : "text-[var(--accent)]"}`}>
                      <Clock className="inline h-4 w-4 mr-1 mb-0.5" />
                      {Math.floor(expSec / 60)}:{String(expSec % 60).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                    <MapPin className="h-3.5 w-3.5" />
                    {o.distanceKm.toFixed(1)} km · {o.order.customerLocation ?? "—"}
                  </div>
                  <p className="mt-1 text-xs font-bold text-[var(--accent)]">Tocá para ver y aceptar →</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-center">
      <div className="flex items-center justify-center gap-1 mb-1">{icon}</div>
      <div className="text-lg font-extrabold text-[var(--text-primary)]">{value}</div>
      <div className="text-xs font-semibold text-[var(--text-tertiary)]">{label}</div>
    </div>
  );
}
