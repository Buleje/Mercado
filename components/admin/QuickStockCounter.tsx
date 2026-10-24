"use client";

/**
 * Conteo físico › Escáner: pasas el código de barras (o lo escribes, o abres la
 * cámara), pones lo que contaste y al final guardas todo junto. Números grandes:
 * se usa de pie frente al anaquel, con el celular.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Barcode, Camera, Loader2, MinusCircle, PlusCircle, Search } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { button } from "@/components/ui-system/button-variants";
import { ListaContados } from "@/components/admin/inventario/conteo/ListaContados";
import { useEscanerConteo } from "@/components/admin/inventario/conteo/use-escaner-conteo";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

const BarcodeScannerDynamic = dynamic(() => import("@/components/admin/inventario/BarcodeScanner"), { ssr: false });

export default function QuickStockCounter() {
  const e = useEscanerConteo();
  const [camara, setCamara] = useState(false);
  const { producto, fisico, busqueda } = e;
  const dif = producto && fisico !== "" ? Number(fisico) - producto.stock : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Barcode className="h-5 w-5 text-primary" aria-hidden />
          <CardTitle>Escanea o escribe el código</CardTitle>
        </div>

        <div className="flex gap-2">
          <input
            ref={e.codigoRef}
            value={e.code}
            onChange={(ev) => e.setCode(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === "Enter") e.buscar(e.code); }}
            placeholder="Código de barras o SKU…"
            aria-label="Código de barras o SKU"
            autoFocus
            className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 text-base text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-tertiary)] focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button type="button" onClick={() => setCamara(true)} className={button({ variant: "secondary", className: "w-12 shrink-0 rounded-xl px-0" })} title="Escanear con la cámara" aria-label="Escanear con la cámara">
            <Camera className="h-5 w-5" aria-hidden />
          </button>
          <button type="button" onClick={() => e.buscar(e.code)} disabled={busqueda === "loading" || !e.code.trim()} className={button({ variant: "primary", className: "shrink-0 rounded-xl max-sm:w-12 max-sm:px-0" })} aria-label="Buscar">
            {busqueda === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
            <span className="max-sm:sr-only">Buscar</span>
          </button>
        </div>

        {busqueda === "notfound" && <p role="alert" className="mt-2 text-sm text-[var(--data-error-ink)]">No hay un producto con ese código.</p>}
        {busqueda === "error" && <p role="alert" className="mt-2 text-sm text-[var(--data-error-ink)]">{e.errorBusqueda}</p>}

        {busqueda === "found" && producto && (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4 dark:bg-primary/10">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-semibold text-[var(--text-primary)]">{producto.name}</p>
                <p className="text-sm text-[var(--text-secondary)]">SKU: {producto.sku} · En el sistema: {producto.stock} {producto.unit}</p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-sm font-medium text-[var(--accent-ink)] dark:text-[var(--accent)]">{formatCurrency(producto.price)}</span>
            </div>

            <Field label="Lo que contaste" labelClassName="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
              {(id) => (
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Disminuir cantidad" onClick={() => e.setFisico((v) => Math.max(0, (Number(v) || 0) - 1))} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-primary">
                    <MinusCircle className="h-7 w-7" aria-hidden />
                  </button>
                  <input
                    id={id}
                    ref={e.cantidadRef}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={fisico}
                    onChange={(ev) => e.setFisico(ev.target.value === "" ? "" : Number(ev.target.value))}
                    onKeyDown={(ev) => { if (ev.key === "Enter") e.agregar(); }}
                    className="h-14 w-full min-w-0 max-w-[10rem] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-center text-3xl font-bold tabular-nums text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <button type="button" aria-label="Aumentar cantidad" onClick={() => e.setFisico((v) => (Number(v) || 0) + 1)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-primary">
                    <PlusCircle className="h-7 w-7" aria-hidden />
                  </button>
                </div>
              )}
            </Field>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {dif !== null && (
                <span className={cn("text-base font-semibold", dif === 0 ? "text-[var(--text-secondary)]" : dif > 0 ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]")} aria-live="polite">
                  {dif === 0 ? "Sin diferencia" : dif > 0 ? `+${dif} sobrante` : `${dif} faltante`}
                </span>
              )}
              <button type="button" onClick={e.agregar} disabled={fisico === ""} className={button({ variant: "primary", className: "ml-auto rounded-xl px-6" })}>
                Agregar
              </button>
            </div>
          </div>
        )}
      </div>

      {e.contados.length > 0 && (
        <>
          <CardTitle>Productos contados ({e.contados.length})</CardTitle>
          <ListaContados e={e} />
        </>
      )}

      {camara && (
        <BarcodeScannerDynamic
          onScan={(codigo: string) => { setCamara(false); e.setCode(codigo); e.buscar(codigo); }}
          onClose={() => setCamara(false)}
        />
      )}
    </div>
  );
}
