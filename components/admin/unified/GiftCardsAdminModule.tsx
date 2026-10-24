"use client";

/**
 * GiftCardsAdminModule — Tarjetas de regalo (admin).
 *
 * Las que los clientes compran desde el marketplace: validar códigos, cancelar
 * con reembolso, extender el vencimiento y emitir tarjetas manuales por
 * compensación. Patrón del panel: cabecera en una fila (título · Indicadores
 * plegables · «Emitir tarjeta» · «⋯»), filtros en una fila y, por tarjeta,
 * «Ver» a la vista y «Cancelar y reembolsar» en el «⋯».
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { DataTable } from "@buleje/design-system";
import { Download, Plus, RefreshCw } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import AdminModal from "@/components/admin/shared/AdminModal";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { CabeceraVista, CLASE_SELECT, CLASE_TABLA, descargarCsv, FilaFiltros, tarjetasDe, TH, Vacio } from "@/components/admin/campanas/comun";
import { GiftCardDetailsModal, type GiftCardDetails } from "./gift-cards-admin/GiftCardDetailsModal";
import { CreateManualGiftCardModal } from "./gift-cards-admin/CreateManualGiftCardModal";
import { formatNumber } from "@/lib/format";
import { type AdminStats, type ApiGiftCard, toGiftCardDetails } from "./gift-cards-admin/tipos";
import { FilaTarjeta, fmt, STATUS_LABELS } from "./gift-cards-admin/FilaTarjeta";


// ── Main Component ──────────────────────────────────────────────────────────

export default function GiftCardsAdminModule() {
  const { prompt } = useConfirm();
  const [cards, setCards] = useState<GiftCardDetails[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GiftCardDetails["status"] | "all">("all");
  const [selected, setSelected] = useState<GiftCardDetails | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch("/api/admin/gift-cards", { cache: "no-store" }),
        fetch("/api/admin/gift-cards/stats", { cache: "no-store" }),
      ]);
      if (listRes.ok) {
        const data = (await listRes.json()) as { cards: ApiGiftCard[] };
        setCards(data.cards.map(toGiftCardDetails));
      } else {
        setCards([]);
        setError("No se pudieron cargar las tarjetas.");
      }
      if (statsRes.ok) {
        const data = (await statsRes.json()) as { stats: AdminStats };
        setStats(data.stats);
      }
    } catch {
      setCards([]);
      setError("No se pudieron cargar las tarjetas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return c.recipientName.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
    });
  }, [cards, search, statusFilter]);

  // Cifras: las del backend; el cálculo local sólo cubre los segundos hasta que lleguen.
  const vendidas = stats?.vendidas30d ?? cards.length;
  const canjeadas = stats?.canjeadas30d ?? cards.filter((c) => c.redeemedAt).length;
  const ingreso = stats?.ingreso30d ?? cards.reduce((sum, c) => sum + c.amount, 0);
  const saldoPendiente = stats?.saldoPendiente ?? cards.filter((c) => c.status === "pendiente").reduce((sum, c) => sum + c.balance, 0);

  const kpis = useKpisPlegables({
    claveMemoria: "tarjetas-de-regalo",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: loading && !stats,
    resumen: `S/ ${formatNumber(saldoPendiente, 0)} por canjear`,
    tarjetas: tarjetasDe([
      { rotulo: "Vendidas (30 días)", valor: String(vendidas), detalle: "Tarjetas emitidas" },
      { rotulo: "Ingreso (30 días)", valor: fmt(ingreso), detalle: "Monto vendido" },
      { rotulo: "Canjeadas (30 días)", valor: String(canjeadas), detalle: "Tarjetas usadas en una compra" },
      { rotulo: "Saldo por canjear", valor: fmt(saldoPendiente), detalle: "Lo que aún pueden gastar", tono: saldoPendiente > 2000 ? "aviso" : undefined },
    ]),
  });

  const handleCancel = async (id: string) => {
    const reason = await prompt({
      title: "Motivo de la cancelación",
      label: "Motivo",
      defaultValue: "Solicitud del cliente",
      inputType: "text",
    });
    if (!reason || reason.trim().length < 3) return;
    try {
      const res = await fetch(`/api/admin/gift-cards/${id}/cancel`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status: "cancelada", balance: 0 } : c)));
      setSelected(null);
      toast.success("Tarjeta cancelada");
      void refetch();
    } catch {
      toast.error("No se pudo cancelar la tarjeta. Revisa y vuelve a intentar.");
    }
  };

  const handleExtend = async (id: string, newExpiry: string) => {
    try {
      const res = await fetch(`/api/admin/gift-cards/${id}/extend`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ expiresAt: newExpiry }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const iso = new Date(newExpiry).toISOString();
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, expiresAt: iso } : c)));
      setSelected((s) => (s?.id === id ? { ...s, expiresAt: iso } : s));
      toast.success("Vencimiento extendido");
      void refetch();
    } catch {
      toast.error("No se pudo extender el vencimiento.");
    }
  };

  const handleCreate = async (data: {
    amount: number;
    recipientName: string;
    recipientPhone: string;
    message: string;
    expiresAt: string;
    reason: string;
  }) => {
    try {
      const res = await fetch("/api/admin/gift-cards/issue-manual", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          amount: Math.floor(data.amount),
          recipientName: data.recipientName,
          recipientPhone: data.recipientPhone || null,
          message: data.message || undefined,
          expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
          reason: data.reason,
        }),
      });
      if (!res.ok) throw new Error("No se pudo emitir la tarjeta");
      const payload = (await res.json()) as { plainCode?: string; giftCard?: ApiGiftCard };
      if (payload.plainCode) setIssuedCode(payload.plainCode);
      if (payload.giftCard) setCards((prev) => [toGiftCardDetails(payload.giftCard!), ...prev]);
      void refetch();
    } catch {
      throw new Error("No se pudo emitir la tarjeta. Intenta de nuevo.");
    }
  };

  const exportar = () =>
    descargarCsv(
      "tarjetas_de_regalo",
      ["ID", "Código", "Monto", "Saldo", "Destinatario", "Estado", "Emitida", "Vence", "Canjeada"],
      filtered.map((r) => [r.id, r.code, Number(r.amount).toFixed(2), Number(r.balance).toFixed(2), r.recipientName, STATUS_LABELS[r.status], r.createdAt, r.expiresAt, r.redeemedAt ?? ""]),
    );

  const menu: MenuAccion[] = [
    { id: "csv", label: "Descargar CSV", hint: `${filtered.length} tarjetas, con los filtros de ahora`, icon: Download, onSelect: exportar, disabled: filtered.length === 0 },
    { id: "recargar", label: "Actualizar", icon: RefreshCw, onSelect: () => void refetch() },
  ];

  return (
    <div className="space-y-4">
      <CabeceraVista
        titulo="Tarjetas de regalo"
        ayuda={{
          title: "Tarjetas de regalo",
          what: "Las tarjetas con saldo que tus clientes compran para regalar, y las que tú emites a mano.",
          affects: "El saldo por canjear es plata que ya cobraste y todavía te falta entregar en productos.",
          example: "Emites una de S/ 50 para compensar un pedido tardío; el código se muestra una sola vez.",
        }}
        indicadores={kpis.boton}
        principal={
          <button type="button" onClick={() => setShowCreate(true)} aria-haspopup="dialog" className={button({ variant: "primary", className: "shrink-0 gap-1.5 rounded-xl px-4 max-sm:w-12 max-sm:px-0" })}>
            <Plus className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Emitir tarjeta</span>
          </button>
        }
        menu={menu}
        tituloMenu="Descargar CSV y actualizar"
      />
      {kpis.panel}

      {/* El código se muestra UNA vez: el admin lo copia y se lo entrega. */}
      <AdminModal open={!!issuedCode} onClose={() => setIssuedCode(null)} title="Código generado" variant="default" aboveModals>
        <div className="p-5">
          <p className="text-sm text-[var(--text-secondary)]">Este código se muestra una sola vez. Cópialo y entrégalo al destinatario (WhatsApp, correo o impreso): no lo podemos recuperar después.</p>
          {issuedCode && (
            <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-[var(--rule-soft)] px-3 py-3">
              <code className="font-mono text-base font-bold tracking-wider text-[var(--text-primary)]">{issuedCode}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(issuedCode).then(() => toast.success("Código copiado")).catch(() => toast.error("No se pudo copiar: selecciónalo y cópialo a mano"));
                }}
                className="min-h-12 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-dark"
              >
                Copiar
              </button>
            </div>
          )}
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => setIssuedCode(null)} className="min-h-12 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90">
              Listo
            </button>
          </div>
        </div>
      </AdminModal>

      <FilaFiltros valor={search} onCambio={setSearch} placeholder="Buscar destinatario o código" etiqueta="Buscar tarjetas">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as GiftCardDetails["status"] | "all")} aria-label="Filtrar por estado" className={CLASE_SELECT}>
          <option value="all">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="canjeada">Canjeadas</option>
          <option value="expirada">Expiradas</option>
          <option value="cancelada">Canceladas</option>
        </select>
      </FilaFiltros>

      {loading && cards.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Cargando tarjetas…</p>
      ) : error ? (
        <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-[var(--rule-base)] py-10 text-center">
          <p className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{error}</p>
          <button type="button" onClick={() => void refetch()} className="min-h-12 rounded-xl px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]">
            Reintentar
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <Vacio>{cards.length === 0 ? "Aún no hay tarjetas: aparecerán cuando un cliente compre una o emitas una." : "Ninguna tarjeta coincide con los filtros."}</Vacio>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <div className="overflow-x-auto">
            <DataTable className={CLASE_TABLA}>
              <thead>
                <tr>
                  <th className={TH}>Código</th>
                  <th className={cn(TH, "hidden sm:table-cell")}>Destinatario</th>
                  <th className={cn(TH, "text-right")}>Monto</th>
                  <th className={cn(TH, "hidden text-right lg:table-cell")}>Saldo</th>
                  <th className={cn(TH, "hidden md:table-cell")}>Vence</th>
                  <th className={cn(TH, "text-center")}>Estado</th>
                  <th className={cn(TH, "text-right")}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filtered.map((c) => (
                  <FilaTarjeta key={c.id} c={c} onVer={() => setSelected(c)} onCancelar={() => void handleCancel(c.id)} />
                ))}
              </tbody>
            </DataTable>
          </div>
        </div>
      )}

      {selected && <GiftCardDetailsModal card={selected} onClose={() => setSelected(null)} onCancel={handleCancel} onExtend={handleExtend} />}
      {showCreate && <CreateManualGiftCardModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
    </div>
  );
}
