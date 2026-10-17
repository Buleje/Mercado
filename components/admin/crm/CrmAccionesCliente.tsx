"use client";

import { useRef } from "react";
import { BarChart3, CircleUser, CreditCard, MessageCircle, MoreHorizontal } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { waLink } from "@/lib/whatsapp-link";
import type { Customer } from "@/components/admin/crm/crm-compartido";

/**
 * La ficha a la vista (48 px) + «⋯» con lo demás, en cada fila de Mis
 * clientes (patrón de Productos y stock, 10-10). Antes: un carrito de 32 px
 * sin nombre para abrir la ficha y un «+» de 28 px en Crédito.
 */
export default function CrmAccionesCliente({ c, onFicha, onLimite, comparando }: {
  c: Customer;
  onFicha: () => void;
  onLimite: () => void;
  /** En modo comparar: si está marcado y si ya hay tres. */
  comparando: { marcado: boolean; lleno: boolean; alternar: () => void } | null;
}) {
  /* El menú cierra sin devolverle el foco a su botón: se enfoca el ⋯ antes de la acción. */
  const ref = useRef<HTMLDivElement>(null);
  const enfocarMenu = () => ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus({ preventScroll: true });
  const wa = waLink(c.phone, `Hola ${c.name.split(" ")[0] ?? ""}`.trim());
  const acciones: MenuAccion[] = [
    { id: "ficha", label: "Ver la ficha 360°", hint: "Compras, crédito, notas y datos", icon: CircleUser, onSelect: onFicha },
    ...(wa
      ? [{ id: "whatsapp", label: "Escribir por WhatsApp", hint: c.phone, icon: MessageCircle, onSelect: () => { window.open(wa, "_blank", "noopener,noreferrer"); } }]
      : []),
    {
      id: "limite",
      label: c.creditLimit && c.creditLimit > 0 ? "Cambiar el límite de crédito" : "Poner un límite de crédito",
      hint: "Hasta cuánto le fías",
      icon: CreditCard,
      onSelect: onLimite,
    },
    ...(comparando
      ? [{
          id: "comparar",
          label: comparando.marcado ? "Quitar de comparar" : "Comparar",
          hint: comparando.lleno && !comparando.marcado ? "Ya elegiste tres" : "Hasta tres clientes lado a lado",
          icon: BarChart3,
          disabled: comparando.lleno && !comparando.marcado,
          onSelect: comparando.alternar,
        }]
      : []),
  ];
  return (
    <div ref={ref} className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onFicha}
        aria-label={`Ver la ficha de ${c.name}`}
        title="Ficha 360°"
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] dark:hover:text-[var(--accent)]"
      >
        <CircleUser className="h-5 w-5" aria-hidden />
      </button>
      <ActionMenu
        label={`Más acciones de ${c.name}`}
        title="Ficha, WhatsApp, límite de crédito y comparar"
        icon={MoreHorizontal}
        actions={acciones.map(a => ({ ...a, onSelect: () => { enfocarMenu(); a.onSelect(); } }))}
        soloIcono
        size="md"
        className="w-12 shrink-0 border-transparent! bg-transparent! hover:bg-[var(--surface-sunken)]!"
      />
    </div>
  );
}
