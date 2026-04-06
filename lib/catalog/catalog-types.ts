export type CatalogCategory =
  | "abarrotes"
  | "lacteos"
  | "bebidas"
  | "snacks"
  | "limpieza"
  | "carnes"
  | "frutas-verduras"
  | "panaderia"
  | "licores"
  | "congelados";

export interface CatalogProduct {
  catalogId: string;
  name: string;
  brand: string;
  category: CatalogCategory;
  subcategory?: string;
  suggestedPrice: number;
  suggestedCostPrice?: number;
  unit: string;
  emoji: string;
  barcode?: string;
  presentation?: string;
  tags?: string[];
}

export interface CatalogCategoryMeta {
  id: CatalogCategory;
  label: string;
  emoji: string;
  color: string;
}

export interface CatalogCartItem {
  product: CatalogProduct;
  stock: number;
  price: number;
  costPrice: number;
}
