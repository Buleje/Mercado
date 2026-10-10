"use client";

/**
 * La tabla del censo: una fila por árbol, con lo que trae la hoja del regente
 * sin volverse ilegible — el científico en cursiva y el nombre nativo debajo
 * de la especie, Este/Norte en una celda, la observación bajo la condición.
 *
 * La condición del regente y la categoría POA van en columnas distintas: la
 * primera la declara el censo, la segunda la calcula el sistema con el DMC.
 *
 * Al nivel de las Secciones del libro (08-10): caja con la cabecera y el total
 * fijos, el total del pie con la MISMA cuenta que la tarjeta «Volumen
 * estimado» (`cifrasDelCenso`), y columnas que se ocultan, se arrastran y se
 * recuerdan (`loth-seccion-columnas`, clave `loth-censo`). Fijas: la casilla
 * (primera) y borrar (última).
 */

import { useMemo, type ReactNode } from "react";
import { DataTable } from "@buleje/design-system";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import { AlertTriangle, Trash2, TreePine } from "@buleje/design-system/icons";
import type { CATEGORIA_LABEL } from "@/lib/forestal/loth-poa";
import { CLASE_ARBOL_LABEL, poaDiscrepa } from "@/lib/forestal/loth-mapa-arboles";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber, type Decimales } from "@/lib/format";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { ArbolCenso } from "./loth-censo-arbol";
import { CategoriaTag, CitesPill, EstadoTag, Mono } from "./loth-plan-ui";
import { FiltroEnCabecera, type FiltrosTabla } from "./filtros-tabla-forestal";
import { cifrasDelCenso } from "./loth-censo-cifras";
import { CAJA_TABLA, FilaPie, TABLA_PIE_FIJO } from "./loth-seccion-celdas";
import { ColumnasRecordadas, soloEnOrden, useOrdenRecordado } from "./loth-seccion-columnas";

/* `dosLineas`: el rótulo parte en dos renglones, como las dos cifras de la
   celda. En uno solo, «Este · Norte» era la columna más ancha de la tabla y
   el botón de borrar quedaba afuera a 1280 (medido: 954 px en 928). */
const COLUMNAS: { id: string; label: string; filtro?: string; derecha?: boolean; dosLineas?: [string, string] }[] = [
  { id: "codigo", label: "Código", filtro: "codigo" },
  { id: "especie", label: "Especie", filtro: "especie" },
  { id: "dap", label: "DAP (m)", filtro: "dap", derecha: true },
  { id: "hc", label: "Hc (m)", filtro: "hc", derecha: true },
  { id: "vol", label: "Vol. m³", filtro: "vol", derecha: true },
  { id: "utm", label: "Este · Norte", derecha: true, dosLineas: ["Este", "Norte"] },
  { id: "condicion", label: "Condición", filtro: "condicion" },
  { id: "categoria", label: "Categoría POA", filtro: "categoria" },
  { id: "estado", label: "Estado", filtro: "estado" },
];
const DE_FABRICA = COLUMNAS.map((c) => c.id);
const ELEGIBLES = COLUMNAS.map((c) => ({ id: c.id, label: c.label }));
const A_LA_DERECHA = new Set(COLUMNAS.filter((c) => c.derecha).map((c) => c.id));

/** Las columnas elegidas del censo, recordadas en este navegador. Envuelve la fila de arriba (el botón) y la tabla. */
export function LothCensoColumnas({ children }: { children: ReactNode }) {
  return (
    <ColumnasRecordadas clave="loth-censo" porDefecto={DE_FABRICA} elegibles={ELEGIBLES}>
      {children}
    </ColumnasRecordadas>
  );
}

const numero = (v: string | null | undefined, dec: Decimales) => (v == null || v === "" ? "—" : formatNumber(Number(v), dec));

