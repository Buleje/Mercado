"use client";

/**
 * Lo que costó la madera, cargado en el alta (Brandon 2026-09-25: «costo al
 * registrar»). Medido ese día en Blas: 24 de 24 ingresos sin precio, y la
 * plata del permiso decía S/ 0.
 *
 * Se pide el PRECIO, no el total: por m³ o por pie tablar (≈ aserrable, la
 * misma cuenta de la columna «Pies tablares»: m³ × 56 % × 424). El total lo
 * calcula y lo guarda el SERVIDOR con «Poner precio» —el mismo camino de la
 * tanda, con su detector de dedazos y su freno de costo congelado—; acá sólo
 * se muestra la vista previa con `costoDe`, la misma cuenta al céntimo.
 * Vacío = sin costo (`null`), nunca S/ 0.
 */

import { useId } from "react";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { formatCurrency } from "@/lib/format";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import { costoDe, precioAplicable } from "@/lib/forestal/precio-en-tanda";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { I } from "./ctp-shared";

export type UnidadDePrecio = "m3" | "pt";
export interface PrecioDeLaMadera {
  valor: string;
  unidad: UnidadDePrecio;
}
export const PRECIO_VACIO: PrecioDeLaMadera = { valor: "", unidad: "m3" };

/** Pies tablares aserrables que salen de 1 m³ de rolliza (≈ 237,44). */
const PT_POR_M3_ROLLIZA = RENDIMIENTO_META * PT_POR_M3;

/** El precio por m³ que se manda al servidor, al céntimo; `null` si no hay precio. */
export function precioM3De(p: PrecioDeLaMadera): number | null {
  const v = Number(p.valor.replace(",", "."));
  if (!p.valor.trim() || !Number.isFinite(v) || v <= 0) return null;
  return precioAplicable(p.unidad === "pt" ? v * PT_POR_M3_ROLLIZA : v);
}

export default function CtpPrecioDeLaMadera({
  precio,
  onCambio,
  lineas,
}: {
  precio: PrecioDeLaMadera;
  onCambio: (p: PrecioDeLaMadera) => void;
  /** Lo que se va a valorizar: una línea por ingreso (especie y su m³). */
  lineas: { etiqueta: string; m3: number }[];
}) {
  const id = useId();
  const precioM3 = precioM3De(precio);
  const conVolumen = lineas.filter((l) => l.m3 > 0);
  const total = precioM3 == null ? 0 : conVolumen.reduce((a, l) => a + costoDe(precioM3, l.m3), 0);

  return (
    <div className="min-w-0 space-y-2 sm:col-span-12">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-[16rem]">
          <label htmlFor={id} className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
            Precio {precio.unidad === "pt" ? "por pie tablar" : "por m³"} (S/)
          </label>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={precio.valor}
            onChange={(e) => onCambio({ ...precio, valor: e.target.value })}
            placeholder={precio.unidad === "pt" ? "1.20" : "300.00"}
            className={`${I} font-mono`}
          />
        </div>
        <SegmentedControl
          value={precio.unidad}
          onChange={(u) => onCambio({ ...precio, unidad: u })}
          label="Unidad del precio"
          options={[
            { value: "m3", label: "por m³" },
            { value: "pt", label: "por pie tablar" },
          ]}
        />
      </div>

      {precioM3 != null && conVolumen.length > 0 && (
        <div className="rounded-xl bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm">
          {precio.unidad === "pt" && (
            <p className="mb-1 text-xs text-[var(--text-tertiary)]">
              Equivale a {formatCurrency(precioM3)} por m³ (≈ {Math.round(PT_POR_M3_ROLLIZA * 100) / 100} pt aserrables por m³)
            </p>
          )}
          <ul className="space-y-0.5">
            {conVolumen.map((l) => (
              <li key={l.etiqueta} className="flex items-baseline justify-between gap-3 text-[var(--text-secondary)]">
                <span className="min-w-0 truncate">
                  {l.etiqueta} · <span className="font-mono tabular-nums">{fmtM3(l.m3)} m³</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums">{formatCurrency(costoDe(precioM3, l.m3))}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-[var(--rule-base)] pt-1.5 font-semibold text-[var(--text-primary)]">
            <span>Costo de la madera</span>
            <span className="font-mono tabular-nums">{formatCurrency(total)}</span>
          </p>
        </div>
      )}
      {precio.valor.trim() !== "" && precioM3 == null && (
        <p className="text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          El precio tiene que ser de al menos S/ 0.01 por m³. Vacío = sin costo.
        </p>
      )}
    </div>
  );
}
