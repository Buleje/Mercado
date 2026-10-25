"use client";

/**
 * «Bajar lo que ves» (Brandon 25-10: filtros tipo Excel en todas las tablas +
 * «ideas de alto nivel»): con un filtro puesto, las filas que quedaron se bajan
 * a Excel —con el membrete del negocio— en un clic, con las columnas que tienen
 * filtro. 50 de 82 tablas con filtros no tenían cómo sacar lo filtrado.
 *
 * Lo monta `BarraFiltrosTabla` cuando la tabla le pasa `excel="<nombre>"`; sólo
 * aparece con filtros puestos (sin filtros, la pantalla ya tiene su «Exportar»
 * o no lo necesita).
 */

import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { logger } from "@/lib/logger";
import type { ColumnaFiltro } from "@/lib/admin/filtros-columna";
import type { FiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";

/** Una fila de Excel: el rótulo de cada columna con filtro y lo que la fila tiene ahí. */
export function filaParaExcel<T>(fila: T, columnas: readonly ColumnaFiltro<T>[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of columnas) {
    if (c.tipo === "rango" || c.tipo === "fecha") {
      out[c.label] = c.numero?.(fila) ?? "";
    } else {
      const v = c.valor?.(fila);
      out[c.label] = v == null ? "" : typeof v === "string" ? v : v.join(" · ");
    }
  }
  return out;
}

/** «fiados-2026-10-25»: minúsculas, sin tildes ni espacios. */
const nombreArchivo = (nombre: string) =>
  `${nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${new Date().toISOString().slice(0, 10)}`;

export function BajarLoQueVes<T>({ f, nombre, filas }: { f: FiltrosTabla<T>; nombre: string; filas?: readonly T[] }) {
  const [bajando, setBajando] = useState(false);
  if (f.activos === 0) return null;
  const lista = filas ?? f.filtradas;
  const bajar = async () => {
    setBajando(true);
    try {
      const { exportToExcel } = await import("@/lib/export-excel");
      await exportToExcel(lista.map((x) => filaParaExcel(x, f.columnas)), nombreArchivo(nombre), nombre.slice(0, 31));
    } catch (err) {
      logger.error("[bajar-lo-que-ves] no se pudo armar el Excel", { error: String(err) });
      toast.error("No se pudo bajar el Excel. Inténtalo otra vez.");
    } finally {
      setBajando(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void bajar()}
      disabled={bajando || lista.length === 0}
      title={`Bajar a Excel lo que ves (${lista.length} fila${lista.length === 1 ? "" : "s"})`}
      aria-label={`Bajar a Excel lo que ves: ${lista.length} filas`}
      /* Sin la píldora del DS: el panel es de esquinas rectas (globals.css, «BORDES RECTOS — ADMIN»)
         salvo `rounded-full`; así queda igual al menú «Vista» que va al lado. */
      className={button({ variant: "secondary", size: "icon", className: "shrink-0 rounded-xl" })}
    >
      {bajando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="h-4 w-4" aria-hidden />}
    </button>
  );
}
