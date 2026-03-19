"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Search,
  Download,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Info,
  Loader2,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type ProductOption = {
  id: number;
  name: string;
  unit: string;
  stock: number;
  costPrice?: number;
};

type InventoryMovement = {
  id: string;
  productId: number;
  type: string;
  lossType?: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reference?: string;
  notes?: string;
  warehouseId?: string;
  createdAt: string;
};

type KardexLine = {
  id: string;
  date: string;
  type: string;
  reference: string;
  description: string;
  qtyIn: number;
  qtyOut: number;
  balance: number;
  costUnit: number;
  totalCost: number;
  warehouse: string;
  warehouseId?: string;
};

const TYPE_META: Record<string, { label: string; color: string; bg: string; dir: "in" | "out" }> = {
  compra: { label: "Compra", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", dir: "in" },
  devolucion: { label: "Devolucion", color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30", dir: "in" },
  ajuste_positivo: { label: "Ajuste (+)", color: "text-sky-700 dark:text-sky-400", bg: "bg-sky-100 dark:bg-sky-900/30", dir: "in" },
  venta: { label: "Venta POS", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30", dir: "out" },
  venta_online: { label: "Venta Online", color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30", dir: "out" },
  ajuste_negativo: { label: "Ajuste (-)", color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30", dir: "out" },
  merma: { label: "Merma", color: "text-rose-700 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-900/30", dir: "out" },
  transferencia: { label: "Transferencia", color: "text-violet-700 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-900/30", dir: "out" },
};

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function ModuleTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-gray-400 hover:text-primary transition-colors focus:outline-none"
        aria-label="Ayuda sobre Kardex"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="pointer-events-none absolute left-6 top-0 z-50 w-80 rounded-2xl border border-gray-200 bg-white p-4 text-xs leading-relaxed shadow-xl dark:border-card-border dark:bg-card">
          <p className="mb-2 text-sm font-extrabold text-gray-900 dark:text-foreground">Kardex de Inventario</p>
          <p className="mb-3 text-gray-600 dark:text-muted">Te muestra el historial real de entradas, salidas y saldo por producto para auditar stock y costo.</p>
          <p className="text-gray-500 dark:text-muted">Ejemplo: si entra una compra de 24 unidades y luego se venden 5, el Kardex deja ver ambas operaciones y el saldo exacto.</p>
        </div>
      )}
    </div>
  );
}

function toKardexLine(movement: InventoryMovement, product: ProductOption, warehouses: { id: string; name: string }[]): KardexLine {
  const meta = TYPE_META[movement.type] ?? TYPE_META.ajuste_negativo;
  const qtyIn = meta.dir === "in" ? movement.quantity : 0;
  const qtyOut = meta.dir === "out" ? movement.quantity : 0;
  const costUnit = product.costPrice ?? 0;
  const totalCost = movement.quantity * costUnit;
  const warehouseName = movement.warehouseId
    ? (warehouses.find(w => w.id === movement.warehouseId)?.name ?? movement.notes?.match(/almacen:([^|]+)/i)?.[1]?.trim() ?? "Principal")
    : (movement.notes?.match(/almacen:([^|]+)/i)?.[1]?.trim() ?? "Principal");
  return {
    id: movement.id,
    date: movement.createdAt,
    type: movement.type,
    reference: movement.reference || "SIN-REF",
    description: movement.notes || (movement.lossType ? `Motivo: ${movement.lossType}` : TYPE_META[movement.type]?.label || movement.type),
    qtyIn,
    qtyOut,
    balance: movement.newStock,
    costUnit,
    totalCost,
    warehouse: warehouseName,
    warehouseId: movement.warehouseId,
  };
}

export default function KardexTab() {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [filterType, setFilterType] = useState<string>("todos");
  const [filterWarehouse, setFilterWarehouse] = useState<string>("todos");
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/warehouses")
      .then(r => r.json())
      .then((d: unknown) => {
        const items = Array.isArray(d) ? d : (d as { items?: unknown[] })?.items;
        setWarehouses(Array.isArray(items) ? items.map((w: { id: string; name: string }) => ({ id: w.id, name: w.name })) : []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadProducts() {
      setLoadingProducts(true);
      try {
        const res = await fetch("/api/products");
        const data = await res.json();
        if (cancelled) return;
        const nextProducts = Array.isArray(data)
          ? data.map((item) => ({
              id: Number(item.id),
              name: item.name,
              unit: item.unit || "unidad",
              stock: Number(item.stock || 0),
              costPrice: typeof item.costPrice === "number" ? item.costPrice : undefined,
            }))
          : [];
        setProducts(nextProducts);
        setSelectedProduct((current) => current ?? nextProducts[0]?.id ?? null);
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    }
    loadProducts().catch(() => {
      if (!cancelled) setLoadingProducts(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedProduct) return;
    let cancelled = false;
    async function loadMovements() {
      setLoadingMovements(true);
      try {
        const res = await fetch(`/api/inventory-movements?productId=${selectedProduct}`);
        const data = await res.json();
        if (!cancelled) setMovements(Array.isArray(data) ? data : []);
      } finally {
        if (!cancelled) setLoadingMovements(false);
      }
    }
    loadMovements().catch(() => {
      if (!cancelled) setLoadingMovements(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedProduct]);

  const product = products.find((item) => item.id === selectedProduct) ?? null;

  const allLines = useMemo(() => {
    if (!product) return [] as KardexLine[];
    return movements.map((movement) => toKardexLine(movement, product, warehouses));
  }, [movements, product, warehouses]);

  const lines = useMemo(() => {
    let list = [...allLines];
    if (filterType !== "todos") list = list.filter((line) => line.type === filterType);
    if (filterWarehouse !== "todos") list = list.filter((line) => line.warehouseId === filterWarehouse || (!line.warehouseId && filterWarehouse === "sin-almacen"));
    if (dateFrom) list = list.filter((line) => line.date >= dateFrom);
    if (dateTo) list = list.filter((line) => line.date <= `${dateTo}T23:59:59.000Z`);
    if (search.trim()) {
      const query = search.toLowerCase();
      list = list.filter((line) => line.reference.toLowerCase().includes(query) || line.description.toLowerCase().includes(query));
    }
    return list;
  }, [allLines, filterType, dateFrom, dateTo, search]);

  const stats = useMemo(() => {
    const inTotal = allLines.reduce((sum, line) => sum + line.qtyIn, 0);
    const outTotal = allLines.reduce((sum, line) => sum + line.qtyOut, 0);
    const costTotal = allLines.filter((line) => line.type === "compra").reduce((sum, line) => sum + line.totalCost, 0);
    const lastBalance = allLines[allLines.length - 1]?.balance ?? product?.stock ?? 0;
    return { inTotal, outTotal, lastBalance, costTotal };
  }, [allLines, product]);

  if (loadingProducts) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-500 dark:text-muted">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando productos...
      </div>
    );
  }

  if (products.length === 0 || !product) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-bold text-gray-400 dark:text-muted">Sin productos registrados</p>
        <p className="mt-1 text-sm text-gray-400 dark:text-muted">Agrega productos desde el modulo de inventario.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-foreground">
            <BookOpen className="h-6 w-6 text-primary" /> Kardex de Inventario <ModuleTooltip />
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-muted">Registro historico por producto: entradas, salidas y saldo valorizado</p>
        </div>
        <button
          onClick={() => exportToCSV(lines.map((line) => ({ fecha: line.date, tipo: TYPE_META[line.type]?.label || line.type, referencia: line.reference, descripcion: line.description, entrada: line.qtyIn || "", salida: line.qtyOut || "", saldo: line.balance, costo_unit: line.costUnit, costo_total: line.totalCost, almacen: line.warehouse })), `kardex-${product.name}`)}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-card-border dark:bg-surface dark:text-foreground dark:hover:bg-accent"
        >
          <Download className="h-4 w-4" /> Exportar kardex
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-card-border dark:bg-card">
        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-muted">Seleccionar producto</label>
        <div className="flex flex-wrap gap-2">
          {products.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedProduct(item.id)}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                selectedProduct === item.id
                  ? "bg-primary text-white"
                  : "border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-card-border dark:bg-surface dark:text-foreground dark:hover:bg-accent"
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KCard label="Saldo actual" value={`${stats.lastBalance} ${product.unit}`} sub={fmt(stats.lastBalance * (product.costPrice ?? 0))} icon={RefreshCw} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950/30" />
        <KCard label="Total entradas" value={`+${stats.inTotal} ${product.unit}`} sub="del periodo" icon={ArrowUpCircle} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/30" />
        <KCard label="Total salidas" value={`-${stats.outTotal} ${product.unit}`} sub="del periodo" icon={ArrowDownCircle} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-950/30" />
        <KCard label="Costo compras" value={fmt(stats.costTotal)} sub="periodo actual" icon={TrendingUp} color="text-violet-600" bg="bg-violet-50 dark:bg-violet-950/30" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ref. o descripcion..." className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 dark:border-card-border dark:bg-surface dark:text-foreground" />
        </div>
        <select value={filterType} onChange={(event) => setFilterType(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-card-border dark:bg-surface dark:text-foreground">
          <option value="todos">Todos los tipos</option>
          {Object.keys(TYPE_META).map((type) => (
            <option key={type} value={type}>{TYPE_META[type].label}</option>
          ))}
        </select>
        {warehouses.length > 0 && (
          <select value={filterWarehouse} onChange={(event) => setFilterWarehouse(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-card-border dark:bg-surface dark:text-foreground">
            <option value="todos">Todos los almacenes</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            <option value="sin-almacen">Sin almacén asignado</option>
          </select>
        )}
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-card-border dark:bg-surface dark:text-foreground" />
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-card-border dark:bg-surface dark:text-foreground" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-card-border dark:bg-card">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-card-border">
          <span className="text-sm font-bold text-gray-700 dark:text-foreground">{product.name} - {product.unit}</span>
          <span className="text-xs text-gray-400 dark:text-muted">{lines.length} movimientos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-card-border dark:bg-surface/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-muted">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-muted">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-muted">Referencia</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-muted">Descripcion</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-emerald-600">Entrada</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-red-500">Salida</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-muted">Saldo</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-muted">Costo u.</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-muted">Costo total</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-muted">Almacen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {loadingMovements && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-muted">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Cargando movimientos...
                  </td>
                </tr>
              )}
              {!loadingMovements && lines.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-muted">Sin movimientos con los filtros actuales.</td>
                </tr>
              )}
              {lines.map((line) => {
                const meta = TYPE_META[line.type] ?? TYPE_META.ajuste_negativo;
                return (
                  <tr key={line.id} className="transition-colors hover:bg-gray-50/50 dark:hover:bg-surface/30">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500 dark:text-muted">{fmtDate(line.date)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", meta.bg, meta.color)}>
                        {meta.dir === "in" ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700 dark:text-foreground">{line.reference}</td>
                    <td className="max-w-60 truncate px-4 py-3 text-xs text-gray-600 dark:text-muted">{line.description}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{line.qtyIn > 0 ? `+${line.qtyIn}` : "-"}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-500">{line.qtyOut > 0 ? `-${line.qtyOut}` : "-"}</td>
                    <td className={cn("px-4 py-3 text-right font-extrabold", line.balance <= 0 ? "text-red-500" : line.balance <= 10 ? "text-amber-500" : "text-gray-800 dark:text-foreground")}>{line.balance}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-muted">{fmt(line.costUnit)}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-foreground">{fmt(line.totalCost)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-muted">{line.warehouse}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KCard({ label, value, sub, icon: Icon, color, bg }: { label: string; value: string; sub: string; icon: typeof RefreshCw; color: string; bg: string }) {
  return (
    <div className={cn("rounded-2xl p-4", bg)}>
      <Icon className={cn("mb-2 h-5 w-5", color)} />
      <p className="mb-1 text-xs font-semibold text-gray-500 dark:text-muted">{label}</p>
      <p className={cn("text-lg font-extrabold leading-tight", color)}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-400 dark:text-muted">{sub}</p>
    </div>
  );
}