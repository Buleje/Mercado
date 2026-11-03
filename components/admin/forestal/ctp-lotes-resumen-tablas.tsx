"use client";

/**
 * Las dos tablas del resumen de lotes elegidos (Brandon, 2026-11-03): el
 * resumen por especie —que se usa dos veces, para todos los elegidos y para los
 * marcados en el detalle— y el detalle lote por lote, con su casilla.
 *
 * Las columnas son las mismas en las dos: lo que se compara tiene que estar en
 * el mismo lugar. «Salió» y «Sin aserrar» sólo aparecen si algún lote tiene
 * algo ahí: con todo en cero serían columnas de rayas que empujan la tabla.
 */

import { DataTable } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { FilaDetalleLote, FilaResumenEspecie, ResumenPorEspecie } from "@/lib/forestal/lotes-resumen-especie";

const NUM = "text-right font-mono tabular-nums";
/** Una cifra no se parte en dos renglones: «46.6 %» partido se lee como dos datos. */
const SIN_CORTE = "[&_th]:whitespace-nowrap [&_td]:whitespace-nowrap";

/** Columnas que aparecen sólo si algún lote tiene algo en ellas. */
export interface ColumnasOpcionales {
  salio: boolean;
  sinAserrar: boolean;
}
const m3 = (v: number) => (v > 1e-4 ? fmtM3(v) : "—");
const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("es-PE", { maximumFractionDigits: 1 })} %`);

/** Los encabezados de cifras, con su ⓘ: qué es cada número sin un párrafo encima de la tabla. */
function EncabezadosCifras({ col }: { col: ColumnasOpcionales }) {
  return (
    <>
      <th scope="col" className="text-right">Consumido</th>
      <th scope="col" className="text-right">Producido</th>
      <th scope="col" className="text-right">Rinde</th>
      {col.salio && <th scope="col" className="text-right">Salió</th>}
      <th scope="col" className="text-right">En patio</th>
      <th scope="col" className="text-right">
        <span className="inline-flex items-center gap-1">
          Sobra
          <InfoTip
            title="Lo que sobra por declarar"
            what="Producción que el lote todavía admite declarar hasta el tope del 56 % de lo consumido. Un lote sin nada declarado tiene el tope entero."
            example="31.092 m³ consumidos → tope 17.412; con 16.985 declarados quedan 0.427."
            side="left"
          />
        </span>
      </th>
      {col.sinAserrar && (
        <th scope="col" className="text-right">
          <span className="inline-flex items-center gap-1">
            Sin aserrar
            <InfoTip title="Rolliza que sobra" what="Piezas del lote abierto que todavía no entraron a la sierra." side="left" />
          </span>
        </th>
      )}
    </>
  );
}

function CeldasCifras({ f, col }: { f: FilaDetalleLote | FilaResumenEspecie; col: ColumnasOpcionales }) {
  return (
    <>
      <td className={NUM}>{m3(f.consumidoM3)}</td>
      <td className={NUM}>{f.producidoM3 == null ? "—" : m3(f.producidoM3)}</td>
      <td className={NUM}>{pct(f.rendimientoPct)}</td>
      {col.salio && <td className={NUM}>{m3(f.salidoM3)}</td>}
      <td className={NUM}>
        {m3(f.enPatioM3)}
        {f.enPatioPt > 0 && (
          <span className="block text-xs text-[var(--text-tertiary)]">{fmtPt(f.enPatioPt)} pt</span>
        )}
      </td>
      <td className={NUM}>{m3(f.porDeclararM3)}</td>
      {col.sinAserrar && <td className={NUM}>{m3(f.sinAserrarM3)}</td>}
    </>
  );
}

export function TablaResumenEspecie({
  resumen,
  col,
  etiqueta,
}: {
  resumen: ResumenPorEspecie;
  col: ColumnasOpcionales;
  /** Para el lector de pantalla: qué grupo de lotes resume esta tabla. */
  etiqueta: string;
}) {
  return (
    <DataTable aria-label={etiqueta} className={SIN_CORTE}>
      <thead>
        <tr>
          <th scope="col">Especie</th>
          <th scope="col" className="text-right">Lotes</th>
          <EncabezadosCifras col={col} />
        </tr>
      </thead>
      <tbody>
        {resumen.especies.map((e) => (
          <tr key={e.especie}>
            <td className="font-bold">{e.especie}</td>
            <td className={NUM}>{e.lotes}</td>
            <CeldasCifras f={e} col={col} />
          </tr>
        ))}
      </tbody>
      {resumen.especies.length > 1 && (
        <tfoot>
          <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
            <td>Total</td>
            <td className={NUM}>{resumen.total.lotes}</td>
            <CeldasCifras f={resumen.total} col={col} />
          </tr>
        </tfoot>
      )}
    </DataTable>
  );
}

export function TablaDetalleLotes({
  filas,
  marcados,
  onAlternar,
  onAlternarTodos,
  col,
}: {
  filas: readonly FilaDetalleLote[];
  marcados: ReadonlySet<string>;
  onAlternar: (id: string) => void;
  onAlternarTodos: () => void;
  col: ColumnasOpcionales;
}) {
  const todos = filas.length > 0 && filas.every((f) => marcados.has(f.id));
  const algunos = !todos && filas.some((f) => marcados.has(f.id));
  return (
    <DataTable aria-label="Detalle de los lotes elegidos" className={SIN_CORTE}>
      <thead>
        <tr>
          <th scope="col" className="w-10">
            <input
              type="checkbox"
              checked={todos}
              ref={(el) => {
                if (el) el.indeterminate = algunos;
              }}
              onChange={onAlternarTodos}
              aria-label={todos ? "Desmarcar todos los lotes" : "Marcar todos los lotes"}
              className="h-5 w-5 accent-[var(--accent-dark)]"
            />
          </th>
          <th scope="col">Lote</th>
          <th scope="col">Especie</th>
          <EncabezadosCifras col={col} />
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => {
          const marcado = marcados.has(f.id);
          return (
            <tr
              key={f.id}
              onClick={() => onAlternar(f.id)}
              className={`cursor-pointer ${marcado ? "bg-[var(--accent)]/10" : ""}`}
            >
              <td>
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => onAlternar(f.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Marcar el lote ${f.code}`}
                  className="h-5 w-5 accent-[var(--accent-dark)]"
                />
              </td>
              <td className="whitespace-nowrap">
                <span className="font-mono font-bold">{f.code}</span>
                <span className="block text-xs text-[var(--text-tertiary)]">{f.estado}</span>
              </td>
              <td>{f.especie}</td>
              <CeldasCifras f={f} col={col} />
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
