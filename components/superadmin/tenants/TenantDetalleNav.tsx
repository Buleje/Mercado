"use client";

import { useEffect, useRef } from "react";
import {
  LayoutDashboard, HeartPulse, Gauge, Receipt, Mail, ShieldCheck, KeyRound, History, StickyNote,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import type { TabDetalle } from "@/components/superadmin/tenants/tenant-detalle-shared";

type ItemNav = { id: TabDetalle; label: string; icon: LucideIcon };

/** Las 9 pestañas de la ficha, agrupadas por la pregunta que contestan. */
export const GRUPOS_DETALLE: { titulo: string; items: ItemNav[] }[] = [
  {
    titulo: "Negocio",
    items: [
      { id: "resumen", label: "Resumen", icon: LayoutDashboard },
      { id: "salud", label: "Salud", icon: HeartPulse },
      { id: "uso", label: "Uso", icon: Gauge },
    ],
  },
  {
    titulo: "Cuenta",
    items: [
      { id: "facturacion", label: "Facturación", icon: Receipt },
      { id: "avisos", label: "Avisos por correo", icon: Mail },
    ],
  },
  {
    titulo: "Acceso",
    items: [
      { id: "seguridad", label: "Seguridad", icon: ShieldCheck },
      { id: "credenciales", label: "Credenciales", icon: KeyRound },
    ],
  },
  {
    titulo: "Historial",
    items: [
      { id: "actividad", label: "Actividad", icon: History },
      { id: "notas", label: "Notas", icon: StickyNote },
    ],
  },
];

export function etiquetaDeTab(tab: TabDetalle): string {
  for (const g of GRUPOS_DETALLE) for (const i of g.items) if (i.id === tab) return i.label;
  return "";
}

interface TenantDetalleNavProps {
  tab: TabDetalle;
  setTab: (t: TabDetalle) => void;
  /** Pestañas con algo que mirar (p. ej. avisos pausados o sin correo): llevan un punto. */
  conAviso?: Partial<Record<TabDetalle, string>>;
}

/**
 * Navegación de la ficha: columna con grupos a la izquierda desde md; en celular,
 * una fila de chips que se desliza (sin títulos de grupo). Un solo <nav> para los dos.
 */
export function TenantDetalleNav({ tab, setTab, conAviso }: TenantDetalleNavProps) {
  const navRef = useRef<HTMLElement>(null);
  // La pestaña activa siempre a la vista (abrir en «Credenciales» a 400 px la deja fuera de la fila).
  useEffect(() => {
    const activo = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    activo?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [tab]);

  return (
    <nav
      ref={navRef}
      aria-label="Secciones de la ficha"
      className="min-w-0 shrink-0 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]/50 md:w-56 md:overflow-y-auto md:border-b-0 md:border-r"
    >
      <div className="flex gap-2 overflow-x-auto px-4 py-2.5 md:block md:space-y-4 md:overflow-visible md:p-3">
        {GRUPOS_DETALLE.map((g) => (
          <div key={g.titulo} className="contents md:block">
            <Kicker as="p" className="hidden px-2.5 pb-1 md:block">
              {g.titulo}
            </Kicker>
            {g.items.map(({ id, label, icon: Icon }) => {
              const activo = tab === id;
              const aviso = conAviso?.[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={activo ? "page" : undefined}
                  className={`relative inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors md:flex md:w-full md:rounded-lg md:border-0 md:px-2.5 ${
                    activo
                      ? "border-[var(--accent-muted)] bg-[var(--accent-soft)] font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] md:bg-transparent"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                  {aviso && (
                    <>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--data-warning-500)] md:ml-auto" aria-hidden="true" />
                      <span className="sr-only">({aviso})</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
