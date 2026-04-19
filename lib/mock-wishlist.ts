/**
 * Mock data para Wishlist MVP — favoritos del cliente.
 * ADR: temporal, reemplazar con API real cuando exista endpoint customer-side.
 * No conecta a orders.db.ts ni a Prisma.
 */

export type WishlistProduct = {
  id: string;
  name: string;
  price: number;
  category: string;
  unit: string;
  inStock: boolean;
  storeName: string;
  storeSlug: string;
  imageUrl: null;
  addedAt: number;
};

export const MOCK_WISHLIST_PRODUCTS: WishlistProduct[] = [
  {
    id: "wl_001",
    name: "Arroz Costeño 1 kg",
    price: 4.5,
    category: "abarrotes",
    unit: "kg",
    inStock: true,
    storeName: "Bodega Doña Elena",
    storeSlug: "bodega-dona-elena",
    imageUrl: null,
    addedAt: Date.now() - 1000 * 60 * 30,
  },
  {
    id: "wl_002",
    name: "Aceite Primor 1L",
    price: 7.9,
    category: "abarrotes",
    unit: "unid",
    inStock: true,
    storeName: "Buleje",
    storeSlug: "bodega-san-martin",
    imageUrl: null,
    addedAt: Date.now() - 1000 * 60 * 60 * 2,
  },
  {
    id: "wl_003",
    name: "Detergente Ariel 500g",
    price: 8.9,
    category: "limpieza",
    unit: "bolsa",
    inStock: false,
    storeName: "Bodega Doña Elena",
    storeSlug: "bodega-dona-elena",
    imageUrl: null,
    addedAt: Date.now() - 1000 * 60 * 60 * 5,
  },
  {
    id: "wl_004",
    name: "Leche Gloria 400g",
    price: 4.2,
    category: "lacteos",
    unit: "tarro",
    inStock: true,
    storeName: "Buleje",
    storeSlug: "bodega-san-martin",
    imageUrl: null,
    addedAt: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: "wl_005",
    name: "Gaseosa Inca Kola 1.5L",
    price: 5.5,
    category: "bebidas",
    unit: "botella",
    inStock: true,
    storeName: "Bodega Doña Elena",
    storeSlug: "bodega-dona-elena",
    imageUrl: null,
    addedAt: Date.now() - 1000 * 60 * 60 * 48,
  },
  {
    id: "wl_006",
    name: "Pan de molde Bimbo",
    price: 5.5,
    category: "panaderia",
    unit: "unid",
    inStock: false,
    storeName: "Buleje",
    storeSlug: "bodega-san-martin",
    imageUrl: null,
    addedAt: Date.now() - 1000 * 60 * 60 * 72,
  },
];

/** Productos sugeridos basados en categorías de la wishlist */
export const MOCK_SUGGESTIONS: WishlistProduct[] = [
  {
    id: "sg_001",
    name: "Azúcar Rubia 1 kg",
    price: 3.2,
    category: "abarrotes",
    unit: "kg",
    inStock: true,
    storeName: "Bodega Doña Elena",
    storeSlug: "bodega-dona-elena",
    imageUrl: null,
    addedAt: 0,
  },
  {
    id: "sg_002",
    name: "Fideos Don Vittorio 500g",
    price: 3.1,
    category: "abarrotes",
    unit: "paquete",
    inStock: true,
    storeName: "Buleje",
    storeSlug: "bodega-san-martin",
    imageUrl: null,
    addedAt: 0,
  },
  {
    id: "sg_003",
    name: "Jabón Bolívar x3",
    price: 6.0,
    category: "limpieza",
    unit: "pack",
    inStock: true,
    storeName: "Bodega Doña Elena",
    storeSlug: "bodega-dona-elena",
    imageUrl: null,
    addedAt: 0,
  },
  {
    id: "sg_004",
    name: "Yogur Gloria Fresa 200ml",
    price: 2.8,
    category: "lacteos",
    unit: "unid",
    inStock: true,
    storeName: "Buleje",
    storeSlug: "bodega-san-martin",
    imageUrl: null,
    addedAt: 0,
  },
];
