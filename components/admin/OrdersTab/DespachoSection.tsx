"use client";

/**
 * DespachoSection — sección unificada de asignación de motorizado dentro del
 * modal de pedido. Reemplaza el doble flujo previo (DRIVERS hardcoded +
 * "Asignar repartidor del marketplace" anidado).
 *
 * Flujo:
 *   1. Lista DeliveryPartners reales del tenant (libres + ocupados + offline)
 *      vía useDeliveryPartnersLive() → /api/admin/delivery/partners-live.
 *   2. Click en partner libre → POST /api/admin/delivery/manual-assign,
 *      crea DeliveryAssignment + ocupa al partner + persiste riderName
 *      string en el order (para chips de la lista).
 *   3. Acordeón "Ad-hoc" → input texto libre + Asignar (sólo persiste string,
 *      sin DeliveryAssignment) — fallback para vecinos/ad-hoc sin registro.
 *
 * Tokens DS exclusivos. No usa DRIVERS hardcoded.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Bike, Loader2, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { DbOrder } from "@/lib/jsondb";
import { useDeliveryPartnersLive, type DeliveryPartnerLive } from "./hooks/useDeliveryPartnersLive";
import { DespachoAdHoc } from "./detalle/DespachoAdHoc";
import { ListaLibres, ListaOcupados } from "./detalle/DespachoListas";
import { responsableDe } from "./siguiente-paso";
import { csrfHeaders } from "@/lib/csrf-client";

interface DespachoSectionProps {
  order: DbOrder;
  customDriver: string;
  savingDriver: boolean;
  driverColor: (name: string) => string;
  onCustomDriverChange: (value: string) => void;
  onSaveCustomDriver: (orderId: string) => void;
  onPatchOrder: (id: string, patch: Partial<DbOrder>) => void;
}

function partnerStatus(p: DeliveryPartnerLive): "free" | "busy" | "offline" {
  if (!p.isOnline) return "offline";
  if (p.currentOrderId) return "busy";
  return "free";
}

export function DespachoSection({
  order,
  customDriver,
  savingDriver,
  driverColor,
  onCustomDriverChange,
  onSaveCustomDriver,
  onPatchOrder,
}: DespachoSectionProps) {
  const { partners, summary, loading, error, refresh } = useDeliveryPartnersLive();
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [showAdHoc, setShowAdHoc] = useState(false);

  const currentDriver = responsableDe(order);

  const grouped = useMemo(() => {
    const free: DeliveryPartnerLive[] = [];
    const busy: DeliveryPartnerLive[] = [];
    const offline: DeliveryPartnerLive[] = [];
    for (const p of partners) {
      const s = partnerStatus(p);
      if (s === "free") free.push(p);
      else if (s === "busy") busy.push(p);
      else offline.push(p);
    }
    return { free, busy, offline };
  }, [partners]);

  const handleAssign = async (partner: DeliveryPartnerLive) => {
    if (assigning) return;
    setAssigning(partner.id);
    setAssignError(null);
    try {
      const res = await fetch("/api/admin/delivery/manual-assign", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ orderId: order.id, partnerId: partner.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAssignError(data.error ?? "No pudimos asignar.");
        return;
      }
      // Persistimos también el nombre para que la lista/Kanban muestre el chip
      // del motorizado sin cargar DeliveryAssignment cada vez. `riderName` es
      // la columna (17-10: se mandaba `deliveryDriver` y el servidor lo descartaba).
      await onPatchOrder(order.id, { riderName: partner.name });
      refresh();
    } catch {
      setAssignError("Error de red.");
    } finally {
      setAssigning(null);
    }
  };

  const handleClearDriver = () => {
    void onPatchOrder(order.id, { riderName: "" });
  };

  const handleSaveAdHoc = () => {
    onSaveCustomDriver(order.id);
    setShowAdHoc(false);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      {/* Una fila: «Despacho · Sin asignar» y cuántos libres. Los ocupados los
          cuenta su plegable de abajo (antes la cifra salía tres veces). */}
      <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]/40 px-4 py-2.5">
        <CardTitle className="min-w-0 truncate text-sm font-bold">
          Despacho{" "}
          <span className="font-semibold text-[var(--text-secondary)]">
            · {currentDriver ? "con motorizado" : "sin asignar"}
          </span>
        </CardTitle>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/10 px-2.5 py-0.5 text-sm font-bold tabular-nums text-[var(--data-success-ink)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)]" aria-hidden />
          {grouped.free.length} libre{grouped.free.length === 1 ? "" : "s"}
        </span>
      </header>

      {/* Asignado actual */}
      {currentDriver && (
        <div className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-primary/10 px-4 py-2">
          <span
            aria-hidden
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white font-bold text-sm shrink-0"
            style={{ backgroundColor: driverColor(currentDriver) }}
          >
            {currentDriver.charAt(0).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)] truncate">{currentDriver}</p>
            <p className="text-sm text-[var(--text-secondary)]">Motorizado en marcha</p>
          </div>
          <button
            type="button"
            onClick={handleClearDriver}
            className="inline-flex h-12 items-center gap-1 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--data-error-500)] hover:text-[var(--data-error-ink)]"
          >
            <X className="h-4 w-4" aria-hidden /> Cambiar
          </button>
        </div>
      )}

      {/* Estados de carga / error */}
      {loading && (
        <div className="flex items-center justify-center gap-2 px-4 py-4 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando motorizados…
        </div>
      )}

      {!loading && error && (
        <div
          role="alert"
          className="mx-4 my-3 flex items-center gap-2 rounded-lg border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 px-3 text-sm font-semibold text-[var(--data-error-ink)]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={refresh} className="h-12 px-2 text-sm underline">
            Reintentar
          </button>
        </div>
      )}

      {!loading && assignError && (
        <div
          role="alert"
          className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 px-3 text-sm font-semibold text-[var(--data-error-ink)]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{assignError}</span>
          <button
            type="button"
            onClick={() => setAssignError(null)}
            className="h-12 px-2 text-sm underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Sin partners registrados */}
      {!loading && !error && summary.total === 0 && (
        <p className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">
          <Bike
            className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]"
            strokeWidth={1.5}
            aria-hidden
          />
          Aún no tienes motorizados registrados
          <InfoTip what="Regístralos en Pedidos › Reparto › Repartidores, con su WhatsApp y vehículo. Mientras tanto, abajo puedes poner el nombre de quien lo lleva." />
        </p>
      )}

      {!loading && !error && (
        <>
          <ListaLibres
            libres={grouped.free}
            asignando={assigning}
            driverColor={driverColor}
            onAsignar={(p) => void handleAssign(p)}
          />
          <ListaOcupados ocupados={grouped.busy} driverColor={driverColor} />
        </>
      )}

      {/* Sin libres pero hay registrados */}
      {!loading && !error && summary.total > 0 && grouped.free.length === 0 && (
        <p className="px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">
          Nadie libre ahora
          {summary.total - summary.online > 0
            ? ` · ${summary.total - summary.online} fuera de línea`
            : ""}
        </p>
      )}

      {/* Asignación ad-hoc — para vecino/familiar sin registro */}
      <DespachoAdHoc
        abierto={showAdHoc}
        onAbrir={() => setShowAdHoc(true)}
        onCerrar={() => {
          setShowAdHoc(false);
          onCustomDriverChange("");
        }}
        valor={customDriver}
        onValor={onCustomDriverChange}
        guardando={savingDriver}
        onGuardar={handleSaveAdHoc}
      />
    </section>
  );
}
