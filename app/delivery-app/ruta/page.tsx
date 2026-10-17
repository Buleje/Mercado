"use client";

/**
 * /delivery-app/ruta — pantalla de "pedidos apilados" del repartidor.
 *
 * Pide la ubicación GPS (best-effort), trae la ruta óptima desde
 * GET /api/delivery/me/route y la pinta con StackedRouteView. Si el repartidor
 * niega el GPS, igual funciona: el backend usa la bodega como punto de inicio.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, AlertTriangle } from "@buleje/design-system/icons";
import { RouteIcon } from "@/components/delivery/icons";
import {
  StackedRouteView,
  type StackedRoute,
} from "@/components/delivery/StackedRouteView";

/** Pide la posición actual; resuelve a null si falla o el usuario la niega. */
function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30_000 },
    );
  });
}

export default function RutaPage() {
  const router = useRouter();
  const [route, setRoute] = useState<StackedRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const pos = await getPosition();
      const qs = pos ? `?lat=${pos.lat}&lng=${pos.lng}` : "";
      const res = await fetch(`/api/delivery/me/route${qs}`, { credentials: "include" });
      if (res.status === 401) {
        router.push("/delivery-app/login");
        return;
      }
      if (!res.ok) {
        setError("No pudimos armar tu ruta. Intenta de nuevo.");
        return;
      }
      const data: StackedRoute = await res.json();
      setRoute(data);
      setError(null);
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      <header
        className="sticky top-0 z-30 border-b border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/delivery-app")}
            aria-label="Volver"
            className="h-10 w-10 bg-[var(--surface-sunken)] text-[var(--text-secondary)] inline-flex items-center justify-center hover:bg-[var(--surface-canvas)]"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              Pedidos apilados
            </p>
            <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
              Mi ruta
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 lg:py-10 pb-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            <p className="text-sm font-semibold text-[var(--text-secondary)]">
              Armando tu ruta óptima…
            </p>
          </div>
        ) : error ? (
          <div className="text-center max-w-md mx-auto py-20">
            <AlertTriangle className="h-16 w-16 mx-auto text-[var(--brand-secondary)]" />
            <p className="mt-3 text-base text-[var(--text-secondary)]">{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError(null);
                load();
              }}
              className="mt-5 inline-flex items-center gap-2 h-12 px-6 bg-[var(--accent)] font-extrabold text-white"
            >
              Reintentar
            </button>
          </div>
        ) : !route || route.count === 0 ? (
          <div className="text-center max-w-md mx-auto py-20">
            <div className="inline-flex h-16 w-16 items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
              <RouteIcon className="h-9 w-9" />
            </div>
            <p className="mt-4 text-lg font-extrabold text-[var(--text-primary)]">
              No tienes pedidos en curso
            </p>
            <p className="mt-1 text-base text-[var(--text-secondary)] leading-relaxed">
              Cuando aceptes dos o más pedidos, te armamos la ruta más corta para
              entregarlos todos en una sola vuelta.
            </p>
            <button
              type="button"
              onClick={() => router.push("/delivery-app")}
              className="mt-5 inline-flex items-center gap-2 h-12 px-6 border-2 border-[var(--rule-base)] font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)]"
            >
              Volver al panel
            </button>
          </div>
        ) : (
          <StackedRouteView route={route} />
        )}
      </div>
    </main>
  );
}
