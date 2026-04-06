export interface PurchaseProduct {
  id: number;
  name: string;
  category: string;
  costPrice?: number | null;
  price: number;
  image: string;
  stock?: number | null;
  stockMin?: number | null;
  stockMax?: number | null;
  unit: string;
  barcode?: string | null;
  active?: boolean;
}

export interface PurchaseSupplier {
  id: string;
  name: string;
  phone?: string | null;
  ruc?: string | null;
}

export interface PurchaseCartItem {
  product: PurchaseProduct;
  quantity: number;
}

export type PaymentMethod = "contado" | "credito_7" | "credito_15" | "credito_30" | "transferencia";

export type PurchaseSortBy = "stock" | "price" | "name";

export type PurchaseViewMode = "grid" | "list";

/** Calcula cantidad sugerida para reposición */
export function calculateSuggestedQty(product: Pick<PurchaseProduct, "stock" | "stockMin" | "stockMax">): number {
  const targetStock = product.stockMax ?? (((product.stockMin ?? 0) * 3) || 10);
  return Math.max(1, targetStock - (product.stock ?? 0));
}

/** Verifica si un producto necesita reposición */
export function needsReorder(product: Pick<PurchaseProduct, "stock" | "stockMin">): boolean {
  return (product.stock ?? 0) <= (product.stockMin ?? 0);
}
