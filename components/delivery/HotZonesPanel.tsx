"use client";

/**
 * HotZonesPanel — visualizador de zonas con alta demanda para el repartidor.
 * Sin Leaflet. Muestra ranked cards con heat indicator, pedidos pendientes,
 * tarifa promedio, distancia y bonos activos.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Flame, Star } from "@buleje/design-system/icons";

// ── Tipos ────────────────────────────────────────────────────────────────────

type HeatLevel = "high" | "medium" | "low";

interface Zone {
  id: string;
  name: string;
  heat: HeatLevel;
  pendingOrders: number;
  avgFee: number;
  distanceKm: number;
  bonus: string | null;
}

export interface HotZonesPanelProps {
  isOnline: boolean;
  currentLat?: number | null;
  currentLng?: number | null;
}

// Brandon mayo 2026 v7: removido MOCK_ZONES (Yarinacocha 12 pedidos S/8.5,
// "Lluvia +25%", etc). Si el endpoint aún no respondió, mostramos un empty
// honesto en vez de zonas inventadas. El backend ya cuenta pedidos reales.

// ── Helpers de heat ──────────────────────────────────────────────────────────

const HEAT_ORDER: Record<HeatLevel, number> = { high: 3, medium: 2, low: 1 };

const HEAT_META: Record<
  HeatLevel,
  {
    label: string;
    flames: number;
    textClass: string;
    bgAlpha: string;
    borderHover: string;
  }
> = {
  high: {
    label: "Alta",
    flames: 3,
    textClass: "text-[var(--data-error-500)]",
    bgAlpha: "bg-[var(--data-error-500)]/10",
    borderHover: "hover:border-[var(--data-error-500)]",
  },
  medium: {
    label: "Media",
    flames: 2,
    textClass: "text-[var(--data-warning-500)]",
    bgAlpha: "bg-[var(--data-warning-500)]/10",
    borderHover: "hover:border-[var(--data-warning-500)]",
  },
  low: {
    label: "Baja",
    flames: 1,
    textClass: "text-[var(--text-tertiary)]",
    bgAlpha: "bg-[var(--surface-sunken)]",
    borderHover: "hover:border-[var(--rule-strong)]",
  },
};

function sortZones(zones: Zone[]): Zone[] {
  return [...zones].sort((a, b) => {
    const heatDiff = HEAT_ORDER[b.heat] - HEAT_ORDER[a.heat];
    return heatDiff !== 0 ? heatDiff : b.pendingOrders - a.pendingOrders;
  });
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 bg-[var(--data-error-500)]/15 px-3 h-7 text-xs font-extrabold uppercase tracking-wider text-[var(--data-error-500)]">
      <span
        className="h-2 w-2 rounded-full bg-[var(--data-error-500)] animate-pulse"
        aria-hidden="true"
      />
      Live
    </span>
  );
}

function HeatFlames({ level }: { level: HeatLevel }) {
  const { flames, textClass } = HEAT_META[level];
  return (
    <span className={`inline-flex gap-0.5 ${textClass}`} aria-label={`Demanda ${HEAT_META[level].label}`}>
      {Array.from({ length: 3 }).map((_, i) => (
        <Flame
          key={i}
          className={`h-3.5 w-3.5 ${i < flames ? textClass : "text-[var(--rule-base)]"}`}
          strokeWidth={2.25}
          aria-hidden
        />
      ))}
    </span>
  );
}

function BonusBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 bg-[var(--brand-secondary)]/15 px-2.5 h-6 text-xs font-extrabold text-[var(--brand-secondary)] shrink-0">
      <Star className="h-3 w-3" aria-hidden="true" />
      <span data-no-translate>{text}</span>
    </span>
  );
}

function ZoneCard({ zone, onNavigate }: { zone: Zone; onNavigate: (id: string) => void }) {
  const meta = HEAT_META[zone.heat];

  return (
    <article
      className={[
        "group relative flex flex-col border-2 border-[var(--rule-base)]",
        "bg-[var(--surface-raised)] p-5 transition-colors duration-150",
        meta.borderHover,
      ].join(" ")}
    >
      {/* Header de la card */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p
            className="text-base font-extrabold text-[var(--text-primary)] leading-tight"
            data-no-translate
          >
            {zone.name}
          </p>
          <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {Number(zone.distanceKm).toFixed(1)} km de ti
          </p>
        </div>
        <HeatFlames level={zone.heat} />
      </div>

      {/* Métricas */}
      <div className={` ${meta.bgAlpha} px-3 py-2.5 mb-3 flex items-center justify-between gap-2`}>
        <div className="text-center">
          <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">
            {zone.pendingOrders}
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Sin tomar
          </p>
        </div>
        <div className="h-8 w-px bg-[var(--rule-base)]" aria-hidden="true" />
        <div className="text-center">
          <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">
            S/ {Number(zone.avgFee).toFixed(1)}
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Prom. tarifa
          </p>
        </div>
      </div>

      {/* Bonus */}
      {zone.bonus && (
        <div className="mb-3">
          <BonusBadge text={zone.bonus} />
        </div>
      )}

      {/* CTA */}
      <div className="mt-auto pt-3 border-t border-[var(--rule-base)]">
        <button
          type="button"
          onClick={() => onNavigate(zone.id)}
          className={[
            "w-full inline-flex items-center justify-center gap-2",
            "h-10 text-sm font-extrabold transition-all",
            "bg-[var(--accent-soft)] text-[var(--accent)]",
            "hover:bg-[var(--accent)] hover:text-white",
            "active:scale-[0.97]",
          ].join(" ")}
          aria-label={`Ir a la zona ${zone.name}`}
        >
          Ir a zona
          <ArrowRight
            className="h-4 w-4 group-hover:translate-x-0.5 transition-transform"
            strokeWidth={2.5}
          />
        </button>
      </div>
    </article>
  );
}

