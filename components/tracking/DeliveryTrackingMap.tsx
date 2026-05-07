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
      <div className="h-6 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-64 w-full rounded-xl bg-gray-200 dark:bg-gray-700 sm:h-80" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-16 rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="h-16 rounded-xl bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DeliveryTrackingMap({ orderId, destLat, destLng, className }: Props) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const riderMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const destMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineRef = useRef<any>(null);
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
        initRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Actualizar markers cuando cambia data ──────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || !data) return;

    const updateMarkers = async () => {
      const L = await import("leaflet");
      const map = mapRef.current;
      if (!map) return;

      const riderLat = data.trackingLat;
      const riderLng = data.trackingLng;

      // ── Marker del repartidor (moto) ────────────────────────────
      if (riderLat !== null && riderLng !== null) {
        const riderIcon = L.divIcon({
          className: "delivery-rider-marker",
          html: `<div style="
            background:var(--accent);color:white;
            width:40px;height:40px;border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            font-size:18px;border:3px solid white;
            box-shadow:0 3px 10px rgba(0,0,0,0.35);
            transition:all 0.6s ease;
          ">🏍️</div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
          popupAnchor: [0, -22],
        });

        if (riderMarkerRef.current) {
          // Animar al nueva posición si cambió
          const prev = prevLatLng.current;
          if (!prev || prev[0] !== riderLat || prev[1] !== riderLng) {
            riderMarkerRef.current.setLatLng([riderLat, riderLng]);
          }
        } else {
          riderMarkerRef.current = L.marker([riderLat, riderLng], { icon: riderIcon })
            .bindPopup(`
              <div style="min-width:150px;">
                <p style="font-weight:700;margin:0 0 4px;">🏍️ ${data.partnerName}</p>
                <p style="margin:0 0 2px;font-size:12px;color:#555;">Tel: ${data.partnerPhone}</p>
                <p style="margin:0;font-size:11px;color:#888;">Actualizado: ${formatTime(data.trackingUpdatedAt)}</p>
              </div>
            `)
            .addTo(map);
        }
        prevLatLng.current = [riderLat, riderLng];
      }

      // ── Marker de destino (casa del cliente) ────────────────────
      const dLat = destLat ?? STORE_CENTER[0];
      const dLng = destLng ?? STORE_CENTER[1];

      if (!destMarkerRef.current) {
        const destIcon = L.divIcon({
          className: "delivery-dest-marker",
          html: `<div style="
            background:#f97316;color:white;
            width:36px;height:36px;border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            font-size:16px;border:3px solid white;
            box-shadow:0 3px 10px rgba(0,0,0,0.3);
          ">🏠</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -20],
        });

        destMarkerRef.current = L.marker([dLat, dLng], { icon: destIcon })
          .bindPopup("<p style='font-weight:700;margin:0;'>Destino del pedido</p>")
          .addTo(map);
      }

      // ── Línea punteada entre repartidor y destino ────────────────
      if (riderLat !== null && riderLng !== null) {
        if (polylineRef.current) {
          map.removeLayer(polylineRef.current);
        }
        polylineRef.current = L.polyline(
          [[riderLat, riderLng], [dLat, dLng]],
          { color: "var(--accent)", weight: 2, opacity: 0.6, dashArray: "8 6" }
        ).addTo(map);

        // Ajustar vista para mostrar ambos marcadores
        const bounds = L.latLngBounds(
          [[riderLat, riderLng], [dLat, dLng]]
        );
        map.fitBounds(bounds.pad(0.25), { maxZoom: 16 });
      } else {
        map.setView([dLat, dLng], 15);
      }
    };

    updateMarkers();
  }, [data, destLat, destLng]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <MapSkeleton />;

  if (error) {
    return (
      <div className={cn("flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-900/10", className)}>
        <AlertCircle className="h-5 w-5 shrink-0 text-[var(--data-error-500)]" />
        <p className="text-sm text-[var(--data-error-600)] dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const statusCfg = getStatusConfig(data.status);
  const StatusIcon = statusCfg.icon;
  const isDelivered = data.status === "delivered";

  return (
    <div className={cn("space-y-4", className)}>
      {/* Status badge + info del repartidor */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 dark:bg-[var(--accent)]/20">
            <Bike className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div>
            <p className="font-bold text-gray-900 dark:text-white">{data.partnerName}</p>
            <a
              href={`tel:${data.partnerPhone}`}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--accent)] dark:text-gray-400"
            >
              <Phone className="h-3.5 w-3.5" />
              {data.partnerPhone}
            </a>
          </div>
        </div>

        <span className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold",
          "bg-gray-100 dark:bg-gray-800",
          statusCfg.color,
        )}>
          <StatusIcon className="h-4 w-4" />
          {statusCfg.label}
        </span>
      </div>

      {/* Stepper de progreso */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        {Object.entries(STATUS_CONFIG).map(([key, cfg], idx, arr) => {
          const isActive = cfg.step <= statusCfg.step;
          const isCurrent = key === data.status;
          const StepIcon = cfg.icon;
          return (
            <div key={key} className="flex min-w-0 flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                  isActive
                    ? "bg-[var(--accent)] text-white"
                    : "bg-gray-200 text-gray-400 dark:bg-gray-700",
                  isCurrent && "ring-2 ring-[var(--accent)] ring-offset-2 dark:ring-offset-gray-900",
                )}>
                  <StepIcon className="h-3.5 w-3.5" />
                </div>
                <span className={cn(
                  "whitespace-nowrap text-[length:var(--ts-2xs)] font-medium",
                  isActive ? "text-[var(--accent)]" : "text-gray-400 dark:text-gray-600",
                )}>
                  {cfg.label}
                </span>
              </div>
              {idx < arr.length - 1 && (
                <div className={cn(
                  "mx-1 h-0.5 flex-1 rounded-full transition-colors",
                  cfg.step < statusCfg.step
                    ? "bg-[var(--accent)]"
                    : "bg-gray-200 dark:bg-gray-700",
                )} />
              )}
            </div>
          );
        })}
      </div>

      {/* Mapa */}
      {isDelivered ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-12 dark:border-emerald-900/30 dark:bg-emerald-900/10">
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
            className="rounded-xl border border-gray-200 shadow-sm dark:border-gray-700"
            style={{ height: 320, width: "100%" }}
          />
          {/* Info de última actualización */}
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-xs dark:border-gray-800 dark:bg-gray-900/50">
            <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Actualizando cada 15 segundos
            </span>
            {data.trackingUpdatedAt && (
              <span className="text-gray-400 dark:text-gray-600">
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
        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Pedido asignado</p>
          <p className="mt-0.5 font-mono text-sm font-bold text-gray-900 dark:text-white">
            {formatTime(data.createdAt)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {data.pickedUpAt ? "Recogido" : "Entrega estimada"}
          </p>
          <p className="mt-0.5 font-mono text-sm font-bold text-gray-900 dark:text-white">
            {data.pickedUpAt ? formatTime(data.pickedUpAt) : "~30 min"}
          </p>
        </div>
      </div>

      {/* Costo de delivery */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <span className="text-sm text-gray-500 dark:text-gray-400">Costo de delivery</span>
        <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">
          S/ {Number(data.fee).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
