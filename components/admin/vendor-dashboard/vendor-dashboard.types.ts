// Tipos compartidos para los componentes del dashboard del vendedor

export type WeeklyRevenueDay = {
  date: string;   // "YYYY-MM-DD"
  total: number;
};

export type VendorKPIs = {
  salesToday: number;
  salesYesterday: number;
  salesLastWeek: number;
  pendingOrdersCount: number;
  lowStockCount: number;
};

export type VendorOrderItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  image: string;
};

export type VendorOrder = {
  id: string;
  customer: {
    name: string;
    phone?: string;
    location: string;
    reference: string;
  };
  items: VendorOrderItem[];
  total: number;
  status: string;
  paymentMethod?: string;
  createdAt: string;
  updatedAt: string;
};

export type VendorLowStockProduct = {
  id: number;
  name: string;
  category: string;
  stock?: number;
  stockMin?: number;
  unit: string;
  image: string;
};

export type VendorDashboardData = {
  kpis: VendorKPIs;
  pendingOrders: VendorOrder[];
  lowStockProducts: VendorLowStockProduct[];
  recentSales: VendorOrder[];
  weeklyRevenue: WeeklyRevenueDay[];
};
