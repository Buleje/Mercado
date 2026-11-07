"use client";

import { CardTitle } from "@buleje/design-system";
import { Phone, MapPin, Calendar, Clock, MessageCircle, FileText } from "@buleje/design-system/icons";
import { m } from "@/components/admin/providers";
import { cn } from "@/lib/utils";
import { cumpleCorto, cumpleDe } from "@/lib/clientes/cumpleanos";
import { fmtRelative, getInitials, getAvatarColor, type CustomerData, type Resumen360 } from "@/components/admin/cliente360/cliente360-compartido";
import { CustomerSegmentBadge, HealthBadge } from "@/components/admin/cliente360/insignias";
import ActionMenu from "@/components/admin/shared/action-menu";
import type { Cliente360 } from "@/components/admin/cliente360/use-cliente-360";

/** Tarjeta del cliente: nombre, antigüedad, salud, segmento, contacto y botones. Bloque de la ficha 360 (Customer360Tab). */
export default function FichaPerfil({ ficha, customer, resumen }: { ficha: Cliente360; customer: CustomerData; resumen: Resumen360 }) {
  const {
    orders, setShowEstadoCuenta, setShowEditModal,
  } = ficha;
  const { segCfg, totalSpent, lastOrder, firstOrder } = resumen;
  return (
    <>
      {/* Profile card */}
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Avatar with auto-generated color */}
          <div
            className="h-16 w-16 rounded-xl flex items-center justify-center text-2xl font-extrabold text-white shrink-0 select-none "
            style={{ backgroundColor: getAvatarColor(customer.name) }}
          >
            {getInitials(customer.name)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <CardTitle className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{customer.name}</CardTitle>
              {/* Mejora 16: Dias como cliente */}
              {firstOrder && (() => {
                const dias = Math.floor((Date.now() - new Date(firstOrder.createdAt).getTime()) / 86400000);
                const meses = Math.floor(dias / 30);
                const anos = Math.floor(dias / 365);
                if (dias < 30) return <span className="text-xs text-[var(--text-tertiary)]">Nuevo (hace {dias} d)</span>;
                if (dias < 90) return <span className="text-xs text-[var(--text-tertiary)]">Cliente hace {dias} días</span>;
                if (dias < 365) return <span className="text-xs text-[var(--text-tertiary)]">Cliente hace {meses} meses</span>;
                return <span className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-medium">Cliente hace {anos}+ año(s)</span>;
              })()}
              <HealthBadge score={customer.healthScore} />
              <span className={cn("text-xs font-extrabold px-2 py-0.5 rounded-full border", segCfg.bg, segCfg.color, segCfg.border)}>
                {segCfg.label}
              </span>
              <CustomerSegmentBadge totalSpent={totalSpent} orderCount={orders.length} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] dark:text-muted">
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {customer.phone}</span>
              {customer.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {customer.location}</span>}
              {cumpleDe(customer) && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" aria-hidden /> Cumple {cumpleCorto(cumpleDe(customer))}</span>}
              {lastOrder && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Últ. pedido {fmtRelative(lastOrder.createdAt)}</span>}
            </div>
          </div>

          {/* CTAs */}
          <div className="flex gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => setShowEstadoCuenta(true)}
              className="inline-flex items-center gap-2 px-4 min-h-11 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition-colors"
            >
              <FileText className="h-4 w-4" />
              Estado de cuenta
            </button>
            <a
              href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 min-h-11 rounded-xl bg-[var(--color-whatsapp)] hover:bg-[var(--color-whatsapp-dark)] text-white text-sm font-bold transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
            {/* Lo de vez en cuando, al menú (ley de Brandon): editar los datos de la ficha. */}
            <ActionMenu
              label="Más"
              size="md"
              soloIcono
              actions={[{ id: "editar", label: "Editar ficha", hint: "Nombre, documento, contacto, cumpleaños y más", icon: FileText, onSelect: () => setShowEditModal(true) }]}
            />
          </div>
        </div>
      </m.div>
    </>
  );
}
