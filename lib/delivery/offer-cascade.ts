/**
 * lib/delivery/offer-cascade.ts
 *
 * Lógica de cascada Rappi-style. Reusable desde:
 *   - cron/delivery-offer-cascade (auto, cada 30s)
 *   - trigger onOrderConfirmed (al confirmarse un pedido, 1ra oferta)
 *   - admin override (asignar partner X manualmente)
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  findNearestPartners,
  computeOfferFee,
  type PartnerCandidate,
} from "@/lib/delivery/matchmaking";
import { sendPushToPhone } from "@/lib/push-sender";
import { sendWhatsAppQueued } from "@/lib/whatsapp";

const OFFER_TTL_SEC = Number(process.env.DELIVERY_OFFER_TTL_SEC ?? "120"); // 2 min
const MAX_ATTEMPTS = Number(process.env.DELIVERY_MAX_ATTEMPTS ?? "5");

export interface OrderForOffer {
  id: string;
  tenantId: string;
  customerLocation: string | null;
  customerLat?: number | null;
  customerLng?: number | null;
}

/**
 * Crea una oferta para el partner #N+1 más cercano. N = ofertas previas
 * para este orderId. Si no hay candidatos disponibles, devuelve null.
 *
 * Excluye partners que ya tuvieron oferta para este order (anti-loop).
 */
export async function createNextOffer(
  order: OrderForOffer,
  orderLat: number,
  orderLng: number,
): Promise<{ offerId: string; partnerId: string; attempt: number } | null> {
  // 1. Obtener partners ya invitados para este order — excluir.
  const previousOffers = await prisma.deliveryOffer.findMany({
    where: { orderId: order.id },
    select: { partnerId: true, status: true },
  });
  const excludePartnerIds = previousOffers.map((o) => o.partnerId);
  const attempt = previousOffers.length + 1;

  if (attempt > MAX_ATTEMPTS) {
    logger.warn("[offer-cascade] max attempts reached", { orderId: order.id, attempt });
    return null;
  }

  // Si ya hay un assignment, no crear más offers (race safety).
  const assigned = await prisma.deliveryAssignment.findUnique({
    where: { orderId: order.id },
    select: { id: true },
  });
  if (assigned) return null;

  // 2. Cargar partners online — pool híbrido:
  //    - partners del tenant de la tienda (vendor con flota propia)
  //    - partners del tenant "main" (red global Buleje, compartida)
  //    Si la tienda tiene flota propia se prefiere; sino usa la red Buleje.
  //    Cliente final ve un único pool: el que esté online y más cerca.
  const partners = await prisma.deliveryPartner.findMany({
    where: {
      tenantId: { in: Array.from(new Set([order.tenantId, "main"])) },
      isActive: true,
      isOnline: true,
      currentOrderId: null,
    },
    select: {
      id: true, name: true, phone: true, lat: true, lng: true,
      isOnline: true, lastPingAt: true, currentOrderId: true,
      rating: true, acceptanceRate: true, maxRadiusKm: true,
      vehicleType: true, fee: true,
    },
  });

  const candidates: PartnerCandidate[] = partners.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    lat: p.lat,
    lng: p.lng,
    isOnline: p.isOnline,
    lastPingAt: p.lastPingAt,
    currentOrderId: p.currentOrderId,
    rating: p.rating,
    acceptanceRate: p.acceptanceRate,
    maxRadiusKm: p.maxRadiusKm,
    fee: Number(p.fee),
    vehicleType: p.vehicleType,
  }));

  const ranked = findNearestPartners(orderLat, orderLng, candidates, {
    excludePartnerIds,
    limit: 1,
  });

  if (ranked.length === 0) {
    logger.info("[offer-cascade] no available partners", {
      orderId: order.id,
      attempt,
      excluded: excludePartnerIds.length,
    });
    return null;
  }

  const winner = ranked[0];
  const fee = computeOfferFee(winner.distanceKm);
  const expiresAt = new Date(Date.now() + OFFER_TTL_SEC * 1000);

  const offer = await prisma.deliveryOffer.create({
    data: {
      orderId: order.id,
      partnerId: winner.id,
      tenantId: order.tenantId,
      status: "pending",
      expiresAt,
      distanceKm: winner.distanceKm,
      feeOffered: fee,
      attempt,
    },
    select: { id: true },
  });

  // Increment totalOffers (rate calculation).
  await prisma.deliveryPartner.update({
    where: { id: winner.id },
    data: { totalOffers: { increment: 1 } },
  });

  logger.info("[offer-cascade] offer created", {
    orderId: order.id,
    partnerId: winner.id,
    attempt,
    distanceKm: winner.distanceKm.toFixed(2),
    fee,
  });

  // Notificar al partner — Push primero, WhatsApp como fallback.
  // Fire-and-forget: si fallan no afecta la cascada (cron retry).
  notifyPartnerOfOffer(winner.id, winner.phone, offer.id, {
    distanceKm: winner.distanceKm,
    fee,
  }).catch((err) =>
    logger.warn("[offer-cascade] notify partner failed", {
      partnerId: winner.id,
      error: String(err),
    }),
  );

  return { offerId: offer.id, partnerId: winner.id, attempt };
}

