"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ClipboardList,
  Search,
  Play,
  Save,
  CheckCircle,
  AlertTriangle,
  History,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
  sku?: string;
  stock: number;
}

interface CountRow {
  productId: number;
  productName: string;
  sku: string;
  systemStock: number;
  realStock: number | "";
  reason: string;
}

interface PhysicalCountSession {
  id: string;
  date: string;
  rows: CountRow[];
  status: "pendiente" | "aplicado";
  totalCounted: number;
  differences: number;
}

const REASONS = [
  { value: "", label: "Seleccionar motivo" },
  { value: "error-conteo", label: "Error de conteo" },
  { value: "robo", label: "Robo / hurto" },
  { value: "dano", label: "Daño" },
  { value: "vencido", label: "Producto vencido" },
  { value: "otro", label: "Otro" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function sessionKey(date: string) {
  return `bodega-physical-count-${date}`;
}

function loadSessions(): PhysicalCountSession[] {
  const keys = Object.keys(localStorage).filter((k) =>
    k.startsWith("bodega-physical-count-")
  );
  return keys
    .map((k) => {
      try {
        return JSON.parse(localStorage.getItem(k) ?? "") as PhysicalCountSession;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b!.date.localeCompare(a!.date)) as PhysicalCountSession[];
}

function saveSession(session: PhysicalCountSession) {
  localStorage.setItem(sessionKey(session.date), JSON.stringify(session));
}

function diff(row: CountRow): number {
  if (row.realStock === "") return 0;
  return (row.realStock as number) - row.systemStock;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PhysicalCountTab() {
  const [view, setView] = useState<"start" | "counting" | "reconcile" | "history">("start");
  const [_products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [session, setSession] = useState<PhysicalCountSession | null>(null);
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState<PhysicalCountSession[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Cargar historial al montar
  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  // ── Fetch productos ──────────────────────────────────────────────────────────

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/products?tenantId=default&limit=500");
      if (!res.ok) throw new Error("Error al cargar productos");
      const data = await res.json();
      const list: Product[] = (data.products ?? data).map((p: { id: number; name: string; sku?: string; stock?: number; currentStock?: number }) => ({
        id: p.id,
        name: p.name,
        sku: p.sku ?? "",
        stock: p.stock ?? p.currentStock ?? 0,
      }));
      setProducts(list);
      return list;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Iniciar conteo ───────────────────────────────────────────────────────────

  const handleStart = async () => {
    const list = await fetchProducts();
    if (!list.length) return;

    const date = todayKey();
    const existing = localStorage.getItem(sessionKey(date));
    if (existing) {
      try {
        const prev = JSON.parse(existing) as PhysicalCountSession;
        if (prev.status === "pendiente") {
          setSession(prev);
          setView("counting");
          return;
        }
      } catch {}
    }

    const rows: CountRow[] = list.map((p) => ({
      productId: p.id,
      productName: p.name,
      sku: p.sku ?? "",
      systemStock: p.stock,
      realStock: "",
      reason: "",
    }));

    const newSession: PhysicalCountSession = {
      id: `count-${Date.now()}`,
      date,
      rows,
      status: "pendiente",
      totalCounted: 0,
      differences: 0,
    };

    saveSession(newSession);
    setSession(newSession);
    setView("counting");
  };

  // ── Filtrar filas ────────────────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    if (!session) return [];
    const q = search.toLowerCase();
    return session.rows.filter(
      (r) =>
        r.productName.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q)
    );
  }, [session, search]);

  // ── Actualizar stock real ────────────────────────────────────────────────────

  const updateRow = useCallback(
    (productId: number, field: "realStock" | "reason", value: string) => {
      setSession((prev) => {
        if (!prev) return prev;
        const rows = prev.rows.map((r) => {
          if (r.productId !== productId) return r;
          if (field === "realStock") {
            const num: number | "" = value === "" ? "" : Math.max(0, Number(value));
            return { ...r, realStock: num };
          }
          return { ...r, reason: value };
        });
        return { ...prev, rows };
      });
    },
    []
  );

  // ── Guardar conteo ───────────────────────────────────────────────────────────

  const handleSave = () => {
    if (!session) return;
    setSaving(true);
    const counted = session.rows.filter((r) => r.realStock !== "").length;
    const diffs = session.rows.filter(
      (r) => r.realStock !== "" && diff(r) !== 0
    ).length;
    const updated: PhysicalCountSession = {
      ...session,
      totalCounted: counted,
      differences: diffs,
    };
    saveSession(updated);
    setSession(updated);
    setSessions(loadSessions());
    setSaving(false);
    setSuccess("Conteo guardado correctamente.");
    setTimeout(() => setSuccess(null), 3000);
  };

  // ── Reconciliacion ───────────────────────────────────────────────────────────

  const withDiff = useMemo(() => {
    if (!session) return [];
    return session.rows.filter((r) => r.realStock !== "" && diff(r) !== 0);
  }, [session]);

  // ── Aplicar ajustes ──────────────────────────────────────────────────────────

  const handleApply = async () => {
    if (!session || !withDiff.length) return;
    setApplying(true);
    setError(null);
    try {
      const items = withDiff.map((r) => ({
        productId: r.productId,
        newStock: r.realStock as number,
        notes: `Conteo físico ${session.date}${r.reason ? " — " + r.reason : ""}`,
      }));

      const res = await fetch("/api/inventory-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk-adjust", items }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al aplicar ajustes");
      }

      const result = await res.json();
      const updated: PhysicalCountSession = {
        ...session,
        status: "aplicado",
        totalCounted: session.rows.filter((r) => r.realStock !== "").length,
        differences: withDiff.length,
      };
      saveSession(updated);
      setSession(updated);
      setSessions(loadSessions());
      setSuccess(
        `Ajustes aplicados: ${result.succeeded ?? withDiff.length} productos actualizados.`
      );
      setTimeout(() => setSuccess(null), 4000);
      setView("history");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setApplying(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const diffColor = (d: number) => {
    if (d === 0) return "text-emerald-600 dark:text-emerald-400";
    return d > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";
  };

  // ─── View: START ─────────────────────────────────────────────────────────────

  if (view === "start") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList className="h-5 w-5 text-[#00B4A6]" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-foreground">
            Conteo físico
          </h2>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={handleStart}
            disabled={loading}
            className="flex items-center gap-3 p-5 rounded-xl border-2 border-[#00B4A6] bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10 hover:bg-[#00B4A6]/10 dark:hover:bg-[#00B4A6]/20 transition-colors text-left disabled:opacity-60"
          >
            {loading ? (
              <RefreshCw className="h-8 w-8 text-[#00B4A6] animate-spin shrink-0" />
            ) : (
              <Play className="h-8 w-8 text-[#00B4A6] shrink-0" />
            )}
            <div>
              <p className="font-bold text-[#00B4A6]">Iniciar conteo de hoy</p>
              <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
                Carga todos los productos con su stock actual
              </p>
            </div>
          </button>

          <button
            onClick={() => setView("history")}
            className="flex items-center gap-3 p-5 rounded-xl border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-card/60 transition-colors text-left"
          >
            <History className="h-8 w-8 text-gray-400 shrink-0" />
            <div>
              <p className="font-bold text-gray-700 dark:text-foreground">Ver historial</p>
              <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
                {sessions.length} conteo{sessions.length !== 1 ? "s" : ""} guardado{sessions.length !== 1 ? "s" : ""}
              </p>
            </div>
          </button>
        </div>

        {sessions.length > 0 && sessions[0].status === "pendiente" && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Tienes un conteo pendiente del {sessions[0].date}. Al iniciar nuevo, se retomará ese.
          </div>
        )}
      </div>
    );
  }

  // ─── View: COUNTING ──────────────────────────────────────────────────────────

  if (view === "counting" && session) {
    const countedCount = session.rows.filter((r) => r.realStock !== "").length;
    const total = session.rows.length;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-[#00B4A6]" />
              Conteo: {session.date}
            </h2>
            <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
              {countedCount} / {total} productos contados
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setView("reconcile")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#f97316] text-[#f97316] text-sm font-medium hover:bg-[#f97316]/10 transition-colors min-h-[44px]"
            >
              <AlertTriangle className="h-4 w-4" />
              Ver diferencias
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#00B4A6]/90 transition-colors disabled:opacity-60 min-h-[44px]"
            >
              <Save className="h-4 w-4" />
              {saving ? "Guardando..." : "Guardar conteo"}
            </button>
          </div>
        </div>

        {success && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {/* Barra progreso */}
        <div className="w-full bg-gray-100 dark:bg-card rounded-full h-2">
          <div
            className="bg-[#00B4A6] h-2 rounded-full transition-all"
            style={{ width: `${total ? (countedCount / total) * 100 : 0}%` }}
          />
        </div>

        {/* Busqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar producto o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm text-gray-900 dark:text-foreground placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 min-h-[44px]"
          />
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-card-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-card text-left">
                <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-muted w-full">Producto</th>
                <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-muted text-right whitespace-nowrap">Sistema</th>
                <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-muted text-right whitespace-nowrap">Real</th>
                <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-muted text-right whitespace-nowrap">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-gray-400 text-sm">
                    No se encontraron productos
                  </td>
                </tr>
              )}
              {filteredRows.map((row) => {
                const d = diff(row);
                const hasDiff = row.realStock !== "" && d !== 0;
                return (
                  <tr
                    key={row.productId}
                    className={`transition-colors ${hasDiff ? "bg-red-50/40 dark:bg-red-900/10" : "hover:bg-gray-50 dark:hover:bg-card/60"}`}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900 dark:text-foreground leading-tight">{row.productName}</p>
                      {row.sku && <p className="text-xs text-gray-400">{row.sku}</p>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-muted">
                      {row.systemStock}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={row.realStock}
                        onChange={(e) => updateRow(row.productId, "realStock", e.target.value)}
                        placeholder="—"
                        className="w-20 text-right px-2 py-1 rounded border border-gray-200 dark:border-card-border bg-white dark:bg-input text-gray-900 dark:text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 min-h-[36px]"
                      />
                    </td>
                    <td className={`px-3 py-2 text-right font-bold font-mono ${diffColor(d)}`}>
                      {row.realStock === "" ? "—" : d > 0 ? `+${d}` : d}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ─── View: RECONCILE ─────────────────────────────────────────────────────────

  if (view === "reconcile" && session) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#f97316]" />
              Reconciliación — {session.date}
            </h2>
            <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
              {withDiff.length} diferencia{withDiff.length !== 1 ? "s" : ""} encontrada{withDiff.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setView("counting")}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm font-medium hover:bg-gray-50 dark:hover:bg-card/60 transition-colors min-h-[44px]"
            >
              Volver al conteo
            </button>
            <button
              onClick={handleApply}
              disabled={applying || !withDiff.length || session.status === "aplicado"}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#f97316]/90 transition-colors disabled:opacity-60 min-h-[44px]"
            >
              <CheckCircle className="h-4 w-4" />
              {applying ? "Aplicando..." : session.status === "aplicado" ? "Ya aplicado" : "Aplicar ajustes"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {withDiff.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-8 text-center">
            <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">Sin diferencias</p>
            <p className="text-sm text-gray-500 dark:text-muted mt-1">
              El stock físico coincide con el sistema en todos los productos contados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-card-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-card text-left">
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-muted">Producto</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-muted text-right">Sistema</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-muted text-right">Real</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-muted text-right">Diferencia</th>
                  <th className="px-3 py-2.5 font-semibold text-gray-600 dark:text-muted">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {withDiff.map((row) => {
                  const d = diff(row);
                  return (
                    <tr key={row.productId} className="hover:bg-gray-50 dark:hover:bg-card/60">
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900 dark:text-foreground">{row.productName}</p>
                        {row.sku && <p className="text-xs text-gray-400">{row.sku}</p>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-muted">{row.systemStock}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-foreground">{row.realStock}</td>
                      <td className={`px-3 py-2 text-right font-bold font-mono ${diffColor(d)}`}>
                        {d > 0 ? `+${d}` : d}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.reason}
                          onChange={(e) => updateRow(row.productId, "reason", e.target.value)}
                          disabled={session.status === "aplicado"}
                          className="w-full px-2 py-1.5 rounded border border-gray-200 dark:border-card-border bg-white dark:bg-input text-gray-900 dark:text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 min-h-[36px]"
                        >
                          {REASONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ─── View: HISTORY ───────────────────────────────────────────────────────────

  if (view === "history") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
            <History className="h-5 w-5 text-[#00B4A6]" />
            Historial de conteos
          </h2>
          <button
            onClick={() => setView("start")}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm font-medium hover:bg-gray-50 dark:hover:bg-card/60 transition-colors min-h-[44px]"
          >
            Volver
          </button>
        </div>

        {success && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="rounded-xl border border-gray-200 dark:border-card-border p-8 text-center text-gray-400 text-sm">
            No hay conteos guardados aún.
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-gray-200 dark:border-card-border overflow-hidden"
              >
                <button
                  onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-card/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                        s.status === "aplicado"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      }`}
                    >
                      {s.status}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-foreground">{s.date}</span>
                    <span className="text-xs text-gray-400 hidden sm:block">
                      {s.totalCounted} productos · {s.differences} diferencia{s.differences !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {expandedSession === s.id ? (
                    <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  )}
                </button>

                {expandedSession === s.id && (
                  <div className="border-t border-gray-100 dark:border-card-border px-4 py-3 space-y-3">
                    <div className="flex gap-4 text-sm text-gray-600 dark:text-muted">
                      <span>Productos contados: <strong className="text-gray-900 dark:text-foreground">{s.totalCounted}</strong></span>
                      <span>Diferencias: <strong className={s.differences > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-foreground"}>{s.differences}</strong></span>
                    </div>

                    {s.status === "pendiente" && (
                      <button
                        onClick={() => {
                          setSession(s);
                          setView("counting");
                        }}
                        className="text-sm text-[#00B4A6] font-medium hover:underline"
                      >
                        Retomar este conteo
                      </button>
                    )}

                    {s.differences > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[400px] text-xs">
                          <thead>
                            <tr className="text-left text-gray-500 dark:text-muted">
                              <th className="pb-1.5 font-semibold">Producto</th>
                              <th className="pb-1.5 font-semibold text-right">Sistema</th>
                              <th className="pb-1.5 font-semibold text-right">Real</th>
                              <th className="pb-1.5 font-semibold text-right">Dif.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                            {s.rows
                              .filter((r) => r.realStock !== "" && (r.realStock as number) !== r.systemStock)
                              .map((r) => {
                                const d = (r.realStock as number) - r.systemStock;
                                return (
                                  <tr key={r.productId}>
                                    <td className="py-1 text-gray-700 dark:text-foreground">{r.productName}</td>
                                    <td className="py-1 text-right font-mono text-gray-500">{r.systemStock}</td>
                                    <td className="py-1 text-right font-mono">{r.realStock}</td>
                                    <td className={`py-1 text-right font-bold font-mono ${diffColor(d)}`}>
                                      {d > 0 ? `+${d}` : d}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