export default function LothCensoTabla({ arboles, filasTotal, filtros, vacio, sinCoincidencias, fueraDelPlan, categorias, onBorrar, marcados, onMarcar, onMarcarVisibles }: {
  /** Ya filtrados, ordenados y recortados a lo visible. */
  arboles: readonly ArbolCenso[];
  /** Todos los que deja el filtro (no sólo los pintados): el pie suma éstos. */
  filasTotal: readonly ArbolCenso[];
  /** El autofiltro de cada encabezado (sobre el censo completo, no sobre lo pintado). */
  filtros: FiltrosTabla<ArbolCenso>;
  /** El censo no tiene ningún árbol. */
  vacio: boolean;
  /** Hay árboles, pero el filtro no deja ninguno. */
  sinCoincidencias: boolean;
  fueraDelPlan: (especie: string) => boolean;
  categorias: Map<string, keyof typeof CATEGORIA_LABEL>;
  onBorrar: (a: ArbolCenso) => void;
  /** Árboles seleccionados para borrar en bloque (ids). */
  marcados: ReadonlySet<string>;
  onMarcar: (id: string) => void;
  /** Selecciona (o suelta) todas las filas que se ven. */
  onMarcarVisibles: (marcar: boolean) => void;
}) {
  const { orden, refCabecera } = useOrdenRecordado(DE_FABRICA);
  const pie = useMemo(() => cifrasDelCenso(filasTotal, categorias, fueraDelPlan), [filasTotal, categorias, fueraDelPlan]);
  const total = orden.length + 2;
  const todosVisibles = arboles.length > 0 && arboles.every((t) => marcados.has(t.id));
  const cabeceras: Record<string, ReactNode> = {};
  for (const c of COLUMNAS) {
    cabeceras[c.id] = (
      <th data-col={c.id} data-label={c.label} className={`whitespace-nowrap px-2.5 py-2 font-bold text-[var(--text-primary)] ${c.derecha ? "text-right" : ""}`}>
        {c.dosLineas ? (
          <>
            {c.dosLineas[0]}<FiltroEnCabecera id="este" f={filtros} compacto /><br />
            {c.dosLineas[1]}<FiltroEnCabecera id="norte" f={filtros} compacto />
          </>
        ) : c.label}
        {c.filtro && <FiltroEnCabecera id={c.filtro} f={filtros} compacto />}
        {c.id === "categoria" && (
          <InfoTip
            title="Condición vs. categoría POA"
            what="«Condición» es lo que declaró el regente en la hoja del censo; «Categoría POA» es lo que calcula el sistema con el DMC y el % de semilleros del plan."
            affects="Manda lo que firma la resolución aprobada, no el cálculo de esta pantalla. Cuando no coinciden, la fila lo marca para que lo revises antes de talar."
            example="Regente: «Aprovechable». Sistema: «Semillero» (es de los más gruesos de su especie) → se marca la discrepancia."
          />
        )}
      </th>
    );
  }
  return (
    <DataTable className={`w-full text-sm ${TABLA_PIE_FIJO}`} stickyHeader wrapperClassName={`${CAJA_TABLA} max-h-[60vh]`}>
      <thead ref={refCabecera} className="bg-[var(--surface-sunken)] text-left align-top">
        <tr>
          <th className="w-9 px-2.5 py-2">
            <input
              type="checkbox"
              checked={todosVisibles}
              disabled={arboles.length === 0}
              onChange={() => onMarcarVisibles(!todosVisibles)}
              aria-label={todosVisibles ? "Quitar la selección de los árboles visibles" : "Seleccionar los árboles visibles"}
              title={todosVisibles ? "Quitar la selección de los visibles" : "Seleccionar los visibles"}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </th>
          <EnOrden orden={orden} celdas={soloEnOrden(orden, cabeceras)} />
          <th className="px-2.5 py-2"><span className="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {arboles.map((t) => (
          <tr key={t.id} className={`border-t border-[var(--rule-soft)] align-top ${fueraDelPlan(t.speciesCommon) ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12" : ""}`}>
            <Td>
              <input
                type="checkbox"
                checked={marcados.has(t.id)}
                onChange={() => onMarcar(t.id)}
                aria-label={`Seleccionar el árbol ${t.treeCode}`}
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </Td>
            <EnOrden orden={orden} celdas={soloEnOrden(orden, celdasArbol(t, fueraDelPlan(t.speciesCommon), categorias.get(t.id)))} />
            <Td derecha>
              <button type="button" onClick={() => onBorrar(t)} title={`Borrar ${t.treeCode}`} aria-label={`Borrar el árbol ${t.treeCode}`} className="-my-1 grid h-8 w-8 place-items-center rounded-lg text-[var(--data-error-600)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] dark:hover:bg-[var(--data-error-500)]/12">
                <Trash2 className="h-4 w-4" />
              </button>
            </Td>
          </tr>
        ))}
        {vacio && (
          <tr><td colSpan={total} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]"><TreePine className="mx-auto mb-2 h-8 w-8 opacity-30" />Sin árboles censados. Agrega uno o importa la hoja del regente.</td></tr>
        )}
        {sinCoincidencias && (
          <tr><td colSpan={total} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">Ningún árbol coincide con los filtros de columna.</td></tr>
        )}
      </tbody>
      {/* Pie: lo que deja el filtro, todo (no sólo las 200 filas pintadas). La misma cuenta que «Volumen estimado». */}
      {arboles.length > 0 && (
        <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
          <FilaPie
            orden={orden}
            dato={orden.includes("vol") ? { vol: <span className="whitespace-nowrap font-mono text-base font-black tabular-nums text-[var(--text-primary)]">{fmtM3(pie.volumenM3)}</span> } : {}}
            derecha={(id) => A_LA_DERECHA.has(id)}
            rotulo={
              <>
                <span className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">
                  Total · {formatNumber(pie.arboles)} árbol{pie.arboles === 1 ? "" : "es"}
                </span>
                {/* El total que no se ve (columna oculta) se dice igual: ocultar no es borrar. */}
                {!orden.includes("vol") && <span className="ml-2 whitespace-nowrap font-mono text-sm font-black tabular-nums">{fmtM3(pie.volumenM3)} m³</span>}
              </>
            }
          />
        </tfoot>
      )}
    </DataTable>
  );
}

