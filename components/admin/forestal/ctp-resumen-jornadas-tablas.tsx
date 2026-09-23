"use client";

/**
 * Las tres tablas del resumen de jornadas (`CtpResumenDeJornadasModal`):
 *
 * - **Por especie**: los días marcados juntos, especie y producto adentro.
 * - **Por día** (Brandon, 2026-09-23: *«el lunes tantas piezas, m³ y otros
 *   detalles, el martes lo mismo»*): un renglón por día.
 * - **Por día, especie y tipo** (*«detallado por tipo y especie, separado en
 *   cada fila»*): cada día con su total y debajo una fila por especie · tipo,
 *   con la especie escrita en CADA fila — así se copia a una planilla sin
 *   rellenar huecos.
 *
 * Las cifras vienen cerradas del servidor (`resumirJornadas`): el PT de cada
 * día es el de su casillero y lo demás son sumas. Acá sólo se dibuja.
 */

import type { ReactNode } from "react";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { formatNumber } from "@/lib/format";
import type { ResumenDeJornadas } from "@/lib/forestal/resumen-de-jornadas";
import { SIN_DUENO } from "@/lib/forestal/detalle-de-jornada";
import { nombreCortoDeDueno } from "@/lib/forestal/dueno-de-la-madera";

export type CorteResumen = "especie" | "dia" | "diaEspecie";

export const ETIQUETA_CORTE: Record<CorteResumen, string> = {
  especie: "Por especie",
  dia: "Por día",
  diaEspecie: "Por día, especie y tipo",
};

/* El corte de una celda del Libro. Venía en `px-2 py-1.5`: cuatro columnas de
   cifras pegadas al filo, que es justo lo que se lee como «apretado». */
export const CELDA = "px-3 py-2.5 text-sm";
export const CIFRA = `${CELDA} text-right font-mono tabular-nums`;
const CABECERA =
  "bg-[var(--surface-sunken)] text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] [&>th]:border-b [&>th]:border-[var(--rule-base)]";
const FILA_TOTAL = "border-t-2 border-[var(--rule-strong)] bg-primary/10 font-bold text-[var(--text-primary)]";

/** PT por pieza: cuánto rinde cada pieza en promedio. Sin piezas, no hay promedio. */
const ptPorPieza = (pt: number, piezas: number) => (piezas > 0 ? formatNumber(pt / piezas, 2) : "—");

/** El marco común: scroll propio y encabezado pegado (un mes son decenas de filas). */
function Marco({ titulo, cabecera, children }: { titulo: string; cabecera: ReactNode; children: ReactNode }) {
  return (
    <div className="max-h-[52vh] overflow-auto rounded-xl border border-[var(--rule-base)]">
      <table className="w-full min-w-[34rem] border-collapse">
        <caption className="sr-only">{titulo}</caption>
        <thead className="sticky top-0 z-[1]">
          <tr className={CABECERA}>{cabecera}</tr>
        </thead>
        {children}
      </table>
    </div>
  );
}

/** Los dueños de un día, en chico debajo del día. «Sin declarar» no se dice: es ruido. */
function DuenosDelDia({ duenos }: { duenos: readonly string[] }) {
  const conocidos = duenos.filter((x) => x !== SIN_DUENO);
  if (conocidos.length === 0) return null;
  return (
    <span className="block text-xs font-normal text-[var(--text-tertiary)]">
      {conocidos.map(nombreCortoDeDueno).join(" · ")}
    </span>
  );
}

/** Día con la primera letra en mayúscula: «Lunes 21/09». */
function Dia({ iso }: { iso: string }) {
  return <span className="inline-block whitespace-nowrap first-letter:uppercase">{etiquetaLarga(iso)}</span>;
}

// ── Por especie ─────────────────────────────────────────────────────────────

export function TablaPorEspecie({ datos }: { datos: ResumenDeJornadas }) {
  return (
    <Marco
      titulo="Por especie y producto, todos los días juntos"
      cabecera={
        <>
          <th className={CELDA}>Especie · producto</th>
          <th className={`${CELDA} text-right`}>Piezas</th>
          <th className={`${CELDA} text-right`}>m³</th>
          <th className={`${CELDA} text-right`}>PT</th>
        </>
      }
    >
      <tbody>
        {datos.porEspecie.map((e) => (
          <EspecieYProductos key={e.especie} especie={e} />
        ))}
      </tbody>
    </Marco>
  );
}

function EspecieYProductos({ especie }: { especie: ResumenDeJornadas["porEspecie"][number] }) {
  return (
    <>
      <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]/60">
        <td className={`${CELDA} font-bold text-[var(--text-primary)]`}>
          {especie.especie}{" "}
          <span className="font-normal text-[var(--text-tertiary)]">
            · {especie.corridas} corrida{especie.corridas === 1 ? "" : "s"}
          </span>
        </td>
        <td className={`${CIFRA} font-bold`}>{fmtPiezas(especie.piezas)}</td>
        <td className={`${CIFRA} font-bold`}>{fmtM3(especie.m3)}</td>
        <td className={`${CIFRA} font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]`}>{fmtPt(especie.pt)}</td>
      </tr>
      {especie.productos.map((p) => (
        <tr key={p.producto} className="border-t border-[var(--rule-soft)]">
          <td className={`${CELDA} pl-6 text-[var(--text-secondary)]`}>{p.producto}</td>
          <td className={CIFRA}>{fmtPiezas(p.piezas)}</td>
          <td className={CIFRA}>{fmtM3(p.m3)}</td>
          <td className={CIFRA}>{fmtPt(p.pt)}</td>
        </tr>
      ))}
    </>
  );
}

