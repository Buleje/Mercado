import { Gift, Sparkles, Zap, UserPlus, PartyPopper } from "@buleje/design-system/icons";

/** Tipos, reglas y ayudas de Cupones (antes arriba de CouponsTab). */
export type Coupon = {
  id: string; code: string; description: string;
  discountType: "percent" | "fixed" | "giftcard"; discountValue: number;
  balance?: number;
  minPurchase?: number; maxUses?: number; usedCount: number;
  active: boolean; expiresAt?: string; createdAt: string;
  storeId?: string | null;
};

export type AutoRule = {
  id: string;
  type: "birthday" | "first-purchase" | "inactive" | "min-spend" | "referral";
  enabled: boolean;
  config: {
    discountType?: "percent" | "fixed";
    discountValue?: number;
    validityDays?: number;
    inactiveDays?: number;
    minSpend?: number;
    autoSend?: boolean;
  };
};

export type GeneratedCouponLog = {
  id: string;
  date: string;
  customer: string;
  ruleType: string;
  couponCode: string;
  status: "sent" | "pending" | "used";
};

export const ruleConfigs = {
  birthday: { label: "Cumpleaños", icon: PartyPopper, desc: "Cupón automático en cumpleaños del cliente" },
  "first-purchase": { label: "Primera compra", icon: UserPlus, desc: "Bienvenida para nuevos clientes" },
  inactive: { label: "Cliente inactivo", icon: Zap, desc: "Reactivar clientes sin compras recientes" },
  "min-spend": { label: "Gasto mínimo", icon: Gift, desc: "Recompensa por alcanzar monto acumulado" },
  referral: { label: "Referidos", icon: Sparkles, desc: "Cupón para referidor y referido" },
};
