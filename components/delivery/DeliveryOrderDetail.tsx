"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  ArrowLeft,
  Package,
  MapPin,
  Phone,
  User,
  DollarSign,
  CheckCircle,
  Camera,
  RefreshCw,
  ClipboardList,
  AlertCircle,
} from "@buleje/design-system/icons";
import SignatureCanvas from "@/components/delivery/SignatureCanvas";

// Leaflet no funciona en SSR — carga lazy obligatoria
const DeliveryMap = dynamic(() => import("@/components/delivery/DeliveryMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-52 rounded-xl bg-[var(--surface-sunken)] dark:bg-gray-800 animate-pulse flex items-center justify-center">
      <MapPin className="h-6 w-6 text-gray-400" />
    </div>
  ),
});

// ── Tipos ──────────────────────────────────────────────────────────────────

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  image: string;
}

interface Assignment {
  id: string;
  orderId: string;
  status: "assigned" | "picked_up" | "in_transit" | "delivered";
  fee: number;
  deliveredAt?: string;
  order: {
    id: string;
    customerName: string;
    customerPhone?: string;
    customerLocation: string;
    customerReference: string;
    total: number;
    notes?: string;
    paymentMethod?: string;
    createdAt: string;
    items: OrderItem[];
  };
  partner: { id: string; name: string; phone: string };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Intenta parsear coordenadas desde strings tipo "-8.379,-74.553" o "lat:-8,lng:-74" */
function parseCoords(location: string): { lat: number; lng: number } | null {
  const match = location.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }
  return null;
}

// Coordenadas de Pucallpa como fallback cuando no hay coords en la dirección
const PUCALLPA_COORDS = { lat: -8.3791, lng: -74.5539 };

// ── Modal de confirmación ─────────────────────────────────────────────────