// ── Por día ─────────────────────────────────────────────────────────────────

export function TablaPorDia({ datos }: { datos: ResumenDeJornadas }) {
  const { totales } = datos;
  return (
    <Marco
      titulo="Un renglón por día"
      cabecera={
        <>
          <th className={CELDA}>Día</th>
          <th className={`${CELDA} text-right`}>Corridas</th>
          <th className={CELDA}>Especies</th>
          <th className={`${CELDA} text-right`}>Piezas</th>
          <th className={`${CELDA} text-right`}>m³</th>
          <th className={`${CELDA} text-right`}>PT</th>
          <th className={`${CELDA} whitespace-nowrap text-right`}>PT / pieza</th>
        </>
      }
    >
      <tbody>
        {datos.porDia.map((d) => (
          <tr key={d.dia} className="border-t border-[var(--rule-soft)]">
            <td className={`${CELDA} font-bold text-[var(--text-primary)]`}>
              <Dia iso={d.dia} />
              {/* De quién: con dos dueños el mismo día, lo que separa un registro del otro. */}
              <DuenosDelDia duenos={d.duenos} />
            </td>
            <td className={CIFRA}>{d.corridas}</td>
            <td className={`${CELDA} text-[var(--text-secondary)]`}>
              {d.especies.map((e) => e.especie).join(" · ")}
              {/* La línea (sierra, turno) es el «otro detalle» que separa dos
                  jornadas parecidas: sólo si el día la declaró. */}
              {d.lineas.length > 0 && (
                <span className="block text-xs text-[var(--text-tertiary)]">{d.lineas.join(" · ")}</span>
              )}
            </td>
            <td className={CIFRA}>{fmtPiezas(d.piezas)}</td>
            <td className={CIFRA}>{fmtM3(d.m3)}</td>
            <td className={`${CIFRA} font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]`}>{fmtPt(d.pt)}</td>
            <td className={`${CIFRA} text-[var(--text-secondary)]`}>{ptPorPieza(d.pt, d.piezas)}</td>
          </tr>
        ))}
      </tbody>
      {datos.porDia.length > 1 && (
        <tfoot>
          <tr className={FILA_TOTAL}>
            <td className={CELDA}>Total · {datos.porDia.length} días</td>
            <td className={CIFRA}>{totales.corridas}</td>
            <td className={CELDA} />
            <td className={CIFRA}>{fmtPiezas(totales.piezas)}</td>
            <td className={CIFRA}>{fmtM3(totales.m3)}</td>
            <td className={CIFRA}>{fmtPt(totales.pt)}</td>
            <td className={CIFRA}>{ptPorPieza(totales.pt, totales.piezas)}</td>
          </tr>
        </tfoot>
      )}
    </Marco>
  );
}

// ── Por día, especie y tipo ─────────────────────────────────────────────────

export function TablaPorDiaEspecieTipo({ datos }: { datos: ResumenDeJornadas }) {
  const { totales } = datos;
  return (
    <Marco
      titulo="Cada día con una fila por especie y tipo"
      cabecera={
        <>
          <th className={CELDA}>Especie</th>
          <th className={CELDA}>Tipo</th>
          <th className={`${CELDA} text-right`}>Piezas</th>
          <th className={`${CELDA} text-right`}>m³</th>
          <th className={`${CELDA} text-right`}>PT</th>
        </>
      }
    >
      {datos.porDia.map((d) => (
        /* Un `<tbody>` por día: la cabecera del día y sus filas van juntas, y
           un lector de pantalla las lee como un grupo. */
        <tbody key={d.dia}>
          <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]/60">
            <th scope="colgroup" colSpan={2} className={`${CELDA} text-left font-bold text-[var(--text-primary)]`}>
              <Dia iso={d.dia} />{" "}
              <span className="font-normal text-[var(--text-tertiary)]">
                · {d.corridas} corrida{d.corridas === 1 ? "" : "s"}
                {d.duenos.some((x) => x !== SIN_DUENO) &&
                  ` · ${d.duenos.filter((x) => x !== SIN_DUENO).map(nombreCortoDeDueno).join(" · ")}`}
              </span>
            </th>
            <td className={`${CIFRA} font-bold`}>{fmtPiezas(d.piezas)}</td>
            <td className={`${CIFRA} font-bold`}>{fmtM3(d.m3)}</td>
            <td className={`${CIFRA} font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]`}>{fmtPt(d.pt)}</td>
          </tr>
          {d.especies.flatMap((e) =>
            e.productos.map((p) => (
              <tr key={`${e.especie}|${p.producto}`} className="border-t border-[var(--rule-soft)]">
                <td className={`${CELDA} pl-6 text-[var(--text-primary)]`}>{e.especie}</td>
                <td className={`${CELDA} text-[var(--text-secondary)]`}>{p.producto}</td>
                <td className={CIFRA}>{fmtPiezas(p.piezas)}</td>
                <td className={CIFRA}>{fmtM3(p.m3)}</td>
                <td className={CIFRA}>{fmtPt(p.pt)}</td>
              </tr>
            )),
          )}
        </tbody>
      ))}
      {datos.porDia.length > 1 && (
        <tfoot>
          <tr className={FILA_TOTAL}>
            <td className={CELDA} colSpan={2}>
              Total · {datos.porDia.length} días
            </td>
            <td className={CIFRA}>{fmtPiezas(totales.piezas)}</td>
            <td className={CIFRA}>{fmtM3(totales.m3)}</td>
            <td className={CIFRA}>{fmtPt(totales.pt)}</td>
          </tr>
        </tfoot>
      )}
    </Marco>
  );
}
