"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2, ArrowRight, AlertTriangle, ArrowLeft, Check,
} from "@buleje/design-system/icons";
import {
  PackageIcon,
  PinIcon,
  CheckBadge,
  PhoneRing,
  WhatsAppIcon,
  MotoIcon,
  RouteIcon,
} from "@/components/delivery/icons";

interface Assignment {
  id: string;
  status: "assigned" | "picked_up" | "in_transit" | "delivered" | "cancelled";
  fee: number;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  /** JSON serializado: { proofPhotoUrl?, proofTakenAt?, text? }. */
  notes: string | null;
  order: {
    id: string;
    customerName: string;
    customerPhone: string | null;
    customerLocation: string | null;
    customerReference: string | null;
    total: number;
    notes: string | null;
    items: { name: string; quantity: number; unit: string }[];
  };
}

/** Extrae la URL de la foto de prueba si está guardada en `notes` JSON. */
function getProofUrl(notes: string | null): string | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { proofPhotoUrl?: string };
    return typeof parsed.proofPhotoUrl === "string" ? parsed.proofPhotoUrl : null;
  } catch {
    return null;
  }
}

const STEPS: { key: Assignment["status"]; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "assigned", label: "Asignado", icon: PackageIcon },
  { key: "picked_up", label: "Recogido", icon: PackageIcon },
  { key: "in_transit", label: "En camino", icon: MotoIcon },
  { key: "delivered", label: "Entregado", icon: CheckBadge },
];

const STATUS_INDEX: Record<Assignment["status"], number> = {
  assigned: 0,
  picked_up: 1,
  in_transit: 2,
  delivered: 3,
  cancelled: 0,
};

const NEXT_ACTION: Record<Assignment["status"], { label: string; nextStatus: Assignment["status"] } | null> = {
  assigned: { label: "Marcar como recogido", nextStatus: "picked_up" },
  picked_up: { label: "Salí en camino", nextStatus: "in_transit" },
  in_transit: { label: "Marcar entregado", nextStatus: "delivered" },
  delivered: null,
  cancelled: null,
};

function csrf(): string {
  return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
}

