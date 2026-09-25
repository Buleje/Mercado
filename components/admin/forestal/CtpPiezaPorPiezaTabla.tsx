"use client";

/**
 * «Pieza por pieza» del modal del día (`CtpDiaDeProduccionModal`): cada
 * paquete de cada corrida, con su escuadría en pulgadas y pies — como se cantó
 * en la sierra y como la muestra el cubicador.
 *
 * Una corrida es un grupo: su cabecera dice N.º, especie, dueño y lo que suma,
 * y lleva «Editar corrida» (ADR-401). Debajo, sus paquetes; la escuadría ES el
 * botón para corregirla (el mismo gesto que la celda MEDIDAS de «Productos
 * disponibles»). Va en la primera columna, con las piezas y el PT al lado: a
 * 400 px es lo que entra sin desplazar, y es lo que se compara con el parte.
 *
 * Lo que el asiento declara y ningún paquete detalla tiene su renglón: sin él,
 * la tabla sumaría menos que el día de arriba.
 */

import { AlertTriangle, Pencil, Ruler } from "@buleje/design-system/icons";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { ptDesdeM3 } from "@/lib/forestal/cubicacion";
import { nombreCortoDeDueno } from "@/lib/forestal/dueno-de-la-madera";
import { SIN_DUENO } from "@/lib/forestal/detalle-de-jornada";
import {
  cifrasDeLaCorrida,
  escuadriaEnPulgadas,
  fmtEscuadriaPulgadas,
  ptDelPaqueteDelDia,
  tipoDelPaquete,
  totalesDeLasCorridas,
  type CorridaDelDia,
  type PaqueteDelDia,
} from "@/lib/forestal/piezas-del-dia";
import { cuadreDeEscuadria } from "@/lib/forestal/escuadria-del-paquete";
import { CELDA, CIFRA, FILA_TOTAL, Marco } from "./ctp-resumen-jornadas-tablas";
import { PASTILLA } from "./ctp-celda-escuadria";

const COLUMNAS = 6;
const PT_ACENTO = "text-[var(--accent-ink)] dark:text-[var(--accent)]";
const BOTON_CORRIDA =
  "inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 dark:hover:text-[var(--accent)]";

interface Props {
  corridas: readonly CorridaDelDia[];
  /** Sin estos dos (un rol que no puede corregir), la tabla es de sólo lectura. */
  onEditarCorrida?: (c: CorridaDelDia) => void;
  onEditarEscuadria?: (c: CorridaDelDia, p: PaqueteDelDia) => void;
}

export default function CtpPiezaPorPiezaTabla({ corridas, onEditarCorrida, onEditarEscuadria }: Props) {
  const total = totalesDeLasCorridas(corridas);
  return (
    <Marco
      titulo="Cada paquete de cada corrida, con su escuadría"
      /* Cada columna a su ancho natural (y la tabla, al del modal si sobra): a
         400 px, con 34 rem fijos las columnas se estiraban y el PT quedaba
         fuera de la pantalla. Así entran escuadría, piezas y PT sin desplazar. */
      tablaClassName="w-full min-w-max"
      cabecera={
        <>
          <th className={`${CELDA} sm:whitespace-nowrap`}>
            Escuadría{" "}
            <span className="block font-normal normal-case tracking-normal sm:inline">(pulg × pulg × pies)</span>
          </th>
          <th className={`${CELDA} text-right`}>Piezas</th>
          <th className={`${CELDA} text-right`}>PT</th>
          <th className={`${CELDA} text-right`}>m³</th>
          <th className={CELDA}>Tipo</th>
          <th className={CELDA}>Código</th>
        </>
      }
    >
      {corridas.map((c) => (
        <GrupoDeCorrida
          key={c.id}
          corrida={c}
          onEditarCorrida={onEditarCorrida}
          onEditarEscuadria={onEditarEscuadria}
        />
      ))}
      <tfoot>
        <tr className={FILA_TOTAL}>
          <th scope="row" className={`${CELDA} text-left`}>
            Total · {total.paquetes} paquete{total.paquetes === 1 ? "" : "s"}
          </th>
          <td className={CIFRA}>{fmtPiezas(total.piezas)}</td>
          <td className={CIFRA}>{fmtPt(total.pt)}</td>
          <td className={CIFRA}>{fmtM3(total.m3)}</td>
          <td className={CELDA} colSpan={2}>
            {total.corridas} corrida{total.corridas === 1 ? "" : "s"}
          </td>
        </tr>
      </tfoot>
    </Marco>
  );
}

