"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Wifi,
  WifiOff,
  Package,
  CheckCircle,
  Truck,
  Phone,
  MapPin,
  RefreshCw,
  Navigation,
  User,
  DollarSign,
} from "@buleje/design-system/icons";

// ── Tipos ──────────────────────────────────────────────────────────────────
interface AssignmentOrder {
  id: string;
  customerName: string;
  total: number;
  customerLocation?: string;
  customerPhone?: string;
}

interface AssignmentPartner {
  id: string;
  name: string;
  phone: string;
}

interface Assignment {
  id: string;
  orderId: string;
  partnerId: string;
  fee: number;
  status: "assigned" | "picked_up" | "in_transit" | "delivered";
  createdAt: string;
  deliveredAt?: string;
  order: AssignmentOrder;
  partner: AssignmentPartner;
}

// ── Status config ──────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  Assignment["status"],
  { label: string; badge: string; next?: Assignment["status"]; nextLabel?: string; nextColor?: string }
> = {
  assigned:   { label: "Asignado",    badge: "bg-amber-100 text-[var(--data-warning-700)] dark:bg-amber-900/30 dark:text-amber-300",   next: "picked_up",  nextLabel: "Recogí el pedido", nextColor: "bg-[color-mix(in oklab, var(--accent) 70%, white)] hover:bg-[var(--accent-dark)]" },
  picked_up:  { label: "Recogido",    badge: "bg-emerald-100 text-[var(--data-success-700)] dark:bg-emerald-900/30 dark:text-emerald-300",       next: "in_transit", nextLabel: "En camino",        nextColor: "bg-[var(--data-success-600)] hover:bg-[var(--data-success-700)]" },
  in_transit: { label: "En camino",   badge: "bg-purple-100 text-[var(--accent)] dark:bg-purple-900/30 dark:text-purple-300", next: "delivered", nextLabel: "Entregado",        nextColor: "bg-[var(--data-success-600)] hover:bg-[var(--data-success-700)]" },
  delivered:  { label: "Entregado",   badge: "bg-emerald-100 text-[var(--data-success-700)] dark:bg-emerald-900/30 dark:text-emerald-300" },
};

