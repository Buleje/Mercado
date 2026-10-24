"use client";

/**
 * El mapa de Pedidos y reparto › Reparto › En vivo: cada repartidor con GPS,
 * del color de lo que está haciendo, y al lado la lista para centrarlo.
 *
 * Desde el 10-10 (Brandon: «compactar para que la información central esté
 * bien vista») el mapa es lo primero de la sección: sin título propio ni
 * párrafo (la cabecera de Reparto y el ⓘ ya lo dicen) y sin las cuatro
 * tarjetas grandes —sus cifras van en la leyenda, al lado de cada color, y en
 * los Indicadores de la sección—. Los datos llegan por props
 * (`useDeliveryPartnersLive`, que la sección comparte con sus indicadores):
 * así no hay dos sondeos al mismo endpoint.
 *
 * Marcadores: verde = libre, coral = con oferta, azul = atendiendo.
 */
import { useEffect, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, RefreshCw } from "@buleje/design-system/icons";
import type { DeliveryPartnerLive, UseDeliveryPartnersLiveResult } from "@/components/admin/OrdersTab/hooks/useDeliveryPartnersLive";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { LiveMapLista } from "./LiveMapLista";
import { markerHtml, partnerStateOf, popupHtml, STATE_META, timeAgo, type PartnerState } from "./live-map-helpers";

const PUCALLPA_LAT = -8.379;
const PUCALLPA_LNG = -74.553;

/** Los tres colores del mapa; cada uno con cuántos puntos de ese color hay (los mismos que se ven). */
const LEYENDA: PartnerState[] = ["free", "with-offer", "busy"];

export default function DeliveryPartnersLiveMap({ live, onActualizar }: { live: UseDeliveryPartnersLiveResult; onActualizar: () => void }) {
  const { partners, loading, refreshing, error, lastUpdate } = live;
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // El mapa se arma una sola vez.
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    void import("leaflet/dist/leaflet.css");
    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current) return;
      // Sin mergeOptions con unpkg.com: los marcadores son divIcon propios y
      // los íconos por defecto de Leaflet nunca se dibujan (05-06).
      const map = L.map(containerRef.current).setView([PUCALLPA_LAT, PUCALLPA_LNG], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      mapRef.current = map;
    });
    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.clear();
    };
  }, []);

  // Marcadores: se crean, se mueven o se borran cuando cambian los repartidores.
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      const seen = new Set<string>();
      partners.forEach((p) => {
        if (p.lat == null || p.lng == null) return;
        seen.add(p.id);
        const elegido = selectedId === p.id;
        const lado = elegido ? 32 : 26;
        const icon = L.divIcon({ html: markerHtml(p, elegido), className: "", iconSize: [lado, lado], iconAnchor: [lado / 2, lado / 2] });
        const existing = markersRef.current.get(p.id);
        if (existing) {
          existing.setLatLng([p.lat, p.lng]);
          existing.setIcon(icon);
          existing.setPopupContent(popupHtml(p));
        } else {
          const marker = L.marker([p.lat, p.lng], { icon }).addTo(mapRef.current).bindPopup(popupHtml(p));
          marker.on("click", () => setSelectedId(p.id));
          markersRef.current.set(p.id, marker);
        }
      });
      markersRef.current.forEach((marker, id) => {
        if (!seen.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [partners, selectedId]);

  const centrar = (p: DeliveryPartnerLive) => {
    setSelectedId(p.id);
    if (mapRef.current && p.lat != null && p.lng != null) {
      mapRef.current.flyTo([p.lat, p.lng], 15, { duration: 0.7 });
      markersRef.current.get(p.id)?.openPopup();
    }
  };

  const porEstado: Partial<Record<PartnerState, number>> = {};
  for (const p of partners) {
    const e = partnerStateOf(p);
    porEstado[e] = (porEstado[e] ?? 0) + 1;
  }
  /* «Cuántos en línea» ya está en los Indicadores: acá sólo cuándo llegó el último dato (la fila entra en una línea). */
  const ultima = lastUpdate ? timeAgo(lastUpdate.toISOString()) : loading ? "Cargando…" : "";

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] px-4 dark:bg-[var(--data-error-500)]/10">
          <AlertCircle className="h-4 w-4 shrink-0 text-[var(--data-error-ink)]" aria-hidden />
          <p className="flex-1 py-3 text-sm font-semibold text-[var(--data-error-ink)]">{error}</p>
          <button type="button" onClick={onActualizar} className="h-12 px-2 text-sm font-bold text-[var(--data-error-ink)] underline hover:no-underline">
            Reintentar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="reparto-mapa-titulo" className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]">
          {/* Una fila: título · leyenda con sus cifras · cuándo se actualizó · actualizar. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--rule-base)] py-1 pl-4 pr-1">
            <div className="flex items-center gap-1.5">
              <CardTitle id="reparto-mapa-titulo" className="text-sm font-bold leading-tight">
                Mapa en vivo
              </CardTitle>
              <InfoTip
                title="Mapa en vivo"
                what="Cada punto es un repartidor con GPS, del color de lo que está haciendo. Se actualiza solo cada 10 s."
                affects="Toca un punto (o un nombre de la lista) para ver su teléfono, su calificación y el pedido que lleva."
                example="Un punto azul que se mueve = un repartidor llevando un pedido."
              />
            </div>
            <ul className="order-last flex w-full flex-wrap items-center gap-x-3 gap-y-1 pb-2 sm:order-none sm:w-auto sm:pb-0" aria-label="Leyenda del mapa">
              {LEYENDA.map((estado) => (
                <li key={estado} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 rounded-full ring-2 ring-[var(--surface-raised)]"
                    style={{ backgroundColor: STATE_META[estado].mapColor }}
                  />
                  {STATE_META[estado].label}
                  {lastUpdate && <span className="tabular-nums font-bold text-[var(--text-primary)]">{porEstado[estado] ?? 0}</span>}
                </li>
              ))}
            </ul>
            <span className="ml-auto text-sm tabular-nums text-[var(--text-secondary)]" title="Última actualización del mapa" aria-live="polite">
              {ultima}
            </span>
            <button
              type="button"
              onClick={onActualizar}
              disabled={refreshing}
              title="Actualizar ahora"
              aria-label="Actualizar el mapa y las cifras del reparto"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:cursor-wait"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
            </button>
          </div>
          <div ref={containerRef} className="h-[24rem] w-full min-w-0 sm:h-[32rem]" />
        </section>

        <LiveMapLista partners={partners} cargando={loading} elegido={selectedId} onElegir={centrar} />
      </div>
    </div>
  );
}