function GrupoDeCorrida({
  corrida: c,
  onEditarCorrida,
  onEditarEscuadria,
}: {
  corrida: CorridaDelDia;
  onEditarCorrida?: Props["onEditarCorrida"];
  onEditarEscuadria?: Props["onEditarEscuadria"];
}) {
  const x = cifrasDeLaCorrida(c);
  const dueno = c.dueno !== SIN_DUENO ? nombreCortoDeDueno(c.dueno) : null;
  return (
    /* Un `<tbody>` por corrida: su cabecera y sus paquetes se leen como un grupo. */
    <tbody>
      <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]/60">
        <th scope="rowgroup" colSpan={COLUMNAS} className={`${CELDA} text-left font-normal`}>
          {/* Con tope de ancho: sin él, esta fila de una sola celda ensanchaba la
              tabla entera en el celular y empujaba las cifras fuera de la vista. */}
          <span className="flex max-w-[calc(100vw-4rem)] flex-wrap items-center gap-x-2 gap-y-1">
            <b className="text-[var(--text-primary)]">
              N.º <span className="tabular-nums">{c.lineNo}</span> · {c.especie ?? "sin especie"}
            </b>
            {dueno && <span className="text-[var(--text-secondary)]">· {dueno}</span>}
            {onEditarCorrida && (
              <button
                type="button"
                onClick={() => onEditarCorrida(c)}
                aria-label={`Editar la corrida N.º ${c.lineNo}: especie, producto, cantidad, dueño`}
                className={BOTON_CORRIDA}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar corrida
              </button>
            )}
            {/* Lo que suma, en la MISMA línea (a la derecha; en el celular baja):
                con 91 paquetes un subtotal al pie quedaría a tres pantallas de
                su N.º, y en un renglón propio duplicaba el alto de cada corrida. */}
            <span className="text-xs tabular-nums text-[var(--text-tertiary)] max-sm:basis-full sm:ml-auto">
              {x.paquetes} paquete{x.paquetes === 1 ? "" : "s"} · {fmtPiezas(x.piezas)} pza ·{" "}
              <b className={PT_ACENTO}>{fmtPt(x.pt)} PT</b> · {fmtM3(x.m3)} m³
              {c.atadaPorque && ` · ${c.atadaPorque}`}
            </span>
          </span>
        </th>
      </tr>
      {c.paquetes.map((p) => (
        <FilaDePaquete key={p.id} paquete={p} onEditar={onEditarEscuadria ? () => onEditarEscuadria(c, p) : undefined} />
      ))}
      {x.sinPaqueteM3 > 0 && (
        <tr className="border-t border-[var(--rule-soft)] text-[var(--text-tertiary)]">
          <td className={`${CELDA} italic`}>
            {c.paquetes.length === 0 ? "Sin paquetes: lo declara el asiento" : "Sin paquete declarado"}
          </td>
          <td className={CIFRA}>{c.paquetes.length === 0 ? fmtPiezas(c.piezasAsiento) : "—"}</td>
          <td className={CIFRA}>{fmtPt(ptDesdeM3(x.sinPaqueteM3))}</td>
          <td className={CIFRA}>{fmtM3(x.sinPaqueteM3)}</td>
          <td className={CELDA} colSpan={2}>
            —
          </td>
        </tr>
      )}
    </tbody>
  );
}

function FilaDePaquete({ paquete: p, onEditar }: { paquete: PaqueteDelDia; onEditar?: () => void }) {
  const e = escuadriaEnPulgadas(p);
  /* Corregir la escuadría NO pisa el volumen declarado (es para cotejarlo):
     si ya no cuadran, la fila lo dice — como la celda de «Productos disponibles». */
  const cuadre = e ? cuadreDeEscuadria(p) : null;
  const pastilla = cuadre ? PASTILLA[cuadre.estado] : undefined;
  const medida = e ? (
    <span className="inline-flex items-center gap-1.5" title={pastilla ? cuadre?.texto : undefined}>
      <span className="font-mono tabular-nums text-[var(--text-primary)]">{fmtEscuadriaPulgadas(e)}</span>
      {pastilla && (
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-sans text-[length:var(--ts-2xs)] font-bold ${pastilla.clase}`}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden /> {pastilla.texto}
        </span>
      )}
    </span>
  ) : (
    <span className="font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">Sin escuadría</span>
  );
  return (
    <tr className="border-t border-[var(--rule-soft)]">
      <td className="whitespace-nowrap px-3 py-1 text-sm">
        {onEditar ? (
          <button
            type="button"
            onClick={onEditar}
            aria-label={`${e ? "Corregir" : "Cargar"} la escuadría del paquete ${p.codigo}`}
            title={e ? "Corregir la escuadría (en pulgadas y pies)" : "Cargar espesor, ancho y largo"}
            className="-ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            <Ruler className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            {medida}
          </button>
        ) : (
          medida
        )}
      </td>
      <td className={CIFRA}>{fmtPiezas(p.cantidad)}</td>
      <td className={`${CIFRA} font-bold ${PT_ACENTO}`}>{fmtPt(ptDelPaqueteDelDia(p))}</td>
      <td className={CIFRA}>{fmtM3(p.volumenM3)}</td>
      <td className={`${CELDA} whitespace-nowrap text-[var(--text-secondary)]`} title={p.producto ?? undefined}>
        {tipoDelPaquete(p)}
      </td>
      <td className={`${CELDA} whitespace-nowrap font-mono text-xs text-[var(--text-secondary)]`}>{p.codigo}</td>
    </tr>
  );
}
