"use client";

/**
 * «Libros para el contador» — totales del mes + las primeras filas del libro.
 * Totales y filas vienen ya armados del servidor; acá solo se pintan.
 */
import { DataTable } from "@buleje/design-system";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { ValorCelda } from "@/lib/contabilidad/libros/comun";
import type { VistaPrevia } from "./use-libros-contador";
import { COLUMNAS_VISTA, TOTALES_VISTA, type ColumnaVista } from "./libros-contador-config";

function Celda({ valor, col }: { valor: ValorCelda; col: ColumnaVista }) {
  if (valor === null || valor === undefined || valor === "") return <span className="text-[var(--text-tertiary)]">—</span>;
  if (typeof valor === "number" && col.soles) return <>{formatNumber(valor, 2)}</>;
  if (typeof valor === "number") return <>{formatNumber(valor)}</>;
  return <>{valor}</>;
}

export function TotalesLibro({ datos }: { datos: VistaPrevia }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-3 text-sm">
      <div>
        <dt className="text-[var(--text-secondary)]">Filas</dt>
        <dd className="font-bold tabular-nums text-[var(--text-primary)]">{formatNumber(datos.totalFilas)}</dd>
      </div>
      {TOTALES_VISTA[datos.libro].map((t) => (
        <div key={t.clave}>
          <dt className="text-[var(--text-secondary)]">{t.rotulo}</dt>
          <dd className="font-bold tabular-nums text-[var(--text-primary)]" data-total={t.clave}>
            {formatCurrency(datos.totales[t.clave] ?? 0)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function TablaLibro({ datos }: { datos: VistaPrevia }) {
  const columnas = COLUMNAS_VISTA[datos.libro];
  if (datos.filas.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--text-secondary)]">No hay movimientos en este mes.</p>;
  }
  return (
    <div className="space-y-2">
      <DataTable>
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.clave} scope="col" className={c.soles || c.numero ? "text-right" : undefined}>
                {c.corto}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.filas.map((f, i) => (
            <tr key={`${String(f.idSistema ?? f.correlativo ?? "")}-${i}`}>
              {columnas.map((c) => (
                <td key={c.clave} className={c.soles || c.numero ? "text-right tabular-nums" : undefined}>
                  <Celda valor={f[c.clave] ?? null} col={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </DataTable>
      {datos.totalFilas > datos.filas.length && (
        <p className="text-sm text-[var(--text-secondary)]">
          Ves las primeras {formatNumber(datos.filas.length)} de {formatNumber(datos.totalFilas)} filas. El archivo trae todas y todas las columnas del formato.
        </p>
      )}
    </div>
  );
}

export function NotasLibro({ notas }: { notas: string[] }) {
  return (
    <details className="rounded-xl border border-[var(--rule-soft)] px-4 py-2 text-sm">
      <summary className="cursor-pointer font-semibold text-[var(--text-primary)]">
        Qué es dato, qué es cálculo y qué falta ({notas.length})
      </summary>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[var(--text-secondary)]">
        {notas.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </details>
  );
}
