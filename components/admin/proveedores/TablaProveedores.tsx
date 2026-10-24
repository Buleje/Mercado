"use client";

import { Fragment, useState } from "react";
import { Award, BarChart3, History, Mail, MapPin, MessageCircle, MoreHorizontal, Pencil, Phone, Trash2 } from "@buleje/design-system/icons";
import type { DbSupplier } from "@/lib/jsondb";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { describirCoincidencia, tipoDeDocumento, type Coincidencia } from "@/lib/compras/proveedor-identidad";
import type { SeccionFicha } from "./FichaProveedorModal";
import {
  comprasPorMes, deudaDe, diasSinComprar, urlWhatsApp,
  type CompraDeProveedor, type CuentaDeProveedor,
} from "./datos-proveedores";
import { DataTable } from "@buleje/design-system";

interface Props {
  proveedores: readonly DbSupplier[];
  cuentas: readonly CuentaDeProveedor[];
  compras: readonly CompraDeProveedor[];
  hoy: string;
  ahora: Date;
  /** Posibles duplicados de TODA la lista (no sólo de lo filtrado): id → con quién se parece. */
  duplicados: ReadonlyMap<string, Coincidencia[]>;
  /** El último proveedor consultado: al volver a la lista se ve dónde estabas. */
  resaltado?: string | null;
  /** Abre la ficha de consulta, en la sección pedida. */
  onFicha: (s: DbSupplier, seccion?: SeccionFicha) => void;
  onEditar: (s: DbSupplier) => void;
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
 * Una fila por proveedor: quién es, cómo contactarlo, cuánto le debes y «Ficha»
 * (consulta, C33). Editar, cómo te entrega, historial, compras de 6 meses,
 * WhatsApp y eliminar van en el «⋯» de la fila: «Cómo te entrega» e
 * «Historial» abren la ficha en esa sección; «Compras de 6 meses» se muestra
 * debajo de la fila. A 400 px la tabla pasa a tarjetas sola (`useMobileTableCards`).
 */
export default function TablaProveedores({ proveedores, cuentas, compras, hoy, ahora, duplicados, resaltado, onFicha, onEditar, onEliminar }: Props) {
  const [comprasDe, setComprasDe] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <DataTable wrapperClassName="overflow-visible rounded-none border-0" className="w-full">
        <thead>
          <tr>
            <th>Proveedor</th>
            <th>Contacto</th>
            <th className="text-right">Le debes</th>
            <th className="text-right" data-label="Acciones"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-soft)]">
          {proveedores.map((s) => {
            const deuda = deudaDe(cuentas, s.id, hoy);
            const sinComprar = diasSinComprar(compras, s.id, ahora);
            const sinContacto = !s.phone && !s.email && !s.address;
            const acciones: MenuAccion[] = [
              ...(s.phone ? [{ id: "wa", label: "WhatsApp", hint: deuda.total > 0 ? "Coordinar el pago" : "Hacerle un pedido", icon: MessageCircle, onSelect: () => window.open(urlWhatsApp(s.phone as string, mensajeWhatsApp(deuda.total)), "_blank", "noopener,noreferrer") }] : []),
              { id: "editar", label: "Editar datos", icon: Pencil, onSelect: () => onEditar(s) },
              { id: "evaluacion", label: "Cómo te entrega", hint: "A tiempo, completas y precio, por período", icon: Award, onSelect: () => onFicha(s, "entrega") },
              { id: "historial", label: "Historial", hint: "Órdenes, recepciones y devoluciones", icon: History, onSelect: () => onFicha(s, "ordenes") },
              { id: "compras", label: "Compras de 6 meses", icon: BarChart3, activo: comprasDe === s.id, onSelect: () => setComprasDe((a) => (a === s.id ? null : s.id)) },
              { id: "eliminar", label: "Eliminar proveedor", icon: Trash2, tone: "danger", onSelect: () => onEliminar(s) },
            ];
            const documento = (s.documento || s.ruc || "").trim();
            const parecidos = duplicados.get(s.id);
            return (
              <Fragment key={s.id}>
                <tr className={cn(resaltado === s.id && "bg-[var(--accent-soft)]!")} aria-current={resaltado === s.id ? "true" : undefined}>
                  <td className="align-top">
                    <div className="min-w-0">
                      <p className="font-bold text-[var(--text-primary)]">{s.name}</p>
                      {documento && <p className="font-mono text-sm text-[var(--text-secondary)]">{tipoDeDocumento(s.tipoDocumento)} {documento}</p>}
                      <div className="mt-1 flex flex-wrap gap-1.5 empty:hidden">
                        {parecidos && (
                          <span className={cn(CHIP, CHIP_AMBAR)} title={`Se parece a ${parecidos.map(describirCoincidencia).join("; ")}. Revísalos: no se unen solos.`}>
                            Posible duplicado
                          </span>
                        )}
                        {deuda.vencida && <span className={cn(CHIP, CHIP_ROJO)}>Deuda vencida</span>}
                        {deuda.proxima && <span className={cn(CHIP, CHIP_AMBAR)}>Próximo a vencer</span>}
                        {sinComprar != null && sinComprar > 30 && <span className={cn(CHIP, sinComprar > 60 ? CHIP_ROJO : CHIP_AMBAR)}>Sin compra hace {sinComprar} días</span>}
                        {sinContacto && <span className={cn(CHIP, CHIP_AMBAR)}>Falta contacto</span>}
                      </div>
                    </div>
                  </td>
                  <td className="align-top">
                    <div className="min-w-0 space-y-0.5 text-[var(--text-secondary)]">
                      {s.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />{s.phone}</p>}
                      {s.email && <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{s.email}</span></p>}
                      {s.address && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="line-clamp-2">{s.address}</span></p>}
                      {sinContacto && <p>—</p>}
                    </div>
                  </td>
                  <td className="text-right align-top tabular-nums">
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
                  <td className="align-top">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => onFicha(s)} aria-haspopup="dialog" title={`Ver la ficha de ${s.name}`} className={button({ variant: "secondary", className: "rounded-xl px-4" })}>Ficha</button>
                      <ActionMenu label={`Más de ${s.name}`} soloIcono icon={MoreHorizontal} size="md" actions={acciones} className="w-12 shrink-0" />
                    </div>
                  </td>
                </tr>
                {comprasDe === s.id && (
                  <tr>
                    <td colSpan={4} data-label="">
                      <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3 sm:p-4">
                        <ComprasDeSeisMeses compras={comprasPorMes(compras, s.id, ahora)} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </DataTable>
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
