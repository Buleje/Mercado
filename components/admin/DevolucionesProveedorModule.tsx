"use client";
import { CardTitle, LoadingState } from "@buleje/design-system";
import { useState, useEffect, useCallback, useMemo } from "react";
import { RotateCcw, Plus, X, ChevronDown, ChevronUp, Package, Truck, AlertCircle, Loader2, RefreshCw, BarChart2, Download, Clock, CheckCircle2 } from "@buleje/design-system/icons";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

// ── Tipos ────────────────────────────────────────────────────────────────────

type DevolucionEstado = "PENDIENTE" | "ENVIADA" | "RESUELTA";

interface ItemDevuelto {
  nombre:   string;
  cantidad: number;
  unidad:   string;
}

interface Devolucion {
  id:              string;
  createdAt:       string;
  proveedorNombre: string;
  items:           ItemDevuelto[];
  motivo:          string;
  estado:          DevolucionEstado;
  notas?:          string | null;
}

interface Proveedor {
  id:   string;
  name: string;
}

// ── Constantes ───────────────────────────────────────────────────────────────

const MOTIVOS = [
  "Producto vencido",
  "Producto dañado",
  "Producto incorrecto",
  "Exceso de stock",
  "Precio incorrecto en factura",
  "Calidad no aceptable",
  "Otro",
];

const ESTADO_STYLES: Record<DevolucionEstado, string> = {
  PENDIENTE: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]",
  ENVIADA:   "bg-[var(--accent-soft)] text-[var(--data-success-500)]",
  RESUELTA:  "bg-[var(--accent-soft)] text-[var(--data-success-500)]",
};

const ESTADO_SIGUIENTE: Record<DevolucionEstado, DevolucionEstado | null> = {
  PENDIENTE: "ENVIADA",
  ENVIADA:   "RESUELTA",
  RESUELTA:  null,
};

