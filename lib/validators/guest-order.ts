/**
 * guest-order.ts — Zod schemas para Guest Checkout (compra sin login).
 *
 * Regla CLAUDE.md #2: safeParse() siempre.
 * ZONA DE PELIGRO: este flujo SÍ persiste Orders reales (source="guest"). El
 * `unitPrice` del item es solo un hint del cliente y NO es autoritativo — el
 * route /api/guest/orders/create recalcula precio y total desde Product.price
 * (regla #6). No confiar nunca en el unitPrice del body para cobrar.
 */

import { z } from "zod";

const PERU_PHONE_RE = /^(\+?51)?9\d{8}$/;

export const GuestOrderSchema = z.object({
  // Datos del invitado
  name: z.string().min(2).max(120),
  phone: z.string().regex(PERU_PHONE_RE, "Celular peruano inválido (9 dígitos)"),
  email: z.string().email().max(180),

  // Dirección completa (no hay addresses guardados)
  address: z.object({
    line1: z.string().min(5).max(200),
    reference: z.string().max(200).optional(),
    zone: z.string().max(80).optional(),
  }),

  // Payment
  paymentMethod: z.enum(["yape", "plin", "cash"]),

  // Items del carrito (snapshot del momento)
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        storeProductId: z.string().min(1),
        storeId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
        unitPrice: z.number().positive(),
      }),
    )
    .min(1)
    .max(50),

  notes: z.string().max(400).optional(),
});

export type GuestOrderInput = z.infer<typeof GuestOrderSchema>;
