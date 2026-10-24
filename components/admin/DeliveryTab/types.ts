/**
 * Tipos compartidos del DeliveryTab.
 * Estos reflejan exactamente los DTOs que devuelven los endpoints
 * /api/admin/delivery/* (ver lib/db/delivery.db.ts para la shape server-side).
 */

export type RouteStatus = "planned" | "in_progress" | "completed" | "cancelled";
export type StopStatus = "pending" | "arrived" | "delivered" | "failed" | "skipped";
export type TrackingStatus =
  | "preparing"
  | "ready"
  | "picked_up"
  | "in_transit"
  | "nearby"
  | "delivered"
  | "failed"
  | "cancelled";

export interface DeliveryRouteView {
  id: string;
  tenantId: string;
  storeId: string;
  driverId: string;
  driverName: string;
  driverPhone: string | null;
  vehicleType: string;
  status: RouteStatus;
  plannedStartAt: string;
  actualStartAt: string | null;
  completedAt: string | null;
  totalStops: number;
  completedStops: number;
  totalDistanceM: number | null;
  optimizedByAi: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryStopView {
  id: string;
  tenantId: string;
  routeId: string;
  orderId: string;
  sequence: number;
  status: StopStatus;
  address: string;
  addressDetail: string | null;
  lat: number | null;
  lng: number | null;
  customerName: string;
  customerPhone: string | null;
  estimatedArrivalAt: string | null;
  actualArrivalAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  proofPhotoUrl: string | null;
  proofSignatureUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LiveTrackingEvent {
  id: string;
  tenantId: string;
  orderId: string;
  status: TrackingStatus;
  description: string | null;
  lat: number | null;
  lng: number | null;
  distanceM: number | null;
  etaMinutes: number | null;
  actorId: string | null;
  actorType: string;
  photoUrl: string | null;
  metadataJson: string | null;
  createdAt: string;
  customerName?: string;
}

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  planned: "Planificada",
  in_progress: "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
};

export const ROUTE_STATUS_COLORS: Record<RouteStatus, string> = {
  planned: "bg-slate-500",
  in_progress: "bg-[#00A0A0]",
  completed: "bg-primary/10",
  cancelled: "bg-[var(--data-error-500)]",
};

export const TRACKING_STATUS_LABELS: Record<TrackingStatus, string> = {
  preparing: "Preparando",
  ready: "Listo",
  picked_up: "Recogido",
  in_transit: "En camino",
  nearby: "Cerca del cliente",
  delivered: "Entregado",
  failed: "Fallida",
  cancelled: "Cancelada",
};

// Deprecated — usar TRACKING_STATUS_ICON desde ./status-icons.tsx en vez.
export const TRACKING_STATUS_EMOJI: Record<TrackingStatus, string> = {
  preparing: "",
  ready: "",
  picked_up: "",
  in_transit: "",
  nearby: "",
  delivered: "",
  failed: "",
  cancelled: "",
};