interface ConfirmModalProps {
  orderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function ConfirmDeliveryModal({ orderId, onClose, onSuccess }: ConfirmModalProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhoto(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/delivery/confirm", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          orderId,
          photo: photo ?? undefined,
          signature: signature ?? undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al confirmar");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al confirmar la entrega");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="
          w-full max-w-md bg-white dark:bg-gray-900
          rounded-t-3xl shadow-2xl overflow-y-auto
          max-h-[92dvh]
        "
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Handle visual */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-[var(--rule-base)] dark:bg-gray-700" />
        </div>

        <div className="px-4 pb-6 space-y-5">
          <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">
            Confirmar entrega
          </h2>

          {/* Foto de entrega */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Foto de entrega (opcional)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoCapture}
            />
            {photo ? (
              <div className="relative">
                <Image
                  src={photo}
                  alt="Foto de entrega"
                  width={400}
                  height={160}
                  unoptimized
                  className="w-full h-40 object-cover rounded-xl border border-gray-200 dark:border-gray-700"
                />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full px-2 py-0.5 text-xs"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="
                  w-full min-h-[80px] rounded-xl
                  border-2 border-dashed border-gray-300 dark:border-gray-700
                  flex flex-col items-center justify-center gap-2
                  text-gray-400 dark:text-gray-600
                  hover:border-primary hover:text-primary
                  transition-colors active:scale-95
                "
              >
                <Camera className="h-6 w-6" />
                <span className="text-sm font-semibold">Tomar foto</span>
              </button>
            )}
          </div>

          {/* Firma digital */}
          <SignatureCanvas
            onConfirm={(dataUrl) => setSignature(dataUrl)}
            onClear={() => setSignature(null)}
          />

          {signature && (
            <p className="text-xs text-[var(--data-success-600)] dark:text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" />
              Firma guardada
            </p>
          )}

          {/* Notas opcionales */}
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-2">
              Notas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Entregado a vecino, dejado en portería..."
              rows={2}
              maxLength={500}
              className="
                w-full rounded-xl border border-gray-300 dark:border-gray-700
                bg-white dark:bg-gray-800
                text-sm text-gray-900 dark:text-white
                placeholder:text-gray-400
                px-3 py-2.5 resize-none
                focus:outline-none focus:ring-2 focus:ring-primary
              "
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-[var(--data-error-500)] shrink-0" />
              <p className="text-sm text-[var(--data-error-700)] dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Botones */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="
                min-h-[52px] rounded-xl
                bg-[var(--surface-sunken)] dark:bg-gray-800
                text-gray-700 dark:text-gray-300
                font-bold text-sm
                hover:bg-[var(--rule-soft)] dark:hover:bg-gray-700
                active:scale-95 transition-all
                disabled:opacity-50
              "
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="
                min-h-[52px] rounded-xl
                bg-[var(--data-success-600)] hover:bg-[var(--data-success-700)]
                text-white font-bold text-sm
                active:scale-95 transition-all
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2
              "
            >
              {submitting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              {submitting ? "Enviando..." : "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

interface DeliveryOrderDetailProps {
  orderId: string;
}

export default function DeliveryOrderDetail({ orderId }: DeliveryOrderDetailProps) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [delivered, setDelivered] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Buscar la asignación de este pedido específico
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/delivery/my-orders?date=${today}`);
      if (!res.ok) throw new Error("Error al cargar el pedido");
      const data: Assignment[] = await res.json();
      const found = data.find((a) => a.orderId === orderId);
      if (!found) throw new Error("Pedido no encontrado en tus asignaciones");
      setAssignment(found);
      if (found.status === "delivered") setDelivered(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDeliverySuccess() {
    setShowConfirmModal(false);
    setDelivered(true);
    // Actualizar estado local sin refetch
    setAssignment((prev) =>
      prev
        ? { ...prev, status: "delivered", deliveredAt: new Date().toISOString() }
        : prev
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-[var(--surface-alt)] dark:bg-gray-950">
        <div className="p-4 space-y-3 max-w-md mx-auto w-full">
          <div className="h-8 w-32 bg-[var(--rule-soft)] dark:bg-gray-800 rounded-lg animate-pulse" />
          <div className="h-52 rounded-xl bg-[var(--rule-soft)] dark:bg-gray-800 animate-pulse" />
          <div className="h-40 rounded-xl bg-[var(--rule-soft)] dark:bg-gray-800 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="flex flex-col min-h-screen bg-[var(--surface-alt)] dark:bg-gray-950">
        <div className="p-4 max-w-md mx-auto w-full">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4 min-h-[44px]"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5 text-center">
            <AlertCircle className="h-8 w-8 text-[var(--data-error-500)] mx-auto mb-2" />
            <p className="font-semibold text-[var(--data-error-700)] dark:text-red-400 text-sm">
              {error ?? "Pedido no encontrado"}
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-3 text-sm text-primary font-bold underline"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { order } = assignment;
  const coords = parseCoords(order.customerLocation) ?? PUCALLPA_COORDS;
  const hasCoords = parseCoords(order.customerLocation) !== null;

  return (
    <>
      <div className="flex flex-col min-h-screen bg-[var(--surface-alt)] dark:bg-gray-950">
        {/* Header */}
        <header
          className="sticky top-0 z-30 bg-primary text-white px-4 py-3 shadow-md flex items-center gap-3"
          style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={() => window.history.back()}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center -ml-1 rounded-xl hover:bg-white/10 transition-colors"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base leading-tight truncate">
              #{order.id.slice(-8).toUpperCase()}
            </p>
            <p className="text-xs text-white/70 truncate">{order.customerName}</p>
          </div>
          {delivered && (
            <span className="bg-[var(--data-success-500)] text-white text-xs font-bold px-3 py-1 rounded-full">
              Entregado
            </span>
          )}
        </header>

        <div
          className="flex-1 overflow-y-auto p-4 space-y-4 max-w-md mx-auto w-full"
          style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}
        >
          {/* Mapa */}
          <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <h2 className="font-bold text-sm text-gray-900 dark:text-white">Destino</h2>
            </div>

            <div>
              <p className="text-sm text-gray-700 dark:text-gray-200 font-semibold leading-snug">
                {order.customerLocation || "Sin dirección"}
              </p>
              {order.customerReference && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Ref: {order.customerReference}
                </p>
              )}
              {!hasCoords && (
                <p className="text-xs text-[var(--data-warning-600)] dark:text-amber-400 mt-1">
                  Sin coordenadas exactas — mapa centrado en Pucallpa
                </p>
              )}
            </div>

            <DeliveryMap
              destLat={coords.lat}
              destLng={coords.lng}
              destLabel={order.customerLocation || order.customerName}
            />
          </section>

          {/* Datos del cliente */}
          <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary shrink-0" />
              <h2 className="font-bold text-sm text-gray-900 dark:text-white">Cliente</h2>
            </div>

            <p className="text-sm font-bold text-gray-900 dark:text-white">
              {order.customerName}
            </p>

            {order.customerPhone && (
              <a
                href={`tel:${order.customerPhone}`}
                className="
                  flex items-center gap-2
                  min-h-[48px] rounded-xl
                  bg-[var(--surface-sunken)] dark:bg-gray-800
                  text-gray-700 dark:text-gray-300
                  font-semibold text-sm px-3
                  hover:bg-[var(--rule-soft)] dark:hover:bg-gray-700
                  active:scale-95 transition-all
                "
              >
                <Phone className="h-4 w-4 shrink-0" />
                {order.customerPhone}
              </a>
            )}

            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-gray-400 shrink-0" />
              <span className="font-mono font-bold text-gray-900 dark:text-white">
                S/ {Number(order.total).toFixed(2)}
              </span>
              {order.paymentMethod && (
                <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  · {order.paymentMethod}
                </span>
              )}
            </div>

            {order.notes && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
                <p className="text-xs font-semibold text-[var(--data-warning-700)] dark:text-amber-400 mb-1">
                  Notas del pedido
                </p>
                <p className="text-sm text-amber-900 dark:text-amber-200">{order.notes}</p>
              </div>
            )}
          </section>

          {/* Items del pedido */}
          <section className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="h-4 w-4 text-primary shrink-0" />
              <h2 className="font-bold text-sm text-gray-900 dark:text-white">
                Items ({order.items.length})
              </h2>
            </div>

            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {order.items.map((item) => (
                <li key={item.id} className="py-2.5 flex items-center gap-3">
                  <div className="relative h-9 w-9 rounded-lg bg-[var(--surface-sunken)] dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    ) : (
                      <Package className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {item.quantity} {item.unit}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-bold text-gray-900 dark:text-white shrink-0">
                    S/ {(item.price * item.quantity).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Botón flotante de confirmar entrega */}
        {!delivered && (
          <div
            className="fixed bottom-0 left-0 right-0 z-20 px-4 pb-4 bg-linear-to-t from-gray-50 dark:from-gray-950 pt-3"
            style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
          >
            <div className="max-w-md mx-auto">
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                className="
                  w-full min-h-[56px] rounded-2xl
                  bg-[var(--data-success-600)] hover:bg-[var(--data-success-700)]
                  text-white font-extrabold text-base
                  flex items-center justify-center gap-2
                  shadow-lg shadow-emerald-500/30
                  active:scale-[0.98] transition-all
                "
              >
                <CheckCircle className="h-5 w-5" />
                Marcar como entregado
              </button>
            </div>
          </div>
        )}

        {/* Banner entregado */}
        {delivered && (
          <div
            className="fixed bottom-0 left-0 right-0 z-20 px-4 pb-4"
            style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
          >
            <div className="max-w-md mx-auto">
              <div className="w-full min-h-[56px] rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center gap-2">
                <CheckCircle className="h-5 w-5 text-[var(--data-success-600)] dark:text-emerald-400" />
                <span className="font-extrabold text-[var(--data-success-700)] dark:text-emerald-300">
                  Entrega confirmada
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {showConfirmModal && (
        <ConfirmDeliveryModal
          orderId={orderId}
          onClose={() => setShowConfirmModal(false)}
          onSuccess={handleDeliverySuccess}
        />
      )}
    </>
  );
}