const ESTADO_LABEL_SIGUIENTE: Record<DevolucionEstado, string> = {
  PENDIENTE: "Marcar enviada",
  ENVIADA:   "Marcar resuelta",
  RESUELTA:  "",
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function DevolucionesProveedorModule() {
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProveedores, setLoadingProveedores] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<DevolucionEstado | "">("");
  const [actionId, setActionId] = useState<string | null>(null);

  // Campos del formulario
  const [proveedorId, setProveedorId] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState<ItemDevuelto[]>([{ nombre: "", cantidad: 1, unidad: "und" }]);
  const [guardando, setGuardando] = useState(false);
  const [showReportes, setShowReportes] = useState(false);

  // Cargar devoluciones con cache localStorage SWR (TTL 60s)
  const fetchDevoluciones = useCallback(async () => {
    const KEY = "admin-devoluciones-cache";
    const TTL = 60 * 1000;
    // Hidratar de cache primero
    try {
      const cached = localStorage.getItem(KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: Devolucion[]; ts: number };
        if (Array.isArray(data)) {
          setDevoluciones(data);
          setLoading(false);
          if (Date.now() - ts < TTL) return;
        }
      }
    } catch { /* ignore */ }
    setLoading(true);
    try {
      const res = await fetch("/api/supplier-returns");
      if (res.ok) {
        const data = await res.json();
        setDevoluciones(data);
        try { localStorage.setItem(KEY, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar proveedores desde la API
  const fetchProveedores = useCallback(async () => {
    setLoadingProveedores(true);
    try {
      const res = await fetch("/api/suppliers");
      if (res.ok) {
        const data = await res.json();
        setProveedores(data.suppliers ?? data ?? []);
      }
    } catch {}
    setLoadingProveedores(false);
  }, []);

  useEffect(() => { fetchDevoluciones(); }, [fetchDevoluciones]);
  useEffect(() => { fetchProveedores(); }, [fetchProveedores]);

  // ── Acciones ─────────────────────────────────────────────────────────────

  function agregarItem() {
    setItems(prev => [...prev, { nombre: "", cantidad: 1, unidad: "und" }]);
  }

  function quitarItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  function actualizarItem(index: number, campo: keyof ItemDevuelto, valor: string | number) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [campo]: valor } : item));
  }

  function resetFormulario() {
    setProveedorId("");
    setMotivo(MOTIVOS[0]);
    setNotas("");
    setItems([{ nombre: "", cantidad: 1, unidad: "und" }]);
  }

  // ── Datos para reportes ───────────────────────────────────────────────────

  const reportesPorMes = useMemo(() => {
    const counts: Record<string, number> = {};
    devoluciones.forEach(d => {
      const mes = new Date(d.createdAt).toLocaleDateString("es-PE", { year: "2-digit", month: "short" });
      counts[mes] = (counts[mes] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([mes, total]) => ({ mes, total }))
      .slice(-6); // últimos 6 meses
  }, [devoluciones]);

  const reportesPorMotivo = useMemo(() => {
    const counts: Record<string, number> = {};
    devoluciones.forEach(d => { counts[d.motivo] = (counts[d.motivo] ?? 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([motivo, total]) => ({ motivo: motivo.length > 20 ? motivo.slice(0, 18) + "…" : motivo, total }));
  }, [devoluciones]);

  const reportesPorProveedor = useMemo(() => {
    const counts: Record<string, number> = {};
    devoluciones.forEach(d => { counts[d.proveedorNombre] = (counts[d.proveedorNombre] ?? 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [devoluciones]);

  function exportarCSV() {
    const header = ["ID", "Fecha", "Proveedor", "Motivo", "Estado", "Notas", "Items"];
    const rows = devoluciones.map(d => [
      d.id,
      new Date(d.createdAt).toLocaleDateString("es-PE"),
      d.proveedorNombre,
      d.motivo,
      d.estado,
      d.notas ?? "",
      d.items.map(i => `${i.cantidad} ${i.unidad} ${i.nombre}`).join("; "),
    ]);
    const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `devoluciones_proveedor_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleGuardar() {
    const itemsValidos = items.filter(i => i.nombre.trim() !== "");
    if (!proveedorId || itemsValidos.length === 0) return;

    setGuardando(true);
    try {
      const proveedor = proveedores.find(p => p.id === proveedorId);
      const res = await fetch("/api/supplier-returns", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          proveedorId,
          proveedorNombre: proveedor?.name ?? proveedorId,
          motivo,
          notas: notas.trim() || undefined,
          items: itemsValidos,
        }),
      });

      if (res.ok) {
        const nueva = await res.json();
        setDevoluciones(prev => [nueva, ...prev]);
        resetFormulario();
        setMostrarFormulario(false);
      }
    } catch {
      // silencioso
    } finally {
      setGuardando(false);
    }
  }

  async function avanzarEstado(id: string) {
    const dev = devoluciones.find(d => d.id === id);
    if (!dev) return;
    const siguiente = ESTADO_SIGUIENTE[dev.estado];
    if (!siguiente) return;

    setActionId(id);
    try {
      const res = await fetch(`/api/supplier-returns/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ estado: siguiente }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDevoluciones(prev => prev.map(d => d.id === id ? updated : d));
      }
    } catch {
      // silencioso
    } finally {
      setActionId(null);
    }
  }

  async function eliminar(id: string) {
    setActionId(id);
    try {
      const res = await fetch(`/api/supplier-returns/${id}`, { method: "DELETE", headers: csrfHeaders() });
      if (res.ok) {
        setDevoluciones(prev => prev.filter(d => d.id !== id));
      }
    } catch {
      // silencioso
    } finally {
      setActionId(null);
    }
  }

  // ── Filtrado ──────────────────────────────────────────────────────────────

  const devolucionesFiltradas = filtroEstado
    ? devoluciones.filter(d => d.estado === filtroEstado)
    : devoluciones;

  const conteos: Record<DevolucionEstado, number> = {
    PENDIENTE: devoluciones.filter(d => d.estado === "PENDIENTE").length,
    ENVIADA:   devoluciones.filter(d => d.estado === "ENVIADA").length,
    RESUELTA:  devoluciones.filter(d => d.estado === "RESUELTA").length,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        title="Devoluciones a Proveedores"
        icon={RotateCcw}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDevoluciones}
            disabled={loading}
            aria-label="Recargar devoluciones"
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4 text-[var(--text-secondary)]", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => { setMostrarFormulario(true); resetFormulario(); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium transition-colors min-h-[44px]"
          >
            <Plus className="h-4 w-4" />
            Nueva devolución
          </button>
        </div>
      </AdminModuleHeader>

      {/* KPI summary 4 cards minimalistas */}
      {!loading && devoluciones.length > 0 && (() => {
        const totalItems = devoluciones.reduce((s, d) => s + d.items.reduce((a, i) => a + i.cantidad, 0), 0);
        const mesActual = new Date().toISOString().slice(0, 7);
        const totalMes = devoluciones.filter(d => d.createdAt.startsWith(mesActual)).length;
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Total</p>
                <p className="text-2xl font-extrabold tabular-nums leading-none mt-1.5 text-[var(--text-primary)]">{devoluciones.length}</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">devoluciones registradas</p>
              </div>
              <RotateCcw className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
            </div>
            <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Pendientes</p>
                <p className={cn("text-2xl font-extrabold tabular-nums leading-none mt-1.5", conteos.PENDIENTE > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)]")}>{conteos.PENDIENTE}</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">{conteos.ENVIADA} enviadas</p>
              </div>
              <Clock className={cn("h-5 w-5 shrink-0", conteos.PENDIENTE > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]")} />
            </div>
            <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Resueltas</p>
                <p className="text-2xl font-extrabold tabular-nums leading-none mt-1.5 text-[var(--data-success-500)]">{conteos.RESUELTA}</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">{devoluciones.length > 0 ? Math.round((conteos.RESUELTA / devoluciones.length) * 100) : 0}% completadas</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-[var(--data-success-500)] shrink-0" />
            </div>
            <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Items mes</p>
                <p className="text-2xl font-extrabold tabular-nums leading-none mt-1.5 text-[var(--text-primary)]">{totalItems}</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">{totalMes} devoluciones este mes</p>
              </div>
              <Package className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
            </div>
          </div>
        );
      })()}

      {/* Filter pills uniformes */}
      <div className="flex flex-wrap gap-2">
        {([
          { id: "",          label: "Todas",     count: devoluciones.length    },
          { id: "PENDIENTE", label: "Pendientes", count: conteos.PENDIENTE      },
          { id: "ENVIADA",   label: "Enviadas",   count: conteos.ENVIADA        },
          { id: "RESUELTA",  label: "Resueltas",  count: conteos.RESUELTA       },
        ] as const).map(p => (
          <button
            key={p.id}
            onClick={() => setFiltroEstado(p.id as DevolucionEstado | "")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
              filtroEstado === p.id
                ? "bg-[var(--text-primary)] text-white border-[var(--text-primary)]"
                : "bg-white dark:bg-[var(--color-card)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]"
            )}
          >
            {p.label}
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums min-w-[20px] text-center",
              filtroEstado === p.id ? "bg-white/25" : "bg-[var(--surface-sunken)]"
            )}>
              {p.count}
            </span>
          </button>
        ))}
      </div>

      {/* Formulario nueva devolución */}
      {mostrarFormulario && (
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="font-semibold text-[var(--text-primary)] text-sm">Nueva devolución</CardTitle>
            <button
              onClick={() => setMostrarFormulario(false)}
              className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
          </div>

          {/* Proveedor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Proveedor *</label>
              {loadingProveedores ? (
                <div className="h-10 bg-[var(--surface-sunken)] rounded-xl animate-pulse" />
              ) : (
                <select
                  value={proveedorId}
                  onChange={e => setProveedorId(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--rule-base)] rounded-lg text-sm bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-secondary/40"
                >
                  <option value="">Seleccionar proveedor...</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Motivo *</label>
              <select
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--rule-base)] rounded-lg text-sm bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-secondary/40"
              >
                {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Items a devolver *</label>
              <button
                onClick={agregarItem}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary-dark font-medium"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar
              </button>
            </div>
            {items.map((item, index) => (
              <div key={index} className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Nombre del producto"
                  value={item.nombre}
                  onChange={e => actualizarItem(index, "nombre", e.target.value)}
                  className="flex-1 px-3 py-2 border border-[var(--rule-base)] rounded-lg text-sm bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-secondary/40"
                />
                <input
                  type="number"
                  min={1}
                  value={item.cantidad}
                  onChange={e => actualizarItem(index, "cantidad", Number(e.target.value))}
                  className="w-16 px-2 py-2 border border-[var(--rule-base)] rounded-lg text-sm bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)] text-center focus:outline-none focus:ring-2 focus:ring-secondary/40"
                />
                <select
                  value={item.unidad}
                  onChange={e => actualizarItem(index, "unidad", e.target.value)}
                  className="w-20 px-2 py-2 border border-[var(--rule-base)] rounded-lg text-sm bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-secondary/40"
                >
                  <option value="und">und</option>
                  <option value="kg">kg</option>
                  <option value="caja">caja</option>
                  <option value="paq">paq</option>
                  <option value="bot">bot</option>
                </select>
                {items.length > 1 && (
                  <button
                    onClick={() => quitarItem(index)}
                    className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Notas */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--text-secondary)]">Notas adicionales</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              placeholder="Información adicional sobre la devolución..."
              className="w-full px-3 py-2 border border-[var(--rule-base)] rounded-lg text-sm bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)] resize-none focus:outline-none focus:ring-2 focus:ring-secondary/40"
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setMostrarFormulario(false)}
              className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] rounded-lg transition-colors min-h-[44px]"
            >
              Cancelar
            </button>
            <button
              onClick={handleGuardar}
              disabled={guardando || !proveedorId || items.every(i => !i.nombre.trim())}
              className="px-4 py-2 bg-secondary hover:bg-secondary/90 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors min-h-[44px] flex items-center gap-2"
            >
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {guardando ? "Guardando..." : "Registrar devolución"}
            </button>
          </div>
        </div>
      )}

      {/* Lista de devoluciones */}
      {loading ? (
        <LoadingState />
      ) : (
        <div className="space-y-2">
          {devolucionesFiltradas.length === 0 ? (
            <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-8 text-center">
              <RotateCcw className="h-8 w-8 mx-auto mb-2 text-[var(--text-tertiary)]" />
              <p className="text-sm text-[var(--text-tertiary)]">
                {filtroEstado ? `No hay devoluciones con estado ${filtroEstado}` : "No hay devoluciones registradas"}
              </p>
              {!filtroEstado && (
                <button
                  onClick={() => { setMostrarFormulario(true); resetFormulario(); }}
                  className="mt-3 text-sm text-primary font-medium hover:underline"
                >
                  Registrar la primera devolución
                </button>
              )}
            </div>
          ) : (
            devolucionesFiltradas.map(dev => (
              <div
                key={dev.id}
                className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl overflow-hidden"
              >
                {/* Cabecera de la tarjeta */}
                <div className="flex items-center gap-3 p-3">
                  <div className="h-9 w-9 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
                    <Truck className="h-4 w-4 text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {dev.proveedorNombre}
                      </span>
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full shrink-0", ESTADO_STYLES[dev.estado])}>
                        {dev.estado}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {new Date(dev.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {dev.items.length} {dev.items.length === 1 ? "item" : "items"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {ESTADO_SIGUIENTE[dev.estado] && (
                      <button
                        onClick={() => avanzarEstado(dev.id)}
                        disabled={actionId === dev.id}
                        className="text-xs px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors font-medium min-h-[36px] whitespace-nowrap disabled:opacity-50 flex items-center gap-1"
                      >
                        {actionId === dev.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        {ESTADO_LABEL_SIGUIENTE[dev.estado]}
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedId(expandedId === dev.id ? null : dev.id)}
                      className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      {expandedId === dev.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Detalle expandido */}
                {expandedId === dev.id && (
                  <div className="border-t border-[var(--rule-soft)] px-4 py-3 space-y-3 bg-[var(--surface-alt)]/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">Motivo</p>
                        <div className="flex items-start gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5 text-[var(--data-warning-500)] mt-0.5 shrink-0" />
                          <span className="text-sm text-[var(--text-primary)]">{dev.motivo}</span>
                        </div>
                      </div>
                      {dev.notas && (
                        <div>
                          <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">Notas</p>
                          <p className="text-sm text-[var(--text-secondary)]">{dev.notas}</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">Items devueltos</p>
                      <div className="space-y-1">
                        {dev.items.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <Package className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
                            <span className="flex-1 text-[var(--text-primary)]">{item.nombre}</span>
                            <span className="font-medium text-[var(--text-primary)] tabular-nums">
                              {item.cantidad} {item.unidad}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => eliminar(dev.id)}
                        disabled={actionId === dev.id}
                        className="text-xs text-[var(--data-error-500)] hover:text-[var(--data-error-500)] font-medium transition-colors min-h-[36px] px-2 disabled:opacity-50 flex items-center gap-1"
                      >
                        {actionId === dev.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        Eliminar registro
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Panel de Reportes ─────────────────────────────────────────── */}
      <div className="mt-6 border border-[var(--rule-base)] rounded-xl overflow-hidden">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={showReportes}
          onClick={() => setShowReportes(v => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setShowReportes(v => !v);
            }
          }}
          className="w-full flex items-center justify-between px-4 py-3 bg-[var(--surface-alt)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              Reportes de Devoluciones
            </span>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {devoluciones.length} registros
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); exportarCSV(); }}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs rounded-lg hover:bg-primary-dark transition-colors"
              title="Exportar CSV"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            {showReportes ? <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />}
          </div>
        </div>

        {showReportes && (
          <div className="p-4 space-y-6">
            {/* Tarjetas resumen */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total", value: devoluciones.length, color: "text-[var(--text-primary)]" },
                { label: "Pendientes", value: devoluciones.filter(d => d.estado === "PENDIENTE").length, color: "text-[var(--data-warning-500)]" },
                { label: "Enviadas", value: devoluciones.filter(d => d.estado === "ENVIADA").length, color: "text-[var(--data-success-500)]" },
                { label: "Resueltas", value: devoluciones.filter(d => d.estado === "RESUELTA").length, color: "text-[var(--data-success-500)]" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-soft)] rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Gráfico mensual */}
            {reportesPorMes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-3">
                  Devoluciones por mes
                </p>
                <ResponsiveContainer minWidth={0} width="100%" height={180}>
                  <BarChart data={reportesPorMes} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(val) => { const n = Number(val); return [`${n} devoluci${n === 1 ? "ón" : "ones"}`, ""] as [string, string]; }}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="total" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top motivos + proveedores */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
                  Top motivos
                </p>
                <div className="space-y-1.5">
                  {reportesPorMotivo.map(({ motivo, total }) => {
                    const max = reportesPorMotivo[0]?.total ?? 1;
                    return (
                      <div key={motivo} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-[var(--text-primary)] truncate">{motivo}</span>
                            <span className="text-xs font-bold text-[var(--text-primary)] ml-2">{total}</span>
                          </div>
                          <div className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-secondary rounded-full transition-all"
                              style={{ width: `${(total / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
                  Top proveedores
                </p>
                <div className="space-y-1.5">
                  {reportesPorProveedor.map(([proveedor, total]) => {
                    const max = reportesPorProveedor[0]?.[1] ?? 1;
                    return (
                      <div key={proveedor} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-[var(--text-primary)] truncate">{proveedor}</span>
                            <span className="text-xs font-bold text-[var(--text-primary)] ml-2">{total}</span>
                          </div>
                          <div className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${(total / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {devoluciones.length === 0 && (
              <p className="text-center text-sm text-[var(--text-tertiary)] py-4">Sin datos para mostrar aún</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
