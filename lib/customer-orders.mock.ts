/**
 * Mock data para demo — pedidos del cliente.
 * Reemplazar con API real cuando exista endpoint customer-side.
 * ADR: este archivo es temporal MVP, no conecta a orders.db.ts.
 */

export type MockOrderItem = {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  image: string;
};

export type MockOrder = {
  id: string;
  items: MockOrderItem[];
  total: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod: "yape" | "efectivo";
  createdAt: string;
  updatedAt: string;
  notes?: string;
  storeName?: string;
  storeDistance?: string;
  deliveryAddress?: string;
  deliveryWindow?: string;
  courierName?: string;
  courierPhone?: string;
};

export const MOCK_ORDERS: MockOrder[] = [
  {
    id: "ord_abc001",
    items: [
      { productId: 1, name: "Arroz Costeño 1 kg", price: 4.5, quantity: 2, unit: "kg", image: "" },
      { productId: 2, name: "Aceite Primor 1L", price: 7.9, quantity: 1, unit: "unid", image: "" },
      { productId: 3, name: "Azúcar Rubia 1 kg", price: 3.2, quantity: 1, unit: "kg", image: "" },
    ],
    total: 20.1,
    status: "en_camino",
    paymentMethod: "yape",
    createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    storeName: "Bodega Doña Elena",
    storeDistance: "0.8 km",
    deliveryAddress: "Jr. Ucayali 342, Pucallpa",
    deliveryWindow: "15 – 30 min",
    courierName: "Carlos Ríos",
    courierPhone: "951234567",
  },
  {
    id: "ord_abc002",
    items: [
      { productId: 4, name: "Pan de molde Bimbo", price: 5.5, quantity: 1, unit: "unid", image: "" },
      { productId: 5, name: "Leche Gloria 400g", price: 4.2, quantity: 2, unit: "tarro", image: "" },
    ],
    total: 13.9,
    status: "entregado",
    paymentMethod: "efectivo",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 47).toISOString(),
    storeName: "Bodega San Martín",
    storeDistance: "1.2 km",
    deliveryAddress: "Jr. Ucayali 342, Pucallpa",
    deliveryWindow: "20 – 40 min",
  },
  {
    id: "ord_abc003",
    items: [
      { productId: 6, name: "Fideos Don Vittorio 500g", price: 3.1, quantity: 3, unit: "paquete", image: "" },
      { productId: 7, name: "Detergente Ariel 500g", price: 8.9, quantity: 1, unit: "bolsa", image: "" },
      { productId: 8, name: "Jabón Bolívar x3", price: 6.0, quantity: 1, unit: "pack", image: "" },
    ],
    total: 24.2,
    status: "entregado",
    paymentMethod: "yape",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7 + 1000 * 60 * 25).toISOString(),
    storeName: "Bodega Doña Elena",
    storeDistance: "0.8 km",
    deliveryAddress: "Jr. Ucayali 342, Pucallpa",
    notes: "Dejar en la puerta principal",
  },
  {
    id: "ord_abc004",
    items: [
      { productId: 9, name: "Gaseosa Inca Kola 1.5L", price: 5.5, quantity: 2, unit: "botella", image: "" },
    ],
    total: 11.0,
    status: "cancelado",
    paymentMethod: "efectivo",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14 + 1000 * 60 * 5).toISOString(),
    storeName: "Bodega San Martín",
    storeDistance: "1.2 km",
    deliveryAddress: "Jr. Ucayali 342, Pucallpa",
  },
];

export const MOCK_STATS = {
  activeOrders: MOCK_ORDERS.filter((o) =>
    ["pendiente", "confirmado", "en_camino"].includes(o.status)
  ).length,
  loyaltyPoints: 1_240,
  availableCoupons: 3,
  favoriteBodegas: 2,
};
