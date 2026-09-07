"use client";

/**
 * Qué hay DETRÁS de una fila del balance de capacidad.
 *
 * La tarjeta contesta «cuánto puede salir»; esto contesta «de qué está hecho
 * ese número». Sin el detalle, un total de 84 m³ hay que creerlo: no se puede
 * cruzar contra el patio ni contra una guía, que es exactamente lo que pide un
 * fiscalizador —y lo que hace el dueño antes de comprometer una venta—.
 *
 * Cada fuente trae sus propias columnas porque son cosas distintas: una troza
 * tiene código y dimensiones, un lote tiene tope y plazo, un producto tiene
 * piezas. Forzarlas a una tabla común obligaría a dejar la mitad en blanco.
 *
 * El reporte que baja de acá es SÓLO lo filtrado, y lo dice en el encabezado:
 * un PDF que no declara su filtro se archiva como si fuera todo el patio.
 */

import { useMemo, useState } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { DataTable } from "@buleje/design-system";
import { FileSpreadsheet, Layers, Printer } from "@buleje/design-system/icons";
import { Btn, MODAL_BODY } from "../ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import {
  filaDeTroza,
  hayFiltro,
  lotesDeFuente,
  trozasDeFuente,
  type EntradaCapacidad,
  type FiltrosCapacidad,
  type FuenteDeCapacidad,
} from "@/lib/forestal/capacidad-de-planta";
import { printCapacidadDetalle } from "@/lib/forestal/capacidad-detalle-print";

const pt = (v: number) => pieTablarDe(v).toLocaleString("es-PE");

/** Las filas de la fuente, ya en la forma que se muestra y se exporta. */
function filasDe(
  fuente: FuenteDeCapacidad,
  entrada: EntradaCapacidad,
  filtros: FiltrosCapacidad,
): { columnas: string[]; filas: Record<string, string | number>[] } {
  if (fuente.clave === "patio" || fuente.clave === "porRecepcionar") {
    return {
      columnas: [
        "Código",
        "Especie",
        "Dimensiones",
        "m³",
        "pt",
        "Permiso",
        "Guía",
        "Proveedor",
        "Fecha",
      ],
      filas: trozasDeFuente(fuente.clave, entrada.patio, filtros).map((t) => {
        const f = filaDeTroza(t);
        return {
          Código: f.codigo,
          Especie: f.especie,
          Dimensiones: f.dimensiones,
          "m³": f.m3,
          pt: f.pt,
          Permiso: f.permiso,
          Guía: f.guia,
          Proveedor: f.proveedor,
          Fecha: f.fecha,
        };
      }),
    };
  }
  if (fuente.clave === "lotes") {
    return {
      columnas: [
        "Lote",
        "Permiso",
        "Especie",
        "Estado",
        "Consumido (m³)",
        "Al 56 % (m³)",
        "Producido (m³)",
        "Resta (m³)",
        "Resta (pt)",
        "Piezas",
      ],
      filas: lotesDeFuente(entrada.lotes, filtros).map((l) => ({
        Lote: l.code,
        Permiso: l.permisos.join(" + ") || "—",
        Especie: l.especie ?? "—",
        Estado: l.status,
        "Consumido (m³)": l.consumidoM3,
        "Al 56 % (m³)": l.esperado56M3,
        /* Vacío y no 0: una corrida en pt o kg no se puede sumar en m³, y un
           cero ahí se leería como «no produjo nada». */
        "Producido (m³)": l.producidoM3 ?? "",
        "Resta (m³)": l.restaM3 ?? "",
        "Resta (pt)": l.restaM3 == null ? "" : pieTablarDe(l.restaM3),
        Piezas: l.piezas,
      })),
    };
  }
  return {
    columnas: ["Producto", "Producido", "Despachado", "Disponible", "Disponible (pt)"],
    /* Sin columna de unidad a propósito: `productos[]` agrega corridas que
       pueden venir en m³, pt o unidades. El pie tablar se calcula igual porque
       la fila que llega acá ya está en m³ (es la que suma el balance). */
    filas: entrada.productos.map((p) => ({
      Producto: p.producto,
      Producido: p.producido,
      Despachado: p.despachado,
      Disponible: p.stock,
      "Disponible (pt)": pieTablarDe(p.stock),
    })),
  };
}

