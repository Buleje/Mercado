"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  TrendingUp, DollarSign, ShoppingCart, Users, Package,
  AlertTriangle, BarChart3, Clock,
  Loader2, CreditCard, Banknote,
  AlertCircle, PackageX, Timer, Truck, Star, Receipt, Percent,
  ShoppingBasket, RefreshCw, Lightbulb, Zap, CalendarDays,
  UserCheck, TrendingDown, Download, type LucideIcon,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";
import { OrderStats } from "@/components/OrderStats";

// ── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: number; name: string; category: string; price: number;
  costPrice?: number; stock?: number; stockMin?: number; stockMax?: number;
  unit: string; active: boolean; badge?: string; image: string;
}
interface OrderItem { id: number; name: string; price: number; quantity: number; unit: string; image: string; }
interface Order {
  id: string; customer: { name: string; phone?: string; location: string; reference: string };
  items: OrderItem[]; total: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: "yape" | "efectivo"; createdAt: string; updatedAt: string; notes?: string;
}
interface SaleItem { productId: number; name: string; price: number; quantity: number; unit: string; }
interface Sale {
  id: string; items: SaleItem[]; total: number;
  payment: "efectivo" | "yape" | "plin" | "tarjeta";
  amountPaid: number; change: number; customerPhone?: string; createdAt: string;
}
interface Customer { phone: string; name: string; location: string; createdAt: string; }
interface Purchase {
  id: string; supplierId: string; supplierName: string;
  items: { productId: number; name: string; quantity: number; unitCost: number; unit: string }[];
  total: number; status: string; createdAt: string;
}
interface Payable { id: string; supplierId: string; supplierName: string; amount: number; paidAmount: number; status: string; dueDate: string; }
interface Supplier { id: string; name: string; createdAt: string; }
interface Review { id: string; name: string; rating: number; text: string; date: string; }

