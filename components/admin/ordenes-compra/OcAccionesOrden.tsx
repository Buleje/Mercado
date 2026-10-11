"use client";

import { useRef } from "react";
import {
  MoreHorizontal, PackageCheck, ChevronDown, FileText, MessageCircle, Copy, Repeat, Trash2,
  CheckCircle2, PackageOpen, XCircle, ClipboardList,
} from "@buleje/design-system/icons";
import type { DbPurchaseOrder, DbSupplier, PurchaseStatus } from "@/lib/jsondb";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { opcionesDeEstado } from "@/lib/compras/estados-oc";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { enviarOCPorWhatsApp, imprimirOC } from "@/components/admin/compras/OCPDFExport";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

/** Cómo se lee cada cambio de estado en el menú: el destino dice qué pasa, no sólo su nombre. */
const CAMBIO: Partial<Record<PurchaseStatus, { label: string; hint: string; icon: typeof PackageCheck; tone?: "danger" }>> = {
  pendiente: { label: "Aprobar la orden", hint: "La propuesta automática pasa a pendiente", icon: ClipboardList },
  parcial: { label: "Pasar a parcial", hint: "Llegó una parte; el resto se recibe después", icon: PackageOpen },
  recibido: { label: "Marcar recibida entera", hint: "Suma al stock todo lo pedido, sin contar", icon: CheckCircle2 },
  cancelado: { label: "Cancelar la orden", hint: "No vuelve atrás", icon: XCircle, tone: "danger" },
};

/**
 * «Recibir» a la vista (48 px) si la orden espera mercadería y el resto en «⋯»:
 * detalle, PDF, WhatsApp, duplicar, recurrente, cambios de estado y eliminar.
 * Antes la tarjeta tenía un select de estado y siete botones sueltos de 28-40 px.
 */
export default function OcAccionesOrden({
  oc, o, supplier, abierta,
}: { oc: OrdenesCompra; o: DbPurchaseOrder; supplier: DbSupplier | undefined; abierta: boolean }) {
  const {
    setExpanded, setRecepcionOC, setShowRecurringModal, setRecurringInterval, setRecurringNotifyDays,
    updateStatus, deleteOrder, duplicateOrder, confirm,
  } = oc;
  /* El menú cierra sin devolver el foco a su botón: la ventana que se abre
     guardaba «body» y, al cerrarla, el teclado volvía al inicio de la página. */
  const ref = useRef<HTMLDivElement>(null);
  const enfocarMenu = () => ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus({ preventScroll: true });
  const espera = o.status === "pendiente" || o.status === "parcial";

  const cambiar = async (destino: PurchaseStatus) => {
    // Cerrar por el estado suma TODO lo pedido al stock: se pregunta antes (el
    // select de antes lo hacía sin decir nada).
    if (destino === "recibido") {
      const ok = await confirm({
        title: `¿Marcar recibida entera la orden de ${o.supplierName}?`,
        description: `Suma al stock todo lo pedido (${o.items.length} producto${o.items.length === 1 ? "" : "s"}, ${formatCurrency(Number(o.total))}) sin contar lo que llegó. Para contar, usa «Recibir».`,
        confirmLabel: "Sí, recibida entera",
      });
      if (!ok) return;
    }
    await updateStatus(o.id, destino);
  };

  const estados: MenuAccion[] = opcionesDeEstado(o.status)
    .filter((d) => d !== o.status && CAMBIO[d as PurchaseStatus])
    .map((d) => {
      const c = CAMBIO[d as PurchaseStatus]!;
      return { id: `estado-${d}`, label: c.label, hint: c.hint, icon: c.icon, tone: c.tone, seccion: "Estado", onSelect: () => void cambiar(d as PurchaseStatus) };
    });

  const base: MenuAccion[] = [
    { id: "detalle", label: abierta ? "Ocultar detalle" : "Ver detalle", hint: "Productos, precios contra la compra anterior y flete", icon: ChevronDown, onSelect: () => setExpanded(abierta ? null : o.id) },
    { id: "pdf", label: "Descargar PDF", icon: FileText, onSelect: () => imprimirOC(o, supplier) },
    { id: "whatsapp", label: "Enviar por WhatsApp", hint: supplier?.phone ? `Al ${supplier.phone}` : "Eliges a quién en WhatsApp", icon: MessageCircle, onSelect: () => enviarOCPorWhatsApp(o, supplier) },
    { id: "duplicar", label: "Duplicar", hint: "Una orden nueva con los mismos productos", icon: Copy, onSelect: () => void duplicateOrder(o) },
    ...(o.status === "recibido" || o.status === "parcial"
      ? [{ id: "recurrente", label: "Hacer recurrente", hint: "Repetir este pedido cada cierto tiempo", icon: Repeat, onSelect: () => { setShowRecurringModal(o); setRecurringInterval(15); setRecurringNotifyDays(2); } }]
      : []),
    ...estados,
    { id: "eliminar", label: "Eliminar", icon: Trash2, tone: "danger", onSelect: () => void deleteOrder(o.id) },
  ];
  const acciones = base.map((a) => ({ ...a, onSelect: () => { enfocarMenu(); a.onSelect(); } }));

  return (
    <div ref={ref} className="flex items-center justify-end gap-1">
      {espera && (
        <button
          type="button"
          onClick={() => setRecepcionOC(o)}
          className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--accent-dark)] bg-transparent px-3 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-dark)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 dark:border-[var(--accent)] dark:text-[var(--accent)] dark:hover:text-[var(--surface-canvas)] dark:hover:bg-[var(--accent)]"
          title="Contar lo que llegó y sumarlo al stock"
        >
          <PackageCheck className="h-4 w-4" aria-hidden /> Recibir
        </button>
      )}
      <ActionMenu
        label={`Más acciones de la orden de ${o.supplierName}`}
        title="Detalle, PDF, WhatsApp, duplicar, estado y eliminar"
        icon={MoreHorizontal}
        actions={acciones}
        soloIcono
        size="md"
        className={cn("w-12 shrink-0", "border-transparent! bg-transparent! hover:bg-[var(--surface-sunken)]!")}
      />
    </div>
  );
}
