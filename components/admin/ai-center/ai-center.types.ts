export type Product = {
  id: number | string;
  name: string;
  stock?: number;
  stockMin?: number;
  price?: number;
  costPrice?: number;
  active?: boolean;
  category?: string;
  unit?: string;
  expiresAt?: string;
};

export type OrderItem = {
  id: number | string;
  name: string;
  quantity: number;
  price: number;
};

export type Order = {
  id: string;
  status: string;
  total: number;
  createdAt?: string;
  items: OrderItem[];
  customer?: { name?: string; phone?: string };
};

export type SaleItem = {
  productId: number | string;
  name: string;
  quantity: number;
  price: number;
};

export type Sale = {
  id: string;
  total: number;
  createdAt?: string;
  items: SaleItem[];
  payment?: string;
  customerPhone?: string;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  createdAt?: string;
  totalSpent?: number;
  lastPurchase?: string;
};

export type ExpenseSummary = {
  totalMonth?: number;
  totalWeek?: number;
  byCategory?: Record<string, number>;
};

export type BusinessData = {
  products: Product[];
  orders: Order[];
  sales: Sale[];
  customers: Customer[];
  expenses: ExpenseSummary;
  alerts?: { lowStock: number; pendingOrders: number; overduePayables: number };
  lastUpdated: number;
};
