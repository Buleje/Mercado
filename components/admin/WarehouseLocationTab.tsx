"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, Search, Check, AlertTriangle, Info, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/erp";

type Warehouse = { id: string; name: string };
type Location = {
  id: string;
  code: string;
  zone: string;
  aisle: string;
  shelf: string;
  bin: string;
  warehouseId: string;
  warehouseName: string;
  productId: number | null;
  product: string | null;
  qty: number;
  capacity: number;
  category: string;
};

const ZONES = ["A - Bebidas", "B - Abarrotes", "C - Refrigerados", "D - Snacks/Limpieza", "E - Panaderia/Frescos"];

function ModuleTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} className="text-gray-400 hover:text-primary transition-colors focus:outline-none" aria-label="Ayuda sobre Ubicaciones">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="pointer-events-none absolute left-6 top-0 z-50 w-80 rounded-xl border border-[var(--rule-base)] bg-white p-4 text-xs leading-relaxed dark:border-card-border dark:bg-card">
          <p className="mb-2 text-sm font-extrabold text-gray-900 dark:text-foreground">Ubicaciones de almacen</p>
          <p className="mb-3 text-gray-600 dark:text-muted">Mapea donde esta cada producto dentro del almacen: zona, pasillo, estante y posicion.</p>
          <p className="text-gray-500 dark:text-muted">Ejemplo: una gaseosa puede estar en A - Bebidas, pasillo 1, estante 2, bin 4, con 18 unidades ocupando 60% de capacidad.</p>
        </div>
      )}
    </div>
  );
}

