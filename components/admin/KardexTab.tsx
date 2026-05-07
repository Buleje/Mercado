"use client";

import { PageTitle } from "@buleje/design-system";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  Check,
  Package,
} from "@buleje/design-system/icons";
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
  compra: { label: "Compra", color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", dir: "in" },
  devolucion: { label: "Devolucion", color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", dir: "in" },
  ajuste_positivo: { label: "Ajuste (+)", color: "text-[var(--data-info-500)] dark:text-[var(--data-info-500)]", bg: "bg-[var(--data-info-100)] dark:bg-[var(--data-info-500)]/30", dir: "in" },
  venta: { label: "Venta POS", color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30", dir: "out" },
  venta_online: { label: "Venta Online", color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30", dir: "out" },
  ajuste_negativo: { label: "Ajuste (-)", color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]", bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30", dir: "out" },
  merma: { label: "Pérdida", color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", bg: "bg-[var(--surface-sunken)]", dir: "out" },
  transferencia: { label: "Transferencia", color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", bg: "bg-[var(--surface-sunken)]", dir: "out" },
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
        className="text-[var(--text-tertiary)] hover:text-primary transition-colors focus:outline-none"
        aria-label="Ayuda sobre Movimientos"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="pointer-events-none absolute left-6 top-0 z-50 w-80 rounded-xl border border-[var(--rule-base)] bg-white p-4 text-xs leading-relaxed dark:border-card-border dark:bg-card">
          <p className="mb-2 text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground">Movimientos del Producto</p>
          <p className="mb-3 text-[var(--text-secondary)] dark:text-muted">Te muestra todo lo que entró y salió de cada producto, para que sepas exactamente cuánto tienes.</p>
          <p className="text-[var(--text-secondary)] dark:text-muted">Ejemplo: si entra una compra de 24 unidades y luego se venden 5, aquí puedes ver ambas operaciones y el saldo exacto.</p>
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
  const [productSearch, setProductSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const query = productSearch.toLowerCase();
    return products.filter((item) => item.name.toLowerCase().includes(query));
  }, [products, productSearch]);

  const handleSelectProduct = useCallback((id: number) => {
    setSelectedProduct(id);
    setProductSearch("");
    setDropdownOpen(false);
  }, []);

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
  }, [allLines, filterType, filterWarehouse, dateFrom, dateTo, search]);

  const stats = useMemo(() => {
    const inTotal = allLines.reduce((sum, line) => sum + line.qtyIn, 0);
    const outTotal = allLines.reduce((sum, line) => sum + line.qtyOut, 0);
    const costTotal = allLines.filter((line) => line.type === "compra").reduce((sum, line) => sum + line.totalCost, 0);
    const lastBalance = allLines[allLines.length - 1]?.balance ?? product?.stock ?? 0;
    return { inTotal, outTotal, lastBalance, costTotal };
  }, [allLines, product]);

  if (loadingProducts) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[var(--text-secondary)] dark:text-muted">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando productos...
      </div>
    );
  }

  if (products.length === 0 || !product) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-bold text-[var(--text-tertiary)] dark:text-muted">Sin productos registrados</p>
        <p className="mt-1 text-sm text-[var(--text-tertiary)] dark:text-muted">Agrega productos desde el modulo de inventario.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageTitle className="flex flex-wrap items-center gap-2 text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground">
            <BookOpen className="h-6 w-6 text-primary" /> Movimientos del Producto <ModuleTooltip />
          </PageTitle>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)] dark:text-muted">Historial por producto: qué entró, qué salió y cuánto queda</p>
        </div>
        <button
          onClick={() => exportToCSV(lines.map((line) => ({ fecha: line.date, tipo: TYPE_META[line.type]?.label || line.type, referencia: line.reference, descripcion: line.description, entrada: line.qtyIn || "", salida: line.qtyOut || "", saldo: line.balance, costo_unit: line.costUnit, costo_total: line.totalCost, almacen: line.warehouse })), `kardex-${product.name}`)}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-gray-50 dark:border-card-border dark:bg-surface dark:text-foreground dark:hover:bg-accent"
        >
          <Download className="h-4 w-4" /> Descargar movimientos
        </button>
      </div>

      <div className="rounded-xl border border-[var(--rule-base)] bg-white p-4 dark:border-card-border dark:bg-card">
        <label className="mb-2 block text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Seleccionar producto</label>

        {/* Selected product display */}
        {product && !dropdownOpen && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 dark:border-primary/30 dark:bg-primary/10">
            <Package className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{product.name}</p>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Stock: {product.stock} {product.unit} {product.costPrice != null ? `· Costo: S/ ${product.costPrice.toFixed(2)}` : ""}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDropdownOpen(true);
                setTimeout(() => productInputRef.current?.focus(), 0);
              }}
              className="shrink-0 rounded-lg border border-[var(--rule-base)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-gray-50 dark:border-card-border dark:bg-surface dark:text-foreground dark:hover:bg-accent"
            >
              Cambiar
            </button>
          </div>
        )}

        {/* Searchable dropdown */}
        <div ref={dropdownRef} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              ref={productInputRef}
              type="text"
              value={productSearch}
              onChange={(event) => {
                setProductSearch(event.target.value);
                setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              placeholder="Buscar producto..."
              className="w-full rounded-lg border border-[var(--rule-base)] bg-white py-2.5 pl-9 pr-10 text-sm text-[var(--text-primary)] transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-card-border dark:bg-surface dark:text-foreground dark:focus:border-primary"
            />
            <ChevronDown className={cn("absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)] transition-transform", dropdownOpen && "rotate-180")} />
          </div>

          {dropdownOpen && (
            <div className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-white dark:border-card-border dark:bg-card">
              {filteredProducts.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)] dark:text-muted">
                  No se encontraron productos
                </div>
              ) : (
                filteredProducts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectProduct(item.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-surface/50",
                      selectedProduct === item.id && "bg-primary/5 dark:bg-primary/10"
                    )}
                  >
                    {selectedProduct === item.id ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <div className="h-4 w-4 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate font-semibold", selectedProduct === item.id ? "text-primary" : "text-[var(--text-primary)] dark:text-foreground")}>
                        {item.name}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Stock: {item.stock} {item.unit}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-[var(--text-tertiary)] dark:text-muted">{products.length} productos disponibles</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-4">
        <KCard label="Saldo actual" value={`${stats.lastBalance} ${product.unit}`} sub={fmt(stats.lastBalance * (product.costPrice ?? 0))} icon={RefreshCw} color="text-[var(--data-success-500)]" bg="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" />
        <KCard label="Total entradas" value={`+${stats.inTotal} ${product.unit}`} sub="del periodo" icon={ArrowUpCircle} color="text-[var(--data-success-500)]" bg="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" />
        <KCard label="Total salidas" value={`-${stats.outTotal} ${product.unit}`} sub="del periodo" icon={ArrowDownCircle} color="text-[var(--data-warning-600)]" bg="bg-amber-50 dark:bg-amber-950/30" />
        <KCard label="Costo compras" value={fmt(stats.costTotal)} sub="periodo actual" icon={TrendingUp} color="text-[var(--text-secondary)]" bg="bg-[var(--surface-sunken)]" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ref. o descripcion..." className="w-full rounded-lg border border-[var(--rule-base)] bg-white py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] dark:border-card-border dark:bg-surface dark:text-foreground" />
        </div>
        <select value={filterType} onChange={(event) => setFilterType(event.target.value)} className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] dark:border-card-border dark:bg-surface dark:text-foreground">
          <option value="todos">Todos los tipos</option>
          {Object.keys(TYPE_META).map((type) => (
            <option key={type} value={type}>{TYPE_META[type].label}</option>
          ))}
        </select>
        {warehouses.length > 0 && (
          <select value={filterWarehouse} onChange={(event) => setFilterWarehouse(event.target.value)} className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] dark:border-card-border dark:bg-surface dark:text-foreground">
            <option value="todos">Todos los almacenes</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            <option value="sin-almacen">Sin almacén asignado</option>
          </select>
        )}
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] dark:border-card-border dark:bg-surface dark:text-foreground" />
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] dark:border-card-border dark:bg-surface dark:text-foreground" />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-white dark:border-card-border dark:bg-card">
        <div className="flex items-center justify-between border-b border-[var(--rule-soft)] px-5 py-3 dark:border-card-border">
          <span className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{product.name} - {product.unit}</span>
          <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">{lines.length} movimientos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="border-b border-[var(--rule-base)] bg-gray-50 dark:border-card-border dark:bg-surface/50">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Fecha</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Tipo</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Referencia</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Descripcion</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--data-success-500)]">Entrada</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--data-error-500)]">Salida</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Saldo</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Costo u.</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Costo total</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Almacen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {loadingMovements && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)] dark:text-muted">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Cargando movimientos...
                  </td>
                </tr>
              )}
              {!loadingMovements && lines.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)] dark:text-muted">Sin movimientos con los filtros actuales.</td>
                </tr>
              )}
              {lines.map((line) => {
                const meta = TYPE_META[line.type] ?? TYPE_META.ajuste_negativo;
                return (
                  <tr key={line.id} className="transition-colors hover:bg-gray-50/50 dark:hover:bg-surface/30">
                    <td className="whitespace-nowrap px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{fmtDate(line.date)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", meta.bg, meta.color)}>
                        {meta.dir === "in" ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono text-xs font-semibold text-[var(--text-primary)] dark:text-foreground">{line.reference}</td>
                    <td className="max-w-60 truncate px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{line.description}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-[var(--data-success-500)]">{line.qtyIn > 0 ? `+${line.qtyIn}` : "-"}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-[var(--data-error-500)]">{line.qtyOut > 0 ? `-${line.qtyOut}` : "-"}</td>
                    <td className={cn("px-2 sm:px-4 py-2 sm:py-3 text-right font-extrabold", line.balance <= 0 ? "text-[var(--data-error-500)]" : line.balance <= 10 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)] dark:text-foreground")}>{line.balance}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-[var(--text-secondary)] dark:text-muted">{fmt(line.costUnit)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-semibold text-[var(--text-primary)] dark:text-foreground">{fmt(line.totalCost)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-tertiary)] dark:text-muted">{line.warehouse}</td>
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
    <div className={cn("rounded-xl p-4", bg)}>
      <Icon className={cn("mb-2 h-5 w-5", color)} />
      <p className="mb-1 text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{label}</p>
      <p className={cn("text-lg font-extrabold leading-tight", color)}>{value}</p>
      <p className="mt-0.5 text-xs text-[var(--text-tertiary)] dark:text-muted">{sub}</p>
    </div>
  );
}