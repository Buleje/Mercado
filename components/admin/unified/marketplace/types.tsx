// ─────────────────────────────────────────────
// Tipos compartidos del módulo Marketplace
// Extraídos de MarketplaceModule.tsx — NO modificar lógica de negocio
// ─────────────────────────────────────────────

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface StoreHours {
  open: string;   // "08:00"
  close: string;  // "20:00"
  closed: boolean;
}

export interface StoreData {
  id?: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string;
  category: string;
  zone: string;
  commissionRate: number;
  isActive: boolean;
  vacationMode?: boolean;
  vacationMessage?: string;
  hours?: Record<DayKey, StoreHours>;
  /** Subcategoría dentro de `category` — id del catálogo global o string custom. */
  subcategory?: string | null;
  /** Zonas de cobertura (ids del catálogo MARKETPLACE_ZONES o strings libres). */
  coverageZones?: string[];
  /** Categorías propias del tenant — solo visibles en su storefront. */
  customCategories?: Array<{
    id: string;
    label: string;
    imageUrl: string | null;
    subcategories: Array<{ id: string; label: string; imageUrl: string | null }>;
  }>;
}

export interface MarketplaceProduct {
  id: string;
  name: string;
  isActive: boolean;
  retailPrice: number;
  wholesalePrice: number;
  stock: number;
  sku: string;
  image: string | null;
  description: string | null;
  category: string | null;
}

export interface MarketplaceOrder {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerLocation: string;
  customerReference: string;
  total: number;
  status: string;
  createdAt: string;
  itemsCount: number;
}

export interface CommissionEntry {
  id: string;
  orderId: string;
  amount: number;
  status: "pendiente" | "liquidado" | "pagado";
  createdAt: string;
  orderTotal: number;
}

export interface CommissionSummary {
  pendiente: number;
  liquidado: number;
  pagado: number;
}

export interface ReviewItem {
  id: string;
  name: string;
  text: string;
  rating: number;
  status: string;
  date: string;
  phone?: string | null;
  storeId?: string | null;
  adminReply?: string | null;
  adminReplyDate?: string | null;
}

// ── Status badge helpers (solo data, sin iconos — los iconos se inyectan en cada tab) ──

export const ORDER_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendiente:   { label: "Pendiente",  className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" },
  confirmado:  { label: "Confirmado", className: "bg-[var(--accent-soft)] text-[var(--data-success-500)]" },
  en_camino:   { label: "En camino",  className: "bg-[var(--surface-sunken)] text-[var(--text-primary)]" },
  entregado:   { label: "Entregado",  className: "bg-[var(--accent-soft)] text-[var(--data-success-500)]" },
  cancelado:   { label: "Cancelado",  className: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" },
};

// ── UI primitivos compartidos (sin "use client" — son componentes puros) ───
import React from "react";

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-10 w-10 bg-gray-200 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-3 bg-gray-200 rounded w-1/3" />
          </div>
          <div className="h-8 w-20 bg-gray-200 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