export default function WarehouseLocationTab() {
  const [locs, setLocs] = useState<Location[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [showEmpty, setShowEmpty] = useState(true);
  const [form, setForm] = useState({ code: "", zone: ZONES[0], aisle: "", shelf: "", bin: "", warehouseId: "", productId: "", qty: "0", capacity: "100", category: "" });

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      try {
        const [locationsRes, warehousesRes, productsRes] = await Promise.all([fetch("/api/locations"), fetch("/api/admin/warehouses"), fetch("/api/products")]);
        const [locationsData, warehousesData, productsData] = await Promise.all([locationsRes.json(), warehousesRes.json(), productsRes.json()]);
        if (cancelled) return;
        const nextWarehouses = Array.isArray(warehousesData) ? warehousesData : [];
        setLocs(Array.isArray(locationsData) ? locationsData : []);
        setWarehouses(nextWarehouses);
        setProducts(Array.isArray(productsData) ? productsData : []);
        setForm((prev) => ({ ...prev, warehouseId: prev.warehouseId || nextWarehouses[0]?.id || "" }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return locs.filter((loc) => {
      if (search && !loc.code.toLowerCase().includes(search.toLowerCase()) && !(loc.product?.toLowerCase().includes(search.toLowerCase()))) return false;
      if (zoneFilter && loc.zone !== zoneFilter) return false;
      if (!showEmpty && !loc.product) return false;
      return true;
    });
  }, [locs, search, zoneFilter, showEmpty]);

  const totalSlots = locs.length;
  const occupied = locs.filter((loc) => loc.product).length;
  const empty = totalSlots - occupied;
  const avgOccupancy = locs.filter((loc) => loc.product).reduce((sum, loc) => sum + (loc.capacity > 0 ? (loc.qty / loc.capacity) * 100 : 0), 0) / Math.max(1, occupied);
  const critical = locs.filter((loc) => loc.product && loc.capacity > 0 && (loc.qty / loc.capacity) > 0.9).length;

  async function addLocation() {
    if (!form.code || !form.warehouseId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          zone: form.zone,
          aisle: form.aisle,
          shelf: form.shelf,
          bin: form.bin,
          warehouseId: form.warehouseId,
          productId: form.productId ? Number(form.productId) : null,
          qty: Number(form.qty || 0),
          capacity: Number(form.capacity || 0),
          category: form.category,
        }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created?.error || "No se pudo crear la ubicacion");
      setLocs((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, code: "", aisle: "", shelf: "", bin: "", productId: "", qty: "0", capacity: "100", category: "" }));
    } finally {
      setSaving(false);
    }
  }

  async function saveLocation(location: Location) {
    const res = await fetch("/api/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: location.id,
        productId: location.productId,
        qty: location.qty,
        capacity: location.capacity,
        category: location.category,
      }),
    });
    const updated = await res.json();
    if (!res.ok) return;
    setLocs((prev) => prev.map((loc) => loc.id === location.id ? updated : loc));
  }

  async function deleteLocation(id: string) {
    const res = await fetch(`/api/locations?id=${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setLocs((prev) => prev.filter((loc) => loc.id !== id));
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col gap-2 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-extrabold text-gray-900 dark:text-foreground">
            <MapPin className="h-6 w-6 text-[var(--text-secondary)]" /> Ubicaciones de Almacen <ModuleTooltip />
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-muted">Mapa real de ubicaciones por zona, almacen y capacidad</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3 sm:p-5 dark:border-card-border dark:bg-card"><p className="text-xs font-semibold uppercase text-gray-500 dark:text-muted">Ubicaciones Ocupadas</p><p className="mt-1 text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground">{occupied}/{totalSlots}</p></div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3 sm:p-5 dark:border-card-border dark:bg-card"><p className="text-xs font-semibold uppercase text-gray-500 dark:text-muted">Espacios Libres</p><p className="mt-1 text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{empty}</p></div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3 sm:p-5 dark:border-card-border dark:bg-card"><p className="text-xs font-semibold uppercase text-gray-500 dark:text-muted">Ocupacion Promedio</p><p className="mt-1 text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{avgOccupancy.toFixed(0)}%</p></div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3 sm:p-5 dark:border-card-border dark:bg-card"><p className="text-xs font-semibold uppercase text-gray-500 dark:text-muted">Casi Llenos (&gt;90%)</p><p className="mt-1 text-xl sm:text-2xl font-extrabold text-amber-600 dark:text-amber-400">{critical}</p></div>
      </div>

      <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3 sm:p-5 dark:border-card-border dark:bg-card">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm font-extrabold text-gray-900 dark:text-foreground"><Plus className="h-4 w-4 text-primary" /> Nueva ubicacion</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="Codigo" className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface" />
          <select value={form.zone} onChange={(event) => setForm((prev) => ({ ...prev, zone: event.target.value }))} className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface">{ZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select>
          <select value={form.warehouseId} onChange={(event) => setForm((prev) => ({ ...prev, warehouseId: event.target.value }))} className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
          <select value={form.productId} onChange={(event) => setForm((prev) => ({ ...prev, productId: event.target.value, category: products.find((product) => String(product.id) === event.target.value)?.category || prev.category }))} className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface">
            <option value="">Sin producto asignado</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
          <input value={form.aisle} onChange={(event) => setForm((prev) => ({ ...prev, aisle: event.target.value }))} placeholder="Pasillo" className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface" />
          <input value={form.shelf} onChange={(event) => setForm((prev) => ({ ...prev, shelf: event.target.value }))} placeholder="Estante" className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface" />
          <input value={form.bin} onChange={(event) => setForm((prev) => ({ ...prev, bin: event.target.value }))} placeholder="Bin" className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={form.qty} onChange={(event) => setForm((prev) => ({ ...prev, qty: event.target.value }))} type="number" min={0} placeholder="Qty" className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface" />
            <input value={form.capacity} onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))} type="number" min={0} placeholder="Capacidad" className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2.5 text-sm dark:border-card-border dark:bg-surface" />
          </div>
        </div>
        <button onClick={addLocation} disabled={saving} className="mt-4 rounded-lg bg-primary px-2 sm:px-4 py-1.5 sm:py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-50">{saving ? "Guardando..." : "Crear ubicacion"}</button>
      </div>

      <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3 sm:p-6 dark:border-card-border dark:bg-card">
        <h3 className="mb-4 text-sm font-extrabold text-gray-900 dark:text-foreground">Mapa de Zonas</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {ZONES.map((zone) => {
            const zoneLocs = locs.filter((loc) => loc.zone === zone);
            return (
              <button key={zone} onClick={() => setZoneFilter(zoneFilter === zone ? "" : zone)} className={cn("rounded-lg border-2 p-4 text-left transition-all hover:shadow-sm", zoneFilter === zone ? "border-rose-500 bg-[var(--surface-sunken)]" : "border-[var(--rule-base)] bg-gray-50 dark:border-card-border dark:bg-surface")}>
                <p className="text-xs font-extrabold text-gray-900 dark:text-foreground">{zone}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {zoneLocs.map((loc) => (
                    <div key={loc.id} className={cn("h-4 w-4 rounded-sm", !loc.product ? "bg-gray-200 dark:bg-gray-700" : loc.capacity > 0 && (loc.qty / loc.capacity) > 0.9 ? "bg-red-400" : loc.capacity > 0 && (loc.qty / loc.capacity) > 0.6 ? "bg-amber-400" : "bg-emerald-400")} title={loc.code + (loc.product ? `: ${loc.product}` : " (vacio)")} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar codigo o producto..." className="w-full rounded-lg border border-[var(--rule-base)] bg-white py-2.5 pl-10 pr-4 text-sm dark:border-card-border dark:bg-card" />
        </div>
        <button onClick={() => setShowEmpty((prev) => !prev)} className={cn("rounded-lg px-2 sm:px-4 py-1.5 sm:py-2.5 text-sm font-bold transition-colors", showEmpty ? "bg-primary text-white" : "border border-[var(--rule-base)] bg-white text-gray-600 dark:border-card-border dark:bg-card dark:text-muted")}>{showEmpty ? "Mostrando vacios" : "Ocultar vacios"}</button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-white dark:border-card-border dark:bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface">
              <tr>
                <th className="px-5 py-3 text-left font-bold text-gray-500 dark:text-muted">Codigo</th>
                <th className="px-5 py-3 text-left font-bold text-gray-500 dark:text-muted">Zona</th>
                <th className="px-5 py-3 text-left font-bold text-gray-500 dark:text-muted">Almacen</th>
                <th className="px-5 py-3 text-left font-bold text-gray-500 dark:text-muted">Producto</th>
                <th className="px-5 py-3 text-right font-bold text-gray-500 dark:text-muted">Qty/Cap</th>
                <th className="px-5 py-3 text-left font-bold text-gray-500 dark:text-muted">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {loading && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400 dark:text-muted"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Cargando ubicaciones...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400 dark:text-muted">No hay ubicaciones registradas.</td></tr>}
              {filtered.map((loc) => (
                <tr key={loc.id} className="hover:bg-gray-50 dark:hover:bg-surface">
                  <td className="px-5 py-3 font-mono text-xs font-bold text-gray-700 dark:text-foreground">{loc.code}</td>
                  <td className="px-5 py-3 text-gray-600 dark:text-muted">{loc.zone}</td>
                  <td className="px-5 py-3 text-gray-600 dark:text-muted">{loc.warehouseName}</td>
                  <td className="px-5 py-3">
                    <select value={loc.productId ?? ""} onChange={(event) => setLocs((prev) => prev.map((item) => item.id === loc.id ? { ...item, productId: event.target.value ? Number(event.target.value) : null, product: products.find((product) => String(product.id) === event.target.value)?.name ?? null, category: products.find((product) => String(product.id) === event.target.value)?.category ?? item.category } : item))} className="w-full rounded-lg border border-[var(--rule-base)] bg-white px-2 py-1 text-sm dark:border-card-border dark:bg-surface">
                      <option value="">Sin producto</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <input value={loc.qty} onChange={(event) => setLocs((prev) => prev.map((item) => item.id === loc.id ? { ...item, qty: Number(event.target.value || 0) } : item))} type="number" min={0} className="w-20 rounded-lg border border-[var(--rule-base)] bg-white px-2 py-1 text-right text-sm dark:border-card-border dark:bg-surface" />
                      <span className="text-gray-400">/</span>
                      <input value={loc.capacity} onChange={(event) => setLocs((prev) => prev.map((item) => item.id === loc.id ? { ...item, capacity: Number(event.target.value || 0) } : item))} type="number" min={0} className="w-20 rounded-lg border border-[var(--rule-base)] bg-white px-2 py-1 text-right text-sm dark:border-card-border dark:bg-surface" />
                    </div>
                    {loc.capacity > 0 && loc.qty > loc.capacity && <p className="mt-1 text-xs text-red-500">Sobre capacidad</p>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => saveLocation(loc)} className="rounded-lg border border-emerald-200 p-2 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900/40 dark:hover:bg-emerald-950/20"><Check className="h-4 w-4" /></button>
                      <button onClick={() => deleteLocation(loc.id)} className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/20"><Trash2 className="h-4 w-4" /></button>
                      {loc.capacity > 0 && (loc.qty / loc.capacity) > 0.9 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}