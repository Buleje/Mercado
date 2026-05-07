"use client";

/**
 * ManualAssignModal — modal para que el admin asigne manualmente un pedido
 * a un repartidor específico, override de la cascada automática.
 *
 * Flujo:
 *   1. abre con orderId
 *   2. carga partners online del tenant via /api/admin/delivery/partners-live
 *   3. admin clickea uno → POST /api/admin/delivery/manual-assign
 *   4. on success cierra modal + invoca onAssigned(assignmentId)
 */

import { useEffect, useState } from "react";
import {
  X, Loader2, MapPin, Star, CheckCircle2, AlertTriangle, Bike,
} from "@buleje/design-system/icons";

interface Partner {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  isOnline: boolean;
  lat: number | null;
  lng: number | null;
  currentOrderId: string | null;
  rating: number;
  acceptanceRate: number;
  pendingOffers: number;
}

interface Props {
  orderId: string;
  orderLocation?: string | null;
  onClose: () => void;
  onAssigned?: (assignmentId: string) => void;
}

function csrf(): string {
  return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
}

export default function ManualAssignModal({ orderId, orderLocation, onClose, onAssigned }: Props) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ partnerName: string; fee: number } | null>(null);

  useEffect(() => {
    fetch("/api/admin/delivery/partners-live", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { partners: [] }))
      .then((data: { partners: Partner[] }) => {
        // Filtrar solo libres (sin currentOrderId)
        setPartners(data.partners.filter((p) => !p.currentOrderId));
      })
      .catch(() => setError("No pudimos cargar los repartidores."))
      .finally(() => setLoading(false));
  }, []);

  const assign = async (partnerId: string) => {
    if (submitting) return;
    setSubmitting(partnerId);
    setError(null);
    try {
      const res = await fetch("/api/admin/delivery/manual-assign", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ orderId, partnerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos asignar.");
        return;
      }
      const partner = partners.find((p) => p.id === partnerId);
      setSuccess({ partnerName: partner?.name ?? "Repartidor", fee: data.fee });
      onAssigned?.(data.assignmentId);
      setTimeout(onClose, 1500);
    } catch {
      setError("Error de red.");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-[var(--surface-canvas)] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)]">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]">Asignar repartidor manualmente</h2>
            <p className="text-xs text-[var(--text-tertiary)]">Pedido #{orderId.slice(-8)}{orderLocation ? ` · ${orderLocation}` : ""}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--surface-sunken)]">
            <X className="h-5 w-5 text-[var(--text-tertiary)]" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {success && (
            <div className="rounded-xl bg-[var(--data-success-500)]/10 border-2 border-[var(--data-success-500)] p-5 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-[var(--data-success-500)]" strokeWidth={2.25} />
              <p className="mt-2 text-base font-extrabold text-[var(--text-primary)]">
                Asignado a {success.partnerName}
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Se le envió WhatsApp con S/ {Number(success.fee).toFixed(0)} de envío.
              </p>
            </div>
          )}

          {error && !success && (
            <div className="mb-3 rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm font-semibold text-[var(--data-error-700)] dark:text-red-300">
              <AlertTriangle className="inline h-4 w-4 mr-1.5 mb-0.5" />
              {error}
            </div>
          )}

          {!success && loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
          )}

          {!success && !loading && partners.length === 0 && (
            <div className="text-center py-12">
              <Bike className="h-12 w-12 mx-auto text-[var(--text-tertiary)]" />
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                No hay repartidores online y libres ahora.
              </p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Esperá a que prendan el modo en línea o usá la cascada automática.
              </p>
            </div>
          )}

          {!success && !loading && partners.length > 0 && (
            <div className="space-y-2">
              {partners.map((p) => (
                <button
                  key={p.id}
                  onClick={() => assign(p.id)}
                  disabled={submitting !== null}
                  className="w-full flex items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-left hover:border-[var(--accent)] transition-colors disabled:opacity-50"
                >
                  <div className="h-10 w-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-extrabold shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-[var(--text-primary)] text-sm">{p.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-2">
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="h-3 w-3 text-[var(--data-warning-500)]" />{Number(p.rating).toFixed(1)}
                      </span>
                      <span>· {Math.round(p.acceptanceRate * 100)}%</span>
                      <span>· {p.vehicleType}</span>
                      {p.lat != null && p.lng != null && (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" /> GPS
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    {submitting === p.id ? (
                      <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
                    ) : (
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                        Asignar
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
