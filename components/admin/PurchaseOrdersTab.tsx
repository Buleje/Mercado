"use client";

import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { Plus, X, Check, Truck, AlertTriangle, Copy } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useOrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";
import CabeceraOrdenes from "@/components/admin/ordenes-compra/CabeceraOrdenes";
import OcBuscador from "@/components/admin/ordenes-compra/OcBuscador";
import { useMenuOrdenes } from "@/components/admin/ordenes-compra/OcBarra";
import { useIndicadoresOc } from "@/components/admin/ordenes-compra/use-indicadores-oc";
import OcRecurrentes from "@/components/admin/ordenes-compra/OcRecurrentes";
import OcModalRecurrente from "@/components/admin/ordenes-compra/OcModalRecurrente";
import OcHistorialProveedores from "@/components/admin/ordenes-compra/OcHistorialProveedores";
import OcModalNuevaOrden from "@/components/admin/ordenes-compra/OcModalNuevaOrden";
import OcLista from "@/components/admin/ordenes-compra/OcLista";
import OcModalAgregarProducto from "@/components/admin/ordenes-compra/OcModalAgregarProducto";
import dynamic from "next/dynamic";

const BarcodeScanner = dynamic(() => import("@/components/admin/BarcodeScanner"), { ssr: false });
const OCRecepcionModal = dynamic(() => import("@/components/admin/compras/OCRecepcionModal"), { ssr: false });

/** La ayuda de la sección (ⓘ al lado del título). */
const AYUDA = {
  title: "Órdenes de compra",
  what: "Lo que le pides a cada proveedor: qué, cuánto, a qué precio y en qué estado está.",
  affects: "«Recibir» cuenta lo que llegó y lo suma al stock con su costo; la orden pasa sola a parcial o recibida. El ⋯ de cada fila trae el PDF, WhatsApp, duplicar y los cambios de estado.",
  example: "Pediste 40 atunes a Frigorífico Amazonia: cuando lleguen, toca «Recibir» en su fila y anota cuántos llegaron.",
};

