import { Banknote, Smartphone, CreditCard, HandCoins } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────────

export type PaymentLineMethod = "efectivo" | "yape" | "plin" | "tarjeta" | "fiado";

export interface PaymentLine {
  method: PaymentLineMethod;
  amount: number;
}

export type ComprobanteTipo = "ticket" | "boleta" | "factura" | "cotizacion" | "proforma";

export interface PaymentResult {
  payments: PaymentLine[];
  customerPhone?: string;
  customerName?: string;
  comprobanteTipo: ComprobanteTipo;
  comprobanteRuc?: string;
}

export interface POSPaymentModalProps {
  total: number;
  cartCount: number;
  cartItems?: { name: string; quantity: number; price: number; unit: string }[];
  onConfirm: (payments: PaymentLine[], customerPhone?: string, extra?: { comprobanteTipo: ComprobanteTipo; comprobanteRuc?: string; customerName?: string; discountAmount?: number; discountPercent?: number }) => void;
  onCancel: () => void;
  processing?: boolean;
  onRepeatOrder?: (items: { productId: number; name: string; quantity: number; price: number }[]) => void;
  /**
   * Cliente elegido. Vive en usePOSCobro (no en el modal) para que el carrito muestre lo que debe
   * y para que no se pierda si cierras el cobro y vuelves a abrirlo.
   */
  customerPhone: string;
  customerName: string;
  onCustomerPhone: (phone: string) => void;
  onCustomerName: (name: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

export function fmt(n: number) {
  return `${formatCurrency(n)}`;
}

export function isValidRuc(ruc: string): boolean {
  if (ruc.length !== 11) return false;
  return ruc.startsWith("10") || ruc.startsWith("20");
}

export const METHODS: {
  id: PaymentLineMethod;
  label: string;
  icon: typeof Banknote;
  color: string;
}[] = [
  { id: "efectivo", label: "Efectivo", icon: Banknote, color: "emerald" },
  { id: "yape", label: "Yape", icon: Smartphone, color: "purple" },
  { id: "plin", label: "Plin", icon: Smartphone, color: "teal" },
  { id: "tarjeta", label: "Tarjeta", icon: CreditCard, color: "blue" },
  { id: "fiado", label: "Fiado", icon: HandCoins, color: "amber" },
];