/** Las celdas movibles de un árbol (`<EnOrden>` las pinta en el orden elegido). */
function celdasArbol(t: ArbolCenso, fuera: boolean, categoria: keyof typeof CATEGORIA_LABEL | undefined): Record<string, ReactNode> {
  const segunda = [t.speciesScientific, t.speciesNative].filter(Boolean);
  const discrepa = poaDiscrepa({ condicion: t.condicion, categoria });
  return {
    codigo: <Td><span className="whitespace-nowrap"><Mono bold>{t.treeCode}</Mono></span></Td>,
    especie: (
      <Td>
        {/* Un solo hijo: en el celular la celda es flex (rótulo |
            valor) y cada pedazo suelto salía en su propia columna.
            Los espacios entre nombre y pastillas son el corte de
            renglón: sin él, «Mashonaste NO EN PLAN» era una pieza de
            190 px y la tabla se salía de su caja a 1280. */}
        <div className="min-w-0">
          <span className="text-[var(--text-primary)]">{t.speciesCommon}</span>
          {t.cites && <> <CitesPill /></>}
          {fuera && <> <span className="ml-0.5 whitespace-nowrap rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/20 dark:text-[var(--data-error-500)]">NO EN PLAN</span></>}
          {segunda.length > 0 && (
            <span className="mt-0.5 block max-w-[16rem] text-xs text-[var(--text-secondary)]">
              {t.speciesScientific && <i>{t.speciesScientific}</i>}
              {t.speciesScientific && t.speciesNative && " · "}
              {t.speciesNative && <span title="Nombre en idioma nativo">{t.speciesNative}</span>}
            </span>
          )}
        </div>
      </Td>
    ),
    dap: <Td derecha><Mono>{numero(t.dapM, { min: 2, max: 3 })}</Mono></Td>,
    hc: <Td derecha><Mono>{numero(t.alturaComercialM, { min: 0, max: 2 })}</Mono></Td>,
    vol: <Td derecha><Mono bold>{t.volumenEstimadoM3 == null || t.volumenEstimadoM3 === "" ? "—" : fmtM3(Number(t.volumenEstimadoM3))}</Mono></Td>,
    utm: (
      <Td derecha>
        {t.utmX != null && t.utmY != null ? (
          <span className="font-mono text-xs leading-5 tabular-nums text-[var(--text-secondary)]" title={t.utmZona ? `Zona ${t.utmZona}` : undefined}>
            {Math.round(Number(t.utmX))}<br />{Math.round(Number(t.utmY))}
          </span>
        ) : (
          <span className="text-xs text-[var(--text-tertiary)]">—</span>
        )}
      </Td>
    ),
    condicion: (
      <Td>
        <div className="min-w-0">
          <span className="text-[var(--text-primary)]">{t.condicion || "—"}</span>
          {t.notes && <span className="block max-w-[10rem] truncate text-xs text-[var(--text-tertiary)]" title={t.notes}>{t.notes}</span>}
        </div>
      </Td>
    ),
    categoria: (
      <Td>
        <div className="flex items-center gap-1">
          <CategoriaTag categoria={categoria} />
          {discrepa && (
            <span
              title={`El regente declaró otra condición: el sistema calcula «${CLASE_ARBOL_LABEL[discrepa]}»`}
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Discrepa con lo que declaró el regente</span>
            </span>
          )}
        </div>
      </Td>
    ),
    estado: <Td><EstadoTag estado={t.estado} /></Td>,
  };
}

function Td({ children, derecha }: { children: ReactNode; derecha?: boolean }) {
  return <td className={`px-2.5 py-2.5 ${derecha ? "text-right" : ""}`}>{children}</td>;
}