/**
 * Envia notificación al partner: Web Push + WhatsApp fallback.
 * URL del CTA abre la pantalla de oferta con countdown.
 */
async function notifyPartnerOfOffer(
  partnerId: string,
  phone: string,
  offerId: string,
  meta: { distanceKm: number; fee: number },
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://www.buleje.pe";
  const url = `${baseUrl}/delivery-app/oferta/${offerId}`;
  const title = "Pedido nuevo cerca tuyo";
  const body = `${meta.distanceKm.toFixed(1)} km · S/ ${meta.fee.toFixed(0)} · Aceptá en 2 min`;

  // Push
  try {
    await sendPushToPhone(phone, { title, body, url });
  } catch (err) {
    logger.warn("[offer-cascade] push failed", { partnerId, err: String(err) });
  }

  // WhatsApp fallback (queued, no bloquea)
  try {
    const wa = [
      `🛵 ${title}`,
      ``,
      `📍 ${meta.distanceKm.toFixed(1)} km`,
      `💰 S/ ${meta.fee.toFixed(0)}`,
      ``,
      `Acepta en 2 minutos:`,
      url,
    ].join("\n");
    await sendWhatsAppQueued(phone, wa, {
      tenantId: "delivery",
      context: `offer-${offerId}`,
    });
  } catch (err) {
    logger.warn("[offer-cascade] whatsapp failed", { partnerId, err: String(err) });
  }
}

/**
 * Marca offers vencidas como expired y crea siguiente offer en cascada.
 * Llamado por el cron cada 30s.
 */
export async function processCascadeTick(): Promise<{
  expired: number;
  cascadeStarted: number;
  cascadeFailed: number;
  cascadeFallback?: number;
}> {
  const now = new Date();

  // 1. Marcar pending vencidas como expired.
  /* eslint-disable no-restricted-syntax -- cron platform-level: expira ofertas vencidas en TODOS los tenants. cross-tenant intencional. */
  const expired = await prisma.deliveryOffer.updateMany({
    where: { status: "pending", expiresAt: { lt: now } },
    data: { status: "expired" },
  });
  /* eslint-enable no-restricted-syntax */

  // 2. Para cada orderId con offer recién expirada y SIN assignment:
  //    crear próxima offer.
  const orphanOrders = await prisma.deliveryOffer.findMany({
    where: { status: "expired", respondedAt: null },
    select: {
      orderId: true,
      order: {
        select: {
          id: true, tenantId: true, customerLocation: true,
        },
      },
    },
    distinct: ["orderId"],
    take: 50, // batch limit
  });

  let cascadeStarted = 0;
  let cascadeFailed = 0;

  let cascadeFallback = 0;

  for (const o of orphanOrders) {
    if (!o.order) continue;
    const assigned = await prisma.deliveryAssignment.findUnique({
      where: { orderId: o.orderId },
      select: { id: true },
    });
    if (assigned) continue;

    // Resolver coords del order. Usamos campos de Tenant fallback (config).
    // TODO: cuando migremos a customer.lat/lng, reemplazar.
    const tenant = await prisma.tenant.findUnique({
      where: { id: o.order.tenantId },
      select: { name: true },
    });
    const orderLat = -8.379; // Pucallpa default — TODO geocode real
    const orderLng = -74.553;

    const result = await createNextOffer(
      { id: o.order.id, tenantId: o.order.tenantId, customerLocation: o.order.customerLocation },
      orderLat,
      orderLng,
    );
    if (result) {
      cascadeStarted++;
    } else {
      // ── FALLBACK 2026-05-05 ──
      // No hay otros candidatos disponibles (o todos están offline / ya
      // tuvieron oferta). En vez de dejar el pedido huérfano, mantenemos
      // viva la oferta MÁS RECIENTE para el último partner — extendemos
      // su expiresAt a +24h. Cuando ese partner se conecte podrá aceptar.
      //
      // Filosofía: "no importa si pasan los 2 min, la oferta sigue ahí
      // hasta que alguien acepte o admin reasigne".
      const lastOffer = await prisma.deliveryOffer.findFirst({
        where: {
          orderId: o.orderId,
          respondedAt: null,
        },
        orderBy: { offeredAt: "desc" },
        select: { id: true, partnerId: true, status: true },
      });
      if (lastOffer) {
        const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await prisma.deliveryOffer.update({
          where: { id: lastOffer.id },
          data: {
            status: "pending",
            expiresAt: newExpiresAt,
          },
        });
        cascadeFallback++;
        logger.info("[offer-cascade] no candidates left — extending last offer +24h", {
          orderId: o.orderId,
          tenant: tenant?.name,
          partnerId: lastOffer.partnerId,
          offerId: lastOffer.id,
        });
      } else {
        cascadeFailed++;
        logger.warn("[offer-cascade] no candidates and no offer to extend", {
          orderId: o.order.id,
          tenant: tenant?.name,
        });
      }
    }
  }

  return { expired: expired.count, cascadeStarted, cascadeFailed, cascadeFallback };
}
