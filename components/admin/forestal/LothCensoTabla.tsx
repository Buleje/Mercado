"use client";

/**
 * La tabla del censo: una fila por árbol, con lo que trae la hoja del regente
 * sin volverse ilegible — el científico en cursiva y el nombre nativo debajo
 * de la especie, Este/Norte en una celda, la observación bajo la condición.
 *
 * La condición del regente y la categoría POA van en columnas distintas: la
 * primera la declara el censo, la segunda la calcula el sistema con el DMC.
 */

import type { ReactNode } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, Trash2, TreePine } from "@buleje/design-system/icons";
import type { CATEGORIA_LABEL } from "@/lib/forestal/loth-poa";
import { CLASE_ARBOL_LABEL, poaDiscrepa } from "@/lib/forestal/loth-mapa-arboles";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber, type Decimales } from "@/lib/format";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { ArbolCenso } from "./loth-censo-arbol";
import { CategoriaTag, CitesPill, EstadoTag, Mono } from "./loth-plan-ui";

/* `dosLineas`: el rótulo parte en dos renglones, como las dos cifras de la
   celda. En uno solo, «Este · Norte» era la columna más ancha de la tabla y
   el botón de borrar quedaba afuera a 1280 (medido: 954 px en 928). */
const COLUMNAS: { label: string; derecha?: boolean; dosLineas?: [string, string] }[] = [
  { label: "Código" },
  { label: "Especie" },
  { label: "DAP (m)", derecha: true },
  { label: "Hc (m)", derecha: true },
  { label: "Vol. m³", derecha: true },
  { label: "Este · Norte", derecha: true, dosLineas: ["Este", "Norte"] },
  { label: "Condición" },
  { label: "Categoría POA" },
  { label: "Estado" },
];

const numero = (v: string | null | undefined, dec: Decimales) => (v == null || v === "" ? "—" : formatNumber(Number(v), dec));

export default function LothCensoTabla({ arboles, vacio, sinCoincidencias, fueraDelPlan, categorias, onBorrar }: {
  /** Ya filtrados, ordenados y recortados a lo visible. */
  arboles: readonly ArbolCenso[];
  /** El censo no tiene ningún árbol. */
  vacio: boolean;
  /** Hay árboles, pero el filtro no deja ninguno. */
  sinCoincidencias: boolean;
  fueraDelPlan: (especie: string) => boolean;
  categorias: Map<string, keyof typeof CATEGORIA_LABEL>;
  onBorrar: (a: ArbolCenso) => void;
}) {
  const total = COLUMNAS.length + 1;
  return (
    <DataTable className="w-full text-sm" stickyHeader wrapperClassName="max-h-[60vh]">
      <thead className="bg-[var(--surface-sunken)] text-left">
        <tr>
          {COLUMNAS.map((c) => (
            <th key={c.label} data-label={c.label} className={`whitespace-nowrap px-2.5 py-2 font-bold text-[var(--text-primary)] ${c.derecha ? "text-right" : ""}`}>
              {c.dosLineas ? <>{c.dosLineas[0]}<br />{c.dosLineas[1]}</> : c.label}
              {c.label === "Categoría POA" && (
                <InfoTip
                  title="Condición vs. categoría POA"
                  what="«Condición» es lo que declaró el regente en la hoja del censo; «Categoría POA» es lo que calcula el sistema con el DMC y el % de semilleros del plan."
                  affects="Manda lo que firma la resolución aprobada, no el cálculo de esta pantalla. Cuando no coinciden, la fila lo marca para que lo revises antes de talar."
                  example="Regente: «Aprovechable». Sistema: «Semillero» (es de los más gruesos de su especie) → se marca la discrepancia."
                />
              )}
            </th>
          ))}
          <th className="px-2.5 py-2"><span className="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {arboles.map((t) => {
          const fuera = fueraDelPlan(t.speciesCommon);
          const segunda = [t.speciesScientific, t.speciesNative].filter(Boolean);
          const categoria = categorias.get(t.id);
          const discrepa = poaDiscrepa({ condicion: t.condicion, categoria });
          return (
            <tr key={t.id} className={`border-t border-[var(--rule-soft)] align-top ${fuera ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12" : ""}`}>
              <Td><span className="whitespace-nowrap"><Mono bold>{t.treeCode}</Mono></span></Td>
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
              <Td derecha><Mono>{numero(t.dapM, { min: 2, max: 3 })}</Mono></Td>
              <Td derecha><Mono>{numero(t.alturaComercialM, { min: 0, max: 2 })}</Mono></Td>
              <Td derecha><Mono bold>{t.volumenEstimadoM3 == null || t.volumenEstimadoM3 === "" ? "—" : fmtM3(Number(t.volumenEstimadoM3))}</Mono></Td>
              <Td derecha>
                {t.utmX != null && t.utmY != null ? (
                  <span className="font-mono text-xs leading-5 tabular-nums text-[var(--text-secondary)]" title={t.utmZona ? `Zona ${t.utmZona}` : undefined}>
                    {Math.round(Number(t.utmX))}<br />{Math.round(Number(t.utmY))}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--text-tertiary)]">—</span>
                )}
              </Td>
              <Td>
                <div className="min-w-0">
                  <span className="text-[var(--text-primary)]">{t.condicion || "—"}</span>
                  {t.notes && <span className="block max-w-[10rem] truncate text-xs text-[var(--text-tertiary)]" title={t.notes}>{t.notes}</span>}
                </div>
              </Td>
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
              <Td><EstadoTag estado={t.estado} /></Td>
              <Td derecha>
                <button type="button" onClick={() => onBorrar(t)} title={`Borrar ${t.treeCode}`} aria-label={`Borrar el árbol ${t.treeCode}`} className="-my-1 grid h-8 w-8 place-items-center rounded-lg text-[var(--data-error-600)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] dark:hover:bg-[var(--data-error-500)]/12">
                  <Trash2 className="h-4 w-4" />
                </button>
              </Td>
            </tr>
          );
        })}
        {vacio && (
          <tr><td colSpan={total} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]"><TreePine className="mx-auto mb-2 h-8 w-8 opacity-30" />Sin árboles censados. Agrega uno o importa la hoja del regente.</td></tr>
        )}
        {sinCoincidencias && (
          <tr><td colSpan={total} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">Ningún árbol coincide con el filtro.</td></tr>
        )}
      </tbody>
    </DataTable>
  );
}

function Td({ children, derecha }: { children: ReactNode; derecha?: boolean }) {
  return <td className={`px-2.5 py-2.5 ${derecha ? "text-right" : ""}`}>{children}</td>;
}
