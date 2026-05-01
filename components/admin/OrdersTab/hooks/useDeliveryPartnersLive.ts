"use client";

import { useCallback, useEffect, useState } from "react";

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
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const REFRESH_MS = 30_000;

export function useDeliveryPartnersLive(enabled = true): UseDeliveryPartnersLiveResult {
  const [partners, setPartners] = useState<DeliveryPartnerLive[]>([]);
  const [summary, setSummary] = useState<DeliveryPartnersSummary>({ total: 0, online: 0, withOffer: 0, busy: 0 });
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/delivery/partners-live", { credentials: "include" });
      if (!res.ok) {
        setError("No pudimos cargar motorizados.");
        return;
      }
      const data = (await res.json()) as { partners: DeliveryPartnerLive[]; summary: DeliveryPartnersSummary };
      setPartners(data.partners ?? []);
      setSummary(data.summary ?? { total: 0, online: 0, withOffer: 0, busy: 0 });
      setError(null);
    } catch {
      setError("Error de red al cargar motorizados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [enabled, load]);

  return { partners, summary, loading, error, refresh: load };
}