function OfflineEmptyState() {
  return (
    <div className=" border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center">
      <div className="mx-auto mb-3 h-12 w-12 bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--text-tertiary)]">
        <Flame className="h-6 w-6" strokeWidth={2} aria-hidden />
      </div>
      <h3 className="text-base font-extrabold text-[var(--text-primary)]">
        Conéctate para ver zonas activas
      </h3>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)] max-w-xs mx-auto">
        Activa el modo en línea desde la barra lateral para ver dónde hay más pedidos ahora.
      </p>
    </div>
  );
}

function NoZonesState() {
  return (
    <div className=" border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center">
      <h3 className="text-base font-extrabold text-[var(--text-primary)]">
        No hay zonas con pedidos pendientes
      </h3>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
        Cuando entren pedidos vas a ver acá las zonas con más demanda en tiempo real.
      </p>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function HotZonesPanel({
  isOnline,
  currentLat,
  currentLng,
}: HotZonesPanelProps) {
  const router = useRouter();
  // Brandon mayo 2026 v7: arrancamos con [] (nada inventado). El endpoint
  // devuelve la lista real basada en pedidos pendientes; si no hay, no
  // pintamos cards fake — un empty-state honesto es mejor que decorado.
  const [zones, setZones] = useState<Zone[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (typeof currentLat === "number") params.set("lat", String(currentLat));
      if (typeof currentLng === "number") params.set("lng", String(currentLng));
      const qs = params.toString();
      const res = await fetch(`/api/delivery/hot-zones${qs ? `?${qs}` : ""}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { zones: Zone[] };
      if (Array.isArray(json.zones)) {
        // Filtramos zonas sin pedidos pendientes — no tiene sentido
        // mostrar "Yarinacocha 0 pedidos S/0" como si fuera oportunidad.
        const withDemand = json.zones.filter((z) => z.pendingOrders > 0);
        setZones(withDemand);
      }
    } catch {
      /* silent */
    } finally {
      setHasLoaded(true);
    }
  }, [currentLat, currentLng]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 300_000); // 5 min
    return () => clearInterval(id);
  }, [load]);

  const sorted = sortZones(zones);

  function handleNavigate(zoneId: string) {
    router.push(`/delivery-app/mapa?zona=${zoneId}`);
  }

  return (
    <section aria-labelledby="hot-zones-heading">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2
              id="hot-zones-heading"
              className="inline-flex items-center gap-2 text-lg lg:text-xl font-extrabold text-[var(--text-primary)]"
            >
              <Flame className="h-5 w-5 text-[var(--brand-secondary,#ff6b5b)]" strokeWidth={2.25} aria-hidden />
              Zonas activas ahora
            </h2>
            <LiveBadge />
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)] font-semibold">
            Ve a estas zonas para encontrar más viajes
          </p>
        </div>
      </div>

      {/* ── Contenido ── */}
      {!isOnline ? (
        <OfflineEmptyState />
      ) : hasLoaded && sorted.length === 0 ? (
        <NoZonesState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {sorted.map((zone) => (
            <ZoneCard key={zone.id} zone={zone} onNavigate={handleNavigate} />
          ))}
        </div>
      )}

      {/* ── Footer disclaimer ── */}
      {isOnline && sorted.length > 0 && (
        <p className="mt-4 text-center text-xs font-semibold text-[var(--text-tertiary)]">
          Las zonas se actualizan cada 5 min · No garantiza viajes
        </p>
      )}
    </section>
  );
}
