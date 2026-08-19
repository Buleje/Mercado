"use client";

/**
 * Stock de productos transformados — lo que está listo para subir a un camión.
 *
 * Lo que le faltaba a la tabla anterior, en orden de cuánto dolía:
 *
 *  · **Un stock negativo pasaba desapercibido.** Salía como un número rojo en la
 *    fila 8, sin aviso arriba: se despachó más de lo que las corridas declaran
 *    haber producido, que es el mismo error que el saldo negativo de materia
 *    prima —del otro lado del aserradero— y ese sí tenía banner.
 *  · **Sin totales.** Cuántas unidades hay en depósito exigía sumar a ojo.
 *  · **Sin orden.** Con veinte productos, encontrar el que más stock tiene era
 *    leer la columna entera.
 *
 * La cantidad va SIN unidad a propósito: `productos[]` agrega corridas que
 * pueden estar en m³, pies tablares o unidades, y ponerle "m³" a la suma sería
 * inventar una unidad. Por eso tampoco se totaliza junto con la materia prima.
 */

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { PackageCheck, Truck, ArrowUpDown } from "@buleje/design-system/icons";
import { Btn } from "../ctp-shared";
import { Th, Td, n2 } from "../ctp-section-shared";

export interface FilaProducto {
  producto: string;
  producido: number;
  despachado: number;
  stock: number;
}

type Columna = "producto" | "producido" | "despachado" | "stock";

/**
 * La fila del stock viene etiquetada "tipo · especie" (`productLabel` de
 * `forest-ctp.db`). El formulario de despacho pide los dos por separado, así que
 * se parte acá — con el "—" del vacío traducido a `null`, no a un texto que
 * después el select no encuentra.
 */
function partirProducto(label: string): [string, string | null] {
  const [tipo, especie] = label.split(" · ");
  const limpia = (v: string | undefined) => (v && v !== "—" ? v.trim() : null);
  return [limpia(tipo) ?? "", limpia(especie)];
}

export default function TablaProductos({
  productos,
  onDespachar,
}: {
  productos: readonly FilaProducto[];
  /** Atajo "del stock a la guía": abre Despacho con producto y especie elegidos. */
  onDespachar?: (producto: string, especie: string | null) => void;
}) {
  // Por defecto, lo que más stock tiene arriba: es la pregunta con la que se
  // abre la tabla ("¿qué puedo despachar?"), no el orden alfabético.
  const [orden, setOrden] = useState<{ col: Columna; desc: boolean }>({ col: "stock", desc: true });

  const filas = useMemo(() => {
    const copia = [...productos];
    const { col, desc } = orden;
    copia.sort((a, b) => {
      const r = col === "producto" ? a.producto.localeCompare(b.producto, "es-PE") : a[col] - b[col];
      return desc ? -r : r;
    });
    return copia;
  }, [productos, orden]);

  const total = filas.reduce(
    (a, p) => ({ producido: a.producido + p.producido, despachado: a.despachado + p.despachado }),
    { producido: 0, despachado: 0 },
  );
  const conStock = filas.filter((p) => p.stock > 0).length;
  // Lo despachado de más NO es stock negativo disponible: es un error. Se
  // muestra aparte para que este total coincida con la tarjeta de arriba, que
  // suma sólo lo positivo.
  const enNegativo = Number(filas.reduce((a, p) => a + Math.min(0, p.stock), 0).toFixed(4));
  const disponible = Number(filas.reduce((a, p) => a + Math.max(0, p.stock), 0).toFixed(4));

  const ordenar = (col: Columna) =>
    setOrden((p) => ({ col, desc: p.col === col ? !p.desc : col !== "producto" }));

  const Orden = ({ col, children, className }: { col: Columna; children: React.ReactNode; className?: string }) => (
    <Th className={className}>
      <button
        type="button"
        onClick={() => ordenar(col)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-primary ${
          orden.col === col ? "text-primary" : ""
        }`}
        aria-label={`Ordenar por ${children}`}
      >
        {children}
        <ArrowUpDown className="h-3 w-3 opacity-60" aria-hidden />
      </button>
    </Th>
  );

  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Stock de productos transformados
        </CardTitle>
        <p className="text-xs text-[var(--text-tertiary)]">
          {conStock} de {filas.length} {filas.length === 1 ? "línea" : "líneas"} con stock listo para despachar · las
          cantidades van en la unidad declarada por cada corrida
        </p>
      </div>

      {filas.length === 0 ? (
        <div className="p-10 text-center text-[var(--text-tertiary)]">
          <PackageCheck className="mx-auto mb-3 h-9 w-9 opacity-30" />
          <p className="text-sm">Sin productos transformados todavía.</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Orden col="producto">Producto · Especie</Orden>
              <Orden col="producido" className="text-right">Producido</Orden>
              <Orden col="despachado" className="text-right">Despachado</Orden>
              <Orden col="stock" className="text-right">Stock</Orden>
              {onDespachar && <Th className="text-right">&nbsp;</Th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr key={p.producto} className="border-t border-[var(--rule-soft)]">
                <Td className="font-medium text-[var(--text-primary)]">{p.producto}</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(p.producido)}</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(p.despachado)}</Td>
                <Td className="text-right">
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      p.stock < 0 ? "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)]"
                    }`}
                  >
                    {n2(p.stock)}
                  </span>
                  {p.stock < 0 && (
                    <span className="ml-2 rounded-full bg-[var(--data-error-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                      despachado de más
                    </span>
                  )}
                </Td>
                {onDespachar && (
                  <Td className="text-right">
                    {p.stock > 0 && (
                      <Btn size="sm" variant="secondary" onClick={() => onDespachar(...partirProducto(p.producto))}>
                        <Truck className="h-4 w-4" />
                        Despachar
                      </Btn>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
            <tr>
              <td className="px-4 py-2.5 text-[var(--text-primary)]">
                Total
                {enNegativo < 0 && (
                  <span className="block text-xs font-normal text-[var(--text-tertiary)]">
                    sin contar {n2(Math.abs(enNegativo))} despachados de más
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{n2(total.producido)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{n2(total.despachado)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{n2(disponible)}</td>
              {onDespachar && <td />}
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
