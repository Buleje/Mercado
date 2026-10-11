"use client";

import { Fragment, useState } from "react";
import { Award, BarChart3, History, Mail, MapPin, MessageCircle, MoreHorizontal, Phone, Trash2 } from "@buleje/design-system/icons";
import type { DbSupplier } from "@/lib/jsondb";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import SupplierScorecard from "@/components/admin/compras/SupplierScorecard";
import SupplierTimeline from "@/components/admin/compras/SupplierTimeline";
import {
  comprasPorMes, deudaDe, diasSinComprar, urlWhatsApp,
  type CompraDeProveedor, type CuentaDeProveedor,
} from "./datos-proveedores";

type Que = "evaluacion" | "historial" | "compras";

interface Props {
  proveedores: readonly DbSupplier[];
  cuentas: readonly CuentaDeProveedor[];
  compras: readonly CompraDeProveedor[];
  hoy: string;
  ahora: Date;
  onFicha: (s: DbSupplier) => void;
  onEliminar: (s: DbSupplier) => void;
}

const CHIP = "inline-flex items-center rounded-full px-2 py-0.5 text-sm font-semibold";
const CHIP_ROJO = "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]";
const CHIP_AMBAR = "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]";

/** El texto del WhatsApp: si le debes, el recordatorio es TUYO hacia él (antes decía «tienes una deuda pendiente» al proveedor). */
function mensajeWhatsApp(debe: number): string {
  return debe > 0
    ? `Hola, quiero coordinar el pago de ${formatCurrency(debe)} que te debo. ¿Me confirmas tus datos de pago?`
    : "Hola, soy de Buleje. Quisiera hacer un pedido.";
}

/**
 * Una fila por proveedor: quién es, cómo contactarlo, cuánto le debes y «Ficha».
 * Evaluación, historial, compras de 6 meses, WhatsApp y eliminar van en el «⋯»
 * de la fila; lo que abre se muestra debajo. A 400 px la tabla pasa a tarjetas
 * sola (`useMobileTableCards`).
 */
export default function TablaProveedores({ proveedores, cuentas, compras, hoy, ahora, onFicha, onEliminar }: Props) {
  const [abierto, setAbierto] = useState<{ id: string; que: Que } | null>(null);
  const alternar = (id: string, que: Que) => setAbierto((a) => (a?.id === id && a.que === que ? null : { id, que }));

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)] text-left text-sm font-semibold text-[var(--text-secondary)]">
          <tr>
            <th className="px-4 py-2.5">Proveedor</th>
            <th className="px-4 py-2.5">Contacto</th>
            <th className="px-4 py-2.5 text-right">Le debes</th>
            <th className="px-4 py-2.5 text-right" data-label="Acciones"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-soft)]">
          {proveedores.map((s) => {
            const deuda = deudaDe(cuentas, s.id, hoy);
            const sinComprar = diasSinComprar(compras, s.id, ahora);
            const sinContacto = !s.phone && !s.email && !s.address;
            const acciones: MenuAccion[] = [
              ...(s.phone ? [{ id: "wa", label: "WhatsApp", hint: deuda.total > 0 ? "Coordinar el pago" : "Hacerle un pedido", icon: MessageCircle, onSelect: () => window.open(urlWhatsApp(s.phone as string, mensajeWhatsApp(deuda.total)), "_blank", "noopener,noreferrer") }] : []),
              { id: "evaluacion", label: "Cómo te entrega", hint: "Entregas a tiempo, órdenes completas y precio", icon: Award, activo: abierto?.id === s.id && abierto.que === "evaluacion", onSelect: () => alternar(s.id, "evaluacion") },
              { id: "historial", label: "Historial", hint: "Órdenes y devoluciones", icon: History, activo: abierto?.id === s.id && abierto.que === "historial", onSelect: () => alternar(s.id, "historial") },
              { id: "compras", label: "Compras de 6 meses", icon: BarChart3, activo: abierto?.id === s.id && abierto.que === "compras", onSelect: () => alternar(s.id, "compras") },
              { id: "eliminar", label: "Eliminar proveedor", icon: Trash2, tone: "danger", onSelect: () => onEliminar(s) },
            ];
            return (
              <Fragment key={s.id}>
                <tr>
                  <td className="px-4 py-3 align-top">
                    <div className="min-w-0">
                      <p className="font-bold text-[var(--text-primary)]">{s.name}</p>
                      {s.ruc && <p className="font-mono text-sm text-[var(--text-secondary)]">RUC {s.ruc}</p>}
                      <div className="mt-1 flex flex-wrap gap-1.5 empty:hidden">
                        {deuda.vencida && <span className={cn(CHIP, CHIP_ROJO)}>Deuda vencida</span>}
                        {deuda.proxima && <span className={cn(CHIP, CHIP_AMBAR)}>Próximo a vencer</span>}
                        {sinComprar != null && sinComprar > 30 && <span className={cn(CHIP, sinComprar > 60 ? CHIP_ROJO : CHIP_AMBAR)}>Sin compra hace {sinComprar} días</span>}
                        {sinContacto && <span className={cn(CHIP, CHIP_AMBAR)}>Falta contacto</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="min-w-0 space-y-0.5 text-[var(--text-secondary)]">
                      {s.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />{s.phone}</p>}
                      {s.email && <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{s.email}</span></p>}
                      {s.address && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="line-clamp-2">{s.address}</span></p>}
                      {sinContacto && <p>—</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    <div className="min-w-0">
                      {deuda.n > 0 ? (
                        <>
                          <p className="font-bold text-[var(--text-primary)]">{formatCurrency(deuda.total)}</p>
                          <p className="text-sm text-[var(--text-secondary)]">{deuda.n} cuenta{deuda.n === 1 ? "" : "s"}</p>
                        </>
                      ) : (
                        <p className="text-[var(--text-secondary)]">Al día</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => onFicha(s)} aria-haspopup="dialog" className={button({ variant: "secondary", className: "rounded-xl px-4" })}>Ficha</button>
                      <ActionMenu label={`Más de ${s.name}`} soloIcono icon={MoreHorizontal} size="md" actions={acciones} className="w-12 shrink-0" />
                    </div>
                  </td>
                </tr>
                {abierto?.id === s.id && (
                  <tr>
                    <td colSpan={4} className="p-0" data-label="">
                      <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3 sm:p-4">
                        {abierto.que === "evaluacion" && <SupplierScorecard supplierId={s.id} />}
                        {abierto.que === "historial" && <SupplierTimeline supplierId={s.id} supplierName={s.name} />}
                        {abierto.que === "compras" && <ComprasDeSeisMeses compras={comprasPorMes(compras, s.id, ahora)} />}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ComprasDeSeisMeses({ compras }: { compras: { fecha: Date; total: number }[] }) {
  const maximo = Math.max(...compras.map((h) => h.total), 1);
  if (!compras.some((h) => h.total > 0)) return <p className="text-sm text-[var(--text-secondary)]">Sin compras en los últimos 6 meses.</p>;
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">Compras de los últimos 6 meses</p>
      <div className="flex h-24 items-end gap-2">
        {compras.map((h) => (
          <div key={h.fecha.toISOString()} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-sm tabular-nums text-[var(--text-secondary)]">{h.total > 0 ? formatCurrency(h.total) : ""}</span>
            <div className="w-full rounded-sm bg-primary/60" style={{ height: `${h.total > 0 ? Math.max((h.total / maximo) * 48, 4) : 3}px`, opacity: h.total > 0 ? 1 : 0.25 }} />
            <span className="text-sm text-[var(--text-secondary)]">{formatMonth(h.fecha)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
