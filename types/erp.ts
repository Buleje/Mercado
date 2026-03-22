// types/erp.ts
// Tipos core unificados para todo el ERP Bodega San Martín

export interface Product {
  id: number | string;
  name: string;
  category?: string;
  price: number;
  costPrice?: number;
  stock?: number;
  stockMin?: number;
  stockMax?: number;
  active?: boolean;
  unit: string;
  badge?: string;
  image?: string;
  barcode?: string;
  sku?: string;
  description?: string;
  supplierId?: string | number;
  expiryDate?: string;
  isVariant?: boolean;
  variantOf?: string | number;
  variantAttr?: string;
  // Campos extra calculados o de análisis (DemandPrediction, BCG, Reorder)
  avgDailySales?: number;
  leadTimeDays?: number;
  dynamicROP?: number;
  eoq?: number;
  daysUntilStockout?: number;
  currentStock?: number;
  status?: string;
  // Fallback genérico para componentes muy agnósticos
  [key: string]: any;
}

export interface SaleItem {
  productId?: number | string;
  name?: string;
  price?: number;
  quantity: number;
  unit?: string;
  image?: string;
  [key: string]: any;
}

export interface Sale {
  id: string | number;
  items?: SaleItem[];
  total: number;
  payment?: string | "efectivo" | "yape" | "plin" | "tarjeta" | "transferencia";
  amountPaid?: number;
  change?: number;
  customerPhone?: string;
  createdAt: string;
  status?: string;
  [key: string]: any;
}

export interface PurchaseItem {
  productId?: number | string;
  name?: string;
  quantity: number;
  unitCost?: number;
  price?: number;
  unit?: string;
  [key: string]: any;
}

export interface Purchase {
  id: string | number;
  supplierId?: string | number;
  supplierName?: string;
  items?: PurchaseItem[];
  total?: number;
  status?: string;
  createdAt?: string;
  expectedDate?: string;
  notes?: string;
  [key: string]: any;
}

export interface Supplier {
  id: string | number;
  name: string;
  createdAt?: string;
  phone?: string;
  email?: string;
  address?: string;
  rating?: number;
  active?: boolean;
  [key: string]: any;
}

export interface Customer {
  id?: string | number;
  phone?: string;
  name: string;
  location?: string;
  email?: string;
  points?: number;
  createdAt?: string;
  [key: string]: any;
}
