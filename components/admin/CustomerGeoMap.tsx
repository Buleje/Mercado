"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  MapPin,
  Loader2,
  AlertCircle,
  Flame,
  Users,
  DollarSign,
  TrendingUp,
  Eye,
  EyeOff,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type GeoCustomer = {
  phone: string;
  name: string;
  lat: number;
  lng: number;
  totalSpent: number;
  location: string;
};

type ViewMode = "markers" | "heat";

interface Props {
  className?: string;
}

// ── Pucallpa center ──────────────────────────────────────────────────────────

const PUCALLPA_CENTER: [number, number] = [-8.3791, -74.5539];
const DEFAULT_ZOOM = 14;

// ── Spend tier helpers ───────────────────────────────────────────────────────

function getSpendTier(totalSpent: number): "high" | "medium" | "low" {
  if (totalSpent >= 1500) return "high";
  if (totalSpent >= 500) return "medium";
  return "low";
}

function getTierColor(tier: "high" | "medium" | "low"): string {
  switch (tier) {
    case "high":
      return "#00B4A6";
    case "medium":
      return "#f97316";
    case "low":
      return "#6b7280";
  }
}

function getTierLabel(tier: "high" | "medium" | "low"): string {
  switch (tier) {
    case "high":
      return "Oro+";
    case "medium":
      return "Plata";
    case "low":
      return "Bronce";
  }
}

