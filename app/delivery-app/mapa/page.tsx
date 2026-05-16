"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2, AlertTriangle, ArrowRight } from "@buleje/design-system/icons";
import { PinIcon, MapBadge, LiveSignal } from "@/components/delivery/icons";

const PartnerMap = dynamic(() => import("@/components/delivery/PartnerMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px] rounded-3xl bg-[var(--surface-sunken)]">
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
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-[var(--brand-secondary)]" />
          <p className="mt-3 text-base text-[var(--text-secondary)]">{error}</p>
        </div>
      </main>
    );
  }

  if (!partner) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  if (partner.lat == null || partner.lng == null) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4 py-10">
        <div className="text-center max-w-md">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <PinIcon className="h-10 w-10" />
          </div>
          <h1 className="mt-5 text-2xl lg:text-3xl font-extrabold text-[var(--text-primary)]">
            Activa tu ubicación
          </h1>
          <p className="mt-2 text-base text-[var(--text-secondary)]">
            Vuelve al panel y enciende el modo en línea para que detectemos tu posición.
          </p>
          <button
            type="button"
            onClick={() => router.push("/delivery-app")}
            className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[var(--accent)] font-extrabold text-white"
          >
            Ir al panel
            <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
      <header className="flex items-start justify-between mb-5 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-12 w-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <MapBadge className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl lg:text-2xl font-extrabold text-[var(--text-primary)] leading-tight">
              Mapa de pedidos
            </h1>
            <p className="text-sm font-semibold text-[var(--text-secondary)]">
              Tiendas reales del marketplace + tu posición en vivo
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-2 h-9 px-3 rounded-full text-sm font-extrabold shrink-0 ${
            partner.isOnline
              ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
              : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
          }`}
        >
          <LiveSignal className="h-2.5 w-2.5" active={partner.isOnline} />
          {partner.isOnline ? "En línea" : "Offline"}
        </span>
      </header>

      <div className="rounded-3xl overflow-hidden border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="h-[60vh] lg:h-[72vh] min-h-[440px]">
          <PartnerMap partnerLat={partner.lat} partnerLng={partner.lng} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Legend
          dot={<span className="inline-block h-3 w-3 rounded-full bg-[var(--accent)]" />}
          title="Tu ubicación"
          subtitle="Actualiza cada 30s"
        />
        <Legend
          dot={
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white border-2" style={{ borderColor: "#dc2626" }}>
              <span className="block h-3 w-3 rounded-full bg-[#dc2626]" />
            </span>
          }
          title="Alta demanda"
          subtitle="Top 1/3 últimos 30d"
        />
        <Legend
          dot={
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white border-2" style={{ borderColor: "#d97706" }}>
              <span className="block h-3 w-3 rounded-full bg-[#d97706]" />
            </span>
          }
          title="Demanda media"
          subtitle="Tienda activa"
        />
        <Legend
          dot={
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white border-2 border-[var(--text-tertiary)]">
              <span className="block h-3 w-3 rounded-full bg-[var(--text-tertiary)]" />
            </span>
          }
          title="Baja demanda"
          subtitle="Pocos pedidos"
        />
        <Legend
          dot={
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fbbf24] text-[10px] font-extrabold text-[#111] border-2 border-white">
              S/
            </span>
          }
          title="Pedido disponible"
          subtitle="Toca para aceptar"
        />
      </div>
    </div>
  );
}

function Legend({
  dot,
  title,
  subtitle,
}: {
  dot: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
      <div className="shrink-0">{dot}</div>
      <div className="min-w-0">
        <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">{title}</p>
        <p className="text-sm text-[var(--text-secondary)] leading-tight">{subtitle}</p>
      </div>
    </div>
  );
}
