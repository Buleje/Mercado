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
 *      crea DeliveryAssignment + ocupa al partner + persiste deliveryDriver
 *      string en el order (para chips de la lista).
 *   3. Acordeón "Ad-hoc" → input texto libre + Asignar (sólo persiste string,
 *      sin DeliveryAssignment) — fallback para vecinos/ad-hoc sin registro.
 *
 * Tokens DS exclusivos. No usa DRIVERS hardcoded.
 */

import { useMemo, useState } from "react";
import {
  Bike, Star, MapPin, UserCheck, AlertTriangle, Loader2, ChevronDown, Phone, Sparkles, X,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbOrder } from "@/lib/jsondb";
import { useDeliveryPartnersLive, type DeliveryPartnerLive } from "./hooks/useDeliveryPartnersLive";

interface DespachoSectionProps {
  order: DbOrder;
  customDriver: string;
  savingDriver: boolean;
  driverColor: (name: string) => string;
  onCustomDriverChange: (value: string) => void;
  onSaveCustomDriver: (orderId: string) => void;
  onPatchOrder: (id: string, patch: Partial<DbOrder>) => void;
}

function csrf(): string {
  if (typeof document === "undefined") return "";
  return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
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

  const currentDriver = (order as DbOrder & { deliveryDriver?: string }).deliveryDriver;

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
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ orderId: order.id, partnerId: partner.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAssignError(data.error ?? "No pudimos asignar.");
        return;
      }
      // Persistimos también el string para que la lista/Kanban muestre el chip
      // del motorizado sin necesidad de cargar DeliveryAssignment cada vez.
      await onPatchOrder(order.id, { deliveryDriver: partner.name } as Partial<DbOrder>);
      refresh();
    } catch {
      setAssignError("Error de red.");
    } finally {
      setAssigning(null);
    }
  };

  const handleClearDriver = () => {
    void onPatchOrder(order.id, { deliveryDriver: "" } as Partial<DbOrder>);
  };

  const handleSaveAdHoc = () => {
    onSaveCustomDriver(order.id);
    setShowAdHoc(false);
  };

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      {/* Header editorial */}
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]/40">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Despacho
          </p>
          <p className="text-base font-extrabold text-[var(--text-primary)] mt-0.5">
            {currentDriver ? "Motorizado asignado" : "Sin asignar"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold tabular-nums">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--data-success)]/10 text-[var(--data-success)] border border-[var(--data-success)]/30">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-success)]" />
            {grouped.free.length} libre{grouped.free.length === 1 ? "" : "s"}
          </span>
          {grouped.busy.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--data-warning)]/10 text-[var(--data-warning)] border border-[var(--data-warning)]/30">
              {grouped.busy.length} ocupado{grouped.busy.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </header>

      {/* Asignado actual */}
      {currentDriver && (
        <div className="flex items-center gap-3 px-5 py-3 bg-[var(--accent-soft)]/40 border-b border-[var(--rule-soft)]">
          <span
            aria-hidden
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white font-black text-sm shrink-0"
            style={{ backgroundColor: driverColor(currentDriver) }}
          >
            {currentDriver.charAt(0).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">{currentDriver}</p>
            <p className="text-xs text-[var(--text-secondary)]">Motorizado en marcha</p>
          </div>
          <button
            type="button"
            onClick={handleClearDriver}
            className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-xs font-bold text-[var(--text-secondary)] border border-[var(--rule-base)] hover:border-[var(--data-error)] hover:text-[var(--data-error)] transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Cambiar
          </button>
        </div>
      )}

      {/* Estados de carga / error */}
      {loading && (
        <div className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando motorizados…
        </div>
      )}

      {!loading && error && (
        <div className="mx-5 my-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--data-error)]/10 border border-[var(--data-error)]/30 text-sm font-semibold text-[var(--data-error)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={refresh} className="text-xs underline">Reintentar</button>
        </div>
      )}

      {!loading && assignError && (
        <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--data-error)]/10 border border-[var(--data-error)]/30 text-sm font-semibold text-[var(--data-error)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{assignError}</span>
          <button onClick={() => setAssignError(null)} className="text-xs underline">Cerrar</button>
        </div>
      )}

      {/* Sin partners registrados */}
      {!loading && !error && summary.total === 0 && (
        <div className="px-5 py-6 text-center">
          <Bike className="h-10 w-10 mx-auto text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-bold text-[var(--text-secondary)]">
            Aún no tenés motorizados registrados
          </p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)] max-w-xs mx-auto">
            Andá a <strong className="text-[var(--accent)]">Delivery Partners</strong> para
            registrar al personal de tu tienda con su WhatsApp y vehículo.
          </p>
          <button
            type="button"
            onClick={() => setShowAdHoc(true)}
            className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border-2 border-[var(--accent)] text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/5 transition-colors"
          >
            <Sparkles className="h-4 w-4" /> Asignar nombre ad-hoc
          </button>
        </div>
      )}

      {/* Lista de partners libres */}
      {!loading && !error && grouped.free.length > 0 && (
        <ul className="divide-y divide-[var(--rule-soft)]">
          {grouped.free.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => void handleAssign(p)}
                disabled={assigning !== null}
                className={cn(
                  "w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors",
                  "hover:bg-[var(--accent-soft)]/40 disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <span
                  aria-hidden
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white font-black text-base shrink-0"
                  style={{ backgroundColor: driverColor(p.name) }}
                >
                  {p.name.charAt(0).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-[var(--text-primary)] text-sm truncate">{p.name}</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--data-success)]/15 text-[var(--data-success)] text-xs font-bold border border-[var(--data-success)]/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-success)]" />
                      Libre
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-2 text-xs text-[var(--text-tertiary)] tabular-nums">
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="h-3 w-3 text-[var(--data-warning)]" strokeWidth={2.5} aria-hidden />
                      {p.rating.toFixed(1)}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{Math.round(p.acceptanceRate * 100)}% acepta</span>
                    <span aria-hidden>·</span>
                    <span className="capitalize">{p.vehicleType}</span>
                    {p.lat != null && p.lng != null && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-0.5 text-[var(--data-success)] font-bold">
                          <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden />
                          GPS
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-[var(--text-primary)] text-[var(--surface-canvas)] text-xs font-extrabold uppercase tracking-wider">
                  {assigning === p.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5" /> Asignar
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Ocupados — no se pueden asignar pero se ven */}
      {!loading && !error && grouped.busy.length > 0 && (
        <details className="border-t border-[var(--rule-soft)]">
          <summary className="cursor-pointer flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            Ocupados ahora ({grouped.busy.length})
          </summary>
          <ul className="divide-y divide-[var(--rule-soft)]">
            {grouped.busy.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3 opacity-70">
                <span
                  aria-hidden
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white font-black text-sm shrink-0"
                  style={{ backgroundColor: driverColor(p.name) }}
                >
                  {p.name.charAt(0).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[var(--text-primary)] text-sm truncate">{p.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    Atendiendo #{p.currentOrderId?.slice(-6)}
                  </p>
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--data-warning)]">
                  Ocupado
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Sin libres pero hay registrados */}
      {!loading && !error && summary.total > 0 && grouped.free.length === 0 && (
        <div className="px-5 py-5 text-center">
          <p className="text-sm font-bold text-[var(--text-secondary)]">
            No hay motorizados libres ahora mismo
          </p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            {summary.busy} ocupado{summary.busy === 1 ? "" : "s"} ·{" "}
            {summary.total - summary.online} fuera de línea
          </p>
        </div>
      )}

      {/* Asignación ad-hoc — para vecino/familiar sin registro */}
      <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/30">
        {!showAdHoc ? (
          <button
            type="button"
            onClick={() => setShowAdHoc(true)}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Asignar a alguien sin registro
          </button>
        ) : (
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Nombre ad-hoc
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customDriver}
                onChange={(e) => onCustomDriverChange(e.target.value)}
                placeholder="Ej: María (vecina), Juan (sobrino)…"
                className="flex-1 h-12 px-3.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
                onKeyDown={(e) => e.key === "Enter" && handleSaveAdHoc()}
              />
              <button
                type="button"
                onClick={handleSaveAdHoc}
                disabled={savingDriver || !customDriver.trim()}
                className="h-12 px-4 rounded-xl bg-[var(--text-primary)] text-[var(--surface-canvas)] text-sm font-extrabold hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
              >
                {savingDriver ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdHoc(false); onCustomDriverChange(""); }}
                className="h-12 w-12 inline-flex items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
                aria-label="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1">
              <Phone className="h-3 w-3" />
              Sin GPS ni tracking. Sólo persistimos el nombre como referencia.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