function formatSoles(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CustomerGeoMap({ className }: Props) {
  const [customers, setCustomers] = useState<GeoCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("markers");
  const [showStats, setShowStats] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet map instance (dynamically imported)
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet layer group
  const markersLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet heat layer
  const heatLayerRef = useRef<any>(null);
  const initRef = useRef(false);

  // ── Fetch data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    fetch("/api/customers/geo")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCustomers(data);
        } else {
          setError(data.error ?? "Respuesta inesperada del servidor");
        }
      })
      .catch(() => setError("No se pudieron cargar los datos de ubicacion."))
      .finally(() => setLoading(false));
  }, []);

  // ── Initialize map ─────────────────────────────────────────────────────────

  const initMap = useCallback(async () => {
    if (!containerRef.current || initRef.current) return;
    initRef.current = true;

    // Dynamically import leaflet CSS
    await import("leaflet/dist/leaflet.css");

    const L = await import("leaflet");

    // Fix default icon URLs broken by bundlers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    const map = L.map(containerRef.current!).setView(PUCALLPA_CENTER, DEFAULT_ZOOM);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Create marker layer group
    markersLayerRef.current = L.layerGroup().addTo(map);

    // Fix gray tiles
    setTimeout(() => map.invalidateSize(), 250);

    // ResizeObserver for container changes
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(containerRef.current!);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any)._roCleanup = () => ro.disconnect();
    }
  }, []);

  useEffect(() => {
    if (!loading && customers.length >= 0) {
      initMap();
    }

    return () => {
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any)._roCleanup?.();
        mapRef.current.remove();
        mapRef.current = null;
        markersLayerRef.current = null;
        heatLayerRef.current = null;
        initRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Update layers when data or viewMode changes ────────────────────────────

  useEffect(() => {
    if (!mapRef.current || !customers.length) return;

    const updateLayers = async () => {
      const L = await import("leaflet");
      const map = mapRef.current;
      if (!map) return;

      // Clear existing markers
      if (markersLayerRef.current) {
        markersLayerRef.current.clearLayers();
      }

      // Remove heat layer if exists
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }

      if (viewMode === "markers") {
        // ── Markers view ──────────────────────────────────────────────────
        customers.forEach((c) => {
          const tier = getSpendTier(c.totalSpent);
          const color = getTierColor(tier);
          const initials = c.name
            .split(" ")
            .map((w: string) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);

          const icon = L.divIcon({
            className: "customer-geo-marker",
            html: `<div style="
              background:${color};
              color:white;
              width:32px;height:32px;
              border-radius:50%;
              display:flex;align-items:center;justify-content:center;
              font-size:11px;font-weight:700;
              border:2px solid white;
              box-shadow:0 2px 6px rgba(0,0,0,0.3);
            ">${initials}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -18],
          });

          const marker = L.marker([c.lat, c.lng], { icon });
          marker.bindPopup(`
            <div style="min-width:160px;">
              <p style="font-weight:700;margin:0 0 4px;">${c.name}</p>
              <p style="margin:0 0 2px;font-size:12px;color:#666;">
                ${c.location || "Sin direccion"}
              </p>
              <p style="margin:0;font-size:13px;font-weight:600;color:${color};">
                ${formatSoles(c.totalSpent)} (${getTierLabel(tier)})
              </p>
            </div>
          `);
          markersLayerRef.current.addLayer(marker);
        });

        // Fit bounds if we have markers
        if (customers.length > 0) {
          const bounds = L.latLngBounds(customers.map((c) => [c.lat, c.lng] as [number, number]));
          map.fitBounds(bounds.pad(0.1), { maxZoom: 16 });
        }
      } else {
        // ── Heat map view ─────────────────────────────────────────────────
        try {
          // @ts-expect-error -- leaflet.heat extends L globally
          await import("leaflet.heat");
        } catch {
          // leaflet.heat not installed — skip silently
          return;
        }

        const maxSpent = Math.max(...customers.map((c) => c.totalSpent), 1);
        const heatData: [number, number, number][] = customers.map((c) => [
          c.lat,
          c.lng,
          c.totalSpent / maxSpent,
        ]);

        heatLayerRef.current = L.heatLayer(heatData, {
          radius: 30,
          blur: 20,
          maxZoom: 17,
          max: 1,
          minOpacity: 0.4,
          gradient: {
            0.2: "#00B4A6",
            0.4: "#33C4B8",
            0.6: "#2dd4bf",
            0.8: "#f97316",
            1.0: "#e63946",
          },
        }).addTo(map);

        // Fit bounds
        if (customers.length > 0) {
          const bounds = L.latLngBounds(customers.map((c) => [c.lat, c.lng] as [number, number]));
          map.fitBounds(bounds.pad(0.1), { maxZoom: 16 });
        }
      }
    };

    updateLayers();
  }, [customers, viewMode]);

  // ── Computed stats ─────────────────────────────────────────────────────────

  const totalCustomers = customers.length;
  const totalSpent = customers.reduce((sum, c) => sum + c.totalSpent, 0);

  // Group by location for top zones
  const zoneMap: Record<string, { count: number; spent: number }> = {};
  customers.forEach((c) => {
    const zone = c.location?.trim() || "Sin direccion";
    if (!zoneMap[zone]) zoneMap[zone] = { count: 0, spent: 0 };
    zoneMap[zone].count++;
    zoneMap[zone].spent += c.totalSpent;
  });
  const topZones = Object.entries(zoneMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  const tierCounts = { high: 0, medium: 0, low: 0 };
  customers.forEach((c) => {
    tierCounts[getSpendTier(c.totalSpent)]++;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header + controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SectionTitle className="text-xl font-bold text-[var(--text-primary)]">
            Mapa Geografico de Clientes
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            Ubicacion real de clientes con coordenadas GPS
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle stats panel */}
          <button
            onClick={() => setShowStats(!showStats)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              showStats
                ? "bg-primary text-white"
                : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200"
            )}
          >
            {showStats ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Stats
          </button>

          {/* View mode toggle */}
          <div className="flex rounded-lg border border-[var(--rule-base)]">
            <button
              onClick={() => setViewMode("markers")}
              className={cn(
                "flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "markers"
                  ? "bg-primary text-white"
                  : "bg-white text-[var(--text-secondary)] hover:bg-gray-50"
              )}
            >
              <MapPin className="h-3.5 w-3.5" />
              Marcadores
            </button>
            <button
              onClick={() => setViewMode("heat")}
              className={cn(
                "flex items-center gap-1.5 rounded-r-lg px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "heat"
                  ? "bg-primary text-white"
                  : "bg-white text-[var(--text-secondary)] hover:bg-gray-50"
              )}
            >
              <Flame className="h-3.5 w-3.5" />
              Mapa de calor
            </button>
          </div>
        </div>
      </div>

      {/* Stats panel */}
      {showStats && !loading && totalCustomers > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-xs text-[var(--text-secondary)]">Con GPS</span>
            </div>
            <p className="mt-1 text-xl font-bold text-[var(--text-primary)]">
              {totalCustomers}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-secondary" />
              <span className="text-xs text-[var(--text-secondary)]">Total gastado</span>
            </div>
            <p className="mt-1 text-xl font-bold text-[var(--text-primary)]">
              {formatSoles(totalSpent)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-xs text-[var(--text-secondary)]">Top zona</span>
            </div>
            <p className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]">
              {topZones[0]?.[0] ?? "---"}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">{topZones[0]?.[1]?.count ?? 0} clientes</p>
          </div>
          <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[var(--text-secondary)]" />
              <span className="text-xs text-[var(--text-secondary)]">Por nivel</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" />
                {tierCounts.high}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-secondary" />
                {tierCounts.medium}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-500" />
                {tierCounts.low}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Top zones breakdown */}
      {showStats && !loading && topZones.length > 1 && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-4">
          <CardTitle className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            Top 5 zonas
          </CardTitle>
          <div className="space-y-2">
            {topZones.map(([zone, data]) => {
              const pct = totalCustomers > 0 ? Math.round((data.count / totalCustomers) * 100) : 0;
              return (
                <div key={zone} className="flex items-center gap-3">
                  <span className="w-32 truncate text-xs text-[var(--text-secondary)]">
                    {zone}
                  </span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-[var(--dur-slow)]"
                      style={{ width: `${Math.max(pct, 3)}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-xs text-[var(--text-secondary)]">
                    {data.count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Map container */}
      {loading ? (
        <div className="relative rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" style={{ height: 480 }}>
          <LoadingState variant="overlay" message="" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--data-error)] bg-[var(--data-error-50)] px-4 py-8">
          <AlertCircle className="h-5 w-5 shrink-0 text-[var(--data-error)]" />
          <p className="text-sm text-[var(--data-error)]">{error}</p>
        </div>
      ) : totalCustomers === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--rule-base)] bg-white px-4 py-16">
          <MapPin className="h-10 w-10 text-[var(--text-tertiary)]" />
          <p className="text-sm text-[var(--text-secondary)]">
            No hay clientes con coordenadas GPS registradas.
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Agrega lat/lng a tus clientes para verlos en el mapa.
          </p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="rounded-xl border border-[var(--rule-base)] "
          style={{ height: 480, width: "100%" }}
        />
      )}

      {/* Legend */}
      {!loading && !error && totalCustomers > 0 && viewMode === "markers" && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--rule-base)] bg-white px-4 py-2.5 text-xs">
          <span className="font-medium text-[var(--text-secondary)]">Leyenda:</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-primary" />
            Oro+ (S/1500+)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-secondary" />
            Plata (S/500-1499)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-gray-500" />
            Bronce (&lt;S/500)
          </span>
        </div>
      )}

      {!loading && !error && totalCustomers > 0 && viewMode === "heat" && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--rule-base)] bg-white px-4 py-2.5 text-xs">
          <span className="font-medium text-[var(--text-secondary)]">Intensidad:</span>
          <div className="flex items-center gap-1">
            <span className="text-[var(--text-tertiary)]">Bajo</span>
            <div className="flex h-3 w-32 overflow-hidden rounded-full">
              <div className="flex-1 bg-primary" />
              <div className="flex-1 bg-primary-light" />
              <div className="flex-1 bg-[#2dd4bf]" />
              <div className="flex-1 bg-secondary" />
              <div className="flex-1 bg-[#e63946]" />
            </div>
            <span className="text-[var(--text-tertiary)]">Alto</span>
          </div>
          <span className="text-[var(--text-tertiary)]">= Total gastado por cliente</span>
        </div>
      )}
    </div>
  );
}
