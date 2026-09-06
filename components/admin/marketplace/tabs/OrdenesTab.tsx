"use client";
import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertCircle, ChevronDown, Download, Eye, MessageCircle, MoreHorizontal, RefreshCw, Search, ShoppingCart, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceOrders, type MarketplaceOrderDetail, type OrderTargetStatus } from "@/components/admin/marketplace/hooks/use-marketplace-orders";
import { OrderDetailModal } from "@/components/admin/marketplace/OrderDetailModal";
import { ORDER_STATUS_CONFIG, SortIcon, TableSkeleton, CounterChip } from "@/components/admin/marketplace/shared";

// ─────────────────────────────────────────────
// Sub-tab: Órdenes
// ─────────────────────────────────────────────
type OrdersSortKey = "createdAt" | "total" | "status";
type OrdersStatusFilter = "todos" | "pendiente" | "confirmado" | "preparando" | "en_camino" | "entregado" | "cancelado";
type OrdersDateFilter = "hoy" | "7d" | "30d" | "todo";

export function MarketplaceOrdenesTab() {
  const {
    orders, loading, error, load,
    updatingId, bulkBusy,
    updateStatus, bulkUpdateStatus, fetchDetail,
  } = useMarketplaceOrders();

  // Brandon mayo 2026 v7 — Órdenes Nivel A + B:
  // (1) KPI strip por estado clickeable.
  // (2) Búsqueda por #orden / nombre cliente / últimos 4 del tel.
  // (3) Filtro estado + filtro fecha (Hoy / 7d / 30d / Todo).
  // (4) Mostrar teléfono masked + dirección (PII safe).
  // (5) Sort por columna (fecha default desc, total).
  // (6) Sticky header + dark mode tokens.
  // (B-1) Dropdown inline para cambiar estado por orden.
  // (B-2) Botón WhatsApp con template auto.
  // (B-3) Modal de detalle (productos, subtotales, descuentos).
  // (B-4) Bulk actions: seleccionar N órdenes + cambiar estado en lote.
  // (B-5) Export CSV — para SUNAT / contabilidad.
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrdersStatusFilter>("todos");
  const [dateFilter, setDateFilter] = useState<OrdersDateFilter>("30d");
  const [sortKey, setSortKey] = useState<OrdersSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Nivel B state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailOrder, setDetailOrder] = useState<MarketplaceOrderDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openStatusMenuFor, setOpenStatusMenuFor] = useState<string | null>(null);
  const [openBulkMenu, setOpenBulkMenu] = useState(false);

  if (loading) return <TableSkeleton />;

  // ── Counters por estado (sobre TODO el set, no sobre filtrados) ──
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const counters = {
    pendientes: orders.filter((o) => o.status === "pendiente").length,
    confirmadas: orders.filter((o) => o.status === "confirmado").length,
    preparando: orders.filter((o) => o.status === "preparando").length,
    enCamino: orders.filter((o) => o.status === "en_camino").length,
    entregadasHoy: orders.filter((o) => o.status === "entregado" && new Date(o.createdAt).getTime() >= startOfToday).length,
  };

  // ── Filtros ─────────────────────────────────────────────────────
  function withinDateFilter(o: { createdAt: string }): boolean {
    if (dateFilter === "todo") return true;
    const t = new Date(o.createdAt).getTime();
    if (dateFilter === "hoy") return t >= startOfToday;
    const days = dateFilter === "7d" ? 7 : 30;
    return t >= now.getTime() - days * 24 * 60 * 60 * 1000;
  }

  const filteredUnsorted = orders.filter((o) => {
    if (statusFilter !== "todos" && o.status !== statusFilter) return false;
    if (!withinDateFilter(o)) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const idShort = o.id.slice(-8).toLowerCase();
      const phone = (o.customerPhone ?? "").toLowerCase();
      const hit =
        o.customerName.toLowerCase().includes(q) ||
        idShort.includes(q) ||
        phone.includes(q) ||
        (o.customerLocation ?? "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  const filtered = [...filteredUnsorted].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "createdAt") {
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    }
    if (sortKey === "total") {
      return (a.total - b.total) * dir;
    }
    return a.status.localeCompare(b.status) * dir;
  });

  function clickHeader(key: OrdersSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "createdAt" ? "desc" : "desc");
    }
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("todos");
    setDateFilter("todo");
  }

  // ── Nivel B helpers ─────────────────────────────────────────────

  // Mismas transiciones que el backend (espejo). Si el backend rechaza,
  // mostramos el error real igual — pero esto evita ofrecer opciones
  // imposibles en el menú.
  const NEXT_STATUSES: Record<string, OrderTargetStatus[]> = {
    pendiente:  ["confirmado", "cancelado"],
    confirmado: ["preparando", "en_camino", "cancelado"],
    preparando: ["en_camino", "cancelado"],
    en_camino:  ["entregado", "cancelado"],
  };

  const STATUS_ACTION_LABEL: Record<OrderTargetStatus, string> = {
    confirmado: "Confirmar",
    preparando: "Marcar preparando",
    en_camino:  "Marcar en camino",
    entregado:  "Marcar entregado",
    cancelado:  "Cancelar",
  };

  async function openDetail(orderId: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailOrder(null);
    const d = await fetchDetail(orderId);
    setDetailOrder(d);
    setDetailLoading(false);
  }

  function buildWhatsAppLink(o: { customerPhone?: string | null; customerName: string; id: string; status: string; total: number }) {
    // El teléfono que recibe el listado viene enmascarado (`***1234`). Para
    // el wa.me real necesitamos pedir el detalle. Acá hacemos un fallback:
    // si el phone enmascarado no tiene dígitos completos, abrimos el modal
    // y dejamos que el admin copie. En la mayoría de filas el phone está
    // truncado (Ley 29733), por lo que el wa.me solo construye el texto y
    // copia al portapapeles, NO abre el chat directo.
    const idShort = o.id.slice(-8).toUpperCase();
    const statusLabel = ORDER_STATUS_CONFIG[o.status]?.label ?? o.status;
    const message =
      `Hola ${o.customerName}, te escribo de la tienda. ` +
      `Tu pedido #${idShort} está actualmente *${statusLabel}*. ` +
      `Total: S/ ${o.total.toFixed(2)}. ¿Te confirmamos los detalles?`;
    return { message, encoded: encodeURIComponent(message) };
  }

  async function handleWhatsApp(o: { id: string; customerPhone?: string | null; customerName: string; status: string; total: number }) {
    // Para enviar a un número real, traemos el detalle (que sí tiene el
    // phone sin máscara cuando el admin tiene permiso).
    const detail = await fetchDetail(o.id);
    const phone = detail?.customerPhone ?? "";
    const digits = phone.replace(/\D/g, "");
    const { encoded } = buildWhatsAppLink(o);
    if (digits.length >= 8) {
      // wa.me requiere E.164 sin "+". Si no tiene país, asumimos Perú (+51).
      const intl = digits.length === 9 ? `51${digits}` : digits;
      window.open(`https://wa.me/${intl}?text=${encoded}`, "_blank", "noopener,noreferrer");
    } else {
      // Phone no disponible — abrir modal para que el admin lo copie/llame.
      openDetail(o.id);
    }
  }

  function exportCsv() {
    const rows = filtered.map((o) => {
      const d = new Date(o.createdAt);
      return [
        `#${o.id.slice(-8).toUpperCase()}`,
        d.toLocaleDateString("es-PE"),
        d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false }),
        o.customerName,
        o.customerPhone ?? "",
        o.customerLocation ?? "",
        String(o.itemsCount),
        o.total.toFixed(2),
        ORDER_STATUS_CONFIG[o.status]?.label ?? o.status,
      ];
    });
    const header = ["Orden", "Fecha", "Hora", "Cliente", "Tel", "Direccion", "Items", "Total (S/)", "Estado"];
    const csvLines = [header, ...rows].map((r) =>
      r.map((cell) => {
        const s = String(cell ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","),
    );
    const csv = "﻿" + csvLines.join("\r\n"); // BOM para Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marketplace-ordenes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleStatusChange(orderId: string, status: OrderTargetStatus) {
    setOpenStatusMenuFor(null);
    if (status === "cancelado") {
      const reason = window.prompt("Motivo de cancelación (opcional):") ?? undefined;
      const res = await updateStatus(orderId, status, reason);
      if (!res.ok && res.error) window.alert(res.error);
      return;
    }
    const res = await updateStatus(orderId, status);
    if (!res.ok && res.error) window.alert(res.error);
  }

  async function handleBulkStatus(status: OrderTargetStatus) {
    setOpenBulkMenu(false);
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    let reason: string | undefined;
    if (status === "cancelado") {
      const r = window.prompt(`Cancelar ${ids.length} órdenes. Motivo (opcional):`);
      if (r === null) return;
      reason = r || undefined;
    } else {
      const ok = window.confirm(`¿Marcar ${ids.length} órdenes como "${STATUS_ACTION_LABEL[status]}"?`);
      if (!ok) return;
    }
    const res = await bulkUpdateStatus(ids, status, reason);
    if (res.ok) {
      setSelectedIds(new Set());
      if (res.skipped && res.skipped.length > 0) {
        window.alert(`Actualizadas: ${res.updatedCount}. Omitidas: ${res.skipped.length} (transiciones no válidas).`);
      }
    }
  }

  function toggleSelect(orderId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((o) => o.id)));
  }

  // Para el bulk menu: estados a los que SE PUEDE ir desde TODAS las
  // órdenes seleccionadas (intersección de NEXT_STATUSES). Si solo hay
  // pendientes seleccionadas, ofrece [confirmado, cancelado]; si hay
  // mix de pendientes y confirmadas, solo [cancelado] (intersección).
  const bulkAvailableStatuses: OrderTargetStatus[] = (() => {
    if (selectedIds.size === 0) return [];
    const sets = Array.from(selectedIds)
      .map((id) => orders.find((o) => o.id === id))
      .filter((o): o is NonNullable<typeof o> => !!o)
      .map((o) => new Set(NEXT_STATUSES[o.status] ?? []));
    if (sets.length === 0) return [];
    return Array.from(sets[0]).filter((s) => sets.every((set) => set.has(s)));
  })();

  return (
    <div className="space-y-4">
      {detailOpen && (
        <OrderDetailModal
          order={detailOrder}
          loading={detailLoading}
          onClose={() => {
            setDetailOpen(false);
            setDetailOrder(null);
          }}
          onWhatsApp={(o) => {
            // Reusamos handleWhatsApp del listado — el detalle ya tiene phone real.
            const phoneDigits = (o.customerPhone ?? "").replace(/\D/g, "");
            if (phoneDigits.length < 8) {
              window.alert("Esta orden no tiene teléfono válido.");
              return;
            }
            const intl = phoneDigits.length === 9 ? `51${phoneDigits}` : phoneDigits;
            const statusLabel = ORDER_STATUS_CONFIG[o.status]?.label ?? o.status;
            const idShort = o.id.slice(-8).toUpperCase();
            const message =
              `Hola ${o.customerName}, te escribo de la tienda. ` +
              `Tu pedido #${idShort} está actualmente *${statusLabel}*. ` +
              `Total: S/ ${o.total.toFixed(2)}. ¿Te confirmamos los detalles?`;
            window.open(
              `https://wa.me/${intl}?text=${encodeURIComponent(message)}`,
              "_blank",
              "noopener,noreferrer",
            );
          }}
          onChangeStatus={(o) => {
            // Cierra modal y abre el dropdown inline en la fila correspondiente.
            setDetailOpen(false);
            setDetailOrder(null);
            setOpenStatusMenuFor(o.id);
          }}
        />
      )}

      {/* ── KPI strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <CounterChip
          label="Pendientes"
          value={counters.pendientes}
          tone="warning"
          active={statusFilter === "pendiente"}
          onClick={() => setStatusFilter(statusFilter === "pendiente" ? "todos" : "pendiente")}
        />
        <CounterChip
          label="Confirmadas"
          value={counters.confirmadas}
          tone="success"
          active={statusFilter === "confirmado"}
          onClick={() => setStatusFilter(statusFilter === "confirmado" ? "todos" : "confirmado")}
        />
        <CounterChip
          label="Preparando"
          value={counters.preparando}
          tone="neutral"
          active={statusFilter === "preparando"}
          onClick={() => setStatusFilter(statusFilter === "preparando" ? "todos" : "preparando")}
        />
        <CounterChip
          label="En camino"
          value={counters.enCamino}
          tone="warning"
          active={statusFilter === "en_camino"}
          onClick={() => setStatusFilter(statusFilter === "en_camino" ? "todos" : "en_camino")}
        />
        <CounterChip
          label="Entregadas hoy"
          value={counters.entregadasHoy}
          tone="success"
          active={statusFilter === "entregado" && dateFilter === "hoy"}
          onClick={() => {
            if (statusFilter === "entregado" && dateFilter === "hoy") {
              setStatusFilter("todos");
              setDateFilter("todo");
            } else {
              setStatusFilter("entregado");
              setDateFilter("hoy");
            }
          }}
        />
      </div>

      {/* ── Toolbar: search + filtro fecha ─────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cliente, #orden, teléfono o dirección…"
            className="w-full h-10 pl-10 pr-9 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-0.5 gap-0.5">
          {(["hoy", "7d", "30d", "todo"] as OrdersDateFilter[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDateFilter(d)}
              aria-pressed={dateFilter === d}
              className={cn(
                "h-9 px-3 rounded-lg text-xs font-extrabold transition-colors capitalize",
                dateFilter === d
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {d === "hoy" ? "Hoy" : d === "todo" ? "Todo" : d}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-[var(--text-primary)] text-sm font-extrabold hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-[var(--text-primary)] text-sm font-extrabold hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Descargar CSV de las órdenes filtradas (para Excel/SUNAT)"
        >
          <Download className="h-4 w-4" />
          CSV
        </button>
      </div>

      {/* ── Bulk actions bar (visible cuando hay selección) ───────── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-primary/10 border-2 border-[var(--accent)]/40">
          <p className="text-sm font-extrabold text-[var(--accent)]">
            {selectedIds.size} {selectedIds.size === 1 ? "orden seleccionada" : "órdenes seleccionadas"}
          </p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenBulkMenu((v) => !v)}
                disabled={bulkBusy || bulkAvailableStatuses.length === 0}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-[var(--accent)] text-white text-xs font-extrabold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bulkBusy ? "Procesando…" : "Cambiar estado"}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {openBulkMenu && bulkAvailableStatuses.length > 0 && (
                <div className="absolute right-0 mt-1 w-56 z-30 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl overflow-hidden">
                  {bulkAvailableStatuses.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleBulkStatus(s)}
                      className="block w-full text-left px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                    >
                      {STATUS_ACTION_LABEL[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-[var(--text-secondary)] text-xs font-extrabold hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-3.5 w-3.5" />
              Limpiar
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)]/30 rounded-xl text-sm font-bold text-[var(--data-error-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {orders.length === 0 && !error ? (
        <div className="text-center py-16 text-[var(--text-tertiary)] rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin órdenes del marketplace aún</p>
          <p className="text-xs mt-1">Las órdenes recibidas desde el marketplace aparecerán aquí.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-tertiary)] rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-semibold">Sin resultados con esos filtros</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 text-xs font-bold text-[var(--accent)] hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[calc(100vh-24rem)]">
            <DataTable className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] sticky top-0 z-10 border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Seleccionar todas"
                      className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)] cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Orden</th>
                  <th className="text-left px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Cliente</th>
                  <th className="text-left px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] hidden md:table-cell">Dirección</th>
                  <th className="text-right px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    <button
                      type="button"
                      onClick={() => clickHeader("total")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                    >
                      Total <SortIcon k="total" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    <button
                      type="button"
                      onClick={() => clickHeader("status")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors mx-auto"
                    >
                      Estado <SortIcon k="status" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    <button
                      type="button"
                      onClick={() => clickHeader("createdAt")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                    >
                      Fecha <SortIcon k="createdAt" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 w-32 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filtered.map((o) => {
                  const statusConfig = ORDER_STATUS_CONFIG[o.status] ?? {
                    label: o.status,
                    className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                  };
                  const created = new Date(o.createdAt);
                  const isSelected = selectedIds.has(o.id);
                  const nextOptions = NEXT_STATUSES[o.status] ?? [];
                  const isUpdating = updatingId === o.id;
                  return (
                    <tr
                      key={o.id}
                      className={cn(
                        "transition-colors cursor-pointer",
                        isSelected
                          ? "bg-primary/10"
                          : "hover:bg-[var(--surface-sunken)]/50",
                      )}
                      onClick={(e) => {
                        // Solo abre detalle si el click NO fue sobre un botón/input/menu.
                        const target = e.target as HTMLElement;
                        if (target.closest("button, input, a, [data-no-row-click]")) return;
                        openDetail(o.id);
                      }}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(o.id)}
                          aria-label={`Seleccionar orden ${o.id.slice(-8)}`}
                          className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)] cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-mono text-xs font-extrabold text-[var(--text-primary)]">
                          #{o.id.slice(-8).toUpperCase()}
                        </p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                          {o.itemsCount} producto{o.itemsCount !== 1 ? "s" : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-[var(--text-primary)] truncate max-w-[160px]" title={o.customerName}>
                          {o.customerName}
                        </p>
                        {o.customerPhone && (
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono">{o.customerPhone}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <p
                          className="text-xs text-[var(--text-secondary)] truncate max-w-[240px]"
                          title={o.customerLocation ?? "—"}
                        >
                          {o.customerLocation || <span className="text-[var(--text-tertiary)] italic">Sin dirección</span>}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-[var(--text-primary)] tabular-nums">
                        S/ {o.total.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-extrabold", statusConfig.className)}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs">
                        <p className="font-semibold text-[var(--text-primary)] tabular-nums">
                          {created.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                        </p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">
                          {created.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false })}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right" data-no-row-click>
                        <div className="inline-flex items-center gap-1 justify-end">
                          {/* WhatsApp */}
                          {o.customerPhone && (
                            <button
                              type="button"
                              onClick={() => handleWhatsApp(o)}
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--data-success)] hover:bg-[var(--data-success)]/15 transition-colors"
                              title="Escribir por WhatsApp"
                              aria-label="WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </button>
                          )}
                          {/* Ver detalle */}
                          <button
                            type="button"
                            onClick={() => openDetail(o.id)}
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                            title="Ver detalle del pedido"
                            aria-label="Detalle"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {/* Status dropdown */}
                          {nextOptions.length > 0 && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setOpenStatusMenuFor((id) => (id === o.id ? null : o.id))}
                                disabled={isUpdating}
                                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-40"
                                title="Cambiar estado"
                                aria-label="Cambiar estado"
                              >
                                {isUpdating ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </button>
                              {openStatusMenuFor === o.id && (
                                <div className="absolute right-0 mt-1 w-52 z-30 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl overflow-hidden">
                                  {nextOptions.map((s) => (
                                    <button
                                      key={s}
                                      type="button"
                                      onClick={() => handleStatusChange(o.id, s)}
                                      className={cn(
                                        "block w-full text-left px-3 py-2 text-xs font-bold hover:bg-[var(--surface-sunken)] transition-colors",
                                        s === "cancelado"
                                          ? "text-[var(--data-error-500)]"
                                          : "text-[var(--text-primary)]",
                                      )}
                                    >
                                      {STATUS_ACTION_LABEL[s]}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>
          {filtered.length < orders.length && (
            <div className="border-t border-[var(--rule-base)] px-4 py-2 bg-[var(--surface-sunken)] text-xs font-bold text-[var(--text-secondary)] flex items-center justify-between">
              <span>
                Mostrando <strong className="tabular-nums">{filtered.length}</strong> de{" "}
                <strong className="tabular-nums">{orders.length}</strong> órdenes
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="text-[var(--accent)] hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Comisiones
// ─────────────────────────────────────────────
