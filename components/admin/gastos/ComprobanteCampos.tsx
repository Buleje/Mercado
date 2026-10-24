"use client";

import { Kicker } from "@buleje/design-system";
import { Camera, Check, Loader2, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { TIPOS_COMPROBANTE } from "@/lib/gastos/comprobante-del-gasto";
import { campo, chip } from "./estilos";
import type { FormGasto, GastoNuevo } from "./use-gasto-nuevo";

/** Los campos del papel que pinta este bloque. */
export type CamposPapel = Pick<FormGasto, "documentType" | "documentNumber" | "supplierRuc" | "supplierName" | "afectoIgv" | "attachmentUrl">;

/**
 * Lo que necesita el bloque: el alta (`useGastoNuevo`) lo cumple entero, y
 * «Corregir gasto» (`use-gasto-editar`) arma lo suyo con la misma forma.
 */
export type ComprobanteEditable = Pick<GastoNuevo, "error" | "errorRuc" | "padron" | "buscandoRuc" | "igvVistaPrevia" | "subiendo" | "buscarRuc" | "subirFoto"> & {
  form: CamposPapel;
  // `FormGasto[K]` y no `CamposPapel[K]`: tsc 7 no ve que el Pick da el mismo tipo.
  set: <K extends keyof CamposPapel>(campo: K, valor: FormGasto[K]) => void;
};

/**
 * El papel que respalda el gasto: tipo, número, RUC (con el padrón de SUNAT),
 * IGV y foto. Sin esto «IGV del mes › compras» siempre daba S/ 0: medido el
 * 2026-10-09, 0 de 24 gastos de toda la base tenían comprobante.
 */
export default function ComprobanteCampos({ g }: { g: ComprobanteEditable }) {
  const { form, set, error, errorRuc, padron, buscandoRuc, igvVistaPrevia, subiendo } = g;
  const conPapel = form.documentType !== "sin_comprobante";
  const esFactura = form.documentType === "factura";
  const conError = (nombre: string) => error?.campo === nombre;

  return (
    <div role="group" aria-label="Comprobante" className="space-y-3 rounded-xl border border-[var(--rule-base)] p-3">
      <div className="flex items-center gap-1">
        <Kicker>Comprobante</Kicker>
        <InfoTip
          title="Comprobante del gasto"
          what="El papel que te dieron al pagar. Con factura, su IGV se descuenta del que cobras en tus ventas."
          affects="«IGV del mes › compras» en Mi Plata suma sólo el IGV de las facturas."
          example="Factura F001-123 de S/ 118.00 con IGV: S/ 18.00 que SUNAT te descuenta."
        />
      </div>
      <div role="radiogroup" aria-label="Tipo de comprobante" className="flex flex-wrap gap-2">
        {TIPOS_COMPROBANTE.map((t) => (
          <button
            key={t.valor}
            type="button"
            role="radio"
            aria-checked={form.documentType === t.valor}
            onClick={() => set("documentType", t.valor)}
            className={chip(form.documentType === t.valor)}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      {conPapel && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">Número{esFactura ? "" : " (opcional)"}</span>
            <input
              value={form.documentNumber}
              onChange={(e) => set("documentNumber", e.target.value)}
              placeholder={esFactura ? "F001-123" : "B001-45"}
              className={cn(campo(conError("documentNumber")), "uppercase")}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--text-secondary)]">RUC de quien te vendió{esFactura ? "" : " (opcional)"}</span>
            <input
              value={form.supplierRuc}
              inputMode="numeric"
              maxLength={11}
              onChange={(e) => {
                const ruc = e.target.value.replace(/\D/g, "").slice(0, 11);
                set("supplierRuc", ruc);
                if (ruc.length === 11) void g.buscarRuc(ruc);
              }}
              placeholder="20123456789"
              aria-invalid={Boolean(errorRuc)}
              className={cn(campo(Boolean(errorRuc && form.supplierRuc.length === 11) || conError("supplierRuc")), "tabular-nums")}
            />
            {errorRuc && form.supplierRuc.length === 11 && <span className="block text-xs text-[var(--data-error-500)]">{errorRuc}</span>}
            {buscandoRuc && <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]"><Loader2 className="h-3 w-3 animate-spin" />Buscando en SUNAT…</span>}
            {padron && (
              <span className="block text-xs text-[var(--text-secondary)]">
                {padron.nombre}
                {padron.condicion && <> · <span className={padron.condicion === "HABIDO" ? "text-[var(--data-success-500)]" : "font-bold text-[var(--data-error-500)]"}>{padron.condicion}</span></>}
              </span>
            )}
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-[var(--text-secondary)]">A quién le pagaste (opcional)</span>
            <input value={form.supplierName} onChange={(e) => set("supplierName", e.target.value)} placeholder="Grifo San Martín" className={campo()} />
          </label>
        </div>
      )}

      {esFactura && (
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-sm text-[var(--text-secondary)]">
            <span>¿La factura cobra IGV?</span>
            <InfoTip
              title="IGV de la factura"
              what="En la Amazonía (Ley 27037) muchas ventas están exoneradas: la factura dice «Op. exonerada» y no trae IGV."
              affects="Exonerada se guarda con IGV S/ 0; con IGV se calcula del total (18/118)."
              example="Total S/ 118.00 con IGV → IGV S/ 18.00. Exonerada → S/ 0.00."
            />
          </div>
          <div role="radiogroup" aria-label="IGV de la factura" className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", conError("afectoIgv") && "rounded-xl ring-2 ring-[var(--data-error-500)]")}>
            <button type="button" role="radio" aria-checked={form.afectoIgv === true} onClick={() => set("afectoIgv", true)} className={cn(chip(form.afectoIgv === true), "justify-between")}>
              <span>Cobra IGV 18 %</span>
              {form.afectoIgv === true && igvVistaPrevia != null && <span className="tabular-nums">{formatCurrency(igvVistaPrevia)}</span>}
            </button>
            <button type="button" role="radio" aria-checked={form.afectoIgv === false} onClick={() => set("afectoIgv", false)} className={chip(form.afectoIgv === false)}>
              Exonerada (Amazonía)
            </button>
          </div>
        </div>
      )}

      {conPapel && (
        <div className="flex flex-wrap items-center gap-2">
          {form.attachmentUrl ? (
            <>
              <a href={form.attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">
                <Check className="h-4 w-4 text-[var(--data-success-500)]" />Foto guardada
              </a>
              <button type="button" onClick={() => set("attachmentUrl", "")} aria-label="Quitar la foto" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]">
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <label className={cn(chip(false), "cursor-pointer gap-1.5", subiendo && "opacity-60")}>
              {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {subiendo ? "Subiendo…" : "Foto del comprobante"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="sr-only"
                disabled={subiendo}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void g.subirFoto(f); e.target.value = ""; }}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
