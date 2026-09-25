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
import { CardTitle, DataTable } from "@buleje/design-system";
import { PackageCheck, Truck, ArrowUpDown } from "@buleje/design-system/icons";
import { Btn } from "../ctp-shared";
import { Th, Td } from "../ctp-section-shared";
import { formatNumber } from "@/lib/format";

const n2 = (v: number) => formatNumber(v, 2);

export interface FilaProducto {
  producto: string;
  producido: number;
  despachado: number;
  stock: number;
}

type Columna = "producto" | "producido" | "despachado" | "stock";
type Orden = { col: Columna; desc: boolean };

/**
 * Encabezado que ordena. Vive FUERA del render: definido adentro se volvía un
 * componente nuevo en cada render y React re-montaba la cabecera entera.
 * `aria-sort` dice en el `<th>` cuál columna manda y en qué sentido.
 */
function EncabezadoOrden({
  col,
  orden,
  onOrdenar,
  children,
  className,
}: {
  col: Columna;
  orden: Orden;
  onOrdenar: (col: Columna) => void;
  children: string;
  className?: string;
}) {
  const activa = orden.col === col;
  return (
    <Th
      className={className}
      aria-sort={activa ? (orden.desc ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={() => onOrdenar(col)}
        className={`inline-flex min-h-6 items-center gap-1 transition-colors hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)] ${
          activa ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""
        }`}
      >
        {children}
        <span className="sr-only">, ordenar</span>
        <ArrowUpDown className="h-3 w-3 opacity-60" aria-hidden />
      </button>
    </Th>
  );
}

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
  const [orden, setOrden] = useState<Orden>({ col: "stock", desc: true });

  const filas = useMemo(() => {
    const copia = [...productos];
    const { col, desc } = orden;
    copia.sort((a, b) => {
      const r =
        col === "producto" ? a.producto.localeCompare(b.producto, "es-PE") : a[col] - b[col];
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

  return (
    <section
      aria-labelledby="saldos-productos-titulo"
      className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <CardTitle
          as="h3"
          id="saldos-productos-titulo"
          className="text-base font-bold text-[var(--text-primary)]"
        >
          Stock de productos transformados
        </CardTitle>
        <p className="text-xs text-[var(--text-tertiary)]">
          {conStock} de {filas.length} {filas.length === 1 ? "línea" : "líneas"} con stock listo
          para despachar · las cantidades van en la unidad declarada por cada corrida
        </p>
      </div>

      {filas.length === 0 ? (
        <div className="p-10 text-center text-[var(--text-tertiary)]">
          <PackageCheck className="mx-auto mb-3 h-9 w-9 opacity-30" aria-hidden />
          <p className="text-sm">Sin productos transformados todavía.</p>
        </div>
      ) : (
        <DataTable
          className="w-full text-sm"
          wrapperClassName="rounded-none border-0"
          aria-labelledby="saldos-productos-titulo"
        >
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <EncabezadoOrden col="producto" orden={orden} onOrdenar={ordenar}>
                Producto · Especie
              </EncabezadoOrden>
              <EncabezadoOrden
                col="producido"
                orden={orden}
                onOrdenar={ordenar}
                className="text-right"
              >
                Producido
              </EncabezadoOrden>
              <EncabezadoOrden
                col="despachado"
                orden={orden}
                onOrdenar={ordenar}
                className="text-right"
              >
                Despachado
              </EncabezadoOrden>
              <EncabezadoOrden col="stock" orden={orden} onOrdenar={ordenar} className="text-right">
                Stock
              </EncabezadoOrden>
              {onDespachar && (
                <Th className="text-right">
                  <span className="sr-only">Acciones</span>
                </Th>
              )}
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr key={p.producto} className="border-t border-[var(--rule-soft)]">
                <Td className="font-medium text-[var(--text-primary)]">{p.producto}</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {n2(p.producido)}
                </Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {n2(p.despachado)}
                </Td>
                <Td className="text-right">
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      p.stock < 0 ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]"
                    }`}
                  >
                    {n2(p.stock)}
                  </span>
                  {p.stock < 0 && (
                    <span className="ml-2 rounded-full bg-[var(--data-error-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-error-ink)]">
                      despachado de más
                    </span>
                  )}
                </Td>
                {onDespachar && (
                  <Td className="text-right">
                    {p.stock > 0 && (
                      <Btn
                        size="sm"
                        variant="secondary"
                        onClick={() => onDespachar(...partirProducto(p.producto))}
                      >
                        <Truck className="h-4 w-4" aria-hidden />
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
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">
                {n2(total.producido)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">
                {n2(total.despachado)}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">
                {n2(disponible)}
              </td>
              {onDespachar && <td />}
            </tr>
          </tfoot>
        </DataTable>
      )}
    </section>
  );
}