/** Cómo se lee el filtro puesto, para el encabezado y para el reporte. */
export function textoDeFiltros(f: FiltrosCapacidad): string {
  const partes = [
    f.permiso && `permiso ${f.permiso}`,
    f.especie && `especie ${f.especie}`,
    f.guia && `guía ${f.guia}`,
  ].filter(Boolean);
  return partes.length === 0 ? "Toda la planta" : `Sólo ${partes.join(" · ")}`;
}

export default function DetalleDeFuente({
  fuente,
  entrada,
  filtros,
  periodoLabel,
  onClose,
}: {
  fuente: FuenteDeCapacidad;
  entrada: EntradaCapacidad;
  filtros: FiltrosCapacidad;
  periodoLabel: string;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const { columnas, filas } = useMemo(
    () => filasDe(fuente, entrada, filtros),
    [fuente, entrada, filtros],
  );
  const nombreArchivo = `capacidad-${fuente.clave}-${periodoLabel}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  const excel = async () => {
    setError(null);
    try {
      const { exportSheetsToExcel } = await import("@/lib/export-excel");
      await exportSheetsToExcel(
        [
          { nombre: fuente.label.slice(0, 31), filas },
          {
            /* El filtro viaja EN el archivo: un Excel suelto en un correo no
               tiene cómo decir de qué recorte salió. */
            nombre: "Qué se exportó",
            filas: [
              { Dato: "Fuente", Valor: fuente.label },
              { Dato: "Filtro", Valor: textoDeFiltros(filtros) },
              { Dato: "Período", Valor: periodoLabel },
              { Dato: "Filas", Valor: filas.length },
              { Dato: "En producto (m³)", Valor: fuente.enProducto },
              { Dato: "En producto (pt)", Valor: pieTablarDe(fuente.enProducto) },
            ],
          },
        ],
        nombreArchivo,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const pdf = () => {
    setError(null);
    try {
      printCapacidadDetalle({
        titulo: fuente.label,
        filtro: textoDeFiltros(filtros),
        periodoLabel,
        columnas,
        filas,
        totalM3: fuente.m3,
        enProductoM3: fuente.enProducto,
        convertido: fuente.convertido,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      title={`${fuente.label} · detalle`}
      description={`${textoDeFiltros(filtros)} — ${filas.length} ${filas.length === 1 ? "fila" : "filas"}`}
      icon={Layers}
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
          <span className="text-sm text-[var(--text-secondary)]">
            {fmtM3(fuente.m3)} m³ hoy
            {fuente.convertido && " · al 56 %"} →{" "}
            <strong className="text-[var(--text-primary)]">{fmtM3(fuente.enProducto)} m³</strong>{" "}
            <span className="font-mono text-[var(--text-tertiary)]">
              ({pt(fuente.enProducto)} pt)
            </span>
          </span>
          <span className="flex gap-2">
            <Btn variant="secondary" size="sm" onClick={pdf} disabled={filas.length === 0}>
              <Printer className="h-4 w-4" /> PDF
            </Btn>
            <Btn
              variant="secondary"
              size="sm"
              onClick={() => void excel()}
              disabled={filas.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Btn>
          </span>
        </div>

        {error && (
          <p className="rounded-xl border-2 border-[var(--data-error-500)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}

        {filas.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">
            {fuente.noAtribuible ?? `Sin filas${hayFiltro(filtros) ? " con este filtro" : ""}.`}
          </p>
        ) : (
          <DataTable>
            <thead>
              <tr>
                {columnas.map((c) => (
                  <th
                    key={c}
                    className={
                      /m³|pt|Piezas|Producido|Despachado|Disponible|Consumido|Resta|56/.test(c)
                        ? "text-right"
                        : undefined
                    }
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={`${f[columnas[0]]}-${i}`}>
                  {columnas.map((c) => {
                    const v = f[c];
                    const numerica = typeof v === "number";
                    return (
                      <td
                        key={c}
                        className={numerica ? "text-right font-mono tabular-nums" : undefined}
                      >
                        {numerica && /m³|Resta|Consumido|56/.test(c)
                          ? fmtM3(v)
                          : numerica
                            ? v.toLocaleString("es-PE")
                            : v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </AdminModal>
  );
}
