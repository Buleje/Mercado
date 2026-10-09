"use client";

/**
 * Cabecera de la pestaña Caja en UNA fila: el título de la vista (con su ⓘ),
 * el estado de la caja, las cuatro vistas y el menú «Más» con lo que no es de
 * uso constante (arqueos, imprimir, exportar, WhatsApp, tolerancia, refrescar).
 */
import type { ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { MoreHorizontal } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { VistaCaja } from "./tipos";

const VISTAS: Array<{ clave: VistaCaja; rotulo: string }> = [
  { clave: "current", rotulo: "Actual" },
  { clave: "history", rotulo: "Historial" },
  { clave: "auditoria", rotulo: "Quién la tocó" },
  { clave: "reconcile", rotulo: "Reconciliación" },
];

const TITULO: Record<VistaCaja, string> = {
  current: "Caja de hoy",
  history: "Historial de cajas",
  auditoria: "Quién tocó la caja",
  reconcile: "Reconciliación por día",
};

const AYUDA: Record<VistaCaja, { what: string; example?: string }> = {
  current: {
    what: "El efectivo físico del día: abres con un monto inicial, registras ingresos y retiros durante el turno y al cerrar comparas lo contado con lo esperado.",
    example: "Valentina abre con S/ 200, vende durante el turno y al cerrar el sistema le dice si hay faltante o sobrante.",
  },
  history: { what: "Todas las cajas cerradas con su diferencia entre lo esperado y lo contado." },
  auditoria: { what: "Aperturas, cierres e ingresos o retiros a mano, con el usuario que los hizo. Es un registro de auditoría: no se edita ni se borra." },
  reconcile: { what: "Esperado contra real por día y el flujo de efectivo de la semana." },
};

interface Props {
  vista: VistaCaja;
  onVista: (v: VistaCaja) => void;
  estado: ReactNode;
  acciones: MenuAccion[];
}

export function CajaCabecera({ vista, onVista, estado, acciones }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 sm:flex-none items-center gap-2">
        <SectionTitle className="text-[var(--text-primary)]">{TITULO[vista]}</SectionTitle>
        <InfoTip what={AYUDA[vista].what} example={AYUDA[vista].example} />
        {estado}
      </div>
      {/* En el celular las vistas bajan a su propia fila (con scroll) y «Más» se queda arriba, como ícono. */}
      <div className="order-last sm:order-none w-full sm:w-auto sm:ml-auto overflow-x-auto scrollbar-none">
        <div className="flex w-max rounded-xl bg-[var(--surface-sunken)] p-1" role="tablist" aria-label="Vistas de la caja">
          {VISTAS.map((v) => (
            <button
              key={v.clave}
              type="button"
              role="tab"
              aria-selected={vista === v.clave}
              onClick={() => onVista(v.clave)}
              className={cn(
                "px-3 min-h-9 rounded-lg text-sm font-semibold transition-all whitespace-nowrap",
                vista === v.clave ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {v.rotulo}
            </button>
          ))}
        </div>
      </div>
      <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} size="sm" compactoEnMovil title="Arqueos, imprimir, exportar y ajustes" />
    </div>
  );
}
