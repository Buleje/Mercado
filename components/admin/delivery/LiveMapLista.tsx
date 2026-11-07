"use client";

/**
 * La lista al lado del mapa de repartidores en vivo: primero quien lleva un
 * pedido, después con oferta, libres y sin conexión. Tocar uno centra el mapa
 * en él (sin GPS no se puede: el botón queda apagado y lo dice).
 *
 * Sacada de `DeliveryPartnersLiveMap.tsx` el 10-10 (mismo comportamiento; texto
 * de 14 px en vez de 12).
 *
 * 17-10 (P14): cada uno dice de cuándo es su ubicación; «Sin señal hace X» si
 * está en línea pero su app calla hace más de 2 min.
 */
import { CardTitle } from "@buleje/design-system";
import { Phone, Star, Truck } from "@buleje/design-system/icons";
import { EmptyState } from "@/components/admin/EmptyState";
import { toNum, VehicleIcon } from "@/components/admin/delivery-partners/shared";
import type { DeliveryPartnerLive } from "@/components/admin/OrdersTab/hooks/useDeliveryPartnersLive";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { ORDEN_ESTADO, partnerStateOf, senalVieja, STATE_META, textoSenal } from "./live-map-helpers";

export function LiveMapLista({
  partners,
  cargando,
  elegido,
  onElegir,
}: {
  partners: DeliveryPartnerLive[];
  cargando: boolean;
  elegido: string | null;
  onElegir: (p: DeliveryPartnerLive) => void;
}) {
  const ordenados = [...partners].sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return ORDEN_ESTADO[partnerStateOf(a)] - ORDEN_ESTADO[partnerStateOf(b)];
  });

  return (
    <div className="flex max-h-[34rem] flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--rule-base)] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-bold leading-tight">Repartidores</CardTitle>
          <InfoTip
            title="Repartidores"
            what="Primero los que están en línea; después, por lo que están haciendo."
            affects="Toca uno para centrar el mapa en él. «Ubicación hace X»: cuándo mandó su app esa posición. «Sin señal hace X»: está en línea pero su app no manda nada hace más de 2 min; su punto (apagado, borde punteado) es donde estaba. «Sin GPS»: nunca mandó su ubicación."
            example="La app no manda la precisión del GPS: la posición puede errar algunos metros, más bajo techo."
          />
        </div>
        <span className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-0.5 text-sm font-bold tabular-nums text-[var(--text-secondary)]">
          {ordenados.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {ordenados.length === 0 ? (
          cargando ? (
            <LoadingSpinner size={32} className="mx-auto my-12" />
          ) : (
            <EmptyState
              icon={<Truck className="h-10 w-10 text-[var(--text-tertiary)]" />}
              title="Todavía no tienes repartidores"
              description="Agrégalos en Equipo."
              actions={[]}
            />
          )
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {ordenados.map((p) => {
              const meta = STATE_META[partnerStateOf(p)];
              const conGps = p.lat != null && p.lng != null;
              const senal = textoSenal(p);
              const sinSenal = p.isOnline && senalVieja(p);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onElegir(p)}
                    disabled={!conGps}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                      elegido === p.id ? "bg-primary/5" : "hover:bg-[var(--surface-sunken)]",
                      !conGps && "cursor-not-allowed",
                    )}
                  >
                    <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", meta.bg, meta.color)}>
                      <VehicleIcon type={p.vehicleType} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-extrabold text-[var(--text-primary)]">{p.name}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-sm font-bold", meta.bg, meta.color)}>{meta.label}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 font-mono text-sm text-[var(--text-secondary)]">
                        <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {p.phone}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
                        <span className="inline-flex items-center gap-1 font-bold">
                          <Star className="h-3.5 w-3.5 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" aria-hidden />
                          {toNum(p.rating).toFixed(1)}
                        </span>
                        {senal && <span className={cn(sinSenal && "font-bold text-[var(--data-warning-ink)]")}>{senal}</span>}
                        {!conGps && <span className="font-bold text-[var(--data-error-ink)]">Sin GPS</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
