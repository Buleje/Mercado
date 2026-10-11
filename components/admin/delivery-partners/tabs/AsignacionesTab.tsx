"use client";
import { useState, useEffect, useCallback } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertCircle, CheckCircle, ClipboardList, Clock, DollarSign, Plus, Truck, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import { TableSkeleton, toNum, type DeliveryPartner } from "@/components/admin/delivery-partners/shared";
import { useIndicadoresReparto } from "@/components/admin/delivery/reparto-indicadores";
import { AsignarPedidoModal } from "../AsignarPedidoModal";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";

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
  picked_up:   { label: "Recogido",   className: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  in_transit:  { label: "En camino",  className: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  delivered:   { label: "Entregado",  className: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" },
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
      setError("Selecciona un repartidor primero.");
      return;
    }
    if (!assignModal.orderId) {
      setError("Ingresa un ID de orden.");
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

  // Derivados para KPIs — usa los status reales del backend (VALID_TRANSITIONS)
  const pendientes  = assignments.filter((a) => a.status === "assigned").length;
  const enCamino    = assignments.filter((a) => ["picked_up", "in_transit"].includes(a.status)).length;
  const entregadas  = assignments.filter((a) => a.status === "delivered").length;
  const canceladas  = assignments.filter((a) => a.status === "cancelled").length;
  const ingresos    = assignments
    .filter((a) => a.status === "delivered")
    .reduce((acc, a) => acc + toNum(a.fee), 0);
  const partnersActivos = partners.length;

  const kpis = useIndicadoresReparto({
    clave: "asignaciones",
    cargando: loading,
    resumen: `${pendientes} por despachar · ${enCamino} en camino`,
    indicadores: [
      { icono: Clock, rotulo: "Por despachar", valor: String(pendientes), ayuda: "Asignadas a un repartidor que todavía no las recoge.", tono: pendientes > 0 ? "alerta" : undefined },
      { icono: Truck, rotulo: "En camino", valor: String(enCamino), ayuda: "Recogidas o en ruta." },
      { icono: CheckCircle, rotulo: "Entregadas", valor: String(entregadas), extra: canceladas > 0 ? `${canceladas} ${canceladas === 1 ? "cancelada" : "canceladas"}` : undefined, tono: entregadas > 0 ? "ok" : undefined },
      {
        icono: DollarSign,
        rotulo: "Tarifas de lo entregado",
        valor: formatCurrency(ingresos),
        ayuda: "La suma de las tarifas de las entregas hechas de esta lista: lo que ganan los repartidores por ellas. Para tu negocio es un costo, no un ingreso; lo que ya les pagaste está en Pagos.",
      },
    ],
  });

  if (loading) {
    return (
      <>
        {kpis.boton}
        <TableSkeleton />
      </>
    );
  }

  const botonAsignar = (texto: string) => (
    <button
      type="button"
      onClick={() => setAssignModal({ open: true })}
      disabled={partnersActivos === 0}
      title={partnersActivos === 0 ? "Primero agrega un repartidor en Equipo" : "Asignar un pedido a un repartidor"}
      className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
    >
      <Plus className="h-4 w-4" aria-hidden />
      {texto}
    </button>
  );

  return (
    <div className="space-y-4">
      {kpis.boton}
      {kpis.panel}
      {error && (
        <div className="flex items-center gap-3 py-1 pl-4 pr-1 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-2xl text-sm text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/10">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="font-bold">{error}</span>
          <button aria-label="Quitar"
            type="button"
            onClick={() => setError(null)}
            className="ml-auto inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-[var(--data-error-100)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {assignments.length === 0 && !error ? (
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-8 text-center">
          <ClipboardList className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-sm font-semibold text-[var(--text-secondary)]">Todavía no asignaste pedidos a un repartidor.</p>
          {botonAsignar("Asignar el primero")}
        </div>
      ) : assignments.length > 0 ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule-base)] py-2 pl-4 pr-2">
            <p className="text-sm font-semibold text-[var(--text-secondary)]">
              {assignments.length} {assignments.length === 1 ? "asignación" : "asignaciones"}
            </p>
            {botonAsignar("Asignar pedido")}
          </div>
          <div className="overflow-x-auto">
            <DataTable className="w-full">
              <thead>
                <tr>
                  <th>
                    Orden
                  </th>
                  <th>
                    Repartidor
                  </th>
                  <th className="text-right">
                    Tarifa
                  </th>
                  <th className="text-center">
                    Estado
                  </th>
                  <th className="text-right hidden sm:table-cell">
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
                    <tr key={a.id}>
                      <td className="font-mono font-extrabold">
                        #{a.orderId.slice(-8).toUpperCase()}
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-[var(--accent-ink)] dark:text-[var(--accent)] text-sm font-extrabold shrink-0">
                            {initial}
                          </div>
                          <span className="font-bold text-[var(--text-primary)]">
                            {a.partnerName}
                          </span>
                        </div>
                      </td>
                      <td className="text-right">
                        <span className="font-extrabold text-[var(--text-primary)] tabular-nums">
                          {formatCurrency(toNum(a.fee))}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className={cn(
                          "inline-flex items-center px-3 py-1 rounded-full text-sm font-bold",
                          sc.className,
                        )}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="text-right text-[var(--text-secondary)] hidden sm:table-cell">
                        <span className="inline-flex items-center justify-end gap-1.5 font-bold">
                          <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
                          {formatDateTimeShort(a.assignedAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
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

      <AsignarPedidoModal
        assignModal={assignModal}
        setAssignModal={setAssignModal}
        partners={partners}
        selectedPartner={selectedPartner}
        setSelectedPartner={setSelectedPartner}
        assigning={assigning}
        handleAssign={() => void handleAssign()}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Permisos
// ─────────────────────────────────────────────
