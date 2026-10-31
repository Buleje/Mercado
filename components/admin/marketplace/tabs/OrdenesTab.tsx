"use client";

/**
 * Órdenes del Marketplace (`?tab=marketplace&vista=ordenes`) con el patrón del
 * panel (11-10): una fila de filtros pegada a la tabla (buscador · estado ·
 * período · Indicadores), una orden por fila con su paso siguiente a la vista y
 * lo demás en «⋯», y el CSV en el «⋯ Más» de la cabecera del hub.
 */

import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, ChevronDown, Download, Search, ShoppingCart, X, XCircle } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useMarketplaceOrders, type MarketplaceOrder, type MarketplaceOrderDetail, type OrderTargetStatus } from "@/components/admin/marketplace/hooks/use-marketplace-orders";
import { useOrdenesVista, type FiltroEstado, type FiltroFecha, type OrdenesVista } from "@/components/admin/marketplace/hooks/use-ordenes-vista";
import { useAccionesDeVista } from "@/components/admin/marketplace/acciones-de-vista";
import { OrderDetailModal } from "@/components/admin/marketplace/OrderDetailModal";
import { OrdenesTabla } from "@/components/admin/marketplace/ordenes/OrdenesTabla";
import { ACCION_DE_ESTADO, SIGUIENTES, exportarOrdenesCsv, linkWhatsApp } from "@/components/admin/marketplace/ordenes/ordenes-util";
import { BuscadorEnFila, CAMPO_EN_FILA, CounterChip, TableSkeleton } from "@/components/admin/marketplace/shared";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";

const ESTADOS: { valor: FiltroEstado; rotulo: string; tono: "success" | "warning" | "danger" | "neutral" }[] = [
  { valor: "pendiente", rotulo: "Por confirmar", tono: "warning" },
  { valor: "confirmado", rotulo: "Confirmadas", tono: "success" },
  { valor: "preparando", rotulo: "Preparando", tono: "neutral" },
  { valor: "en_camino", rotulo: "En camino", tono: "warning" },
  { valor: "entregado", rotulo: "Entregadas", tono: "success" },
  { valor: "cancelado", rotulo: "Canceladas", tono: "danger" },
];

const PERIODOS: { valor: FiltroFecha; rotulo: string }[] = [
  { valor: "hoy", rotulo: "Hoy" },
  { valor: "7d", rotulo: "Últimos 7 días" },
  { valor: "30d", rotulo: "Últimos 30 días" },
  { valor: "todo", rotulo: "Todo el historial" },
];

function useIndicadoresOrdenes(v: OrdenesVista, cargando: boolean) {
  const porConfirmar = v.conteos.pendiente ?? 0;
  return useKpisPlegables({
    claveMemoria: "marketplace-ordenes",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: cargando,
    filtrosActivos: v.estado !== "todos" ? 1 : 0,
    resumen: `${porConfirmar} por confirmar`,
    tarjetas: ESTADOS.map((e) => (
      <CounterChip
        key={e.valor}
        label={e.rotulo}
        value={v.conteos[e.valor] ?? 0}
        tone={e.tono}
        active={v.estado === e.valor}
        onClick={() => v.setEstado(v.estado === e.valor ? "todos" : e.valor)}
      />
    )),
  });
}

