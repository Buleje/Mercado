"use client";

/**
 * Una fila de «A quién fiarle»: el cliente (abre su ficha) con el motivo, el
 * veredicto, lo que debe, su límite y su historial; «⋯» con cobrar y WhatsApp.
 * Todo viene hecho del servidor (`/api/finanzas/a-quien-fiarle`).
 */

import { useRef } from "react";
import { CircleUser, HandCoins, MessageCircle, MoreHorizontal } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";
import { waLink } from "@/lib/whatsapp-link";
import { cn } from "@/lib/utils";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import type { FilaFiarle as Fila } from "@/lib/credit/a-quien-fiarle";
import { ME_DEBEN } from "@/components/admin/por-cobrar/FiadosEnVentasYCaja";
import { VEREDICTO } from "./estilo";

const soles = (n: number) => montoEnMoneda(n, "PEN");

export default function FilaFiarle({ fila: f }: { fila: Fila }) {
  const v = VEREDICTO[f.veredicto];
  const Icon = v.icon;
  const ref = useRef<HTMLDivElement>(null);
  /* El menú cierra sin devolverle el foco a su botón: se enfoca el ⋯ antes de la acción. */
  const enfocarMenu = () => ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus({ preventScroll: true });
  const wa = waLink(
    f.telefono,
    f.deuda > 0
      ? `Hola ${f.nombre.split(" ")[0] ?? ""}, te escribo por tu saldo pendiente de ${soles(f.deuda)}. ¿Coordinamos el pago?`
      : `Hola ${f.nombre.split(" ")[0] ?? ""}`,
  );
  const acciones: MenuAccion[] = [
    { id: "ficha", label: "Ver su ficha", hint: "Compras, fiados y su límite de crédito, en Mis clientes", icon: CircleUser, onSelect: () => irAlOrigen({ tab: "clientes", params: { vista: "crm", cliente: f.telefono } }) },
    ...(f.deuda > 0
      ? [{ id: "cobrar", label: "Cobrarle", hint: "En Ventas y caja › Me deben", icon: HandCoins, onSelect: () => irAlOrigen({ tab: ME_DEBEN.tab, params: { ...ME_DEBEN.params } }) }]
      : []),
    ...(wa ? [{ id: "wa", label: "Escribirle por WhatsApp", hint: f.telefono, icon: MessageCircle, onSelect: () => { window.open(wa, "_blank", "noopener,noreferrer"); } }] : []),
  ];

  return (
    <tr>
      <td>
        {/* UN solo hijo: en el celular la celda es una fila flex. */}
        {/* El nombre y el motivo son UN enlace de 48 px a la ficha: la fila no
            crece por tener un objetivo táctil aparte para el nombre. */}
        <EnlacePanel cosa="cliente" id={f.telefono} apariencia="heredada" className="group flex min-h-12 min-w-0 flex-col justify-center">
          <span className="font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-ink)] group-hover:underline dark:group-hover:text-[var(--accent)]">{f.nombre}</span>
          <span className="text-sm text-[var(--text-secondary)]">{f.motivo}</span>
        </EnlacePanel>
      </td>
      <td className="whitespace-nowrap">
        <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-bold", v.chip)}>
          <Icon className="h-4 w-4" aria-hidden="true" />{v.label}
        </span>
      </td>
      <td className="whitespace-nowrap text-right tabular-nums">
        {f.deuda > 0 ? (
          <div>
            <span className="font-extrabold text-[var(--text-primary)]">{soles(f.deuda)}</span>
            {f.vencido > 0 && <span className="block text-sm font-semibold text-[var(--data-error-ink)]">{soles(f.vencido)} vencido</span>}
          </div>
        ) : (
          <span className="text-[var(--text-tertiary)]">—</span>
        )}
      </td>
      <td className="whitespace-nowrap text-right tabular-nums text-[var(--text-secondary)]">
        {f.limite > 0 ? (
          <div>
            <span>{soles(f.limite)}</span>
            <span className="block text-sm text-[var(--text-tertiary)]">quedan {soles(f.disponible ?? 0)}</span>
          </div>
        ) : (
          <span className="text-[var(--text-tertiary)]">Sin tope</span>
        )}
      </td>
      <td className="whitespace-nowrap text-[var(--text-secondary)]">
        {f.fiados > 0 ? `${f.pagados} de ${f.fiados} pagados` : "Nunca"}
      </td>
      <td className="text-right">
        <div ref={ref} className="flex justify-end">
          <ActionMenu
            label={`Más acciones de ${f.nombre}`}
            title="Ficha, cobrar y WhatsApp"
            icon={MoreHorizontal}
            actions={acciones.map((a) => ({ ...a, onSelect: () => { enfocarMenu(); a.onSelect(); } }))}
            soloIcono
            size="md"
            className="w-12 shrink-0 border-transparent! bg-transparent! hover:bg-[var(--surface-sunken)]!"
          />
        </div>
      </td>
    </tr>
  );
}
