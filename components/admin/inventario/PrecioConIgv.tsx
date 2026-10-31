"use client";

import { useId, useState } from "react";
import { FIELD_INPUT, FIELD_LABEL } from "@/components/admin/inventario/inventario-compartido";
import { useTasaIgv } from "@/components/admin/inventario/hooks/use-tasa-igv";
import { desdeBase, desdeTotal, etiquetaSinIgv, leerMonto, montoATexto, tasaDelProducto } from "@/lib/precio-igv";
import { formatCurrency } from "@/lib/format";

interface Props {
  /** El precio de venta guardado (con IGV), tal cual está en el formulario. */
  valor: string;
  onCambio: (texto: string) => void;
  /** gravado | exonerado | inafecto (el «Afecto a IGV» del mismo formulario). */
  taxType?: string | null;
  required?: boolean;
  className?: string;
}

/**
 * «Precio base + IGV = Precio de venta» (18-10, copiado de Alegra). Se escribe de cualquiera de los
 * dos lados: el de venta (con IGV) es lo que se guarda; la base es una vista previa que calcula lo mismo
 * que el servidor (`lib/tax.ts`). Si el producto está exonerado/inafecto, o la tienda no cobra IGV, no se
 * inventa un impuesto: queda sólo el precio y el aviso.
 */
export function PrecioConIgv({ valor, onCambio, taxType, required, className }: Props) {
  const tasaTienda = useTasaIgv();
  const tasa = tasaDelProducto(taxType, tasaTienda);
  const sinIgv = etiquetaSinIgv(taxType, tasaTienda);
  const idBase = useId();
  const idTotal = useId();
  // Mientras se teclea la base se muestra lo tecleado (no el recalculado: el cursor saltaría).
  const [baseTecleada, setBaseTecleada] = useState<string | null>(null);

  const total = leerMonto(valor);
  const d = desdeTotal(total, tasa);
  const pct = `${Math.round(tasa * 10000) / 100}`.replace(".", ",");

  return (
    <div className={className}>
      <div className={sinIgv ? "grid gap-3" : "grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end"}>
        {!sinIgv && (
          <>
            <div>
              <label htmlFor={idBase} className={FIELD_LABEL}>Precio base (S/) sin IGV</label>
              <input
                id={idBase}
                type="number" step="0.01" min="0" inputMode="decimal"
                value={baseTecleada ?? montoATexto(d.base)}
                onChange={(e) => { setBaseTecleada(e.target.value); onCambio(montoATexto(desdeBase(leerMonto(e.target.value), tasa).total)); }}
                onBlur={() => setBaseTecleada(null)}
                placeholder="4.66"
                className={FIELD_INPUT}
              />
            </div>
            <div className="sm:w-28" aria-live="polite">
              <span className={FIELD_LABEL}>IGV {pct}%</span>
              <p className="flex min-h-11 items-center rounded-lg bg-[var(--surface-sunken)] px-3.5 text-sm font-semibold tabular-nums text-[var(--text-secondary)]" data-qa="precio-igv-monto">
                {total > 0 ? `+ ${formatCurrency(d.igv)}` : "—"}
              </p>
            </div>
          </>
        )}
        <div>
          <label htmlFor={idTotal} className={FIELD_LABEL}>Precio de venta (S/){sinIgv ? "" : " con IGV"}{required ? " *" : ""}</label>
          <input
            id={idTotal}
            required={required}
            type="number" step="0.01" min="0" inputMode="decimal"
            value={valor}
            onChange={(e) => { setBaseTecleada(null); onCambio(e.target.value); }}
            placeholder="5.50"
            className={FIELD_INPUT}
          />
        </div>
      </div>
      {sinIgv ? (
        <p className="mt-1.5 text-xs font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" data-qa="precio-igv-aviso">
          {sinIgv}: el precio no lleva impuesto, es el mismo con o sin IGV.
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">El precio que se guarda y que paga el cliente es el de venta (con IGV).</p>
      )}
    </div>
  );
}