// ── Confetti simple ────────────────────────────────────────────────────────
const CONFETTI_COLORS = ["color-mix(in oklab, var(--accent) 70%, white)", "#f4a261", "#fbbf24", "#34d399", "#60a5fa"];
function MiniConfetti() {
  // Lazy-init random particle config once per mount (React Compiler purity rule forbids Math.random during render)
  const [particles] = useState(() =>
    Array.from({ length: 30 }, (_, i) => ({
      left: Math.random() * 100,
      top: Math.random() * 60,
      round: Math.random() > 0.5,
      duration: 0.5 + Math.random() * 1,
      delay: Math.random() * 0.5,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    }))
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute animate-bounce"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: 8,
            height: 8,
            borderRadius: p.round ? "50%" : 2,
            backgroundColor: p.color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Card de pedido ─────────────────────────────────────────────────────────
interface OrderCardProps {
  assignment: Assignment;
  onStatusUpdate: (id: string, status: Assignment["status"]) => Promise<void>;
  updating: boolean;
}

function OrderCard({ assignment, onStatusUpdate, updating }: OrderCardProps) {
  const cfg = STATUS_CONFIG[assignment.status];
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    assignment.order.customerLocation ?? assignment.order.customerName
  )}`;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header de la card */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-[color-mix(in oklab, var(--accent) 70%, white)]" />
          <span className="font-mono text-xs font-bold text-gray-500 dark:text-gray-400">
            #{assignment.orderId.slice(-8).toUpperCase()}
          </span>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      {/* Datos del cliente */}
      <div className="px-4 pb-3 space-y-2">
        <div className="flex items-start gap-2">
          <User className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
              {assignment.order.customerName}
            </p>
          </div>
        </div>

        {assignment.order.customerLocation && (
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug">
              {assignment.order.customerLocation}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-gray-400 shrink-0" />
          <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">
            S/ {assignment.order.total.toFixed(2)}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            · Tu ganancia: S/ {assignment.fee.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="px-4 pb-4 space-y-2">
        {/* Botón de siguiente estado */}
        {cfg.next && (
          <button
            type="button"
            disabled={updating}
            onClick={() => onStatusUpdate(assignment.id, cfg.next!)}
            className={`
              w-full flex items-center justify-center gap-2
              min-h-[56px] rounded-xl
              text-white font-bold text-base
              transition-all active:scale-95
              disabled:opacity-60 disabled:cursor-not-allowed
              ${cfg.nextColor}
            `}
          >
            {updating ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <CheckCircle className="h-5 w-5" />
                {cfg.nextLabel}
              </>
            )}
          </button>
        )}

        {/* Botones de contacto */}
        <div className="grid grid-cols-2 gap-2">
          {assignment.order.customerPhone && (
            <a
              href={`tel:${assignment.order.customerPhone}`}
              className="
                flex items-center justify-center gap-2
                min-h-[48px] rounded-xl
                bg-gray-100 dark:bg-gray-800
                text-gray-700 dark:text-gray-300
                font-semibold text-sm
                hover:bg-gray-200 dark:hover:bg-gray-700
                transition-colors active:scale-95
              "
            >
              <Phone className="h-4 w-4" />
              Llamar
            </a>
          )}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`
              flex items-center justify-center gap-2
              min-h-[48px] rounded-xl
              bg-gray-100 dark:bg-gray-800
              text-gray-700 dark:text-gray-300
              font-semibold text-sm
              hover:bg-gray-200 dark:hover:bg-gray-700
              transition-colors active:scale-95
              ${!assignment.order.customerPhone ? "col-span-2" : ""}
            `}
          >
            <MapPin className="h-4 w-4" />
            Ver en mapa
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard principal ────────────────────────────────────────────────────
export default function DeliveryAppDashboard() {
  const [isOnline, setIsOnline] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");

  // Pull-to-refresh
  const [pullStartY, setPullStartY] = useState(0);
  const [pulling, setPulling] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Interval para auto-envío de ubicación cuando hay pedidos en_tránsito
  const geoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // KPIs del día
  const todayDeliveries = assignments.filter((a) => a.status === "delivered").length;
  const todayEarnings = assignments
    .filter((a) => a.status === "delivered")
    .reduce((sum, a) => sum + a.fee, 0);

  // Pedidos activos (no entregados)
  const activeAssignments = assignments.filter((a) => a.status !== "delivered");
  const deliveredAssignments = assignments.filter((a) => a.status === "delivered");

  // PartnerId mock — en producción vendría del login del repartidor
  const PARTNER_ID = typeof window !== "undefined"
    ? (localStorage.getItem("delivery-partner-id") ?? "current")
    : "current";

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(
        `/api/delivery/assignments?partnerId=${PARTNER_ID}&date=${today}`
      );
      if (!res.ok) throw new Error("Error al cargar pedidos");
      const data = await res.json();
      setAssignments(Array.isArray(data) ? data : []);
    } catch {
      setError("No se pudieron cargar los pedidos. Desliza para reintentar.");
    } finally {
      setLoading(false);
    }
  }, [PARTNER_ID]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  // Auto-envío de ubicación cada 30s si hay pedido en tránsito
  useEffect(() => {
    const hasInTransit = assignments.some((a) => a.status === "in_transit");
    if (hasInTransit && isOnline) {
      geoIntervalRef.current = setInterval(() => {
        sendLocation(true);
      }, 30_000);
    } else {
      if (geoIntervalRef.current) {
        clearInterval(geoIntervalRef.current);
        geoIntervalRef.current = null;
      }
    }
    return () => {
      if (geoIntervalRef.current) clearInterval(geoIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, isOnline]);

  async function handleStatusUpdate(
    assignmentId: string,
    newStatus: Assignment["status"]
  ) {
    setUpdatingId(assignmentId);
    try {
      const res = await fetch("/api/delivery/assignments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: assignmentId, status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al actualizar");
      }
      // Actualizar estado local sin refetch completo
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === assignmentId
            ? { ...a, status: newStatus, ...(newStatus === "delivered" ? { deliveredAt: new Date().toISOString() } : {}) }
            : a
        )
      );
      if (newStatus === "delivered") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2500);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al actualizar el estado");
    } finally {
      setUpdatingId(null);
    }
  }

  async function sendLocation(silent = false) {
    if (!silent) setLocationStatus("sending");
    if (!navigator.geolocation) {
      if (!silent) setLocationStatus("error");
      return;
    }
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        });
      });
      const { latitude: lat, longitude: lng } = position.coords;
      // Enviar para todos los pedidos en tránsito
      const inTransitOrders = assignments.filter((a) => a.status === "in_transit");
      await Promise.allSettled(
        inTransitOrders.map((a) =>
          fetch("/api/delivery/tracking/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: a.orderId, lat, lng }),
          })
        )
      );
      if (!silent) {
        setLocationStatus("ok");
        setTimeout(() => setLocationStatus("idle"), 3000);
      }
    } catch {
      if (!silent) setLocationStatus("error");
    }
  }

  // Pull-to-refresh handlers
  function handleTouchStart(e: React.TouchEvent) {
    const scrollTop = listRef.current?.scrollTop ?? 0;
    if (scrollTop === 0) {
      setPullStartY(e.touches[0].clientY);
      setPulling(false);
    }
  }
  function handleTouchMove(e: React.TouchEvent) {
    const delta = e.touches[0].clientY - pullStartY;
    if (delta > 60 && !loading) setPulling(true);
  }
  function handleTouchEnd() {
    if (pulling) {
      setPulling(false);
      loadAssignments();
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">
      {showConfetti && <MiniConfetti />}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[color-mix(in oklab, var(--accent) 70%, white)] text-white px-4 py-3 shadow-md"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Truck className="h-6 w-6" />
            <span className="font-bold text-lg leading-tight">Buleje Delivery</span>
          </div>

          {/* Toggle Online/Offline */}
          <button
            type="button"
            onClick={() => setIsOnline((v) => !v)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
              transition-colors border-2 border-white/30
              ${isOnline
                ? "bg-white/20 text-white"
                : "bg-[var(--data-error-500)]/20 text-red-200"
              }
            `}
          >
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isOnline ? "Online" : "Offline"}
          </button>

          {/* Avatar */}
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
            <User className="h-4 w-4" />
          </div>
        </div>
      </header>

      {/* Contenido scrolleable */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Indicador pull-to-refresh */}
        {pulling && (
          <div className="flex justify-center py-3">
            <RefreshCw className="h-5 w-5 text-[color-mix(in oklab, var(--accent) 70%, white)] animate-spin" />
          </div>
        )}

        <div className="p-4 space-y-4 max-w-lg mx-auto">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 text-center">
              <p className="text-3xl font-extrabold text-[color-mix(in oklab, var(--accent) 70%, white)]">{todayDeliveries}</p>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1 leading-tight">
                Entregas hoy
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 text-center">
              <p className="text-3xl font-extrabold text-[#f4a261] font-mono">
                S/{todayEarnings.toFixed(2)}
              </p>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1 leading-tight">
                Ganancia hoy
              </p>
            </div>
          </div>

          {/* Botón enviar ubicación */}
          <button
            type="button"
            onClick={() => sendLocation(false)}
            disabled={locationStatus === "sending"}
            className={`
              w-full flex items-center justify-center gap-2
              min-h-[48px] rounded-xl font-bold text-sm
              transition-all active:scale-95
              disabled:opacity-60 disabled:cursor-not-allowed
              ${locationStatus === "ok"
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-[var(--data-success-700)] dark:text-emerald-300"
                : locationStatus === "error"
                ? "bg-red-100 dark:bg-red-900/30 text-[var(--data-error-700)] dark:text-red-300"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }
            `}
          >
            {locationStatus === "sending" ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="h-4 w-4" />
            )}
            {locationStatus === "ok"
              ? "Ubicación enviada"
              : locationStatus === "error"
              ? "Error al obtener ubicación"
              : "Enviar mi ubicación"}
          </button>

          {/* Estado de carga */}
          {loading && (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-gray-900 rounded-2xl h-40 animate-pulse border border-gray-200 dark:border-gray-800"
                />
              ))}
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-center">
              <p className="text-sm text-[var(--data-error-700)] dark:text-red-400 font-semibold">{error}</p>
              <button
                type="button"
                onClick={loadAssignments}
                className="mt-3 text-sm text-[color-mix(in oklab, var(--accent) 70%, white)] font-bold underline"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Pedidos activos */}
          {!loading && !error && (
            <>
              {activeAssignments.length === 0 && deliveredAssignments.length === 0 && (
                <div className="text-center py-12 text-gray-400 dark:text-gray-600">
                  <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold text-sm">Sin pedidos asignados</p>
                  <p className="text-xs mt-1">Desliza hacia abajo para actualizar</p>
                </div>
              )}

              {activeAssignments.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1">
                    Pedidos activos ({activeAssignments.length})
                  </h2>
                  {activeAssignments.map((a) => (
                    <OrderCard
                      key={a.id}
                      assignment={a}
                      onStatusUpdate={handleStatusUpdate}
                      updating={updatingId === a.id}
                    />
                  ))}
                </div>
              )}

              {deliveredAssignments.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1">
                    Entregados hoy ({deliveredAssignments.length})
                  </h2>
                  {deliveredAssignments.map((a) => (
                    <OrderCard
                      key={a.id}
                      assignment={a}
                      onStatusUpdate={handleStatusUpdate}
                      updating={false}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Espacio al fondo para safe area */}
          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}
