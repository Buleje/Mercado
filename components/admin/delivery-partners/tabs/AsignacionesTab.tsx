"use client";
import { useState, useEffect, useCallback } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, CheckCircle, ChevronDown, ClipboardList, Clock, DollarSign, Plus, Truck, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import { TableSkeleton, toNum, type DeliveryPartner } from "@/components/admin/delivery-partners/shared";
import { Field } from "@/components/admin/shared/Field";

interface DeliveryAssignment {
  id: string;
  orderId: string;
  partnerId: string;
  partnerName: string;
  status: string;
  fee: number | string;
  assignedAt: string;
  deliveredAt?: string;
  notes?: string;
}


const ASSIGNMENT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  assigned:    { label: "Pendiente",  className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" },
  picked_up:   { label: "Recogido",   className: "bg-primary/10 text-primary" },
  in_transit:  { label: "En camino",  className: "bg-primary/10 text-primary" },
  delivered:   { label: "Entregado",  className: "bg-[var(--accent-soft)] text-[var(--data-success-500)]" },
  cancelled:   { label: "Cancelado",  className: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" },
};
// Permisos canónicos sincronizados con /api/store-permissions

export function AsignacionesTab() {
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [partners, setPartners]       = useState<DeliveryPartner[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState<{ open: boolean; orderId?: string }>({ open: false });
  const [selectedPartner, setSelectedPartner] = useState("");
  const [assigning, setAssigning]     = useState(false);

  // Cada fetch maneja su propio error para que partners siga cargando
  // aunque assignments falle (y viceversa) — antes Promise.all rejected
  // descartaba ambos y dejaba la UI sin partners para asignar.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [aRes, pRes] = await Promise.allSettled([
      tenantFetch("/api/delivery/assignments")
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(`assignments ${r.status}: ${body.detail ?? body.error ?? "unknown"}`);
          }
          return r.json();
        }),
      tenantFetch("/api/delivery/partners")
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(`partners ${r.status}: ${body.detail ?? body.error ?? "unknown"}`);
          }
          return r.json();
        }),
    ]);

    if (aRes.status === "fulfilled") {
      setAssignments(Array.isArray(aRes.value) ? aRes.value : []);
    } else {
      setAssignments([]);
      // Mostramos el detail real para diagnosticar (el endpoint lo expone solo en dev).
      const reason = aRes.reason instanceof Error ? aRes.reason.message : String(aRes.reason);
      setError(`No se pudieron cargar las asignaciones — ${reason}`);
    }

    if (pRes.status === "fulfilled" && Array.isArray(pRes.value)) {
      setPartners(pRes.value.filter((x: DeliveryPartner) => x.isActive));
    } else {
      setPartners([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async () => {
    if (!selectedPartner) {
      setError("Seleccioná un repartidor primero.");
      return;
    }
    if (!assignModal.orderId) {
      setError("Ingresá un ID de orden.");
      return;
    }
    // El endpoint requiere `fee` — usamos la tarifa del partner seleccionado.
    const partner = partners.find((p) => p.id === selectedPartner);
    const fee = toNum(partner?.fee ?? 0);

    setAssigning(true);
    setError(null);
    try {
      const res = await tenantFetch("/api/delivery/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: assignModal.orderId,
          partnerId: selectedPartner,
          fee,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const saved = await res.json();
      setAssignments((prev) => [saved, ...prev]);
      setAssignModal({ open: false });
      setSelectedPartner("");
    } catch (err) {
      setError(`Error al crear la asignación: ${err instanceof Error ? err.message : "desconocido"}`);
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return <TableSkeleton />;

  // Derivados para KPIs — usa los status reales del backend (VALID_TRANSITIONS)
  const pendientes  = assignments.filter((a) => a.status === "assigned").length;
  const enCamino    = assignments.filter((a) => ["picked_up", "in_transit"].includes(a.status)).length;
  const entregadas  = assignments.filter((a) => a.status === "delivered").length;
  const canceladas  = assignments.filter((a) => a.status === "cancelled").length;
  const ingresos    = assignments
    .filter((a) => a.status === "delivered")
    .reduce((acc, a) => acc + toNum(a.fee), 0);
  const partnersActivos = partners.length;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-2xl text-sm text-[var(--data-error-500)]">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="font-bold">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto p-1 rounded-lg hover:bg-[var(--data-error-100)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── 1. Hero card con KPIs ──────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Asignaciones de delivery
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {assignments.length === 0
                  ? "Acá vas a ver las órdenes asignadas a cada repartidor en tiempo real."
                  : `${assignments.length} ${assignments.length === 1 ? "asignación" : "asignaciones"} · ${partnersActivos} ${partnersActivos === 1 ? "repartidor activo" : "repartidores activos"}.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAssignModal({ open: true })}
            disabled={partnersActivos === 0}
            title={partnersActivos === 0 ? "No hay repartidores activos disponibles" : "Asignar nueva orden"}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 shrink-0"
          >
            <Plus className="h-4 w-4" />
            Asignar orden
          </button>
        </div>

        {assignments.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--data-warning-50)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-warning-100)]">
                  <Clock className="h-5 w-5 text-[var(--data-warning-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Pendientes
              </p>
              <p className={cn(
                "text-3xl font-extrabold tabular-nums leading-tight mt-2",
                pendientes > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)]",
              )}>
                {pendientes}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Por despachar</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Truck className="h-5 w-5 text-primary" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                En camino
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-primary leading-tight mt-2">
                {enCamino}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Activas ahora</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                  <CheckCircle className="h-5 w-5 text-[var(--data-success-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Entregadas
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-success-500)] leading-tight mt-2">
                {entregadas}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Completadas</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                  <DollarSign className="h-5 w-5 text-[var(--data-success-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Ingresos
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-2">
                S/{ingresos.toFixed(0)}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Tarifas cobradas</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Tabla / Empty state ─────────────────────────────────── */}
      {assignments.length === 0 && !error ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
            <ClipboardList className="h-8 w-8 text-[var(--text-tertiary)]" />
          </span>
          <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
            Sin asignaciones registradas
          </p>
          <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
            Asigná un repartidor a una orden pendiente y se mostrará acá con su estado en vivo.
          </p>
          <button
            type="button"
            onClick={() => setAssignModal({ open: true })}
            disabled={partnersActivos === 0}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 mt-6"
          >
            <Plus className="h-4 w-4" />
            Crear primera asignación
          </button>
        </div>
      ) : assignments.length > 0 ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--rule-base)] flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Listado de asignaciones
            </p>
            <p className="text-sm text-[var(--text-tertiary)] font-bold">
              {assignments.length} {assignments.length === 1 ? "registro" : "registros"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-6 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Orden
                  </th>
                  <th className="text-left px-6 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Repartidor
                  </th>
                  <th className="text-right px-6 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Tarifa
                  </th>
                  <th className="text-center px-6 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Estado
                  </th>
                  <th className="text-right px-6 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden sm:table-cell">
                    Asignado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {assignments.map((a) => {
                  const sc = ASSIGNMENT_STATUS_CONFIG[a.status] ?? {
                    label: a.status,
                    className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                  };
                  const initial = (a.partnerName || "?").trim().charAt(0).toUpperCase();
                  return (
                    <tr key={a.id} className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm font-extrabold text-[var(--text-primary)]">
                        #{a.orderId.slice(-8).toUpperCase()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-sm font-extrabold shrink-0">
                            {initial}
                          </div>
                          <span className="font-bold text-[var(--text-primary)]">
                            {a.partnerName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-extrabold text-[var(--text-primary)] tabular-nums">
                          S/{toNum(a.fee).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "inline-flex items-center px-3 py-1 rounded-full text-sm font-bold",
                          sc.className,
                        )}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-[var(--text-secondary)] hidden sm:table-cell">
                        <span className="inline-flex items-center justify-end gap-1.5 font-bold">
                          <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
                          {new Date(a.assignedAt).toLocaleDateString("es-PE", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canceladas > 0 && (
            <div className="px-6 py-3 border-t border-[var(--rule-base)] bg-[var(--surface-sunken)]/50">
              <p className="text-sm text-[var(--text-tertiary)] font-bold">
                <AlertCircle className="inline h-4 w-4 mr-1.5 -mt-0.5 text-[var(--data-error-500)]" />
                {canceladas} {canceladas === 1 ? "asignación cancelada" : "asignaciones canceladas"}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* ── 3. Modal asignar ───────────────────────────────────────── */}
      {assignModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setAssignModal({ open: false })}
        >
          <div
            className="bg-[var(--surface-raised)] rounded-2xl w-full max-w-md p-6 sm:p-7 space-y-5 shadow-[var(--shadow-xl)] border border-[var(--rule-base)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Plus className="h-5 w-5" />
                </span>
                <CardTitle className="font-display text-xl font-extrabold text-[var(--text-primary)]">
                  Nueva asignación
                </CardTitle>
              </div>
              <button
                type="button"
                onClick={() => setAssignModal({ open: false })}
                className="p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <Field className="space-y-2" label="ID de orden (opcional)" labelClassName="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              <input
                type="text"
                value={assignModal.orderId ?? ""}
                onChange={(e) => setAssignModal((p) => ({ ...p, orderId: e.target.value }))}
                placeholder="Ej: ORD-12345"
                className="w-full px-4 h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </Field>

            <Field className="space-y-2" label="Repartidor *" labelClassName="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              {(id) => (
                <>
                  <div className="relative">
                    <select
                      id={id}
                      value={selectedPartner}
                      onChange={(e) => setSelectedPartner(e.target.value)}
                      className="w-full px-4 h-12 pr-10 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
                    >
                      <option value="">Seleccionar repartidor...</option>
                      {partners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.zone} — S/{toNum(p.fee).toFixed(2)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] pointer-events-none" />
                  </div>
                  {partners.length === 0 && (
                    <p className="text-sm text-[var(--data-warning-500)] font-bold flex items-center gap-1.5 mt-2">
                      <AlertCircle className="h-4 w-4" />
                      No hay repartidores activos. Activá uno desde la pestaña Repartidores.
                    </p>
                  )}
                </>
              )}
            </Field>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAssignModal({ open: false })}
                className="flex-1 h-12 rounded-xl text-sm font-bold text-[var(--text-primary)] bg-[var(--surface-sunken)] hover:brightness-95 border border-[var(--rule-base)] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={assigning || !selectedPartner}
                className="flex-[2] inline-flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {assigning ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                {assigning ? "Asignando..." : "Confirmar asignación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Permisos
// ─────────────────────────────────────────────
