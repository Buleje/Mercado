"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2,
  AlertCircle,
  Phone,
  Clock,
  CheckCircle,
  Bike,
  Package,
  Navigation } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fetchRoute, formatEta, type RouteResult } from "@/lib/delivery/route";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TrackingData {
  status: string;
  partnerName: string;
  partnerPhone: string;
  fee: number;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  trackingLat: number | null;
  trackingLng: number | null;
  trackingUpdatedAt: string | null;
}

interface Props {
  orderId: string;
  /** Coordenadas del destino (domicilio del cliente) */
  destLat?: number;
  destLng?: number;
  className?: string;
}

// ── Constantes ───────────────────────────────────────────────────────────────

const STORE_CENTER: [number, number] = [-8.3791, -74.5539];
const POLL_INTERVAL_MS = 15_000;

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType; step: number }
> = {
  assigned:  { label: "Asignado",  color: "text-[var(--data-warning-600)] dark:text-amber-400",   icon: Clock,        step: 1 },
  picked_up: { label: "Recogido",  color: "text-[var(--data-success-600)] dark:text-emerald-400",     icon: Package,      step: 2 },
  en_camino: { label: "En camino", color: "text-[var(--accent)] dark:text-teal-400",    icon: Navigation,   step: 3 },
  delivered: { label: "Entregado", color: "text-[var(--data-success-600)] dark:text-emerald-400", icon: CheckCircle, step: 4 },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG["assigned"];
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function MapSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-6 w-1/3 bg-[var(--surface-sunken)]" />
      <div className="h-64 w-full bg-[var(--surface-sunken)] sm:h-80" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-16 bg-[var(--surface-sunken)]" />
        <div className="h-16 bg-[var(--surface-sunken)]" />
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DeliveryTrackingMap({ orderId, destLat, destLng, className }: Props) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [route, setRoute] = useState<RouteResult | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const riderMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const destMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineHaloRef = useRef<any>(null);
  const initRef = useRef(false);
  const prevLatLng = useRef<[number, number] | null>(null);

  // ── Fetch tracking data ────────────────────────────────────────────────────

  const fetchTracking = useCallback(async () => {
    try {
      const res = await fetch(`/api/delivery/tracking/${orderId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Error al obtener el tracking");
        return;
      }
      const json: TrackingData = await res.json();
      setData(json);
      setError("");
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // Fetch inicial + polling
  useEffect(() => {
    fetchTracking();
    const timer = setInterval(fetchTracking, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchTracking]);

  // ── Calcular ruta real (repartidor → destino) cuando hay posición ──────────
  useEffect(() => {
    if (!data?.trackingLat || !data?.trackingLng) return;
    const dLat = destLat ?? STORE_CENTER[0];
    const dLng = destLng ?? STORE_CENTER[1];
    const ctrl = new AbortController();
    fetchRoute(
      { lat: data.trackingLat, lng: data.trackingLng },
      { lat: dLat, lng: dLng },
      { signal: ctrl.signal },
    ).then((r) => {
      if (!ctrl.signal.aborted) setRoute(r);
    });
    return () => ctrl.abort();
  }, [data?.trackingLat, data?.trackingLng, destLat, destLng]);

  // ── Init mapa ──────────────────────────────────────────────────────────────

  const initMap = useCallback(async () => {
    if (!containerRef.current || initRef.current) return;
    initRef.current = true;

    await import("leaflet/dist/leaflet.css");
    const L = await import("leaflet");

    // Corregir URLs de íconos rotos por bundler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    const map = L.map(containerRef.current!).setView(STORE_CENTER, 14);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    setTimeout(() => map.invalidateSize(), 250);

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(containerRef.current!);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any)._roCleanup = () => ro.disconnect();
    }
  }, []);

  // Inicializar mapa cuando deja de cargar
  useEffect(() => {
    if (!loading) initMap();
    return () => {
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any)._roCleanup?.();
        mapRef.current.remove();
        mapRef.current = null;
        riderMarkerRef.current = null;
        destMarkerRef.current = null;
        polylineRef.current = null;
        polylineHaloRef.current = null;
        initRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Actualizar markers + ruta cuando cambia data/route ─────────────────────

  useEffect(() => {
    if (!mapRef.current || !data) return;

    const updateMarkers = async () => {
      const L = await import("leaflet");
      const map = mapRef.current;
      if (!map) return;

      const riderLat = data.trackingLat;
      const riderLng = data.trackingLng;

      // ── Marker del repartidor (punto GPS teal, sin emoji) ───────────
      if (riderLat !== null && riderLng !== null) {
        const riderIcon = L.divIcon({
          className: "delivery-rider-marker",
          html: `<div style="
            background:var(--accent);
            width:22px;height:22px;border-radius:50%;
            border:4px solid white;
            box-shadow:0 0 0 5px color-mix(in oklab, var(--accent) 22%, transparent);
            transition:all 0.6s ease;
          "></div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          popupAnchor: [0, -14],
        });

        if (riderMarkerRef.current) {
          const prev = prevLatLng.current;
          if (!prev || prev[0] !== riderLat || prev[1] !== riderLng) {
            riderMarkerRef.current.setLatLng([riderLat, riderLng]);
          }
        } else {
          riderMarkerRef.current = L.marker([riderLat, riderLng], { icon: riderIcon })
            .bindPopup(`
              <div style="min-width:150px;">
                <p style="font-weight:700;margin:0 0 4px;">${data.partnerName}</p>
                <p style="margin:0 0 2px;font-size:12px;color:#555;">Tel: ${data.partnerPhone}</p>
                <p style="margin:0;font-size:11px;color:#888;">Actualizado: ${formatTime(data.trackingUpdatedAt)}</p>
              </div>
            `)
            .addTo(map);
        }
        prevLatLng.current = [riderLat, riderLng];
      }

      // ── Marker de destino (pin coral, sin emoji) ────────────────────
      const dLat = destLat ?? STORE_CENTER[0];
      const dLng = destLng ?? STORE_CENTER[1];

      if (!destMarkerRef.current) {
        const destIcon = L.divIcon({
          className: "delivery-dest-marker",
          html: `<div style="
            width:30px;height:30px;
            background:var(--brand-secondary);
            border:3px solid white;
            border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            box-shadow:0 2px 8px rgba(0,0,0,0.3);
          "></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 28],
          popupAnchor: [0, -26],
        });

        destMarkerRef.current = L.marker([dLat, dLng], { icon: destIcon })
          .bindPopup("<p style='font-weight:700;margin:0;'>Tu pedido llega aquí</p>")
          .addTo(map);
      }

      // ── Ruta real por calle (repartidor → destino) ──────────────────
      if (riderLat !== null && riderLng !== null) {
        // Limpiar trazos previos
        if (polylineHaloRef.current) map.removeLayer(polylineHaloRef.current);
        if (polylineRef.current) map.removeLayer(polylineRef.current);

        const coords =
          route && route.coords.length >= 2
            ? route.coords
            : ([[riderLat, riderLng], [dLat, dLng]] as [number, number][]);

        polylineHaloRef.current = L.polyline(coords, {
          color: "white",
          weight: 8,
          opacity: 0.9,
        }).addTo(map);
        polylineRef.current = L.polyline(coords, {
          color: "var(--accent)",
          weight: 5,
          opacity: 0.95,
          dashArray: route?.source === "osrm" ? undefined : "10 8",
        }).addTo(map);

        const bounds = L.latLngBounds(coords);
        map.fitBounds(bounds.pad(0.2), { maxZoom: 16 });
      } else {
        map.setView([dLat, dLng], 15);
      }
    };

    updateMarkers();
  }, [data, destLat, destLng, route]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <MapSkeleton />;

  if (error) {
    return (
      <div className={cn("flex items-center gap-3 border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 p-4", className)}>
        <AlertCircle className="h-5 w-5 shrink-0 text-[var(--data-error-500)]" />
        <p className="text-sm text-[var(--data-error-600)] dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const statusCfg = getStatusConfig(data.status);
  const StatusIcon = statusCfg.icon;
  const isDelivered = data.status === "delivered";
  // ETA viva: si tenemos ruta calculada la usamos; si no, estimado genérico.
  const etaText = route ? formatEta(route.durationMin) : "~30 min";

  return (
    <div className={cn("space-y-4", className)}>
      {/* Status badge + info del repartidor */}
      <div className="flex flex-col gap-3 border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center bg-[var(--accent)]/10 dark:bg-[var(--accent)]/20">
            <Bike className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div>
            <p className="font-bold text-[var(--text-primary)]">{data.partnerName}</p>
            <a
              href={`tel:${data.partnerPhone}`}
              className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--accent)]"
            >
              <Phone className="h-3.5 w-3.5" />
              {data.partnerPhone}
            </a>
          </div>
        </div>

        <span className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold",
          "bg-[var(--surface-sunken)]",
          statusCfg.color,
        )}>
          <StatusIcon className="h-4 w-4" />
          {statusCfg.label}
        </span>
      </div>

      {/* Stepper de progreso */}
      <div className="flex items-center gap-1 overflow-x-auto border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
        {Object.entries(STATUS_CONFIG).map(([key, cfg], idx, arr) => {
          const isActive = cfg.step <= statusCfg.step;
          const isCurrent = key === data.status;
          const StepIcon = cfg.icon;
          return (
            <div key={key} className="flex min-w-0 flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center transition-colors",
                  isActive
                    ? "bg-[var(--accent-600,var(--accent))] text-white"
                    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                  isCurrent && "ring-2 ring-[var(--accent)] ring-offset-2 dark:ring-offset-[var(--surface-raised)]",
                )}>
                  <StepIcon className="h-3.5 w-3.5" />
                </div>
                <span className={cn(
                  "whitespace-nowrap text-[length:var(--ts-2xs)] font-medium",
                  isActive ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]",
                )}>
                  {cfg.label}
                </span>
              </div>
              {idx < arr.length - 1 && (
                <div className={cn(
                  "mx-1 h-0.5 flex-1 transition-colors",
                  cfg.step < statusCfg.step
                    ? "bg-[var(--accent)]"
                    : "bg-[var(--rule-base)]",
                )} />
              )}
            </div>
          );
        })}
      </div>

      {/* Mapa */}
      {isDelivered ? (
        <div className="flex flex-col items-center justify-center gap-3 border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/10 px-4 py-12">
          <CheckCircle className="h-12 w-12 text-[var(--data-success-500)]" />
          <p className="text-center font-bold text-[var(--data-success-700)] dark:text-emerald-400">
            Pedido entregado exitosamente
          </p>
          {data.deliveredAt && (
            <p className="text-center text-sm text-[var(--data-success-600)] dark:text-[var(--data-success-500)]">
              Entregado a las {formatTime(data.deliveredAt)}
            </p>
          )}
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            className="border border-[var(--rule-base)]"
            style={{ height: 320, width: "100%" }}
          />
          {/* Info de última actualización */}
          <div className="flex items-center justify-between border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2.5 text-xs">
            <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Actualizando cada 15 segundos
            </span>
            {data.trackingUpdatedAt && (
              <span className="text-[var(--text-tertiary)]">
                Última pos.: {formatTime(data.trackingUpdatedAt)}
              </span>
            )}
            {!data.trackingLat && (
              <span className="text-[var(--data-warning-500)] dark:text-amber-400">
                Esperando ubicación del repartidor...
              </span>
            )}
          </div>
        </>
      )}

      {/* Horario */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          <p className="text-xs text-[var(--text-secondary)]">Pedido asignado</p>
          <p className="mt-0.5 font-mono text-sm font-bold text-[var(--text-primary)]">
            {formatTime(data.createdAt)}
          </p>
        </div>
        <div className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          <p className="text-xs text-[var(--text-secondary)]">
            {data.pickedUpAt ? "Recogido" : "Llegada estimada"}
          </p>
          <p className="mt-0.5 font-mono text-sm font-bold text-[var(--text-primary)]">
            {data.pickedUpAt ? formatTime(data.pickedUpAt) : etaText}
          </p>
        </div>
      </div>

      {/* Costo de delivery */}
      <div className="flex items-center justify-between border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
        <span className="text-sm text-[var(--text-secondary)]">Costo de delivery</span>
        <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
          S/ {Number(data.fee).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
