/**
 * order-tracking.mock.ts — Mock data para tracking post-compra "Amazon-style".
 *
 * Reemplazar con lógica real cuando ADR-XXX definá el modelo Driver/DeliveryRun.
 * MOCK: toda función que dependa de `orders.db.ts` por ahora devuelve fixture.
 */

export type TrackingStatus =
  | "confirmed"
  | "preparing"
  | "shipping"
  | "nearby"
  | "delivered"
  | "canceled";

export interface TrackingStep {
  step: TrackingStatus;
  label: string;
  timestamp?: string; // ISO
  done: boolean;
  current?: boolean;
}

export interface TrackingDriver {
  name: string;
  phone: string;          // +51 987 654 321
  vehicle: string;        // "Moto Honda roja — placa A1B-234"
  rating: number;         // 4.8
  totalDeliveries: number;
  avatarInitials: string; // "JC" fallback cuando no hay avatar real
}

export interface TrackingItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  image: string;
}

export interface TrackingAddress {
  street: string;
  district: string;
  reference: string;
}

export interface TrackingSnapshot {
  orderId: string;
  status: TrackingStatus;
  etaAt: string;              // ISO — hora estimada de llegada
  timeline: TrackingStep[];
  driver: TrackingDriver | null;
  items: TrackingItem[];
  address: TrackingAddress;
  total: number;
  paymentMethod: "yape" | "efectivo";
  createdAt: string;
  storeName: string;
  storeLocation: {
    lat: number;
    lng: number;
    label: string;
  };
  destinationLocation: {
    lat: number;
    lng: number;
    label: string;
  };
  driverLocation: {
    // posición interpolada entre store y destination — fracción 0..1
    progress: number;
    lat: number;
    lng: number;
  };
}

// ── Fixture base ──────────────────────────────────────────────────────────
// Coordenadas aproximadas Pucallpa centro → Yarinacocha.
const STORE_LOC = { lat: -8.38, lng: -74.55, label: "Buleje · Jr. Ucayali 342" };
const DEST_LOC = { lat: -8.34, lng: -74.58, label: "Jr. Sucre 345 · Yarinacocha" };

function interp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function makeMockTracking(
  orderId: string = "BSM-2026-04-18-0042",
  status: TrackingStatus = "shipping",
  progress: number = 0.62,
): TrackingSnapshot {
  const now = Date.now();
  const etaAt = new Date(now + 18 * 60 * 1000).toISOString();

  const timeline: TrackingStep[] = [
    {
      step: "confirmed",
      label: "Pedido confirmado",
      timestamp: new Date(now - 32 * 60 * 1000).toISOString(),
      done: true,
    },
    {
      step: "preparing",
      label: "Preparando pedido",
      timestamp: new Date(now - 24 * 60 * 1000).toISOString(),
      done: true,
    },
    {
      step: "shipping",
      label: "En camino",
      timestamp: new Date(now - 10 * 60 * 1000).toISOString(),
      done: ["shipping", "nearby", "delivered"].includes(status),
      current: status === "shipping",
    },
    {
      step: "nearby",
      label: "Cerca de ti",
      timestamp:
        status === "nearby" || status === "delivered"
          ? new Date(now - 2 * 60 * 1000).toISOString()
          : undefined,
      done: ["nearby", "delivered"].includes(status),
      current: status === "nearby",
    },
    {
      step: "delivered",
      label: "Entregado",
      timestamp:
        status === "delivered" ? new Date(now).toISOString() : undefined,
      done: status === "delivered",
      current: status === "delivered",
    },
  ];

  return {
    orderId,
    status,
    etaAt,
    timeline,
    driver: {
      name: "Juan Carlos Ramírez",
      phone: "+51 987 654 321",
      vehicle: "Moto Honda roja — placa A1B-234",
      rating: 4.8,
      totalDeliveries: 142,
      avatarInitials: "JR",
    },
    items: [
      {
        productId: 1,
        name: "Arroz Costeño 1 kg",
        price: 4.5,
        quantity: 2,
        unit: "kg",
        image: "/products/arroz-costeno.svg",
      },
      {
        productId: 2,
        name: "Aceite Primor 1 L",
        price: 7.9,
        quantity: 1,
        unit: "botella",
        image: "/products/aceite-primor.svg",
      },
      {
        productId: 3,
        name: "Azúcar Rubia 1 kg",
        price: 3.2,
        quantity: 1,
        unit: "kg",
        image: "/products/azucar-rubia.svg",
      },
    ],
    address: {
      street: "Jr. Sucre 345",
      district: "Yarinacocha",
      reference: "Frente a la farmacia Inkafarma",
    },
    total: 45.5,
    paymentMethod: "yape",
    createdAt: new Date(now - 32 * 60 * 1000).toISOString(),
    storeName: "Buleje",
    storeLocation: STORE_LOC,
    destinationLocation: DEST_LOC,
    driverLocation: {
      progress,
      lat: interp(STORE_LOC.lat, DEST_LOC.lat, progress),
      lng: interp(STORE_LOC.lng, DEST_LOC.lng, progress),
    },
  };
}

export const MOCK_TRACKING = makeMockTracking();
