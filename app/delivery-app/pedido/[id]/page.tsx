"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CheckCircle2, Package, Truck, MapPin, Phone, Loader2,
  ArrowRight, AlertTriangle, Receipt, MessageCircle,
} from "@buleje/design-system/icons";

interface Assignment {
  id: string;
  status: "assigned" | "picked_up" | "in_transit" | "delivered" | "cancelled";
  fee: number;
  pickedUpAt: string | null;
  deliveredAt: string | null;
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

const STATUS_LABEL: Record<string, string> = {
  assigned: "Asignado",
  picked_up: "Recogido",
  in_transit: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  assigned: "bg-amber-500",
  picked_up: "bg-blue-500",
  in_transit: "bg-[var(--accent)]",
  delivered: "bg-[var(--data-success)]",
  cancelled: "bg-gray-400",
};

const NEXT_ACTION: Record<string, { label: string; nextStatus: string; icon: React.ReactNode } | null> = {
  assigned: { label: "Marcar como recogido", nextStatus: "picked_up", icon: <Package className="h-5 w-5" /> },
  picked_up: { label: "Salí en camino", nextStatus: "in_transit", icon: <Truck className="h-5 w-5" /> },
  in_transit: { label: "Marcar entregado", nextStatus: "delivered", icon: <CheckCircle2 className="h-5 w-5" /> },
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
          <AlertTriangle className="h-16 w-16 mx-auto text-amber-500" />
          <p className="mt-3 text-[var(--text-secondary)]">{error}</p>
          <button
            onClick={() => router.push("/delivery-app")}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 font-bold text-white text-sm"
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

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] flex flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <h1 className="font-extrabold text-[var(--text-primary)]">Pedido #{assignment.order.id.slice(-8)}</h1>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white ${STATUS_COLOR[assignment.status]}`}>
            {STATUS_LABEL[assignment.status]}
          </span>
        </div>
      </header>

      <section className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full pb-32 space-y-5">
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Cliente</p>
          <p className="mt-1 text-lg font-extrabold text-[var(--text-primary)]">{assignment.order.customerName}</p>
          {assignment.order.customerPhone && (
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={`tel:${assignment.order.customerPhone}`} className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-sunken)] px-3 py-1.5 text-sm font-bold text-[var(--text-primary)]">
                <Phone className="h-3.5 w-3.5" />
                {assignment.order.customerPhone}
              </a>
              <a href={`https://wa.me/51${assignment.order.customerPhone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-1.5 text-sm font-bold text-white">
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </a>
            </div>
          )}
        </div>

        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> Dirección de entrega
          </p>
          <p className="mt-1 text-base font-bold text-[var(--text-primary)]">
            {assignment.order.customerLocation ?? "—"}
          </p>
          {assignment.order.customerReference && (
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">Referencia: {assignment.order.customerReference}</p>
          )}
          {assignment.order.customerLocation && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(assignment.order.customerLocation)}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-3 py-1.5 text-sm font-bold text-white">
              <MapPin className="h-3.5 w-3.5" />
              Abrir en Maps
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1">
            <Receipt className="h-3.5 w-3.5" /> Pedido
          </p>
          <ul className="mt-2 space-y-1.5">
            {assignment.order.items.map((item, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span className="text-[var(--text-primary)]">{item.name}</span>
                <span className="font-bold text-[var(--text-secondary)]">{item.quantity} {item.unit}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-[var(--rule-base)] flex justify-between">
            <span className="font-bold text-[var(--text-primary)]">Total cliente</span>
            <span className="font-extrabold text-[var(--text-primary)]">S/ {assignment.order.total.toFixed(2)}</span>
          </div>
          <div className="mt-1.5 flex justify-between text-sm">
            <span className="font-semibold text-[var(--accent)]">Tu pago</span>
            <span className="font-extrabold text-[var(--accent)]">S/ {assignment.fee.toFixed(2)}</span>
          </div>
        </div>

        {assignment.order.notes && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <strong>Nota del cliente:</strong> {assignment.order.notes}
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {isDone && (
          <div className="rounded-2xl bg-[var(--data-success)]/10 border-2 border-[var(--data-success)] p-5 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-[var(--data-success)]" strokeWidth={2.25} />
            <p className="mt-2 text-lg font-extrabold text-[var(--text-primary)]">
              ¡{assignment.status === "delivered" ? "Pedido entregado" : "Pedido cancelado"}!
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Te llevamos al panel en unos segundos…</p>
          </div>
        )}
      </section>

      {action && (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--surface-canvas)] border-t border-[var(--rule-base)] p-4">
          <div className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={() => advance(action.nextStatus)}
              disabled={submitting}
              className="w-full h-14 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--data-success)] text-base font-extrabold text-white shadow-lg disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : action.icon}
              {action.label}
            </button>
            {assignment.status !== "delivered" && (
              <button
                type="button"
                onClick={() => { if (confirm("¿Cancelar este pedido? Esto libera tu cuenta para otros.")) advance("cancelled"); }}
                disabled={submitting}
                className="mt-2 w-full h-10 inline-flex items-center justify-center text-sm font-semibold text-red-600 dark:text-red-400 disabled:opacity-50"
              >
                Cancelar pedido
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
