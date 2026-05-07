/**
 * order-tracking.db.ts — Tracking post-compra (estilo Amazon "Track your order").
 *
 * Antes (P1 Bug Hunter Report 2026-04-30): MOCK-HEAVY que devolvia fixtures
 * de `lib/mocks/order-tracking.mock.ts` ignorando tenantId/orderId. Los
 * clientes veian datos falsos al rastrear su pedido.
 *
 * Ahora: queries reales sobre Order + OrderItem + OrderStatusHistory +
 * DeliveryAssignment + DeliveryPartner + DeliveryTracking. tenantId scope
 * estricto (regla #3). Cuando no hay datos de delivery (orden vieja sin
 * assignment) cae a un snapshot derivado solo del estado y los items —
 * sigue siendo info real, solo con detalle reducido.
 *
 * Share token: HMAC-SHA256(payload, AUTH_SECRET) — stateless, TTL 24h (reducido 2026-05-05, audit H013).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
import {
  type TrackingSnapshot,
  type TrackingStatus,
  type TrackingDriver,
  type TrackingStep,
  type TrackingItem,
} from "@/lib/mocks/order-tracking.mock";

// SECURITY 2026-05-05 (audit delivery H013): TTL reducido de 72h a 24h para
// acotar la ventana de exposicion del token de seguimiento publico.
// Rotacion de kid (multi-key support) diferido — ver H013 tracker.
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// ── HMAC helpers (edge + node compatible, via WebCrypto) ────────────────────
function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET required — add to .env");
  return secret;
}

function b64urlEncodeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecodeBytes(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncodeString(s: string): string {
  return b64urlEncodeBytes(new TextEncoder().encode(s));
}

function b64urlDecodeString(s: string): string {
  return new TextDecoder().decode(b64urlDecodeBytes(s));
}

async function hmacSign(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function hmacVerify(data: string, sig: Uint8Array): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  try {
    const sigBuf = new ArrayBuffer(sig.byteLength);
    new Uint8Array(sigBuf).set(sig);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBuf,
      new TextEncoder().encode(data),
    );
  } catch {
    return false;
  }
}

// ── Token payload ───────────────────────────────────────────────────────────
interface TrackingTokenPayload {
  orderId: string;
  tenantId: string;
  exp: number;
}

export interface ShareTokenResult {
  token: string;
  url: string;
  expiresAt: string;
}

export interface VerifiedTrackingToken {
  orderId: string;
  tenantId: string;
}

// ── Mapping helpers ─────────────────────────────────────────────────────────

const ORDER_TO_TRACKING: Record<string, TrackingStatus> = {
  pendiente:  "confirmed",
  confirmado: "preparing",
  en_camino:  "shipping",
  entregado:  "delivered",
  cancelado:  "canceled",
};

const STATUS_LABEL: Record<TrackingStatus, string> = {
  confirmed: "Pedido confirmado",
  preparing: "Preparando pedido",
  shipping:  "En camino",
  nearby:    "Cerca de ti",
  delivered: "Entregado",
  canceled:  "Cancelado",
};

const ORDER_STEPS: TrackingStatus[] = ["confirmed", "preparing", "shipping", "nearby", "delivered"];

function progressFromStatus(s: TrackingStatus): number {
  switch (s) {
    case "confirmed": return 0;
    case "preparing": return 0.1;
    case "shipping":  return 0.55;
    case "nearby":    return 0.9;
    case "delivered": return 1;
    case "canceled":  return 0;
  }
}

function interp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Default coords (Pucallpa centro) cuando el Order no tiene pickup/dropoff ─
const FALLBACK_STORE_LOC = { lat: -8.38, lng: -74.55 };
const FALLBACK_DEST_LOC  = { lat: -8.34, lng: -74.58 };

// ── Public DB class ─────────────────────────────────────────────────────────
export const OrderTrackingDB = {
  /**
   * Snapshot completo de tracking. Lee de DB real y mapea al shape público.
   * Devuelve null si la orden no existe en este tenant.
   */
  async getSnapshot(
    tenantId: string,
    orderId: string,
  ): Promise<TrackingSnapshot | null> {
    if (!tenantId || !orderId) return null;

    try {
      // 1. Order base + items (Prisma TS no admite todas las relations
      //    en un solo select — separamos las accesorias en queries paralelas).
      // eslint-disable-next-line no-restricted-properties -- tenant scope explícito en where.
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
        select: {
          id: true,
          status: true,
          total: true,
          customerLocation: true,
          customerReference: true,
          createdAt: true,
          paymentMethod: true,
          deliveryStatus: true,
          estimatedDeliveryAt: true,
          deliveredAt: true,
          pickupLat: true,
          pickupLng: true,
          dropoffLat: true,
          dropoffLng: true,
          driverId: true,
          tenantId: true,
          items: {
            select: {
              productId: true,
              name: true,
              price: true,
              quantity: true,
              unit: true,
              image: true,
            },
          },
        },
      });

      if (!order) return null;

      // 2. Datos accesorios en paralelo (reducen latencia vs serial).
      const [tenantRow, statusHistory, deliveryAssignmentRow, lastTrackingRow] = await Promise.all([
        // eslint-disable-next-line no-restricted-properties -- lookup atomico por id.
        prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
        // eslint-disable-next-line no-restricted-properties -- timeline tenant-scoped.
        prisma.orderStatusHistory.findMany({
          where: { orderId, tenantId },
          orderBy: { createdAt: "asc" },
          select: { fromStatus: true, toStatus: true, createdAt: true },
        }),
        // eslint-disable-next-line no-restricted-properties -- assignment 1:1 con orderId.
        prisma.deliveryAssignment.findUnique({
          where: { orderId },
          select: {
            partner: {
              select: { name: true, phone: true, vehicleType: true, rating: true },
            },
          },
        }),
        // eslint-disable-next-line no-restricted-properties -- ultimo tracking event para driver loc + ETA.
        prisma.deliveryTracking.findFirst({
          where: { orderId, tenantId },
          orderBy: { createdAt: "desc" },
          select: { lat: true, lng: true, etaMinutes: true, status: true },
        }),
      ]);

      const trackingStatus: TrackingStatus = ORDER_TO_TRACKING[order.status] ?? "confirmed";

      // Timeline: derivada de statusHistory + estado actual.
      const seenSteps = new Map<TrackingStatus, string | undefined>();
      // Step inicial siempre marcado (cuando se creó la orden = "confirmed").
      seenSteps.set("confirmed", order.createdAt.toISOString());
      for (const h of statusHistory) {
        const ts = ORDER_TO_TRACKING[h.toStatus];
        if (ts) seenSteps.set(ts, h.createdAt.toISOString());
      }
      // "nearby" no surge de OrderStatusHistory — lo derivamos del DeliveryTracking.
      const lastTrack = lastTrackingRow;
      if (lastTrack?.status === "nearby") {
        // No tenemos createdAt del tracking acá, pero podemos marcar el step.
        seenSteps.set("nearby", order.estimatedDeliveryAt?.toISOString());
      }
      if (order.deliveredAt) {
        seenSteps.set("delivered", order.deliveredAt.toISOString());
      }

      const currentIdx = ORDER_STEPS.indexOf(trackingStatus);
      const timeline: TrackingStep[] = ORDER_STEPS.map((step, idx) => {
        const ts = seenSteps.get(step);
        return {
          step,
          label: STATUS_LABEL[step],
          timestamp: ts,
          done: idx < currentIdx || (idx === currentIdx && trackingStatus === "delivered"),
          current: idx === currentIdx && trackingStatus !== "canceled",
        };
      });

      // Coords: usa Order.pickup/dropoffLat-Lng, sino fallback Pucallpa.
      const storeLoc = {
        lat: order.pickupLat ?? FALLBACK_STORE_LOC.lat,
        lng: order.pickupLng ?? FALLBACK_STORE_LOC.lng,
        label: tenantRow?.name ?? "Tienda",
      };
      const destLoc = {
        lat: order.dropoffLat ?? FALLBACK_DEST_LOC.lat,
        lng: order.dropoffLng ?? FALLBACK_DEST_LOC.lng,
        label: order.customerLocation || "Dirección de entrega",
      };

      // Driver location: si hay tracking real lo usamos; sino interpolamos por progreso.
      const progress = progressFromStatus(trackingStatus);
      const driverLocation =
        lastTrack?.lat != null && lastTrack?.lng != null
          ? { progress, lat: lastTrack.lat, lng: lastTrack.lng }
          : {
              progress,
              lat: interp(storeLoc.lat, destLoc.lat, progress),
              lng: interp(storeLoc.lng, destLoc.lng, progress),
            };

      // Driver info: viene del DeliveryAssignment.partner si existe.
      let driver: TrackingDriver | null = null;
      const partner = deliveryAssignmentRow?.partner;
      if (partner) {
        const initials = partner.name
          .split(/\s+/)
          .map((p: string) => p[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase();
        driver = {
          name: partner.name,
          phone: partner.phone,
          vehicle: partner.vehicleType,
          rating: partner.rating,
          totalDeliveries: 0,
          avatarInitials: initials || "??",
        };
      }

      // ETA: Order.estimatedDeliveryAt o lastTrack.etaMinutes en futuro.
      const etaAt =
        order.estimatedDeliveryAt?.toISOString() ??
        (lastTrack?.etaMinutes != null
          ? new Date(Date.now() + lastTrack.etaMinutes * 60_000).toISOString()
          : new Date(Date.now() + 30 * 60_000).toISOString());

      const items: TrackingItem[] = order.items.map((i: typeof order.items[number]) => ({
        productId: i.productId ?? 0,
        name: i.name,
        price: toNumOrZero(i.price),
        quantity: i.quantity,
        unit: i.unit,
        image: i.image,
      }));

      const paymentMethod: "yape" | "efectivo" =
        order.paymentMethod === "yape" ? "yape" : "efectivo";

      return {
        orderId: order.id,
        status: trackingStatus,
        etaAt,
        timeline,
        driver,
        items,
        address: {
          street: order.customerLocation,
          district: "",
          reference: order.customerReference,
        },
        total: toNumOrZero(order.total),
        paymentMethod,
        createdAt: order.createdAt.toISOString(),
        storeName: tenantRow?.name ?? "Tienda",
        storeLocation: storeLoc,
        destinationLocation: destLoc,
        driverLocation,
      };
    } catch (err) {
      logger.error("[order-tracking.db] getSnapshot failed", {
        tenantId,
        orderId,
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  },

  async getStatus(
    tenantId: string,
    orderId: string,
  ): Promise<Pick<TrackingSnapshot, "orderId" | "status" | "etaAt" | "timeline" | "driverLocation"> | null> {
    const snap = await this.getSnapshot(tenantId, orderId);
    if (!snap) return null;
    const { orderId: oid, status, etaAt, timeline, driverLocation } = snap;
    return { orderId: oid, status, etaAt, timeline, driverLocation };
  },

  async getDriver(
    tenantId: string,
    orderId: string,
  ): Promise<TrackingDriver | null> {
    const snap = await this.getSnapshot(tenantId, orderId);
    return snap?.driver ?? null;
  },

  async generateShareToken(
    tenantId: string,
    orderId: string,
    ttlMs: number = DEFAULT_TTL_MS,
    baseUrl?: string,
  ): Promise<ShareTokenResult> {
    const payload: TrackingTokenPayload = {
      orderId,
      tenantId,
      exp: Date.now() + ttlMs,
    };
    const encoded = b64urlEncodeString(JSON.stringify(payload));
    const sig = await hmacSign(encoded);
    const token = `${encoded}.${b64urlEncodeBytes(sig)}`;

    const origin = baseUrl ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
    const url = `${origin}/t/${encodeURIComponent(tenantId)}/seguimiento/${encodeURIComponent(token)}`;

    return {
      token,
      url,
      expiresAt: new Date(payload.exp).toISOString(),
    };
  },

  async verifyShareToken(token: string): Promise<VerifiedTrackingToken | null> {
    try {
      const dotIdx = token.lastIndexOf(".");
      if (dotIdx < 16) return null;
      const encoded = token.slice(0, dotIdx);
      const sigB64 = token.slice(dotIdx + 1);
      const sigBytes = b64urlDecodeBytes(sigB64);
      if (!(await hmacVerify(encoded, sigBytes))) return null;
      const raw = b64urlDecodeString(encoded);
      const payload = JSON.parse(raw) as TrackingTokenPayload;
      if (typeof payload.exp !== "number") return null;
      if (payload.exp < Date.now()) return null;
      if (typeof payload.orderId !== "string" || typeof payload.tenantId !== "string") {
        return null;
      }
      return { orderId: payload.orderId, tenantId: payload.tenantId };
    } catch {
      return null;
    }
  },

  /**
   * @deprecated Solo dev/preview. La transicion real ocurre via
   * PATCH /api/orders/[id] que dispara OrderStatusHistory + webhook events.
   * Mantenido para no romper UI de dev pero no toca la DB real.
   */
  async advanceStatus(
    _tenantId: string,
    orderId: string,
    nextStatus: TrackingStatus,
  ): Promise<TrackingSnapshot | null> {
    logger.warn("[order-tracking.db] advanceStatus is deprecated dev-only", {
      orderId,
      nextStatus,
    });
    return null;
  },
};

export type { TrackingSnapshot, TrackingStatus, TrackingDriver };
