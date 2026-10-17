"use client";

/**
 * Declaración de inventario: la foto oficial del almacén en una fecha.
 * Vive dentro de una ventana (AdminModal «Declaración de inventario»), que ya
 * pone el título: acá solo el ⓘ, la fecha, las cifras y el detalle.
 */
import { LoadingState } from "@buleje/design-system";
import { AlertTriangle, BarChart3, Download, Loader2, Printer } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { DeclaracionCategorias } from "@/components/admin/inventario/conteo/DeclaracionCategorias";
import { DeclaracionComparativa } from "@/components/admin/inventario/conteo/DeclaracionComparativa";
import { DeclaracionHistorial } from "@/components/admin/inventario/conteo/DeclaracionHistorial";
import { DeclaracionCifras, DeclaracionTuInventario } from "@/components/admin/inventario/conteo/DeclaracionResumen";
import { useDeclaracion } from "@/components/admin/inventario/conteo/use-declaracion";

export default function DeclaracionInventarioModule() {
  const d = useDeclaracion();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2">
        <p className="text-sm text-[var(--text-secondary)]">La foto oficial de tu almacén en un día.</p>
        <InfoTip
          title="Declaración de inventario"
          what="Un documento con todos tus productos, cuántos tienes y cuánto valen, agrupados por categoría. Es la foto de tu almacén en la fecha que eliges."
          affects="No cambia tu stock: solo lo lee. Se guarda en este navegador para compararla con la siguiente."
          example="Eliges 30/09, generas, descargas el Excel y se lo mandas a tu contador. Úsala cuando SUNAT la pida, al abrir o cerrar el año fiscal, o cada mes para tu control."
        />
      </div>

      {d.resumenCargando ? (
        <div className="animate-pulse rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6" aria-hidden>
          <div className="mb-3 h-4 w-1/3 rounded bg-[var(--rule-soft)]" />
          <div className="mb-2 h-8 w-1/2 rounded bg-[var(--rule-soft)]" />
          <div className="h-3 w-2/3 rounded bg-[var(--rule-soft)]" />
        </div>
      ) : d.resumen ? (
        <DeclaracionTuInventario resumen={d.resumen} historial={d.historial} />
      ) : null}

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
        <Field label="Fecha de la declaración" labelClassName="mb-1 block text-sm font-bold text-[var(--text-secondary)]">
          {(id) => (
            <input
              id={id}
              type="date"
              value={d.fecha}
              onChange={(e) => d.setFecha(e.target.value)}
              className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          )}
        </Field>
        <button type="button" onClick={d.generar} disabled={d.cargando} className={button({ variant: "primary", className: "rounded-xl" })}>
          {d.cargando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BarChart3 className="h-4 w-4" aria-hidden />}
          Generar declaración
        </button>
      </div>

      {d.error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-ink)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {d.error}
          <button type="button" onClick={d.generar} className="ml-auto min-h-12 px-3 text-sm font-bold hover:underline">Reintentar</button>
        </div>
      )}

      {d.cargando && <LoadingState />}

      {d.data && !d.cargando && (
        <>
          <DeclaracionCifras data={d.data} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={d.exportar} className={button({ variant: "secondary", className: "rounded-xl" })} title="Tu contador puede usar este archivo para la declaración ante SUNAT">
              <Download className="h-4 w-4" aria-hidden /> Descargar para mi contador
            </button>
            <button type="button" onClick={() => window.print()} className={button({ variant: "secondary", className: "rounded-xl" })}>
              <Printer className="h-4 w-4" aria-hidden /> Imprimir
            </button>
          </div>
          <DeclaracionComparativa data={d.data} prev={d.anterior} />
          <DeclaracionCategorias data={d.data} />
        </>
      )}

      <DeclaracionHistorial historial={d.historial} />

      {!d.data && !d.cargando && !d.error && (
        <p className="py-6 text-center text-sm text-[var(--text-secondary)]">Aún no generaste ninguna. Elige la fecha y pulsa «Generar declaración».</p>
      )}
    </div>
  );
}