type Period = "hoy" | "semana" | "mes" | "todo";
type Section = "resumen" | "ventas" | "productos" | "inventario" | "clientes" | "compras" | "caja";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/${n.toFixed(2)}`; }
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); } catch { return iso; }
}
function fmtDateFull(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; }
}
function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}
function inPeriod(dateStr: string, period: Period): boolean {
  if (period === "todo") return true;
  const d = new Date(dateStr), now = new Date();
  if (period === "hoy") return d.toDateString() === now.toDateString();
  if (period === "semana") { const w = new Date(now); w.setDate(w.getDate() - 7); return d >= w; }
  if (period === "mes") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  return true;
}
function inPrevPeriod(dateStr: string, period: Period): boolean {
  if (period === "todo") return false;
  const d = new Date(dateStr), now = new Date();
  if (period === "hoy") { const y = new Date(now); y.setDate(y.getDate()-1); return d.toDateString()===y.toDateString(); }
  if (period === "semana") { const w2 = new Date(now); w2.setDate(w2.getDate()-7); const w1 = new Date(now); w1.setDate(w1.getDate()-14); return d >= w1 && d < w2; }
  if (period === "mes") { const pm = new Date(now.getFullYear(), now.getMonth()-1, 1); return d.getMonth()===pm.getMonth() && d.getFullYear()===pm.getFullYear(); }
  return false;
}
function dateKey(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function dayLabel(dk: string) { return new Date(dk+"T12:00:00").toLocaleDateString("es-PE",{day:"2-digit",month:"short"}); }

const CAT_LABELS: Record<string,string> = { "frutas-verduras":"Frutas y Verduras", abarrotes:"Abarrotes", carnes:"Carnes", lacteos:"Lácteos", bebidas:"Bebidas", limpieza:"Limpieza" };
const CAT_COLORS: Record<string,string> = { "frutas-verduras":"#10b981", abarrotes:"#f59e0b", carnes:"#ef4444", lacteos:"#3b82f6", bebidas:"#8b5cf6", limpieza:"#06b6d4" };
const PAY_LABELS: Record<string,string> = { efectivo:"Efectivo", yape:"Yape", plin:"Plin", tarjeta:"Tarjeta", transferencia:"Transferencia" };
const PAY_COLORS: Record<string,string> = { efectivo:"#10b981", yape:"#8b5cf6", plin:"#06b6d4", tarjeta:"#3b82f6", transferencia:"#f59e0b" };
const DAYS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{className?:string}> }[] = [
  { id: "resumen",    label: "Resumen",     icon: BarChart3 },
  { id: "ventas",     label: "Ventas",      icon: DollarSign },
  { id: "productos",  label: "Productos",   icon: TrendingUp },
  { id: "inventario", label: "Inventario",  icon: Package },
  { id: "clientes",   label: "Clientes",    icon: Users },
  { id: "compras",    label: "Compras",     icon: Truck },
  { id: "caja",       label: "Caja",        icon: Banknote },
];

// ── Main Component ───────────────────────────────────────────────────────────

export default function DashboardTab() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("mes");
  const [section, setSection] = useState<Section>("resumen");

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  // Auto-refresh (real-time dashboard)
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const knownOrderIdsRef = useRef<Set<string> | null>(null);
  const autoRefreshRef = useRef(autoRefresh);
  autoRefreshRef.current = autoRefresh;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/dashboard");
      if (res.ok) {
        const d = await res.json();
        const freshOrders: Order[] = d.orders ?? [];
        // Detect new orders vs previous poll
        if (knownOrderIdsRef.current !== null) {
          const newIds = freshOrders.filter(o => !knownOrderIdsRef.current!.has(o.id) && o.status === "pendiente");
          if (newIds.length > 0) {
            setNewOrderCount(prev => prev + newIds.length);
            try { new Audio("/sounds/ding.mp3").play(); } catch { /* optional sound */ }
          }
        }
        knownOrderIdsRef.current = new Set(freshOrders.map(o => o.id));
        setProducts(d.products ?? []);
        setOrders(freshOrders);
        setSales(d.sales ?? []);
        setCustomers(d.customers ?? []);
        setPurchases(d.purchases ?? []);
        setPayables(d.payables ?? []);
        setSuppliers(d.suppliers ?? []);
        setReviews(d.reviews ?? []);
      }
    } catch { /* silent */ }
    setLoading(false);
    setLastUpdated(new Date());
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      if (autoRefreshRef.current) load();
    }, refreshInterval * 1000);
    return () => clearInterval(t);
  }, [autoRefresh, refreshInterval, load]);

  // ── Stats ──────────────────────────────────────────────────────────────

  const d = useMemo(() => {
    const fOrders = orders.filter(o => o.status !== "cancelado" && inPeriod(o.createdAt, period));
    const cancelled = orders.filter(o => o.status === "cancelado" && inPeriod(o.createdAt, period));
    const fSales = sales.filter(s => inPeriod(s.createdAt, period));
    const fPurchases = purchases.filter(p => inPeriod(p.createdAt, period));

    const costMap = new Map(products.map(p => [p.id, p.costPrice ?? p.price * 0.7]));
    const orderRev = fOrders.reduce((a,o) => a+o.total,0);
    const saleRev = fSales.reduce((a,s) => a+s.total,0);
    const ventas = orderRev + saleRev;

    let costo = 0;
    fOrders.forEach(o => o.items.forEach(i => { costo += (costMap.get(i.id) ?? i.price*0.7)*i.quantity; }));
    fSales.forEach(s => s.items.forEach(i => { costo += (costMap.get(i.productId) ?? i.price*0.7)*i.quantity; }));
    const utilidad = ventas - costo;
    const margen = ventas > 0 ? (utilidad/ventas)*100 : 0;
    const tickets = fOrders.length + fSales.length;
    const ticketProm = tickets > 0 ? ventas/tickets : 0;

    // ── Comparación vs periodo anterior ──
    const pfOrders = orders.filter(o => o.status !== "cancelado" && inPrevPeriod(o.createdAt, period));
    const pfSales = sales.filter(s => inPrevPeriod(s.createdAt, period));
    const prevVentas = pfOrders.reduce((a,o) => a+o.total, 0) + pfSales.reduce((a,s) => a+s.total, 0);
    let prevCosto = 0;
    pfOrders.forEach(o => o.items.forEach(i => { prevCosto += (costMap.get(i.id) ?? i.price*0.7)*i.quantity; }));
    pfSales.forEach(s => s.items.forEach(i => { prevCosto += (costMap.get(i.productId) ?? i.price*0.7)*i.quantity; }));
    const prevUtilidad = prevVentas - prevCosto;
    const prevTickets = pfOrders.length + pfSales.length;
    const prevTicketProm = prevTickets > 0 ? prevVentas/prevTickets : 0;
    const pctDelta = (curr: number, prev: number): number | null => {
      if (period === "todo" || prev === 0) return null;
      return ((curr - prev) / prev) * 100;
    };

    let uds = 0;
    fOrders.forEach(o => o.items.forEach(i => { uds += i.quantity; }));
    fSales.forEach(s => s.items.forEach(i => { uds += i.quantity; }));

    const uniqueClients = new Set<string>();
    fOrders.forEach(o => { if(o.customer.phone) uniqueClients.add(o.customer.phone); });
    fSales.forEach(s => { if(s.customerPhone) uniqueClients.add(s.customerPhone); });

    const stockVal = products.reduce((a,p) => a+(p.stock??0)*(p.costPrice??p.price*0.7),0);
    const stockCritico = products.filter(p => p.active && p.stock!==undefined && p.stockMin!==undefined && p.stock<=p.stockMin);
    const agotados = products.filter(p => p.active && (p.stock??0)===0);
    const soldIds = new Set<number>();
    orders.forEach(o => o.items.forEach(i => soldIds.add(i.id)));
    sales.forEach(s => s.items.forEach(i => soldIds.add(i.productId)));
    const sinMov = products.filter(p => p.active && !soldIds.has(p.id));

    const catMap = new Map<string,number>();
    fOrders.forEach(o => o.items.forEach(i => { const c = products.find(p=>p.id===i.id)?.category??"otros"; catMap.set(c,(catMap.get(c)??0)+i.price*i.quantity); }));
    fSales.forEach(s => s.items.forEach(i => { const c = products.find(p=>p.id===i.productId)?.category??"otros"; catMap.set(c,(catMap.get(c)??0)+i.price*i.quantity); }));
    const catSales = [...catMap.entries()].map(([c,t])=>({cat:c,total:t,label:CAT_LABELS[c]??c,color:CAT_COLORS[c]??"#94a3b8"})).sort((a,b)=>b.total-a.total);

    const payMap = new Map<string,number>();
    fOrders.forEach(o => { const m=o.paymentMethod??"efectivo"; payMap.set(m,(payMap.get(m)??0)+o.total); });
    fSales.forEach(s => { payMap.set(s.payment,(payMap.get(s.payment)??0)+s.total); });
    const payments = [...payMap.entries()].map(([m,t])=>({method:m,total:t,label:PAY_LABELS[m]??m,color:PAY_COLORS[m]??"#94a3b8"})).sort((a,b)=>b.total-a.total);
    const payTotal = payments.reduce((a,p)=>a+p.total,0);

    const dailyMap = new Map<string,number>();
    [...fOrders.map(o=>({d:o.createdAt,t:o.total})),...fSales.map(s=>({d:s.createdAt,t:s.total}))].forEach(x => { const k=dateKey(x.d); dailyMap.set(k,(dailyMap.get(k)??0)+x.t); });
    const daily = [...dailyMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-14);
    const maxDaily = Math.max(...daily.map(([,v])=>v),1);

    const hourMap = new Map<string,number>();
    [...fOrders,...fSales.map(s=>({...s,createdAt:s.createdAt}))].forEach(t => { const dt=new Date(t.createdAt); hourMap.set(`${dt.getDay()}-${dt.getHours()}`,(hourMap.get(`${dt.getDay()}-${dt.getHours()}`)??0)+1); });
    const maxHeat = Math.max(...hourMap.values(),1);

    const prodMap = new Map<number,{name:string;units:number;revenue:number;profit:number}>();
    fOrders.forEach(o => o.items.forEach(i => { const e=prodMap.get(i.id)??{name:i.name,units:0,revenue:0,profit:0}; const c=costMap.get(i.id)??i.price*0.7; e.units+=i.quantity;e.revenue+=i.price*i.quantity;e.profit+=(i.price-c)*i.quantity;prodMap.set(i.id,e); }));
    fSales.forEach(s => s.items.forEach(i => { const e=prodMap.get(i.productId)??{name:i.name,units:0,revenue:0,profit:0}; const c=costMap.get(i.productId)??i.price*0.7; e.units+=i.quantity;e.revenue+=i.price*i.quantity;e.profit+=(i.price-c)*i.quantity;prodMap.set(i.productId,e); }));
    const topRev = [...prodMap.entries()].map(([id,x])=>({id,...x})).sort((a,b)=>b.revenue-a.revenue).slice(0,10);
    const topProfit = [...prodMap.entries()].map(([id,x])=>({id,...x})).sort((a,b)=>b.profit-a.profit).slice(0,10);
    const topUnits = [...prodMap.entries()].map(([id,x])=>({id,...x})).sort((a,b)=>b.units-a.units).slice(0,10);

    const recent = [...orders].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,10);

    const supMap = new Map<string,number>();
    fPurchases.forEach(p => { supMap.set(p.supplierName,(supMap.get(p.supplierName)??0)+p.total); });
    const supPurchases = [...supMap.entries()].map(([n,t])=>({name:n,total:t})).sort((a,b)=>b.total-a.total);
    const totalPurch = fPurchases.reduce((a,p)=>a+p.total,0);

    const pending = payables.filter(p=>p.status!=="pagado");
    const debt = pending.reduce((a,p)=>a+(p.amount-p.paidAmount),0);
    const overdue = pending.filter(p=>new Date(p.dueDate)<new Date());

    // ── Simple alert badges (kept for backward compat) ──
    const alerts: {type:"danger"|"warning"|"info";msg:string}[] = [];
    if(agotados.length>0) alerts.push({type:"danger",msg:`${agotados.length} producto${agotados.length>1?"s":""} agotado${agotados.length>1?"s":""}`});
    if(stockCritico.length>0) alerts.push({type:"warning",msg:`${stockCritico.length} producto${stockCritico.length>1?"s":""} con stock crítico`});
    if(overdue.length>0) alerts.push({type:"danger",msg:`${overdue.length} cuenta${overdue.length>1?"s":""} por pagar vencida${overdue.length>1?"s":""}`});
    if(cancelled.length>0) alerts.push({type:"warning",msg:`${cancelled.length} cancelado${cancelled.length>1?"s":""} en el periodo`});
    if(sinMov.length>5) alerts.push({type:"info",msg:`${sinMov.length} productos sin movimiento`});
    if(margen<20&&ventas>0) alerts.push({type:"warning",msg:`Margen bajo: ${margen.toFixed(1)}%`});

    // ── Smart Insights ──
    type SmartInsight = { priority: number; icon: LucideIcon; title: string; desc: string; type: "danger"|"warning"|"success"|"info" };
    const insights: SmartInsight[] = [];

    // 1. Pending orders aging
    const now = new Date();
    const pendingOrders = orders.filter(o => o.status === "pendiente");
    const oldPending = pendingOrders.filter(o => (now.getTime() - new Date(o.createdAt).getTime()) > 2 * 60 * 60 * 1000);
    if (oldPending.length > 0) {
      const oldest = Math.max(...oldPending.map(o => now.getTime() - new Date(o.createdAt).getTime()));
      const hrs = Math.floor(oldest / 3600000);
      insights.push({ priority: 100, icon: Clock, title: `${oldPending.length} pedido${oldPending.length>1?"s":""} esperando`, desc: `Hay pedidos pendientes desde hace más de ${hrs}h. Confírmalos o contacta al cliente.`, type: "danger" });
    } else if (pendingOrders.length > 0) {
      insights.push({ priority: 30, icon: Clock, title: `${pendingOrders.length} pedido${pendingOrders.length>1?"s":""} pendiente${pendingOrders.length>1?"s":""}`, desc: "Todos recientes. Revísalos cuando puedas.", type: "warning" });
    }

    // 2. Best-seller stock prediction
    if (topRev.length > 0) {
      const bestId = topRev[0].id;
      const bestProd = products.find(p => p.id === bestId);
      if (bestProd && bestProd.stock !== undefined) {
        const dailySold = topRev[0].units / Math.max(daily.length, 1);
        const daysLeft = dailySold > 0 ? Math.floor(bestProd.stock / dailySold) : 999;
        if (daysLeft <= 3 && daysLeft >= 0) {
          insights.push({ priority: 90, icon: Zap, title: `"${bestProd.name}" se agota pronto`, desc: `Tu más vendido tiene ${bestProd.stock} uds — al ritmo actual, se acaba en ~${daysLeft} día${daysLeft!==1?"s":""}. ¡Reabastece!`, type: "danger" });
        } else if (daysLeft <= 7) {
          insights.push({ priority: 60, icon: Zap, title: `Stock de "${bestProd.name}": ${bestProd.stock} uds`, desc: `Tu más vendido dura ~${daysLeft} días más. Planifica tu reposición.`, type: "warning" });
        }
      }
    }

    // 3. Best sales day pattern
    if (daily.length >= 7) {
      const dayTotals = new Map<number,{sum:number;count:number}>();
      [...orders.filter(o=>o.status!=="cancelado"),...sales.map(s=>({...s,createdAt:s.createdAt,total:s.total}))].forEach(t => {
        const day = new Date(t.createdAt).getDay();
        const e = dayTotals.get(day) ?? {sum:0,count:0};
        e.sum += t.total; e.count++; dayTotals.set(day, e);
      });
      if (dayTotals.size >= 3) {
        let bestDay = 0, bestAvg = 0;
        dayTotals.forEach((v, k) => { const avg = v.sum / Math.max(v.count, 1); if (avg > bestAvg) { bestAvg = avg; bestDay = k; } });
        insights.push({ priority: 20, icon: CalendarDays, title: `Los ${DAYS[bestDay]} son tu mejor día`, desc: `Vendes en promedio ${fmt(bestAvg)} los ${DAYS[bestDay]}. Asegúrate de tener stock y personal listo.`, type: "info" });
      }
    }

    // 4. Overdue payables — more detail
    if (overdue.length > 0) {
      const totalOverdue = overdue.reduce((a,p) => a + (p.amount - p.paidAmount), 0);
      const oldestDue = overdue.reduce((a,p) => { const d2 = new Date(p.dueDate); return d2 < a ? d2 : a; }, new Date());
      const daysOver = Math.floor((now.getTime() - oldestDue.getTime()) / 86400000);
      insights.push({ priority: 85, icon: AlertTriangle, title: `${fmt(totalOverdue)} en deuda vencida`, desc: `${overdue.length} cuenta${overdue.length>1?"s":""} vencida${overdue.length>1?"s":""}, la más antigua desde hace ${daysOver} días. Negocia con tu proveedor.`, type: "danger" });
    }

    // 5. Margin warning with context
    if (margen < 15 && ventas > 0) {
      const lowMarginProds = [...prodMap.entries()].filter(([,x]) => x.revenue > 0 && (x.profit / x.revenue) < 0.10).map(([id,x]) => ({ ...x, id })).sort((a,b) => a.profit/a.revenue - b.profit/b.revenue);
      const worst = lowMarginProds[0];
      insights.push({ priority: 70, icon: TrendingDown, title: `Margen preocupante: ${margen.toFixed(1)}%`, desc: worst ? `"${worst.name}" tiene el margen más bajo (${((worst.profit/worst.revenue)*100).toFixed(0)}%). Revisa tus costos o ajusta precios.` : "Revisa tus costos de compra y precios de venta.", type: "warning" });
    } else if (margen >= 25 && ventas > 0) {
      insights.push({ priority: 5, icon: TrendingUp, title: `Margen saludable: ${margen.toFixed(1)}%`, desc: "Tu negocio mantiene buen rendimiento. ¡Sigue así!", type: "success" });
    }

    // 6. Out of stock — specific names
    if (agotados.length > 0) {
      const names = agotados.slice(0, 3).map(p => p.name).join(", ");
      insights.push({ priority: 95, icon: PackageX, title: `${agotados.length} producto${agotados.length>1?"s":""} agotado${agotados.length>1?"s":""}`, desc: agotados.length <= 3 ? `${names}. Pierde ventas cada hora que faltan.` : `${names} y ${agotados.length-3} más. Pierde ventas cada hora que faltan.`, type: "danger" });
    }

    // 7. Cancellation rate
    if (cancelled.length > 0 && tickets + cancelled.length > 0) {
      const rate = (cancelled.length / (tickets + cancelled.length)) * 100;
      if (rate > 15) {
        insights.push({ priority: 65, icon: AlertCircle, title: `${rate.toFixed(0)}% de cancelaciones`, desc: `${cancelled.length} pedido${cancelled.length>1?"s":""} cancelado${cancelled.length>1?"s":""}. Si supera 10%, revisa tiempos de entrega y comunicación.`, type: "warning" });
      }
    }

    // 8. New customers
    const recentCustomers = customers.filter(c => { try { return (now.getTime() - new Date(c.createdAt).getTime()) < 7 * 86400000; } catch { return false; } });
    if (recentCustomers.length > 0) {
      insights.push({ priority: 15, icon: UserCheck, title: `${recentCustomers.length} cliente${recentCustomers.length>1?"s":""} nuevo${recentCustomers.length>1?"s":""}`, desc: `Ganaste ${recentCustomers.length} cliente${recentCustomers.length>1?"s":""} esta semana. Dale seguimiento para fidelizarlos.`, type: "success" });
    }

    // 9. No sales today
    const todaySales = [...orders.filter(o=>o.status!=="cancelado"),...sales].filter(t => new Date(t.createdAt).toDateString() === now.toDateString());
    if (todaySales.length === 0 && now.getHours() >= 10) {
      insights.push({ priority: 50, icon: Lightbulb, title: "Sin ventas hoy", desc: "¿Día lento? Considera publicar una promoción o contactar clientes frecuentes.", type: "warning" });
    }

    // Sort by priority descending
    insights.sort((a, b) => b.priority - a.priority);

    const avgRating = reviews.length>0?reviews.reduce((a,r)=>a+r.rating,0)/reviews.length:0;
    
    // OrderStats calculations
    const pendingOrdersCount = fOrders.filter(o => o.status === "pendiente").length;
    const completedOrdersCount = fOrders.filter(o => o.status === "entregado").length + fSales.length;
    const conversionRate = tickets > 0 ? (completedOrdersCount / tickets) * 100 : 0;

    return {
      ventas,utilidad,margen,tickets,ticketProm,uds,clientesAtendidos:uniqueClients.size,
      cancelados:cancelled.length,stockVal,stockCritico,agotados,sinMov,
      catSales,payments,payTotal,daily,maxDaily,hourMap,maxHeat,
      topRev,topProfit,topUnits,recent,supPurchases,totalPurch,
      debt,overdue,pending,alerts,insights,avgRating,
      totalCustomers:customers.length,totalSuppliers:suppliers.length,
      activeProducts:products.filter(p=>p.active).length,
      dVentas:pctDelta(ventas,prevVentas),dUtilidad:pctDelta(utilidad,prevUtilidad),
      dTickets:pctDelta(tickets,prevTickets),dTicketProm:pctDelta(ticketProm,prevTicketProm),
      pendingOrdersCount,completedOrdersCount,conversionRate,
    };
  }, [products,orders,sales,customers,purchases,payables,suppliers,reviews,period]);

  const [showExport, setShowExport] = useState(false);

  const handleExport = useCallback((type: string) => {
    setShowExport(false);
    const today = new Date().toISOString().slice(0,10);
    if (type === "ventas") {
      const rows = [
        ...orders.filter(o => inPeriod(o.createdAt, period) && o.status !== "cancelado").map(o => ({
          tipo: "Pedido", id: o.id, fecha: o.createdAt.slice(0,10), hora: o.createdAt.slice(11,16),
          cliente: o.customer.name, telefono: o.customer.phone ?? "",
          items: o.items.map(i => `${i.name} x${i.quantity}`).join("; "),
          total: o.total, pago: o.paymentMethod ?? "efectivo", estado: o.status,
        })),
        ...sales.filter(s => inPeriod(s.createdAt, period)).map(s => ({
          tipo: "POS", id: s.id, fecha: s.createdAt.slice(0,10), hora: s.createdAt.slice(11,16),
          cliente: s.customerPhone ?? "Mostrador", telefono: s.customerPhone ?? "",
          items: s.items.map(i => `${i.name} x${i.quantity}`).join("; "),
          total: s.total, pago: s.payment, estado: "completado",
        })),
      ];
      exportToCSV(rows, `ventas_${today}.csv`);
    } else if (type === "productos") {
      exportToCSV(products.map(p => ({
        id: p.id, nombre: p.name, categoria: p.category, precio: p.price,
        costo: p.costPrice ?? "", stock: p.stock ?? "", stockMin: p.stockMin ?? "",
        unidad: p.unit, activo: p.active ? "Sí" : "No",
      })), `productos_${today}.csv`);
    } else if (type === "clientes") {
      exportToCSV(customers.map(c => ({
        telefono: c.phone, nombre: c.name, ubicacion: c.location,
        registrado: c.createdAt.slice(0,10),
      })), `clientes_${today}.csv`);
    } else if (type === "pedidos") {
      exportToCSV(orders.filter(o => inPeriod(o.createdAt, period)).map(o => ({
        id: o.id, estado: o.status, cliente: o.customer.name,
        telefono: o.customer.phone ?? "", direccion: o.customer.location,
        items: o.items.map(i => `${i.name} x${i.quantity}`).join("; "),
        total: o.total, pago: o.paymentMethod ?? "",
        creado: o.createdAt.slice(0,10), hora: o.createdAt.slice(11,16),
      })), `pedidos_${today}.csv`);
    } else if (type === "pdf") {
      const titulo = `Reporte ${period === "hoy" ? "Hoy" : period === "semana" ? "Últimos 7 días" : period === "mes" ? "Este mes" : "Todo"}`;
      const win = window.open("", "_blank");
      if (!win) return;
      const kpis = [
        ["Ventas", fmt(d.ventas)], ["Utilidad", fmt(d.utilidad)], ["Margen", d.margen.toFixed(1) + "%"],
        ["Tickets", String(d.tickets)], ["Ticket prom.", fmt(d.ticketProm)], ["Unidades", String(d.uds)],
      ];
      const catRows = d.catSales.map(c => `<tr><td>${c.label}</td><td style="text-align:right">${fmt(c.total)}</td></tr>`).join("");
      const recentRows = d.recent.map(o => `<tr><td>${o.id.slice(-6)}</td><td>${o.customer?.name ?? "POS"}</td><td style="text-align:right">${fmt(o.total)}</td><td>${o.status}</td></tr>`).join("");
      win.document.write(`<!DOCTYPE html><html><head><title>${titulo} - Bodega San Martín</title>
