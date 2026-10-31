"use client";

/**
 * Los repartidores en vivo del negocio (`/api/admin/delivery/partners-live`):
 * quién está en línea, dónde, con qué pedido y con cuántas ofertas.
 *
 * UN solo hook para las dos pantallas que lo leen (plan «panel unificado»,
 * 2026-10-09): el despacho del detalle del pedido (`DespachoSection`) y el
 * mapa de Pedidos y reparto › Reparto › En vivo (`DeliveryPartnersLiveMap`).
 * Antes cada una tenía su propio `fetch` al mismo endpoint, con su propio
 * mensaje de error y su propio cada-cuánto.
 *
 * - El sondeo es silencioso; `refresh()` (el botón «Actualizar») prende
 *   `refreshing` para que el ícono gire.
 * - Una respuesta vieja no pisa a una nueva: cada pedido lleva su número y
 *   sólo el último escribe (un sondeo lento que vuelve después del clic en
 *   «Actualizar» dejaba el mapa con datos de antes).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";

export interface DeliveryPartnerLive {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  isOnline: boolean;
  lat: number | null;
  lng: number | null;
  lastPingAt: string | null;
  currentOrderId: string | null;
  rating: number;
  acceptanceRate: number;
  activeAssignment: {
    id: string;
    orderId: string;
    status: string;
    fee: number;
  } | null;
  pendingOffers: number;
}

export interface DeliveryPartnersSummary {
  total: number;
  online: number;
  withOffer: number;
  busy: number;
}

export interface UseDeliveryPartnersLiveResult {
  partners: DeliveryPartnerLive[];
  summary: DeliveryPartnersSummary;
  /** Hasta la primera respuesta. */
  loading: boolean;
  /** Mientras corre un `refresh()` pedido a mano (el sondeo no lo prende). */
  refreshing: boolean;
  error: string | null;
  /** Cuándo llegó la última respuesta buena; `null` hasta la primera. */
  lastUpdate: Date | null;
  refresh: () => void;
}

export interface OpcionesRepartidoresEnVivo {
  /** `false` = no pide nada (el despacho cerrado). Por defecto, sí. */
  enabled?: boolean;
  /** Cada cuánto se vuelve a pedir. El despacho: 30 s; el mapa: 10 s. */
  intervaloMs?: number;
}

const INTERVALO_POR_DEFECTO_MS = 30_000;
const RESUMEN_VACIO: DeliveryPartnersSummary = { total: 0, online: 0, withOffer: 0, busy: 0 };

export function useDeliveryPartnersLive(
  opciones: OpcionesRepartidoresEnVivo | boolean = {},
): UseDeliveryPartnersLiveResult {
  const { enabled = true, intervaloMs = INTERVALO_POR_DEFECTO_MS } =
    typeof opciones === "boolean" ? { enabled: opciones } : opciones;

  const [partners, setPartners] = useState<DeliveryPartnerLive[]>([]);
  const [summary, setSummary] = useState<DeliveryPartnersSummary>(RESUMEN_VACIO);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const ultimoPedido = useRef(0);

  const cargar = useCallback(async (aMano: boolean) => {
    const numero = ++ultimoPedido.current;
    if (aMano) setRefreshing(true);
    try {
      const res = await tenantFetch("/api/admin/delivery/partners-live");
      if (numero !== ultimoPedido.current) return;
      if (!res.ok) {
        setError(`No pudimos cargar a los repartidores (error ${res.status}).`);
        return;
      }
      const data = (await res.json()) as { partners?: DeliveryPartnerLive[]; summary?: DeliveryPartnersSummary };
      if (numero !== ultimoPedido.current) return;
      setPartners(data.partners ?? []);
      setSummary(data.summary ?? RESUMEN_VACIO);
      setLastUpdate(new Date());
      setError(null);
    } catch {
      if (numero === ultimoPedido.current) setError("Error de red: revisa tu conexión.");
    } finally {
      if (numero === ultimoPedido.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void cargar(false);
    const t = setInterval(() => void cargar(false), intervaloMs);
    return () => clearInterval(t);
  }, [enabled, intervaloMs, cargar]);

  const refresh = useCallback(() => void cargar(true), [cargar]);

  return { partners, summary, loading, refreshing, error, lastUpdate, refresh };
}
