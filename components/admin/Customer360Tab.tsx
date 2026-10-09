"use client";

import { useId } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { BotonIndicadores } from "@/components/admin/arqueo/KpisCuadre";
import FichaMas from "@/components/admin/cliente360/FichaMas";
import { LoadingState, SectionTitle } from "@buleje/design-system";
import { User, AlertCircle, X } from "@buleje/design-system/icons";
import EstadoCuentaModal from "@/components/admin/EstadoCuentaModal";
import ClienteFormModal from "@/components/admin/clientes/ClienteFormModal";
import { AvisosDelCliente } from "@/components/admin/clientes/AvisosDelCliente";
import { LinkedDocumentsSection } from "@/components/admin/documentos/LinkedDocumentsSection";
import { fmt, getSegment, getTopProducts, SEGMENT_CONFIG, type Resumen360 } from "@/components/admin/cliente360/cliente360-compartido";
import { FavoriteProductsSection } from "@/components/admin/cliente360/FavoriteProductsSection";
import { PurchaseHeatmap } from "@/components/admin/cliente360/PurchaseHeatmap";
import { FamilyAccountSection } from "@/components/admin/cliente360/FamilyAccountSection";
import { useCliente360 } from "@/components/admin/cliente360/use-cliente-360";
import FichaPerfil from "@/components/admin/cliente360/FichaPerfil";
import FichaNotasRapidas from "@/components/admin/cliente360/FichaNotasRapidas";
import FichaComprasMeses from "@/components/admin/cliente360/FichaComprasMeses";
import FichaDatos from "@/components/admin/cliente360/FichaDatos";
import FichaCreditoEtiquetas from "@/components/admin/cliente360/FichaCreditoEtiquetas";
import FichaKpis from "@/components/admin/cliente360/FichaKpis";
import FichaTopActividad from "@/components/admin/cliente360/FichaTopActividad";
import FichaHistorialPedidos from "@/components/admin/cliente360/FichaHistorialPedidos";
import FichaPuntos from "@/components/admin/cliente360/FichaPuntos";
import FichaNotasVendedor from "@/components/admin/cliente360/FichaNotasVendedor";

// ── Props ──────────────────────────────────────────────────────────────────

type Props = {
  phone: string;
  onClose?: () => void;
};

export default function Customer360Tab({ phone, onClose }: Props) {
  // El estado y los guardados viven en `useCliente360`; cada bloque de la ficha, en su pieza de
  // `cliente360/`. Partido el 09-10 sin cambiar el DOM.
  const ficha = useCliente360(phone);
  const {
    customer, setCustomer, orders, loading, error, showEstadoCuenta, setShowEstadoCuenta,
    showEditModal, setShowEditModal, load,
  } = ficha;
  // Indicadores plegables y recordados (ley de Brandon): la línea plegada y el botón van en la cabecera.
  const [kpisAbiertos, setKpisAbiertos] = useLocalStorage<boolean>("cliente360:kpis-abiertos", true);
  const panelKpis = useId();

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LoadingState message="Cargando perfil…" />
    );
  }

  if (error || !customer) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <AlertCircle className="h-10 w-10 text-[var(--data-error-500)]" />
        <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Cliente no encontrado</p>
        <p className="text-sm text-[var(--text-tertiary)] dark:text-muted">No existe el número {phone}</p>
      </div>
    );
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const segment      = getSegment(orders);
  const segCfg       = SEGMENT_CONFIG[segment];
  const topProducts  = getTopProducts(orders);
  const totalSpent   = orders.reduce((s, o) => s + o.total, 0);
  const avgTicket    = orders.length > 0 ? totalSpent / orders.length : 0;
  const lastOrder    = orders.length > 0
    ? [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  const firstOrder   = orders.length > 0
    ? [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
    : null;
  const resumen: Resumen360 = { segment, segCfg, topProducts, totalSpent, avgTicket, lastOrder, firstOrder };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* Cabecera en una fila: título, indicadores (línea plegada + botón) y cerrar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <SectionTitle className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">Cliente 360°</SectionTitle>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!kpisAbiertos && (
            <p className="flex flex-wrap items-center gap-x-2 text-sm tabular-nums text-[var(--text-secondary)]">
              <span>Gastado <strong className="text-[var(--text-primary)]">{fmt(totalSpent)}</strong></span>
              <span aria-hidden="true">·</span>
              <span>{orders.length} pedidos</span>
              <span aria-hidden="true">·</span>
              <span>Ticket <strong className="text-[var(--text-primary)]">{fmt(avgTicket)}</strong></span>
            </p>
          )}
          <BotonIndicadores abierto={kpisAbiertos} onAlternar={() => setKpisAbiertos(!kpisAbiertos)} controla={panelKpis} />
          {onClose && (
            <button aria-label="Cerrar" onClick={onClose} className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors">
              <X className="h-5 w-5 text-[var(--text-tertiary)]" />
            </button>
          )}
        </div>
      </div>

      <FichaPerfil ficha={ficha} customer={customer} resumen={resumen} />

      <FichaKpis ficha={ficha} resumen={resumen} abierto={kpisAbiertos} panelId={panelKpis} />

      <FichaCreditoEtiquetas ficha={ficha} customer={customer} />

      <FichaHistorialPedidos ficha={ficha} />

      <FichaNotasRapidas ficha={ficha} />

      <FichaNotasVendedor ficha={ficha} />

      <FichaDatos customer={customer} />

      {/* Avisos que acepta (Ley 29733: el cliente decide) */}
      <AvisosDelCliente
        key={customer.phone}
        phone={customer.phone}
        avisos={customer}
        onCambio={(campo, valor) => setCustomer(prev => (prev ? { ...prev, [campo]: valor } : prev))}
      />

      {/* Lo que se mira de vez en cuando: plegable y recordado; cerrado no pide sus datos */}
      <FichaMas>
        <FichaComprasMeses ficha={ficha} resumen={resumen} />
        <FichaTopActividad ficha={ficha} resumen={resumen} />
        {/* Mejora 11: Productos Favoritos (datos del servidor) */}
        <FavoriteProductsSection phone={phone} />
        {/* Mejora 10: Purchase Heatmap */}
        <PurchaseHeatmap orders={orders} />
        <FichaPuntos ficha={ficha} />
        {/* Idea 17: Cuenta Familiar */}
        <FamilyAccountSection phone={phone} customer={customer} />
        {/* ADR-119: Documentos vinculados a este cliente */}
        <LinkedDocumentsSection entity="customer" id={phone} />
      </FichaMas>

      {/* Estado de Cuenta Modal */}
      {showEstadoCuenta && (
        <EstadoCuentaModal
          customerPhone={customer.phone}
          customerName={customer.name}
          onClose={() => setShowEstadoCuenta(false)}
        />
      )}

      {/* Editar ficha modal */}
      <ClienteFormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSaved={() => { setShowEditModal(false); load(); }}
        customer={customer as Record<string, unknown>}
        initialFormat="completo"
      />
    </div>
  );
}
