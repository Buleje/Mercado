"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { MapPin, Truck, Package, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

interface Order {
  id: string;
  customerName: string;
  customerLocation?: string;
  customerReference?: string;
  total: number;
  status: string;
  items?: { name: string; qty: number }[];
}

interface ZoneGroup {
  zone: string;
  orders: Order[];
  totalValue: number;
}

/**
 * Groups pending delivery orders by zone/area for efficient routing.
 * The repartidor sees: "Zone B: 4 pedidos, empezar por Jr. Ucayali"
 */
export default function DeliveryZoneGrouper() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedZone, setExpandedZone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/orders?limit=50");
      if (!res.ok) return;
      const data = await res.json();
      const arr: Order[] = Array.isArray(data) ? data : (data.orders ?? []);
      // Only delivery orders (confirmed or en_camino)
      setOrders(arr.filter(o => ["confirmado", "en_camino", "confirmed", "delivering"].includes(o.status)));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Group by zone (extract from location/reference)
  const zones = useMemo(() => {
    const groups = new Map<string, Order[]>();

    for (const order of orders) {
      const loc = (order.customerLocation ?? order.customerReference ?? "").toLowerCase();
      let zone = "Sin ubicacion";

      // Simple zone detection by keywords
      if (loc.includes("centro") || loc.includes("plaza") || loc.includes("mercado")) zone = "Centro";
      else if (loc.includes("norte") || loc.includes("san juan")) zone = "Zona Norte";
      else if (loc.includes("sur") || loc.includes("manantay")) zone = "Zona Sur";
      else if (loc.includes("este") || loc.includes("yarina")) zone = "Zona Este";
      else if (loc.includes("oeste")) zone = "Zona Oeste";
      else if (loc.length > 3) zone = "Otros";

      const existing = groups.get(zone) ?? [];
      existing.push(order);
      groups.set(zone, existing);
    }

    const result: ZoneGroup[] = Array.from(groups.entries())
      .map(([zone, zoneOrders]) => ({
        zone,
        orders: zoneOrders,
        totalValue: zoneOrders.reduce((s, o) => s + (o.total ?? 0), 0),
      }))
      .sort((a, b) => b.orders.length - a.orders.length);

    return result;
  }, [orders]);

  const fmt = (n: number) => `S/${n.toFixed(2)}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" /> Pedidos por Zona
          </h2>
          <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
            {orders.length} pedido{orders.length !== 1 ? "s" : ""} por entregar
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
          <RefreshCw className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {zones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
          <Package className="h-10 w-10 text-gray-300 dark:text-muted" />
          <p className="text-sm font-semibold text-gray-500 dark:text-muted">No hay pedidos por entregar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {zones.map(group => {
            const isExpanded = expandedZone === group.zone;
            return (
              <div key={group.zone} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedZone(isExpanded ? null : group.zone)}
                  className="w-full p-3.5 flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <MapPin className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-foreground">{group.zone}</p>
                      <p className="text-xs text-gray-500 dark:text-muted">
                        {group.orders.length} pedido{group.orders.length !== 1 ? "s" : ""} — {fmt(group.totalValue)}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-[var(--rule-soft)] dark:border-card-border divide-y divide-gray-50 dark:divide-card-border">
                    {group.orders.map((order, i) => (
                      <div key={order.id} className="px-3.5 py-2.5 flex items-center gap-3">
                        <span className="h-6 w-6 rounded-full bg-gray-100 dark:bg-accent flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-gray-500 shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 dark:text-foreground truncate">{order.customerName}</p>
                          <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted truncate">
                            {order.customerLocation || order.customerReference || "Sin direccion"}
                          </p>
                        </div>
                        <span className="text-xs font-extrabold text-primary shrink-0">{fmt(order.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