export default function PedidoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const assignmentId = params?.id;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const load = useCallback(async () => {
    if (!assignmentId) return;
    try {
      const res = await fetch(`/api/delivery/me/assignments/${assignmentId}`, { credentials: "include" });
      if (res.status === 401) { router.push("/delivery-app/login"); return; }
      if (res.status === 404) { setError("Pedido no encontrado o no es tuyo."); return; }
      const data: { assignment: Assignment } = await res.json();
      setAssignment(data.assignment);
      setError(null);
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  }, [assignmentId, router]);

  useEffect(() => { load(); }, [load]);

  const uploadProof = async (file: File) => {
    if (!assignmentId || uploadingProof) return;
    setUploadingProof(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/delivery/me/assignments/${assignmentId}/proof`, {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": csrf() },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos subir la foto.");
        return;
      }
      await load();
    } catch {
      setError("Error de red al subir la foto.");
    } finally {
      setUploadingProof(false);
    }
  };

  const advance = async (nextStatus: string) => {
    if (submitting || !assignmentId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/delivery/me/assignments/${assignmentId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos actualizar el estado.");
        return;
      }
      await load();
      if (nextStatus === "delivered") setTimeout(() => router.push("/delivery-app"), 2000);
    } catch {
      setError("Error de red.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  if (error && !assignment) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] px-4">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-16 w-16 mx-auto text-[var(--brand-secondary)]" />
          <p className="mt-3 text-base text-[var(--text-secondary)]">{error}</p>
          <button
            type="button"
            onClick={() => router.push("/delivery-app")}
            className="mt-5 inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[var(--accent)] font-extrabold text-white"
          >
            Volver al panel
          </button>
        </div>
      </main>
    );
  }

  if (!assignment) return null;
  const action = NEXT_ACTION[assignment.status];
  const isDone = assignment.status === "delivered" || assignment.status === "cancelled";
  const stepIndex = STATUS_INDEX[assignment.status];
  const proofUrl = getProofUrl(assignment.notes);
  // Photo proof requerido para marcar entregado. Se muestra/edita
  // a partir de "in_transit" — ya estás cerca del cliente.
  const showProofCapture =
    assignment.status === "in_transit" || assignment.status === "picked_up";
  const needsProofToDeliver = action?.nextStatus === "delivered" && !proofUrl;

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
            className="h-10 w-10 rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] inline-flex items-center justify-center hover:bg-[var(--surface-canvas)]"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              Pedido en curso
            </p>
            <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
              #{assignment.order.id.slice(-8)}
            </p>
          </div>
          <span className="text-base font-extrabold text-[var(--accent)] tabular-nums">
            S/ {Number(assignment.fee).toFixed(2)}
          </span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10 pb-44 lg:pb-32 space-y-6">
        {/* Stepper */}
        <Stepper currentIndex={stepIndex} cancelled={assignment.status === "cancelled"} />

        <div className="grid lg:grid-cols-2 gap-5 lg:gap-6">
          {/* Cliente */}
          <Card title="Cliente" icon={<PinIcon className="h-5 w-5 text-[var(--accent)]" />}>
            <p className="text-xl lg:text-2xl font-extrabold text-[var(--text-primary)]">
              {assignment.order.customerName}
            </p>
            {assignment.order.customerPhone && (
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`tel:${assignment.order.customerPhone}`}
                  className="inline-flex items-center gap-2 h-11 px-4 rounded-2xl bg-[var(--surface-sunken)] text-base font-extrabold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] border-2 border-[var(--rule-base)]"
                >
                  <PhoneRing className="h-5 w-5" />
                  Llamar
                </a>
                <a
                  href={`https://wa.me/51${assignment.order.customerPhone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-11 px-4 rounded-2xl bg-[var(--data-success-500)] text-base font-extrabold text-white"
                >
                  <WhatsAppIcon className="h-5 w-5" />
                  WhatsApp
                </a>
              </div>
            )}
          </Card>

          {/* Dirección */}
          <Card title="Dirección de entrega" icon={<RouteIcon className="h-5 w-5 text-[var(--accent)]" />}>
            <p className="text-base lg:text-lg font-bold text-[var(--text-primary)]">
              {assignment.order.customerLocation ?? "Sin dirección"}
            </p>
            {assignment.order.customerReference && (
              <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
                Referencia: {assignment.order.customerReference}
              </p>
            )}
            {assignment.order.customerLocation && (
              <div className="mt-3 flex flex-wrap gap-2">
                {/* "Iniciar ruta" — turn-by-turn navigation. En Android/iOS
                    abre la app de Google Maps en modo navegación; en
                    desktop abre el sitio web en mismo modo. */}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(assignment.order.customerLocation)}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-[var(--accent)] text-base font-extrabold text-white shadow-lg shadow-[var(--accent)]/30 hover:shadow-xl hover:shadow-[var(--accent)]/40 active:scale-[0.98] transition-all"
                >
                  <RouteIcon className="h-5 w-5" />
                  Iniciar ruta
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </a>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(assignment.order.customerLocation)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)]"
                >
                  Ver punto
                </a>
              </div>
            )}
          </Card>
        </div>

        {/* Pedido */}
        <Card title="Detalle del pedido" icon={<PackageIcon className="h-5 w-5 text-[var(--accent)]" />}>
          <ul className="space-y-2">
            {assignment.order.items.map((item, i) => (
              <li key={i} className="flex justify-between gap-3 py-2 border-b border-[var(--rule-base)] last:border-0">
                <span className="text-base font-bold text-[var(--text-primary)]">
                  {item.name}
                </span>
                <span className="text-base font-extrabold text-[var(--text-secondary)] tabular-nums shrink-0">
                  {item.quantity} {item.unit}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-4 border-t-2 border-[var(--rule-base)] grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                Total cliente
              </p>
              <p className="mt-1 text-xl font-extrabold text-[var(--text-primary)] tabular-nums">
                S/ {Number(assignment.order.total).toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--accent)]">
                Tu pago
              </p>
              <p className="mt-1 text-xl font-extrabold text-[var(--accent)] tabular-nums">
                S/ {Number(assignment.fee).toFixed(2)}
              </p>
            </div>
          </div>
        </Card>

        {assignment.order.notes && (
          <div className="rounded-2xl border-2 border-[var(--brand-secondary)]/30 bg-[var(--brand-secondary)]/5 px-5 py-4">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--brand-secondary)]">
              Nota del cliente
            </p>
            <p className="mt-1 text-base font-bold text-[var(--text-primary)]">
              {assignment.order.notes}
            </p>
          </div>
        )}

        {/* ── Photo proof — gate de "delivered" ─────────────────── */}
        {(showProofCapture || proofUrl) && !isDone && (
          <Card
            title="Foto de entrega"
            icon={<CheckBadge className="h-5 w-5 text-[var(--accent)]" />}
          >
            {proofUrl ? (
              <div className="space-y-3">
                <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden border-2 border-[var(--data-success-500)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proofUrl}
                    alt="Foto de entrega"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-[var(--data-success-500)] px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white shadow-md">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    Lista
                  </span>
                </div>
                <label
                  htmlFor="proof-input"
                  className={`block text-sm font-extrabold text-[var(--accent)] cursor-pointer ${uploadingProof ? "opacity-50 pointer-events-none" : ""}`}
                >
                  {uploadingProof ? "Subiendo…" : "Reemplazar foto"}
                </label>
                <input
                  id="proof-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadProof(f);
                    e.target.value = "";
                  }}
                />
              </div>
            ) : (
              <>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
                  Tomá una foto del pedido en la puerta del cliente.
                  <strong className="text-[var(--text-primary)]"> Es obligatoria</strong> para
                  marcar como entregado.
                </p>
                <label
                  htmlFor="proof-input"
                  className={`inline-flex items-center justify-center gap-2 h-14 px-6 rounded-2xl bg-[var(--accent)] text-base font-extrabold text-white shadow-lg shadow-[var(--accent)]/30 cursor-pointer hover:shadow-xl active:scale-[0.98] transition-all ${uploadingProof ? "opacity-60 pointer-events-none" : ""}`}
                >
                  {uploadingProof ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Subiendo…
                    </>
                  ) : (
                    <>
                      📸 Tomar foto de entrega
                    </>
                  )}
                </label>
                <input
                  id="proof-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadProof(f);
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </Card>
        )}

        {error && (
          <div role="alert" className="rounded-2xl bg-[var(--brand-danger)]/10 border-2 border-[var(--brand-danger)]/30 px-4 py-3 text-base font-bold text-[var(--brand-danger)]">
            {error}
          </div>
        )}

        {isDone && (
          <div className="rounded-3xl bg-[var(--data-success-500)]/10 border-2 border-[var(--data-success-500)] p-6 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--data-success-500)] text-white">
              <CheckBadge className="h-10 w-10" />
            </div>
            <p className="mt-3 text-xl font-extrabold text-[var(--text-primary)]">
              ¡{assignment.status === "delivered" ? "Pedido entregado" : "Pedido cancelado"}!
            </p>
            <p className="mt-1 text-base text-[var(--text-secondary)]">
              Te llevamos al panel en unos segundos…
            </p>
          </div>
        )}
      </div>

      {/* CTA sticky */}
      {action && (
        <div
          className="fixed bottom-0 left-0 right-0 bg-[var(--surface-raised)] border-t border-[var(--rule-base)] p-4"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
        >
          <div className="max-w-3xl mx-auto space-y-2">
            <button
              type="button"
              onClick={() => {
                if (needsProofToDeliver) {
                  setError("Tomá la foto de entrega antes de marcar como entregado.");
                  document.getElementById("proof-input")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  return;
                }
                advance(action.nextStatus);
              }}
              disabled={submitting}
              className={`w-full h-14 inline-flex items-center justify-center gap-2 rounded-2xl text-base lg:text-lg font-extrabold text-white shadow-lg disabled:opacity-50 transition-all ${
                needsProofToDeliver
                  ? "bg-[var(--text-tertiary)] cursor-not-allowed"
                  : "bg-[var(--data-success-500)] shadow-[var(--data-success)]/30"
              }`}
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={2.5} />}
              {needsProofToDeliver ? "Tomá la foto primero" : action.label}
            </button>
            {assignment.status !== "delivered" && (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                disabled={submitting}
                className="w-full h-11 inline-flex items-center justify-center text-sm font-extrabold text-[var(--brand-danger)] disabled:opacity-50"
              >
                Cancelar pedido
              </button>
            )}
          </div>
        </div>
      )}
      {/* Modal de confirmacion de cancelacion — reemplaza confirm() nativo (bloqueante en mobile) */}
      {showCancelModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-6 sm:pb-0"
        >
          <div className="w-full max-w-sm rounded-3xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] p-6 space-y-4 shadow-2xl">
            <h2
              id="cancel-modal-title"
              className="text-lg font-extrabold text-[var(--text-primary)]"
            >
              Cancelar pedido
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Esto libera tu cuenta para otros pedidos.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  advance("cancelled");
                }}
                disabled={submitting}
                className="w-full h-12 rounded-2xl bg-[var(--brand-danger)] text-base font-extrabold text-white disabled:opacity-50"
              >
                {submitting ? "Cancelando…" : "Si, cancelar"}
              </button>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="w-full h-11 rounded-2xl border-2 border-[var(--rule-base)] text-sm font-extrabold text-[var(--text-primary)]"
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 lg:p-6">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Stepper({ currentIndex, cancelled }: { currentIndex: number; cancelled: boolean }) {
  if (cancelled) {
    return (
      <div className="rounded-2xl bg-[var(--surface-sunken)] border-2 border-[var(--rule-base)] px-5 py-4 text-center">
        <p className="text-base font-extrabold text-[var(--brand-danger)]">Pedido cancelado</p>
      </div>
    );
  }
  return (
    <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 lg:p-6">
      <div className="flex items-center gap-2 lg:gap-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const done = i < currentIndex;
          const active = i === currentIndex;
          const reached = done || active;
          return (
            <div key={step.key} className="flex-1 flex items-center gap-2 lg:gap-3 min-w-0">
              <div className="flex flex-col items-center min-w-0">
                <div
                  className={`h-10 w-10 lg:h-12 lg:w-12 rounded-2xl flex items-center justify-center transition-colors ${
                    done
                      ? "bg-[var(--data-success-500)] text-white"
                      : active
                      ? "bg-[var(--accent)] text-white ring-4 ring-[var(--accent-soft)]"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                  }`}
                >
                  {done ? <Check className="h-5 w-5" strokeWidth={3} /> : <Icon className="h-5 w-5 lg:h-6 lg:w-6" />}
                </div>
                <span
                  className={`mt-1.5 text-[11px] lg:text-xs font-extrabold uppercase tracking-wider truncate max-w-[70px] lg:max-w-full ${
                    reached ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-1 rounded-full ${
                    done ? "bg-[var(--data-success-500)]" : "bg-[var(--surface-sunken)]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