export function MarketplaceOrdenesTab() {
  const { orders, loading, error, load, updatingId, bulkBusy, updateStatus, bulkUpdateStatus, fetchDetail } = useMarketplaceOrders();
  const v = useOrdenesVista(orders);
  const kpis = useIndicadoresOrdenes(v, loading);
  const { confirm, prompt } = useConfirm();
  const [detalle, setDetalle] = useState<{ abierto: boolean; cargando: boolean; orden: MarketplaceOrderDetail | null }>({ abierto: false, cargando: false, orden: null });

  useAccionesDeVista([
    {
      id: "csv",
      label: "Descargar CSV",
      hint: `${v.filtradas.length} órdenes, con los filtros de la lista (Excel, contabilidad)`,
      icon: Download,
      disabled: v.filtradas.length === 0,
      onSelect: () => exportarOrdenesCsv(v.filtradas),
    },
  ]);

  if (loading) return <TableSkeleton />;

  async function abrirDetalle(id: string) {
    setDetalle({ abierto: true, cargando: true, orden: null });
    const orden = await fetchDetail(id);
    setDetalle({ abierto: true, cargando: false, orden });
  }
  const cerrarDetalle = () => setDetalle({ abierto: false, cargando: false, orden: null });

  async function cambiarEstado(id: string, estado: OrderTargetStatus) {
    let motivo: string | undefined;
    if (estado === "cancelado") {
      const r = await prompt({ title: "Motivo de cancelación", label: "Motivo (opcional)" });
      if (r === null) return;
      motivo = r || undefined;
    }
    const res = await updateStatus(id, estado, motivo);
    if (!res.ok && res.error) toast.error(res.error);
  }

  /* La lista trae el teléfono enmascarado (Ley 29733): el número real sale del detalle. */
  async function escribir(o: MarketplaceOrder) {
    const conTelefono = await fetchDetail(o.id);
    const link = linkWhatsApp(o, conTelefono?.customerPhone);
    if (link) window.open(link, "_blank", "noopener,noreferrer");
    else void abrirDetalle(o.id);
  }

  async function cambiarEnLote(estado: OrderTargetStatus) {
    const ids = Array.from(v.seleccion);
    if (ids.length === 0) return;
    let motivo: string | undefined;
    if (estado === "cancelado") {
      const r = await prompt({ title: `Cancelar ${ids.length} órdenes`, label: "Motivo (opcional)" });
      if (r === null) return;
      motivo = r || undefined;
    } else if (!(await confirm({ title: `¿${ACCION_DE_ESTADO[estado]} ${ids.length} órdenes?`, confirmLabel: "Sí, cambiar" }))) {
      return;
    }
    const res = await bulkUpdateStatus(ids, estado, motivo);
    if (!res.ok) return;
    v.setSeleccion(new Set());
    if (res.skipped && res.skipped.length > 0) {
      toast.info(`Actualizadas: ${res.updatedCount}. Omitidas: ${res.skipped.length} (ese cambio de estado no vale para ellas).`);
    }
  }

  const ordenDetalle = detalle.orden;
  const accionesDetalle = ordenDetalle
    ? (SIGUIENTES[ordenDetalle.status] ?? []).map((s) => ({
        id: s,
        label: ACCION_DE_ESTADO[s],
        peligro: s === "cancelado",
        onSelect: () => {
          cerrarDetalle();
          void cambiarEstado(ordenDetalle.id, s);
        },
      }))
    : [];

  return (
    <div className="space-y-3">
      {detalle.abierto && (
        <OrderDetailModal
          order={ordenDetalle}
          loading={detalle.cargando}
          onClose={cerrarDetalle}
          onWhatsApp={(o) => {
            const link = linkWhatsApp(o, o.customerPhone);
            if (link) window.open(link, "_blank", "noopener,noreferrer");
            else toast.error("Este pedido no tiene un teléfono válido.");
          }}
          acciones={accionesDetalle}
        />
      )}

      {/* Una fila: buscador · estado · período · Indicadores. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden h-12 w-8 shrink-0 items-center justify-center sm:inline-flex">
          <InfoTip title="Órdenes del marketplace" what="Los pedidos que entraron a tu tienda por el marketplace. Toca una fila para ver el pedido; el botón de la fila avanza su estado." affects="Las cifras de arriba cuentan el período elegido. El CSV (en «⋯ Más») baja lo que ves con estos filtros." example="Por confirmar 2 → «Confirmar» → Preparar → Enviar → Entregado." side="bottom" />
        </span>
        <BuscadorEnFila valor={v.query} onCambiar={v.setQuery} placeholder="Buscar por cliente, #orden, teléfono o dirección" />
        <select value={v.estado} onChange={(e) => v.setEstado(e.target.value as FiltroEstado)} aria-label="Estado" className={cn(CAMPO_EN_FILA, "min-w-0 flex-1 px-3 sm:flex-none sm:shrink-0")}>
          <option value="todos">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e.valor} value={e.valor}>{e.rotulo}</option>
          ))}
        </select>
        <select value={v.fecha} onChange={(e) => v.setFecha(e.target.value as FiltroFecha)} aria-label="Período" className={cn(CAMPO_EN_FILA, "min-w-0 flex-1 px-3 sm:flex-none sm:shrink-0")}>
          {PERIODOS.map((p) => (
            <option key={p.valor} value={p.valor}>{p.rotulo}</option>
          ))}
        </select>
        <div className="ml-auto flex shrink-0 items-center gap-2">{kpis.boton}</div>
      </div>
      {kpis.panel}

      {v.seleccion.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-primary/10 p-2 pl-3">
          <p className="text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            {v.seleccion.size} {v.seleccion.size === 1 ? "orden elegida" : "órdenes elegidas"}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <ActionMenu
              label={bulkBusy ? "Procesando…" : "Cambiar estado"}
              icon={ChevronDown}
              size="md"
              title={v.destinosEnLote.length === 0 ? "Las elegidas no tienen un estado siguiente en común" : "Cambiar el estado de todas las elegidas"}
              actions={v.destinosEnLote.map((s) => ({
                id: s,
                label: ACCION_DE_ESTADO[s],
                icon: s === "cancelado" ? XCircle : CheckCircle2,
                tone: s === "cancelado" ? "danger" : "default",
                disabled: bulkBusy,
                onSelect: () => void cambiarEnLote(s),
              }))}
            />
            <button
              type="button"
              onClick={() => v.setSeleccion(new Set())}
              className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
            >
              <X className="h-4 w-4" aria-hidden /> Soltar
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 p-2 pl-3 text-sm font-semibold text-[var(--data-error-ink)]">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
          <button type="button" onClick={load} className="ml-auto h-12 rounded-xl px-3 underline">Reintentar</button>
        </div>
      )}

      {orders.length === 0 && !error ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-12 text-[var(--text-tertiary)]">
          <ShoppingCart className="h-8 w-8 opacity-40" aria-hidden />
          <p className="text-sm font-semibold">Todavía no entran pedidos por el marketplace.</p>
        </div>
      ) : v.filtradas.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-10 text-[var(--text-tertiary)]">
          <Search className="h-6 w-6 opacity-40" aria-hidden />
          <p className="text-sm font-semibold">Ninguna orden con esos filtros.</p>
          <button type="button" onClick={v.limpiar} className="h-12 px-3 text-sm font-semibold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            Ver todas
          </button>
        </div>
      ) : (
        <>
          <OrdenesTabla
            v={v}
            actualizandoId={updatingId}
            onEstado={(id, s) => void cambiarEstado(id, s)}
            onDetalle={(id) => void abrirDetalle(id)}
            onWhatsApp={(o) => void escribir(o)}
          />
          {v.filtradas.length < orders.length && (
            <div className="flex items-center justify-between gap-2 text-sm text-[var(--text-secondary)]">
              <span>
                <strong className="tabular-nums">{v.filtradas.length}</strong> de <strong className="tabular-nums">{orders.length}</strong> órdenes
              </span>
              <button type="button" onClick={v.limpiar} className="h-12 px-3 font-semibold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
                Ver todas
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
