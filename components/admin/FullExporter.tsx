"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState } from "react";
import { Download, Loader2, CheckCircle, Package, Users, ShoppingCart, BarChart2, FileText, Archive } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExportModuleId = "productos" | "clientes" | "ventas" | "inventario" | "gastos";

type ExportStatus = "idle" | "loading" | "done" | "error";

type ModuleState = { status: ExportStatus; count: number };

type ModuleConfig = {
  id: ExportModuleId;
  label: string;
  icon: React.ElementType;
  description: string;
  fetch: () => Promise<Record<string, string | number | boolean | null | undefined>[]>;
  filename: () => string;
};

// ─── Data fetchers with header mapping ───────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

async function fetchProductos(): Promise<Record<string, string | number | boolean | null | undefined>[]> {
  const res = await fetch("/api/products");
  if (!res.ok) throw new Error("Error al cargar productos");
  const data = await res.json() as Record<string, unknown>[];
  return data.map((p) => ({
    "ID": p.id as number,
    "Nombre": p.name as string,
    "Categoria": p.category as string,
    "Precio (S/)": p.price as number,
    "Costo (S/)": p.costPrice as number ?? "",
    "Unidad": p.unit as string,
    "Stock actual": p.stock as number ?? 0,
    "Stock mínimo": p.stockMin as number ?? 0,
    "Codigo barras": p.barcode as string ?? "",
    "Activo": (p.active !== false) ? "Si" : "No",
    "Descripcion": p.description as string ?? "",
  }));
}

async function fetchClientes(): Promise<Record<string, string | number | boolean | null | undefined>[]> {
  const res = await fetch("/api/customers");
  if (!res.ok) throw new Error("Error al cargar clientes");
  const raw = await res.json() as unknown;
  const data = Array.isArray(raw) ? raw as Record<string, unknown>[] : ((raw as { customers?: Record<string, unknown>[] }).customers ?? []);
  return data.map((c) => ({
    "Nombre": c.name as string,
    "Teléfono": c.phone as string,
    "Ubicacion": c.location as string ?? "",
    "Nivel fidelidad": c.loyaltyTier as string ?? "bronce",
    "Puntos": c.loyaltyPoints as number ?? 0,
    "Total gastado (S/)": c.totalSpent as number ?? 0,
    "Credito (S/)": c.creditBalance as number ?? 0,
    "Fecha registro": c.createdAt ? String(c.createdAt).slice(0, 10) : "",
  }));
}

async function fetchVentas(): Promise<Record<string, string | number | boolean | null | undefined>[]> {
  const res = await fetch("/api/orders");
  if (!res.ok) throw new Error("Error al cargar ventas");
  const raw = await res.json() as unknown;
  const data = Array.isArray(raw) ? raw as Record<string, unknown>[] : ((raw as { orders?: Record<string, unknown>[] }).orders ?? []);
  return data.map((o) => ({
    "ID pedido": o.id as string,
    "Cliente": (o.customer as Record<string, unknown>)?.name as string ?? "",
    "Teléfono": (o.customer as Record<string, unknown>)?.phone as string ?? "",
    "Total (S/)": o.total as number,
    "Estado": o.status as string,
    "Metodo pago": o.paymentMethod as string ?? "",
    "Num. productos": Array.isArray(o.items) ? o.items.length : 0,
    "Fecha": o.createdAt ? String(o.createdAt).slice(0, 10) : "",
  }));
}

async function fetchInventario(): Promise<Record<string, string | number | boolean | null | undefined>[]> {
  const res = await fetch("/api/inventory/movements?limit=1000");
  if (!res.ok) {
    // fallback to products with stock info
    const r2 = await fetch("/api/products");
    if (!r2.ok) throw new Error("Error al cargar inventario");
    const data = await r2.json() as Record<string, unknown>[];
    return data.map((p) => ({
      "Producto": p.name as string,
      "Categoria": p.category as string,
      "Stock actual": p.stock as number ?? 0,
      "Stock mínimo": p.stockMin as number ?? 0,
      "Stock máximo": p.stockMax as number ?? "",
      "Unidad": p.unit as string,
    }));
  }
  const raw = await res.json() as unknown;
  const data = Array.isArray(raw) ? raw as Record<string, unknown>[] : ((raw as { movements?: Record<string, unknown>[] }).movements ?? []);
  return data.map((m) => ({
    "ID": m.id as string ?? "",
    "Producto": m.productName as string ?? (m.product as Record<string, unknown>)?.name as string ?? "",
    "Tipo movimiento": m.type as string,
    "Cantidad": m.quantity as number,
    "Motivo": m.reason as string ?? "",
    "Fecha": m.createdAt ? String(m.createdAt).slice(0, 10) : "",
  }));
}

