"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { Plus, X, FileText, Check, Truck, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { useOrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";
import OcBuscador from "@/components/admin/ordenes-compra/OcBuscador";
import OcBarra from "@/components/admin/ordenes-compra/OcBarra";
import OcIndicadores, { OcChipsEstado } from "@/components/admin/ordenes-compra/OcIndicadores";
import OcRecurrentes from "@/components/admin/ordenes-compra/OcRecurrentes";
import OcModalRecurrente from "@/components/admin/ordenes-compra/OcModalRecurrente";
import OcHistorialProveedores from "@/components/admin/ordenes-compra/OcHistorialProveedores";
import OcModalNuevaOrden from "@/components/admin/ordenes-compra/OcModalNuevaOrden";
import OcLista from "@/components/admin/ordenes-compra/OcLista";
import OcModalAgregarProducto from "@/components/admin/ordenes-compra/OcModalAgregarProducto";
import dynamic from "next/dynamic";

const BarcodeScanner = dynamic(() => import("@/components/admin/BarcodeScanner"), { ssr: false });
const OCRecepcionModal = dynamic(() => import("@/components/admin/compras/OCRecepcionModal"), { ssr: false });

export default function PurchaseOrdersTab() {
  // El estado y las acciones viven en `useOrdenesCompra` (ordenes-compra/hooks/); cada bloque de la
  // vista, en su pieza de `ordenes-compra/`. Partido el 09-10 sin cambiar el DOM.
  const oc = useOrdenesCompra();
  const {
    orders, setShowCreate, showScanner, setShowScanner, recepcionOC, setRecepcionOC, toast,
    scannerModalRef, ventanaScanner, load, handleScan, kpis,
  } = oc;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ─── Hero header ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-base)] bg-linear-to-br from-white to-[var(--accent-soft)]/40 dark:from-[var(--color-card)] dark:to-[var(--accent-muted)]/20 px-5 py-4 flex items-center gap-4 flex-wrap">
        <span className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/10 border border-primary/30 shrink-0">
          <FileText className="h-6 w-6 text-primary" strokeWidth={2.2} />
        </span>
        <div className="flex-1 min-w-0">
          <SectionTitle>Órdenes de Compra</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            {orders.length === 0
              ? "Crea la primera orden a un proveedor. Después puedes duplicarla o hacerla recurrente."
              : `${orders.length} ${orders.length === 1 ? "orden registrada" : "órdenes registradas"} · Total acumulado S/${formatNumber(kpis.totalAcumulado, { max: 0 })}${
                  // Decir qué quedó afuera: un total que baja sin explicación
                  // se lee como un error del sistema.
                  kpis.canceladas > 0
                    ? ` (sin ${kpis.canceladas} cancelada${kpis.canceladas === 1 ? "" : "s"} por S/${formatNumber(kpis.montoCancelado, { max: 0 })})`
                    : ""
                }`}
          </p>
        </div>
        {/* Cabecera en una fila (ley de la vista): las acciones de la lista viven al lado de «Nueva orden». */}
        <OcBarra oc={oc} />
        <button
          type="button"
          onClick={() => setShowCreate(v => !v)}
          className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors shadow-sm hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
          Nueva orden
        </button>
      </section>

      {/* Orden por pregunta: el estado y lo que falta arriba; buscador y chips pegados a la lista. */}
      <OcIndicadores oc={oc} />

      {/* ─── Órdenes recibidas sin flete: su costo es optimista ──────── */}
      {(() => {
        const sinFlete = orders.filter(
          (o) => o.status === "recibido" && (o.flete ?? 0) + (o.otrosCostos ?? 0) === 0,
        );
        if (sinFlete.length === 0) return null;
        return (
          <section className="rounded-2xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10 px-4 py-3 flex items-start gap-3">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-[var(--data-warning-500)]/15 shrink-0">
              <Truck className="h-4 w-4 text-[var(--data-warning-500)]" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-[var(--text-primary)]">
                {sinFlete.length} {sinFlete.length === 1 ? "compra recibida no tiene" : "compras recibidas no tienen"} cargado lo que costó traerla
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                El costo de esos productos —y el margen que ves— está por debajo del real.
                Abre el detalle de cada una y carga el flete: se reparte entre lo que quede en stock.
              </p>
            </div>
          </section>
        );
      })()}

      <OcRecurrentes oc={oc} />

      <OcModalRecurrente oc={oc} />

      <OcHistorialProveedores oc={oc} />

      <OcModalNuevaOrden oc={oc} />

      <OcBuscador oc={oc} />

      <OcChipsEstado oc={oc} />

      <OcLista oc={oc} />

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
