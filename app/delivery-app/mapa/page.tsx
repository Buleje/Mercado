"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2, MapPin, AlertTriangle } from "@buleje/design-system/icons";

// Lazy-load del mapa para evitar SSR (Leaflet usa window).
const PartnerMap = dynamic(() => import("@/components/delivery/PartnerMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px] rounded-xl bg-[var(--surface-sunken)]">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
    </div>
  ),
});

interface PartnerProfile {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  isOnline: boolean;
}

export default function MapaPage() {
  const router = useRouter();
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/delivery/me/me", { credentials: "include" })
      .then((r) => {
        if (r.status === 401) {
          router.push("/delivery-app/login");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (data?.partner) setPartner(data.partner);
        else setError("No pudimos cargar tu cuenta.");
      })
      .catch(() => setError("Error de red."));
  }, [router]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] px-4">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-amber-500" />
          <p className="mt-3 text-[var(--text-secondary)]">{error}</p>
        </div>
      </main>
    );
  }

  if (!partner) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  if (partner.lat == null || partner.lng == null) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] px-4">
        <div className="text-center max-w-sm">
          <MapPin className="h-12 w-12 mx-auto text-[var(--text-tertiary)]" />
          <h1 className="mt-3 text-xl font-extrabold text-[var(--text-primary)]">
            Activá tu ubicación
          </h1>
          <p className="mt-2 text-[var(--text-secondary)] text-sm">
            Volvé al panel y prendé el modo en línea para que detectemos tu posición.
          </p>
          <button
            type="button"
            onClick={() => router.push("/delivery-app")}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 font-bold text-white"
          >
            Ir al panel
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] flex flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur px-4 py-3">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <h1 className="font-extrabold text-[var(--text-primary)] flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[var(--accent)]" />
            Mapa de pedidos
          </h1>
          <span className={`text-xs font-bold uppercase tracking-wider ${
            partner.isOnline ? "text-[var(--data-success)]" : "text-[var(--text-tertiary)]"
          }`}>
            {partner.isOnline ? "En línea" : "Offline"}
          </span>
        </div>
      </header>

      <section className="flex-1 p-4 max-w-3xl mx-auto w-full">
        <PartnerMap partnerLat={partner.lat} partnerLng={partner.lng} />

        <div className="mt-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] p-3">
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-[var(--accent)]"></span>
              Tu ubicación
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-4 w-4 rounded-full bg-amber-400 text-[8px] flex items-center justify-center font-extrabold text-black">S/</span>
              Pedido disponible — tocá para aceptar
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