async function fetchGastos(): Promise<Record<string, string | number | boolean | null | undefined>[]> {
  const res = await fetch("/api/expenses");
  if (!res.ok) throw new Error("Error al cargar gastos");
  const raw = await res.json() as unknown;
  const data = Array.isArray(raw) ? raw as Record<string, unknown>[] : ((raw as { expenses?: Record<string, unknown>[] }).expenses ?? []);
  return data.map((e) => ({
    "ID": e.id as string ?? "",
    "Descripcion": e.description as string,
    "Categoria": e.category as string ?? "",
    "Monto (S/)": e.amount as number,
    "Proveedor": e.supplier as string ?? "",
    "Fecha": e.date ? String(e.date).slice(0, 10) : e.createdAt ? String(e.createdAt).slice(0, 10) : "",
    "Notas": e.notes as string ?? "",
  }));
}

// ─── Module configs ───────────────────────────────────────────────────────────

const MODULES: ModuleConfig[] = [
  {
    id: "productos",
    label: "Productos",
    icon: Package,
    description: "Catalogo completo con precios y stock",
    fetch: fetchProductos,
    filename: () => `productos_${today()}.csv`,
  },
  {
    id: "clientes",
    label: "Clientes",
    icon: Users,
    description: "Base de clientes con fidelidad y credito",
    fetch: fetchClientes,
    filename: () => `clientes_${today()}.csv`,
  },
  {
    id: "ventas",
    label: "Ventas",
    icon: ShoppingCart,
    description: "Historial de pedidos y pagos",
    fetch: fetchVentas,
    filename: () => `ventas_${today()}.csv`,
  },
  {
    id: "inventario",
    label: "Inventario",
    icon: BarChart2,
    description: "Movimientos y stock por producto",
    fetch: fetchInventario,
    filename: () => `inventario_${today()}.csv`,
  },
  {
    id: "gastos",
    label: "Gastos",
    icon: FileText,
    description: "Registro de gastos y compras",
    fetch: fetchGastos,
    filename: () => `gastos_${today()}.csv`,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function FullExporter() {
  const [states, setStates] = useState<Record<ExportModuleId, ModuleState>>({
    productos: { status: "idle", count: 0 },
    clientes: { status: "idle", count: 0 },
    ventas: { status: "idle", count: 0 },
    inventario: { status: "idle", count: 0 },
    gastos: { status: "idle", count: 0 },
  });
  const [bulkStatus, setBulkStatus] = useState<"idle" | "loading" | "done">("idle");

  const setModuleState = (id: ExportModuleId, update: Partial<ModuleState>) => {
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...update } }));
  };

  const exportModule = async (mod: ModuleConfig) => {
    setModuleState(mod.id, { status: "loading" });
    try {
      const rows = await mod.fetch();
      exportToCSV(rows, mod.filename());
      setModuleState(mod.id, { status: "done", count: rows.length });
    } catch {
      setModuleState(mod.id, { status: "error" });
    }
  };

  const exportAll = async () => {
    setBulkStatus("loading");
    for (const mod of MODULES) {
      await exportModule(mod);
      // small delay to avoid browser blocking multiple downloads
      await new Promise((r) => setTimeout(r, 400));
    }
    setBulkStatus("done");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">
            Exportar datos del negocio
          </SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)]">
            Descarga tus datos en formato CSV con codificacion UTF-8
          </p>
        </div>

        <button
          onClick={exportAll}
          disabled={bulkStatus === "loading"}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors",
            bulkStatus === "loading"
              ? "bg-gray-100 text-[var(--text-tertiary)] cursor-not-allowed dark:bg-gray-800"
              : "bg-primary text-white hover:bg-[#235c43]"
          )}
        >
          {bulkStatus === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : bulkStatus === "done" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
          {bulkStatus === "loading" ? "Exportando..." : bulkStatus === "done" ? "Todo exportado" : "Exportar todo"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((mod) => {
          const st = states[mod.id];
          const Icon = mod.icon;

          return (
            <div
              key={mod.id}
              className="flex items-center justify-between rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">{mod.label}</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{mod.description}</p>
                  {st.status === "done" && (
                    <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-1">
                      {st.count} registros exportados
                    </p>
                  )}
                  {st.status === "error" && (
                    <p className="text-xs text-[var(--data-error-500)] mt-1">Error al exportar</p>
                  )}
                </div>
              </div>

              <button
                onClick={() => exportModule(mod)}
                disabled={st.status === "loading"}
                title={`Exportar ${mod.label}`}
                className={cn(
                  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors",
                  st.status === "loading"
                    ? "bg-[var(--surface-sunken)] cursor-not-allowed"
                    : st.status === "done"
                    ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)]"
                    : "bg-[var(--surface-sunken)] hover:bg-primary/10"
                )}
              >
                {st.status === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                ) : st.status === "done" ? (
                  <CheckCircle className="h-4 w-4 text-[var(--data-success-500)]" />
                ) : (
                  <Download className="h-4 w-4 text-[var(--text-tertiary)]" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[var(--text-tertiary)]">
        Los archivos CSV incluyen BOM UTF-8 para compatibilidad con Excel. Abre con: Datos &rarr; Desde texto/CSV en Excel.
      </p>
    </div>
  );
}
