"use client";

/**
 * Reparto › Asignaciones: qué pedido va con qué repartidor.
 *
 * 17-10 (P25/M47): el botón «Asignar» salía apagado sin decir por qué y la
 * ventana pedía escribir el «ID de orden». Ahora, si falta algo, se ve qué
 * falta y adónde ir; el pedido se elige de una lista. (P30) Al lado, quién
 * reparte: tu equipo o también la red Buleje.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Clock, DollarSign, Plus, Truck, X } from "@buleje/design-system/icons";
import { tenantFetch } from "@/lib/tenant-fetch";
import { TableSkeleton, toNum, type DeliveryPartner } from "@/components/admin/delivery-partners/shared";
import { useIndicadoresReparto } from "@/components/admin/delivery/reparto-indicadores";
import { EstadoRedReparto } from "@/components/admin/delivery/EstadoRedReparto";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { AsignarPedidoModal, type EstadoAsignar } from "../AsignarPedidoModal";
import { AsignacionesPrerrequisitos } from "../AsignacionesPrerrequisitos";
import { TablaAsignaciones, type AsignacionFila } from "../TablaAsignaciones";
import { usePedidosPorRepartir } from "../use-pedidos-por-repartir";

async function leer<T>(url: string, que: string): Promise<T> {
  const r = await tenantFetch(url);
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { detail?: string; error?: string };
    throw new Error(`${que} ${r.status}: ${body.detail ?? body.error ?? "sin detalle"}`);
  }
  return (await r.json()) as T;
}

export function AsignacionesTab({
  red = null,
  onVerRed,
  onIrEquipo,
}: {
  /** Si la red Buleje también reparte; null = no se sabe (o no lo puedes ver). */
  red?: boolean | null;
  onVerRed?: () => void;
  onIrEquipo?: () => void;
} = {}) {
  const [assignments, setAssignments] = useState<AsignacionFila[]>([]);
  const [partners, setPartners] = useState<DeliveryPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState<EstadoAsignar>({ open: false });
  const [selectedPartner, setSelectedPartner] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [errorVentana, setErrorVentana] = useState<string | null>(null);

  // Cada pedido por su lado: si uno falla, el otro igual carga (antes un
  // Promise.all dejaba la ventana sin repartidores para elegir).
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [aRes, pRes] = await Promise.allSettled([
      leer<unknown>("/api/delivery/assignments", "asignaciones"),
      leer<unknown>("/api/delivery/partners", "repartidores"),
    ]);
    if (aRes.status === "fulfilled") {
      setAssignments(Array.isArray(aRes.value) ? (aRes.value as AsignacionFila[]) : []);
    } else {
      setAssignments([]);
      setError("No se pudieron cargar las asignaciones. Actualiza desde «Más».");
    }
    setPartners(
      pRes.status === "fulfilled" && Array.isArray(pRes.value) ? (pRes.value as DeliveryPartner[]).filter((x) => x.isActive) : [],
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const asignados = useMemo(() => new Set(assignments.map((a) => a.orderId)), [assignments]);
  const porRepartir = usePedidosPorRepartir(asignados);

  const abrir = () => {
    setErrorVentana(null);
    setAssignModal({ open: true });
  };

  const handleAssign = async () => {
    if (!selectedPartner) return setErrorVentana("Elige un repartidor.");
    if (!assignModal.orderId) return setErrorVentana("Elige el pedido que va a llevar.");
    // La tarifa de esta entrega = la del repartidor hoy; queda guardada en la asignación.
    const fee = toNum(partners.find((p) => p.id === selectedPartner)?.fee ?? 0);
    setAssigning(true);
    setErrorVentana(null);
    try {
      const res = await tenantFetch("/api/delivery/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: assignModal.orderId, partnerId: selectedPartner, fee }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudo asignar. Intenta otra vez.");
      }
      const saved = (await res.json()) as AsignacionFila;
      setAssignments((prev) => [saved, ...prev]);
      setAssignModal({ open: false });
      setSelectedPartner("");
    } catch (err) {
      setErrorVentana(err instanceof Error ? err.message : "No se pudo asignar. Intenta otra vez.");
    } finally {
      setAssigning(false);
    }
  };

  // Cifras con los estados reales del servidor (VALID_TRANSITIONS).
  const pendientes = assignments.filter((a) => a.status === "assigned" || a.status === "accepted").length;
  const enCamino = assignments.filter((a) => a.status === "picked_up" || a.status === "in_transit").length;
  const entregadas = assignments.filter((a) => a.status === "delivered").length;
  const canceladas = assignments.filter((a) => a.status === "cancelled").length;
  const tarifas = assignments.filter((a) => a.status === "delivered").reduce((acc, a) => acc + toNum(a.fee), 0);

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
        valor: formatCurrency(tarifas),
        ayuda: "La suma de las tarifas de las entregas hechas de esta lista: lo que ganan los repartidores por ellas. Para tu negocio es un costo, no un ingreso; lo que ya les pagaste está en Retiros.",
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

  const nPedidos = porRepartir.error ? null : porRepartir.pedidos.length;
  const listo = partners.length > 0 && (nPedidos ?? 0) > 0;

  return (
    <div className="space-y-4">
      {kpis.boton}
      {kpis.panel}
      {error && (
        <div role="alert" className="flex items-center gap-3 py-1 pl-4 pr-1 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-2xl text-sm text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/10">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
          <span className="font-bold">{error}</span>
          <button
            aria-label="Quitar"
            type="button"
            onClick={() => setError(null)}
            className="ml-auto inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-[var(--data-error-100)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-base)] py-2 pl-4 pr-2">
          <p className="mr-auto text-sm font-semibold text-[var(--text-secondary)]">
            {assignments.length === 0
              ? "Todavía no asignaste pedidos."
              : `${assignments.length} ${assignments.length === 1 ? "asignación" : "asignaciones"}`}
          </p>
          {onVerRed && <EstadoRedReparto enabled={red} onAbrir={onVerRed} />}
          {listo && (
            <button type="button" onClick={abrir} className={button({ variant: "primary" })} data-qa="asignar-pedido">
              <Plus className="h-4 w-4" aria-hidden />
              Asignar pedido
            </button>
          )}
        </div>
        {!listo && !porRepartir.cargando && (
          <div className={assignments.length > 0 ? "border-b border-[var(--rule-base)]" : undefined}>
            <AsignacionesPrerrequisitos
              repartidores={partners.length}
              pedidos={nPedidos}
              cargandoPedidos={porRepartir.cargando}
              onIrEquipo={onIrEquipo ?? (() => undefined)}
            />
          </div>
        )}
        {assignments.length > 0 && <TablaAsignaciones asignaciones={assignments} canceladas={canceladas} />}
      </div>

      <AsignarPedidoModal
        assignModal={assignModal}
        setAssignModal={setAssignModal}
        partners={partners}
        pedidos={porRepartir.pedidos}
        selectedPartner={selectedPartner}
        setSelectedPartner={setSelectedPartner}
        assigning={assigning}
        error={errorVentana}
        handleAssign={() => void handleAssign()}
      />
    </div>
  );
}