<style>body{font-family:system-ui,sans-serif;padding:20px;max-width:800px;margin:0 auto;font-size:13px}
h1{font-size:18px;margin-bottom:4px}h2{font-size:14px;margin:16px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
p.sub{color:#666;font-size:12px;margin:0 0 16px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
.kpi{border:1px solid #eee;border-radius:8px;padding:10px;text-align:center}
.kpi .v{font-size:18px;font-weight:700}.kpi .l{font-size:11px;color:#888}
table{width:100%;border-collapse:collapse;margin-bottom:12px}
th,td{text-align:left;padding:4px 8px;border-bottom:1px solid #f0f0f0;font-size:12px}
th{font-weight:600;background:#f9f9f9}
@media print{body{padding:0}}</style></head><body>
<h1>Bodega San Martín</h1><p class="sub">${titulo} — generado ${today}</p>
<div class="kpis">${kpis.map(([l,v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("")}</div>
<h2>Ventas por categoría</h2><table><tr><th>Categoría</th><th style="text-align:right">Total</th></tr>${catRows}</table>
<h2>Últimas transacciones</h2><table><tr><th>ID</th><th>Cliente</th><th style="text-align:right">Total</th><th>Estado</th></tr>${recentRows}</table>
</body></html>`);
      win.document.close();
      win.print();
    }
  }, [orders, sales, products, customers, period]);

  const [topTab, setTopTab] = useState<"revenue"|"profit"|"units">("revenue");
  const topList = topTab==="revenue"?d.topRev:topTab==="profit"?d.topProfit:d.topUnits;
  const topMax = topList.length>0?Math.max(...topList.map(p=>topTab==="units"?p.units:topTab==="profit"?p.profit:p.revenue)):1;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-gray-300 dark:text-muted" />
        <span className="text-xs text-gray-400 dark:text-muted">Cargando datos…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between pb-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-foreground">Dashboard</h2>
          <p className="text-xs text-gray-400 dark:text-muted">Bodega San Martín</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 dark:bg-accent rounded-lg p-0.5">
            {(["hoy","semana","mes","todo"] as Period[]).map(p => (
              <button key={p} onClick={()=>setPeriod(p)}
                className={cn("px-2.5 py-1 rounded-md text-xs font-semibold transition-all",
                  period===p?"text-gray-900 dark:text-foreground shadow-sm":"text-gray-400 dark:text-muted hover:text-gray-600"
                )}
                style={period===p?{background:"var(--color-card, white)"}:undefined}>
                {p==="hoy"?"Hoy":p==="semana"?"7d":p==="mes"?"Mes":"Todo"}
              </button>
            ))}
          </div>
          <div className="relative">
            <button onClick={()=>setShowExport(v=>!v)} className="p-1.5 rounded-lg text-gray-300 dark:text-muted hover:text-gray-500 hover:bg-gray-50 dark:hover:bg-accent transition-colors" title="Exportar CSV">
              <Download className="h-3.5 w-3.5" />
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-lg shadow-lg py-1 z-50 min-w-40">
                {[
                  { key:"ventas", label:"📊 Ventas CSV" },
                  { key:"pedidos", label:"📋 Pedidos CSV" },
                  { key:"productos", label:"📦 Inventario CSV" },
                  { key:"clientes", label:"👤 Clientes CSV" },
                  { key:"pdf", label:"📄 Reporte PDF" },
                ].map(opt => (
                  <button key={opt.key} onClick={()=>handleExport(opt.key)}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={load} className="p-1.5 rounded-lg text-gray-300 dark:text-muted hover:text-gray-500 hover:bg-gray-50 dark:hover:bg-accent transition-colors" title="Actualizar">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
          {/* Auto-refresh toggle */}
          <div className="flex items-center gap-1.5 ml-1 border-l border-gray-200 dark:border-card-border pl-2">
            <button
              onClick={() => setAutoRefresh(v => !v)}
              className={cn(
                "px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-colors",
                autoRefresh ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-400 dark:bg-surface dark:text-muted"
              )}
            >
              {autoRefresh ? "⚡ En vivo" : "Auto"}
            </button>
            {newOrderCount > 0 && autoRefresh && (
              <button
                onClick={() => { setNewOrderCount(0); setSection("resumen"); }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse"
              >
                🛎️ +{newOrderCount} nuevo{newOrderCount > 1 ? "s" : ""}
              </button>
            )}
            {autoRefresh && (
              <select
                value={refreshInterval}
                onChange={e => setRefreshInterval(Number(e.target.value))}
                className="text-[10px] bg-transparent border-0 outline-none text-muted cursor-pointer"
              >
                <option value={15}>15s</option>
                <option value={30}>30s</option>
                <option value={60}>1m</option>
              </select>
            )}
            {lastUpdated && (
              <span className="text-[10px] text-muted hidden sm:inline">
                {lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Section Tabs ── */}
      <div className="flex border-b border-gray-100 dark:border-card-border overflow-x-auto" style={{scrollbarWidth:"none" as React.CSSProperties["scrollbarWidth"],marginBottom:"20px"}}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={()=>setSection(s.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-all shrink-0",
              section===s.id
                ? "border-gray-900 dark:border-foreground text-gray-900 dark:text-foreground"
                : "border-transparent text-gray-400 dark:text-muted hover:text-gray-600"
            )}>
            <s.icon className="h-3.5 w-3.5" />{s.label}
          </button>
        ))}
      </div>

      {/* ── Smart Insights ── */}
      {d.insights.length > 0 && section === "resumen" && (
        <div style={{marginBottom:"16px"}}>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-bold text-gray-700 dark:text-foreground">Alertas inteligentes</span>
            <span className="text-xs text-gray-300 dark:text-muted ml-1">{d.insights.length}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {d.insights.map((ins, i) => (
              <div key={i} className={cn(
                "flex gap-3 p-3 rounded-xl border transition-colors",
                ins.type === "danger" ? "bg-red-50/60 border-red-100" :
                ins.type === "warning" ? "bg-amber-50/60 border-amber-100" :
                ins.type === "success" ? "bg-emerald-50/60 border-emerald-100" :
                "bg-gray-50/60 border-gray-100"
              )}>
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  ins.type === "danger" ? "bg-red-100 text-red-600" :
                  ins.type === "warning" ? "bg-amber-100 text-amber-600" :
                  ins.type === "success" ? "bg-emerald-100 text-emerald-600" :
                  "bg-gray-100 text-gray-500"
                )}>
                  <ins.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className={cn(
                    "text-xs font-semibold leading-tight",
                    ins.type === "danger" ? "text-red-700" :
                    ins.type === "warning" ? "text-amber-700" :
                    ins.type === "success" ? "text-emerald-700" :
                    "text-gray-700"
                  )}>{ins.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{ins.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick Alert Badges ── */}
      {d.alerts.length > 0 && section === "resumen" && (
        <div className="flex gap-1.5 flex-wrap" style={{marginBottom:"16px"}}>
          {d.alerts.map((a,i) => (
            <div key={i} className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap",
              a.type==="danger"?"bg-red-50 text-red-600":a.type==="warning"?"bg-amber-50 text-amber-600":"bg-gray-50 text-gray-500"
            )}>
              <AlertCircle className="h-3 w-3 shrink-0" />{a.msg}
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* RESUMEN                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {section === "resumen" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Ventas Netas" value={fmt(d.ventas)} icon={DollarSign} accent="text-emerald-500" delta={d.dVentas} />
            <Kpi label="Utilidad" value={fmt(d.utilidad)} icon={TrendingUp} accent="text-blue-500" delta={d.dUtilidad} />
            <Kpi label="Margen" value={`${d.margen.toFixed(1)}%`} icon={Percent} accent={d.margen>=25?"text-emerald-500":d.margen>=15?"text-amber-500":"text-red-500"} />
            <Kpi label="Tickets" value={String(d.tickets)} icon={Receipt} accent="text-violet-500" delta={d.dTickets} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Ticket Prom." value={fmt(d.ticketProm)} icon={ShoppingCart} accent="text-indigo-500" delta={d. dTicketProm} />
            <Kpi label="Uds. Vendidas" value={String(d.uds)} icon={Package} accent="text-cyan-500" />
            <Kpi label="Clientes" value={String(d.clientesAtendidos)} icon={Users} accent="text-violet-500" />
            <Kpi label="Stock Valor." value={fmt(d.stockVal)} icon={ShoppingBasket} accent="text-amber-500" />
          </div>

          {/* OrderStats Component - Enhanced metrics */}
          <OrderStats
            totalOrders={d.tickets}
            totalRevenue={d.ventas}
            pendingOrders={d.pendingOrdersCount}
            completedOrders={d.completedOrdersCount}
            averageOrderValue={d.ticketProm}
            conversionRate={d.conversionRate}
            periodLabel={period === "hoy" ? "hoy" : period === "semana" ? "esta semana" : period === "mes" ? "este mes" : "todo"}
            previousPeriodComparison={
              period !== "todo" && d.dVentas !== null
                ? {
                    totalOrders: d.dTickets ?? 0,
                    totalRevenue: d.dVentas ?? 0,
                    averageOrderValue: d.dTicketProm ?? 0,
                    conversionRate: 0, // Not calculated for comparison period yet
                  }
                : undefined
            }
          />

          <div className="grid lg:grid-cols-5 gap-3">
            <div className="lg:col-span-3 bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-3">Ventas por día</p>
              {d.daily.length === 0 ? <Empty /> : (
                <div className="relative h-32">
                  <svg viewBox={`0 0 ${d.daily.length * 50} 120`} className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="areaGradSmall" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={
                      d.daily.map(([,v],i) => {
                        const x = i*50+25; const y = 100-((v/(d.maxDaily||1))*85);
                        return i===0?`M${x},${y}`:`L${x},${y}`;
                      }).join(' ') + ` L${(d.daily.length-1)*50+25},100 L25,100 Z`
                    } fill="url(#areaGradSmall)" />
                    <polyline
                      points={d.daily.map(([,v],i) => `${i*50+25},${100-((v/(d.maxDaily||1))*85)}`).join(' ')}
                      fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                    />
                    {d.daily.map(([,v],i) => (
                      <circle key={i} cx={i*50+25} cy={100-((v/(d.maxDaily||1))*85)} r="2.5" fill="#6366f1" stroke="white" strokeWidth="1.5" />
                    ))}
                  </svg>
                  <div className="flex justify-between px-0.5">
                    {d.daily.map(([dk]) => (
                      <span key={dk} className="text-xs text-gray-300 dark:text-muted truncate text-center" style={{width:`${100/d.daily.length}%`}}>{dayLabel(dk)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2 bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-3">Métodos de pago</p>
              {d.payments.length === 0 ? <Empty /> : (
                <div className="flex items-center gap-4">
                  <Donut data={d.payments} total={d.payTotal} />
                  <div className="flex-1 space-y-1.5">
                    {d.payments.map(p => (
                      <div key={p.method} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{background:p.color}} />
                          <span className="text-gray-500">{p.label}</span>
                        </div>
                        <span className="font-semibold text-gray-700 dark:text-foreground">{d.payTotal>0?((p.total/d.payTotal)*100).toFixed(0):0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VENTAS                                                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {section === "ventas" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Ventas Netas" value={fmt(d.ventas)} icon={DollarSign} accent="text-emerald-500" delta={d.dVentas} />
            <Kpi label="Utilidad" value={fmt(d.utilidad)} icon={TrendingUp} accent="text-blue-500" delta={d.dUtilidad} />
            <Kpi label="Tickets" value={String(d.tickets)} icon={Receipt} accent="text-violet-500" delta={d.dTickets} />
            <Kpi label="Cancelados" value={String(d.cancelados)} icon={AlertTriangle} accent="text-red-500" />
          </div>

          <Card title="Ventas por día" icon={BarChart3}>
            {d.daily.length===0?<Empty />:(
              <div className="relative h-44">
                <svg viewBox={`0 0 ${d.daily.length * 50} 160`} className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {/* Grid lines */}
                  {[0.25,0.5,0.75].map(r => (
                    <line key={r} x1="0" y1={140*(1-r)} x2={d.daily.length*50} y2={140*(1-r)} stroke="currentColor" className="text-gray-100 dark:text-gray-700" strokeWidth="1" strokeDasharray="4 4" />
                  ))}
                  {/* Area */}
                  <path d={
                    d.daily.map(([,v],i) => {
                      const x = i*50+25; const y = 140-((v/d.maxDaily)*130);
                      return i===0?`M${x},${y}`:`L${x},${y}`;
                    }).join(' ') + ` L${(d.daily.length-1)*50+25},140 L25,140 Z`
                  } fill="url(#areaGrad)" />
                  {/* Line */}
                  <polyline
                    points={d.daily.map(([,v],i) => `${i*50+25},${140-((v/d.maxDaily)*130)}`).join(' ')}
                    fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                  />
                  {/* Dots */}
                  {d.daily.map(([,v],i) => (
                    <circle key={i} cx={i*50+25} cy={140-((v/d.maxDaily)*130)} r="3.5" fill="#6366f1" stroke="white" strokeWidth="2" />
                  ))}
                </svg>
                <div className="flex justify-between px-1 mt-1">
                  {d.daily.map(([dk]) => (
                    <span key={dk} className="text-xs text-gray-400 dark:text-muted truncate text-center" style={{width:`${100/d.daily.length}%`}}>{dayLabel(dk)}</span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <div className="grid lg:grid-cols-2 gap-3">
            <Card title="Por categoría" icon={ShoppingBasket}>
              {d.catSales.length===0?<Empty />:(
                <div className="space-y-2.5">
                  {d.catSales.map(c => {
                    const mx = d.catSales[0]?.total??1;
                    return (
                      <div key={c.cat}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-600 dark:text-gray-400">{c.label}</span>
                          <span className="font-semibold text-gray-800 dark:text-foreground">{fmt(c.total)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{width:`${(c.total/mx)*100}%`,background:c.color}} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card title="Métodos de pago" icon={CreditCard}>
              {d.payments.length===0?<Empty />:(
                <div className="flex items-center gap-6 justify-center">
                  <Donut data={d.payments} total={d.payTotal} size={120} />
                  <div className="space-y-2">
                    {d.payments.map(p => (
                      <div key={p.method} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full" style={{background:p.color}} />
                        <span className="text-gray-500 w-20">{p.label}</span>
                        <span className="font-semibold text-gray-800 dark:text-foreground">{fmt(p.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Card title="Horas pico" icon={Clock}>
            <div className="overflow-x-auto">
              <div className="min-w-80">
                <div className="flex gap-0.5 mb-0.5">
                  <div className="w-8 shrink-0" />
                  {Array.from({length:14},(_,i)=>i+7).map(h => (
                    <div key={h} className="flex-1 text-center text-xs text-gray-300 font-mono">{h}</div>
                  ))}
                </div>
                {[1,2,3,4,5,6,0].map(day => (
                  <div key={day} className="flex gap-0.5 mb-0.5">
                    <div className="w-8 shrink-0 text-xs text-gray-400 flex items-center">{DAYS[day]}</div>
                    {Array.from({length:14},(_,i)=>i+7).map(hour => {
                      const count = d.hourMap.get(`${day}-${hour}`)??0;
                      const int = d.maxHeat>0?count/d.maxHeat:0;
                      return (
                        <div key={hour} className="flex-1 aspect-square rounded-sm"
                          style={{background:int===0?"#f9fafb":`rgba(99,102,241,${0.12+int*0.88})`}}
                          title={`${DAYS[day]} ${hour}:00 — ${count}`} />
                      );
                    })}
                  </div>
                ))}
                <div className="flex items-center justify-end gap-1.5 mt-2">
                  <span className="text-xs text-gray-300">Menos</span>
                  {[0,0.25,0.5,0.75,1].map((v,i) => (
                    <div key={i} className="w-3 h-3 rounded-sm" style={{background:v===0?"#f9fafb":`rgba(99,102,241,${0.12+v*0.88})`}} />
                  ))}
                  <span className="text-xs text-gray-300">Más</span>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Ventas recientes" icon={Receipt}>
            {d.recent.length===0?<Empty text="Sin pedidos" />:(
              <div className="overflow-x-auto -mx-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 dark:text-muted font-medium border-b border-gray-50 dark:border-card-border">
                      <th className="text-left px-4 py-2">Fecha</th>
                      <th className="text-left px-4 py-2">Cliente</th>
                      <th className="text-left px-4 py-2 hidden sm:table-cell">Detalle</th>
                      <th className="text-left px-4 py-2">Pago</th>
                      <th className="text-left px-4 py-2">Estado</th>
                      <th className="text-right px-4 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.recent.map(o => (
                      <tr key={o.id} className="border-b border-gray-50 dark:border-card-border last:border-0 hover:bg-gray-50/50 dark:hover:bg-accent/50">
                        <td className="px-4 py-2 text-gray-500 dark:text-muted whitespace-nowrap">
                          <div>{fmtDate(o.createdAt)}</div>
                          <div className="text-gray-300">{fmtTime(o.createdAt)}</div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-700 dark:text-foreground">{o.customer.name}</div>
                          {o.customer.phone && <div className="text-gray-300 font-mono">{o.customer.phone}</div>}
                        </td>
                        <td className="px-4 py-2 text-gray-400 hidden sm:table-cell max-w-40 truncate">
                          {o.items.map(i=>`${i.quantity}× ${i.name}`).join(", ")}
                        </td>
                        <td className="px-4 py-2">
                          <DBadge color={o.paymentMethod==="yape"?"purple":"green"}>
                            {o.paymentMethod==="yape"?"Yape":"Efectivo"}
                          </DBadge>
                        </td>
                        <td className="px-4 py-2">
                          <DBadge color={o.status==="entregado"?"green":o.status==="cancelado"?"red":o.status==="pendiente"?"amber":"blue"}>
                            {o.status==="pendiente"?"Pendiente":o.status==="confirmado"?"Confirmado":
                             o.status==="en_camino"?"En camino":o.status==="entregado"?"Entregado":"Cancelado"}
                          </DBadge>
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-800 dark:text-foreground">{fmt(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* PRODUCTOS                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {section === "productos" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <Kpi label="Prods. Activos" value={String(d.activeProducts)} icon={Package} accent="text-blue-500" />
            <Kpi label="Uds. Vendidas" value={String(d.uds)} icon={ShoppingCart} accent="text-emerald-500" />
            <Kpi label="Sin Movimiento" value={String(d.sinMov.length)} icon={Timer} accent={d.sinMov.length>5?"text-amber-500":"text-emerald-500"} />
          </div>

          <Card title="Top 10 productos" icon={TrendingUp}
            action={
              <div className="flex items-center bg-gray-100 dark:bg-accent rounded-md p-0.5">
                {(["revenue","profit","units"] as const).map(t => (
                  <button key={t} onClick={()=>setTopTab(t)}
                    className={cn("px-2 py-0.5 rounded text-xs font-semibold transition-all",
                      topTab===t?"bg-white dark:bg-card text-gray-800 dark:text-foreground shadow-sm":"text-gray-400 dark:text-muted"
                    )}>{t==="revenue"?"Ingreso":t==="profit"?"Utilidad":"Uds."}</button>
                ))}
              </div>
            }>
            {topList.length===0?<Empty />:(
              <div className="space-y-2">
                {topList.map((p,i) => {
                  const val = topTab==="units"?p.units:topTab==="profit"?p.profit:p.revenue;
                  return (
                    <div key={p.id} className="flex items-center gap-2.5">
                      <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        i<3?"bg-gray-900 dark:bg-foreground text-white dark:text-background":"bg-gray-100 dark:bg-accent text-gray-400 dark:text-muted"
                      )}>{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{p.name}</span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-foreground ml-2 shrink-0">
                            {topTab==="units"?`${val} uds`:fmt(val)}
                          </span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{width:`${(val/topMax)*100}%`,background:i<3?"#111827":"#d1d5db"}} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Ventas por categoría" icon={ShoppingBasket}>
            {d.catSales.length===0?<Empty />:(
              <div className="space-y-2.5">
                {d.catSales.map(c => {
                  const mx = d.catSales[0]?.total??1;
                  return (
                    <div key={c.cat}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-gray-400">{c.label}</span>
                        <span className="font-semibold text-gray-800 dark:text-foreground">{fmt(c.total)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${(c.total/mx)*100}%`,background:c.color}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* INVENTARIO                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {section === "inventario" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Stock Valor." value={fmt(d.stockVal)} icon={DollarSign} accent="text-amber-500" />
            <Kpi label="Stock Crítico" value={String(d.stockCritico.length)} icon={AlertTriangle} accent={d.stockCritico.length>0?"text-red-500":"text-emerald-500"} />
            <Kpi label="Agotados" value={String(d.agotados.length)} icon={PackageX} accent={d.agotados.length>0?"text-red-500":"text-emerald-500"} />
            <Kpi label="Sin Movimiento" value={String(d.sinMov.length)} icon={Timer} accent="text-gray-400" />
          </div>

          <Card title="Productos con stock crítico" icon={AlertTriangle}>
            {d.stockCritico.length===0&&d.agotados.length===0?(
              <div className="py-6 text-center text-xs text-emerald-500 font-medium">✓ Inventario saludable</div>
            ):(
              <div className="space-y-1">
                {d.agotados.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-gray-700 dark:text-foreground">{p.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{CAT_LABELS[p.category]??p.category}</span>
                    </div>
                    <DBadge color="red">Agotado</DBadge>
                  </div>
                ))}
                {d.stockCritico.filter(p=>(p.stock??0)>0).map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-gray-700 dark:text-foreground">{p.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{CAT_LABELS[p.category]??p.category}</span>
                    </div>
                    <span className="text-xs font-semibold text-amber-600">{p.stock}/{p.stockMin} uds</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Productos sin movimiento" icon={Timer}>
            {d.sinMov.length===0?(
              <div className="py-6 text-center text-xs text-emerald-500 font-medium">✓ Todos con rotación</div>
            ):(
              <div className="space-y-0.5">
                {d.sinMov.slice(0,20).map(p => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 px-2 text-xs rounded hover:bg-gray-50 dark:hover:bg-accent">
                    <span className="text-gray-600 dark:text-gray-400 truncate flex-1">{p.name}</span>
                    <span className="text-gray-300 ml-2">{p.stock??0} uds</span>
                  </div>
                ))}
                {d.sinMov.length>20 && <p className="text-xs text-gray-300 text-center pt-1">+{d.sinMov.length-20} más</p>}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CLIENTES                                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {section === "clientes" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Total Clientes" value={String(d.totalCustomers)} icon={Users} accent="text-violet-500" />
            <Kpi label="Atendidos" value={String(d.clientesAtendidos)} icon={Users} accent="text-indigo-500" />
            <Kpi label="Rating Prom." value={`★ ${d.avgRating.toFixed(1)}`} icon={Star} accent="text-amber-500" />
            <Kpi label="Reseñas" value={String(reviews.length)} icon={Star} accent="text-amber-400" />
          </div>

          <Card title="Clientes más frecuentes" icon={Users}>
            {(() => {
              const clientSpend = new Map<string,{name:string;orders:number;total:number}>();
              orders.filter(o=>o.status!=="cancelado"&&inPeriod(o.createdAt,period)).forEach(o => {
                if(!o.customer.phone) return;
                const e = clientSpend.get(o.customer.phone)??{name:o.customer.name,orders:0,total:0};
                e.orders++;e.total+=o.total;clientSpend.set(o.customer.phone,e);
              });
              const top = [...clientSpend.entries()].map(([ph,x])=>({phone:ph,...x})).sort((a,b)=>b.total-a.total).slice(0,10);
              if(top.length===0) return <Empty text="Sin datos de clientes" />;
              const mx = top[0]?.total??1;
              return (
                <div className="space-y-2">
                  {top.map((c,i) => (
                    <div key={c.phone} className="flex items-center gap-2.5">
                      <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        i<3?"bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300":"bg-gray-100 dark:bg-accent text-gray-400 dark:text-muted"
                      )}>{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{c.name}</span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-foreground ml-2 shrink-0">{fmt(c.total)} <span className="text-gray-400 font-normal">({c.orders})</span></span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{width:`${(c.total/mx)*100}%`,background:"#8b5cf6"}} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* COMPRAS                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {section === "compras" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Total Compras" value={fmt(d.totalPurch)} icon={Truck} accent="text-blue-500" />
            <Kpi label="Proveedores" value={String(d.totalSuppliers)} icon={Truck} accent="text-indigo-500" />
            <Kpi label="Deuda Pend." value={fmt(d.debt)} icon={Banknote} accent={d.debt>0?"text-red-500":"text-emerald-500"} />
            <Kpi label="Ctas. Vencidas" value={String(d.overdue.length)} icon={AlertCircle} accent={d.overdue.length>0?"text-red-500":"text-emerald-500"} />
          </div>

          {d.supPurchases.length > 0 && (
            <Card title="Compras por proveedor" icon={Truck}>
              <div className="space-y-2.5">
                {d.supPurchases.map(s => {
                  const mx = d.supPurchases[0]?.total??1;
                  return (
                    <div key={s.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-gray-400 truncate">{s.name}</span>
                        <span className="font-semibold text-gray-800 dark:text-foreground ml-2">{fmt(s.total)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${(s.total/mx)*100}%`,background:"#6366f1"}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {d.pending.length > 0 && (
            <Card title="Cuentas por pagar" icon={Banknote}>
              <div className="overflow-x-auto -mx-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 dark:text-muted font-medium border-b border-gray-50 dark:border-card-border">
                      <th className="text-left px-4 py-2">Proveedor</th>
                      <th className="text-right px-4 py-2">Monto</th>
                      <th className="text-right px-4 py-2">Pagado</th>
                      <th className="text-right px-4 py-2">Pend.</th>
                      <th className="text-left px-4 py-2">Vence</th>
                      <th className="text-left px-4 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.pending.map(p => {
                      const rem = p.amount-p.paidAmount;
                      const over = new Date(p.dueDate)<new Date();
                      return (
                        <tr key={p.id} className={cn("border-b border-gray-50 dark:border-card-border last:border-0",over?"bg-red-50 dark:bg-red-950/30":"")} >
                          <td className="px-4 py-2 font-medium text-gray-700 dark:text-foreground">{p.supplierName}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{fmt(p.amount)}</td>
                          <td className="px-4 py-2 text-right text-emerald-600 font-medium">{fmt(p.paidAmount)}</td>
                          <td className="px-4 py-2 text-right text-red-600 font-medium">{fmt(rem)}</td>
                          <td className="px-4 py-2 text-gray-500">{fmtDateFull(p.dueDate)}</td>
                          <td className="px-4 py-2">
                            <DBadge color={over?"red":p.status==="parcial"?"amber":"gray"}>
                              {over?"Vencido":p.status==="parcial"?"Parcial":"Pendiente"}
                            </DBadge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CAJA                                                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {section === "caja" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Ingresos" value={fmt(d.ventas)} icon={DollarSign} accent="text-emerald-500" delta={d.dVentas} />
            <Kpi label="Egresos" value={fmt(d.totalPurch)} icon={TrendingUp} accent="text-red-500" />
            <Kpi label="Balance" value={fmt(d.ventas-d.totalPurch)} icon={Banknote} accent={d.ventas-d.totalPurch>=0?"text-emerald-500":"text-red-500"} />
            <Kpi label="Cancelados" value={String(d.cancelados)} icon={AlertTriangle} accent="text-amber-500" />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Card title="Desglose de pagos" icon={CreditCard}>
              {d.payments.length===0?<Empty />:(
                <div className="space-y-3">
                  {d.payments.map(p => (
                    <div key={p.method} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{background:p.color}} />
                        <span className="text-xs text-gray-600">{p.label}</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-800 dark:text-foreground">{fmt(p.total)}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-100 dark:border-card-border pt-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Total</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-foreground">{fmt(d.payTotal)}</span>
                  </div>
                </div>
              )}
            </Card>

            <Card title="Flujo del periodo" icon={BarChart3}>
              <div className="space-y-3">
                <FlowRow label="Ventas netas" value={fmt(d.ventas)} color="text-emerald-600" />
                <FlowRow label="Costo estimado" value={fmt(d.ventas-d.utilidad)} color="text-gray-500" />
                <FlowRow label="Utilidad bruta" value={fmt(d.utilidad)} color="text-blue-600" />
                <div className="border-t border-gray-100 dark:border-card-border pt-2" />
                <FlowRow label="Compras" value={fmt(d.totalPurch)} color="text-red-500" />
                <FlowRow label="Deuda pendiente" value={fmt(d.debt)} color={d.debt>0?"text-red-600":"text-emerald-600"} />
                <div className="border-t border-gray-100 dark:border-card-border pt-2" />
                <FlowRow label="Margen bruto" value={`${d.margen.toFixed(1)}%`} color={d.margen>=25?"text-emerald-600":d.margen>=15?"text-amber-600":"text-red-600"} />
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Kpi({ label, value, icon: Icon, accent, delta }: { label: string; value: string; icon: React.ComponentType<{className?:string}>; accent: string; delta?: number | null }) {
  return (
    <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border px-4 py-3.5 hover:border-gray-200 dark:hover:border-gray-600 transition-colors">
      <p className="text-xs font-medium text-gray-400 dark:text-muted mb-2.5 truncate">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-end gap-2">
          <p className="text-xl font-bold text-gray-900 dark:text-foreground tabular-nums leading-none">{value}</p>
          {delta != null && (
            <span className={cn("text-xs font-semibold leading-none mb-0.5", delta >= 0 ? "text-emerald-500" : "text-red-500")}>
              {delta >= 0 ? "↑" : "↓"}{Math.abs(delta).toFixed(0)}%
            </span>
          )}
        </div>
        <Icon className={cn("h-4 w-4 shrink-0 mb-0.5", accent)} />
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children, action }: { title: string; icon: React.ComponentType<{className?:string}>; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-gray-400 dark:text-muted" style={{letterSpacing:"0.06em"}}>
          <Icon className="h-3 w-3 text-gray-300 dark:text-muted" />{title.toUpperCase()}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function DBadge({ children, color }: { children: React.ReactNode; color: "green"|"red"|"amber"|"blue"|"purple"|"gray" }) {
  const m: Record<string,string> = {
    green:"bg-emerald-50 text-emerald-600", red:"bg-red-50 text-red-600",
    amber:"bg-amber-50 text-amber-600", blue:"bg-blue-50 text-blue-600",
    purple:"bg-purple-50 text-purple-600", gray:"bg-gray-100 text-gray-500",
  };
  return <span className={cn("inline-flex px-1.5 py-0.5 rounded text-xs font-semibold",m[color])}>{children}</span>;
}

function FlowRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500 dark:text-muted">{label}</span>
      <span className={cn("text-xs font-semibold", color)}>{value}</span>
    </div>
  );
}

function Empty({ text = "Sin datos en este periodo" }: { text?: string }) {
  return <div className="py-8 text-center text-xs text-gray-300 dark:text-muted">{text}</div>;
}

function Donut({ data, total, size = 96 }: { data: { total: number; color: string }[]; total: number; size?: number }) {
  const segments = useMemo(() => {
    let a = 0;
    return data.map(p => { const pct = total>0?(p.total/total)*100:0; const s = a; a += pct; return `${p.color} ${s}% ${a}%`; });
  }, [data, total]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="w-full h-full rounded-full" style={{ background: `conic-gradient(${segments.join(", ")})` }} />
      <div className="absolute rounded-full bg-white dark:bg-card flex items-center justify-center" style={{ inset: size*0.2 }}>
        <span className="text-xs font-bold text-gray-600 dark:text-foreground">{fmt(total)}</span>
      </div>
    </div>
  );
}