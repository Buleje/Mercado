"use client";

import { useState, useMemo } from "react";
import { Eye, Package, MapPin, Clock, CheckCircle, Truck, Phone, Search, Filter, Download } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type Shipment = {
  id: string; orderId: string; customer: string; phone: string; address: string; zone: string;
  rider: string; status: "preparando" | "recogido" | "en-camino" | "entregado" | "fallido";
  createdAt: string; estimatedDelivery: string; deliveredAt: string | null;
  items: number; total: number;
};

const STAGES: { key: Shipment["status"]; label: string; icon: React.ElementType }[] = [
  { key: "preparando", label: "Preparando", icon: Package },
  { key: "recogido", label: "Recogido", icon: CheckCircle },
  { key: "en-camino", label: "En camino", icon: Truck },
  { key: "entregado", label: "Entregado", icon: CheckCircle },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  preparando: { label: "Preparando", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  recogido: { label: "Recogido", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  "en-camino": { label: "En camino", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  entregado: { label: "Entregado", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  fallido: { label: "Fallido", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const SEED: Shipment[] = [];

function fmtDate(iso: string) { return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); }
function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }

export default function ShipmentTrackingTab() {
  const [shipments] = useState(SEED);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  const filtered = useMemo(() => {
    let list = shipments;
    if (filterStatus !== "all") list = list.filter(s => s.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.customer.toLowerCase().includes(q) || s.orderId.toLowerCase().includes(q) || s.address.toLowerCase().includes(q));
    }
    return list;
  }, [shipments, filterStatus, search]);

  const stageIndex = (status: Shipment["status"]) => STAGES.findIndex(s => s.key === status);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Eye className="h-6 w-6 text-primary" /> Seguimiento de Envíos</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Control en tiempo real de todas las entregas activas</p>
        </div>
        <button onClick={() => exportToCSV(filtered.map(s => ({ pedido: s.orderId, cliente: s.customer, direccion: s.address, repartidor: s.rider, estado: STATUS_CONFIG[s.status].label, total: s.total })), "seguimiento-envios")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10"><Download className="h-3.5 w-3.5" /> CSV</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total envíos", value: shipments.length, color: "text-gray-700 dark:text-foreground" },
          { label: "En ruta", value: shipments.filter(s => s.status === "en-camino").length, color: "text-violet-500" },
          { label: "Entregados", value: shipments.filter(s => s.status === "entregado").length, color: "text-emerald-500" },
          { label: "Preparando", value: shipments.filter(s => s.status === "preparando").length, color: "text-amber-500" },
          { label: "Fallidos", value: shipments.filter(s => s.status === "fallido").length, color: "text-red-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-3 text-center">
            <p className="text-[10px] font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" placeholder="Buscar pedido, cliente o dirección…" />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-gray-400" />
          {["all", "preparando", "recogido", "en-camino", "entregado", "fallido"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold transition-colors", filterStatus === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>{s === "all" ? "Todos" : STATUS_CONFIG[s].label}</button>
          ))}
        </div>
      </div>

      {/* Shipment list */}
      <div className="space-y-3">
        {filtered.map(s => (
          <div key={s.id} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{s.orderId}</h4>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", STATUS_CONFIG[s.status].color)}>{STATUS_CONFIG[s.status].label}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted">{s.customer} · {s.items} productos · {fmt(s.total)}</p>
                <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                  <MapPin className="h-3 w-3" /> {s.address}
                </div>
              </div>
              <div className="text-right text-xs">
                <p className="text-gray-500 dark:text-muted flex items-center gap-1 justify-end"><Truck className="h-3 w-3" /> {s.rider}</p>
                <p className="text-gray-400 flex items-center gap-1 justify-end mt-1"><Clock className="h-3 w-3" /> Est. {fmtDate(s.estimatedDelivery)}</p>
                {s.deliveredAt && <p className="text-emerald-600 font-semibold mt-1">✓ {fmtDate(s.deliveredAt)}</p>}
              </div>
            </div>

            {/* Stage tracker */}
            {s.status !== "fallido" && (
              <div className="mt-4 flex flex-wrap items-center gap-0">
                {STAGES.map((stage, i) => {
                  const current = stageIndex(s.status);
                  const complete = i <= current;
                  const isCurrent = i === current;
                  return (
                    <div key={stage.key} className="flex-1 flex flex-col items-center relative">
                      {i > 0 && <div className={cn("absolute top-3 right-1/2 w-full h-0.5", complete ? "bg-primary" : "bg-gray-200 dark:bg-surface")} />}
                      <div className={cn("relative z-10 h-6 w-6 rounded-full flex items-center justify-center text-xs", complete ? "bg-primary text-white" : "bg-gray-200 dark:bg-surface text-gray-400", isCurrent && "ring-2 ring-primary/30")}>
                        <stage.icon className="h-3 w-3" />
                      </div>
                      <span className={cn("text-[9px] mt-1 font-semibold", complete ? "text-primary" : "text-gray-400")}>{stage.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {s.status === "fallido" && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs bg-red-50 dark:bg-red-950/10 text-red-700 dark:text-red-400 px-3 py-2 rounded-xl">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                Contactar al cliente: {s.phone}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