export default function PurchaseOrdersTab({ barra }: { barra?: ReactNode }) {
  // El estado y las acciones viven en `useOrdenesCompra` (ordenes-compra/hooks/); cada bloque de la
  // vista, en su pieza de `ordenes-compra/`. Partido el 09-10 sin cambiar el DOM.
  const oc = useOrdenesCompra();
  const {
    orders, setShowCreate, showScanner, setShowScanner, recepcionOC, setRecepcionOC, toast,
    scannerModalRef, ventanaScanner, load, handleScan, repetidas, f,
  } = oc;
  const indicadores = useIndicadoresOc(oc);
  const menu = useMenuOrdenes(oc);
  const sinFlete = orders.filter((o) => o.status === "recibido" && (o.flete ?? 0) + (o.otrosCostos ?? 0) === 0).length;

  return (
    <div className="space-y-4">
      {/* Una fila: título · secciones · Indicadores · Nueva orden · Más (patrón del panel, 10-10). */}
      <CabeceraOrdenes
        barra={barra}
        ayuda={AYUDA}
        indicadores={indicadores.boton}
        principal={
          <button type="button" onClick={() => setShowCreate(v => !v)} className={button({ variant: "primary", className: "shrink-0 rounded-xl px-4" })}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> Nueva orden
          </button>
        }
        acciones={menu.acciones}
        tituloMenu="Historial por proveedor, comparar cotizaciones y Excel"
      />

      {indicadores.panel}

      {/* Avisos en una línea + ⓘ: lo que pide una acción, arriba de la tabla. */}
      {sinFlete > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] dark:bg-[var(--data-warning-500)]/10">
          <Truck className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
          {sinFlete} {sinFlete === 1 ? "compra recibida no tiene" : "compras recibidas no tienen"} cargado lo que costó traerla
          <InfoTip
            title="Flete sin cargar"
            what="El costo de esos productos —y el margen que ves— está por debajo del real."
            affects="Abre el detalle de cada una (clic en la fila) y carga el flete: se reparte entre lo que quede en stock."
            example="Flete S/ 30 en una compra de 40 atunes: cada atún cuesta S/ 0.75 más."
          />
        </p>
      )}
      {repetidas && (
        <div className="flex flex-wrap items-center gap-x-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-1 text-sm text-[var(--text-primary)]">
          <span className="flex min-w-0 flex-1 basis-[16rem] items-center gap-2 py-2">
            <Copy className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden />
            <span className="min-w-0">
              <strong className="font-semibold">{repetidas.n} órdenes automáticas iguales</strong> a {repetidas.proveedor}: {repetidas.detalle}{" "}
              <InfoTip
                title="Pedido automático repetido"
                what="El reabastecimiento automático arma una orden cada día que el producto sigue bajo su stock mínimo, aunque ya haya una abierta igual."
                affects="Se cuentan como pendientes y suman a «Abiertas». Recibe una y cancela las demás desde su ⋯."
                example="Atún Florida ×40 pedido el 05/10, 06/10 y 07/10: con recibir uno alcanza."
              />
            </span>
          </span>
          <button
            type="button"
            onClick={() => { f.limpiar(); f.setProveedorId(repetidas.supplierId); f.setEstado("pendiente"); f.setBusqueda(repetidas.detalle.split(" ×")[0]); }}
            className="ml-auto inline-flex h-12 items-center rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-raised)] dark:text-[var(--accent)]"
          >
            Ver solo esas
          </button>
        </div>
      )}

      <OcRecurrentes oc={oc} />

      <OcModalRecurrente oc={oc} />

      <OcHistorialProveedores oc={oc} />

      <OcModalNuevaOrden oc={oc} />

      <OcBuscador oc={oc} />

      <OcLista oc={oc} />

      {menu.comparador}

      <OcModalAgregarProducto oc={oc} />

      {/* Reception modal */}
      {recepcionOC && (
        <OCRecepcionModal
          ocId={recepcionOC.id}
          supplier={recepcionOC.supplierName}
          items={recepcionOC.items}
          onComplete={() => {
            setRecepcionOC(null);
            load();
          }}
          onClose={() => setRecepcionOC(null)}
        />
      )}

      {/* Aviso flotante: confirma lo que salió bien y, sobre todo, muestra lo
          que el servidor rechazó (antes fallaba en silencio). */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-4 right-4 z-50 bg-[var(--surface-raised)] border-2 rounded-2xl p-4 max-w-sm shadow-lg animate-in slide-in-from-bottom-5",
            toast.tone === "error"
              ? "border-[var(--data-error-500)]/40"
              : "border-[var(--data-success-500)]/40",
          )}
        >
          <div className="flex items-start gap-3">
            <div className={cn(
              "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
              toast.tone === "error"
                ? "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/15"
                : "bg-primary/10 dark:bg-[var(--data-success-500)]/15",
            )}>
              {toast.tone === "error"
                ? <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)]" />
                : <Check className="h-5 w-5 text-[var(--data-success-500)]" />}
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)] pt-1.5">{toast.msg}</p>
          </div>
        </div>
      )}

      {/* Barcode scanner modal */}
      {showScanner && (
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center bg-black/50" role="presentation" onClick={(e) => e.target === e.currentTarget && !ventanaScanner.fijado && setShowScanner(false)}>
          <div ref={scannerModalRef} role="dialog" aria-modal="true" aria-label="Escanear código de barras" tabIndex={-1} className="relative bg-[var(--surface-raised)] w-full sm:max-w-md sm:rounded-xl rounded-t-2xl overflow-hidden">
            <div {...ventanaScanner.asaProps} className="flex items-center justify-between px-5 py-4 border-b">
              <CardTitle className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Escanear código de barras</CardTitle>
              <span className="ml-auto flex items-center gap-1">
                <ControlesDeVentana ventana={ventanaScanner} />
                <button aria-label="Cerrar" onClick={() => setShowScanner(false)} className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors"><X className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" /></button>
              </span>
            </div>
            <div className="p-4">
              <BarcodeScanner onDetected={handleScan} onClose={() => setShowScanner(false)} />
            </div>
            <TiradorDeVentana ventana={ventanaScanner} />
          </div>
        </div>
      )}
    </div>
  );
}
