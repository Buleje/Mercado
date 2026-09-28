"use client";

/**
 * Piezas chicas de la pestaña «Datos de la guía» (rediseño 2026-09-27).
 *
 * Brandon: «que sea más entendible y mejor compacto los campos y bloques». Tres
 * ideas, cada una en su pieza:
 *
 *   · lo que el sistema YA sabe (la Ficha del CTP) se lee como un resumen de
 *     una o dos líneas, no como cuatro cajas grises que parecen para tipear;
 *   · cada bloque dice en su cabecera si está completo o cuántos datos le
 *     faltan, y el casillero que falta se ve con borde coral;
 *   · un casillero que no corresponde en ESTA guía va punteado con «no aplica»
 *     adentro — el porqué pasa al ⓘ en vez de ocupar tres renglones abajo.
 */

import { useId } from "react";
import { AlertTriangle, Check } from "@buleje/design-system/icons";
import { faltantesGtf, type FaltanteGtf, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";

/**
 * Casillero obligatorio vacío. Sólo con el campo SIN foco: mientras se escribe
 * manda el turquesa del foco, y el coral vuelve si se deja vacío.
 */
export const CLASE_FALTA = "not-focus:border-[var(--data-warning-500)] not-focus:bg-[var(--data-warning-500)]/5";

/** Casillero que no aplica: punteado. Se combina con `placeholder="no aplica"`. */
export const CLASE_NO_APLICA = "border-dashed";

/**
 * Las barras de la libreta (`CtpParteBarra`) traen su propia caja —borde, fondo
 * y margen— pensada para ir sueltas en el formulario. En una cabecera sobran:
 * se apagan desde afuera, sin tocar el componente que usan otros modales.
 * Abierta la libreta, o con un aviso del padrón («Ese RUC no existe…»), la
 * barra pide el ancho entero de la fila —el contenedor Y la barra adentro: si
 * no, la lista se encoge al ancho de sus botones y los botones quedan
 * corridos al medio—. Va en un contenedor `flex flex-wrap`.
 */
export const CLASE_SIN_CAJA =
  "[&>div]:mb-0 [&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent [&>div]:p-0 has-[[aria-expanded=true]]:basis-full [&>div:has([aria-expanded=true])]:basis-full has-[>div_p]:basis-full [&>div:has(p)]:basis-full";

/** El casillero del formato oficial, como el chip de `Field`. */
export function Casillero({ n }: { n: number }) {
  return (
    <span
      title={`Casillero (${n}) del formato oficial LO-CTP`}
      aria-hidden="true"
      className="shrink-0 rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold tabular-nums text-[var(--text-tertiary)]"
    >
      {n}
    </span>
  );
}

/**
 * Qué le falta a cada bloque para poder imprimir la guía.
 *
 * Sale de `faltantesGtf` —la misma regla que el pie del modal— con UNA
 * diferencia: la fecha de inicio del traslado se toma de la emisión, que es lo
 * que se guarda al registrar (`fechaInicio || emision`). Sin eso, el bloque de
 * traslado pediría un casillero que esta pestaña no muestra.
 */
export function faltantesPorBloque(datos: GtfDatos, emision: string) {
  const f = faltantesGtf({ ...datos, traslado: { ...datos.traslado, fechaInicio: datos.traslado.fechaInicio || emision } });
  const de = (...s: FaltanteGtf["seccion"][]) => f.filter((x) => s.includes(x.seccion)).map((x) => x.campo);
  return {
    documento: emision.trim() ? [] : ["Fecha de emisión"],
    propietario: de("propietario"),
    destinatario: de("destinatario"),
    transporte: de("transportista", "vehiculo"),
    traslado: de("traslado", "titulos"),
  };
}

/** «Completo» o «Faltan N»: el estado del bloque de un vistazo. */
export function EstadoBloque({ faltan }: { faltan: readonly string[] }) {
  if (faltan.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--data-success-ink)]">
        <Check className="h-3.5 w-3.5" aria-hidden />
        Completo
      </span>
    );
  }
  return (
    <span
      title={`Falta: ${faltan.join(" · ")}`}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--text-primary)]"
    >
      <AlertTriangle className="h-3.5 w-3.5 text-[var(--data-warning-ink)]" aria-hidden />
      Falta{faltan.length === 1 ? "" : "n"} {faltan.length}
      <span className="sr-only">: {faltan.join(", ")}</span>
    </span>
  );
}

export interface DatoResumen {
  etiqueta: string;
  valor: string;
  mono?: boolean;
  /** Columnas de 4 que ocupa en escritorio (en el celular, 1 → media fila, 2+ → fila entera). */
  ancho?: 1 | 2 | 3 | 4;
  /** Qué hacer si está vacío, en pocas palabras («en la Ficha del CTP»). */
  falta?: string;
}

const ANCHO_RESUMEN: Record<NonNullable<DatoResumen["ancho"]>, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-2 sm:col-span-3",
  4: "col-span-2 sm:col-span-4",
};

/** Datos que el sistema ya sabe, en líneas de lectura: rótulo chico, dato fuerte. */
export function ResumenDatos({ datos }: { datos: readonly DatoResumen[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:col-span-12 sm:grid-cols-4">
      {datos.map((d) => (
        <div key={d.etiqueta} className={ANCHO_RESUMEN[d.ancho ?? 1]}>
          <dt className="text-xs font-medium text-[var(--text-tertiary)]">{d.etiqueta}</dt>
          {d.valor.trim() ? (
            <dd className={`break-words text-sm font-semibold text-[var(--text-primary)] ${d.mono ? "font-mono tabular-nums" : ""}`}>
              {d.valor}
            </dd>
          ) : (
            <dd className="flex items-start gap-1 text-sm font-medium text-[var(--data-warning-ink)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>Falta{d.falta ? ` · ${d.falta}` : ""}</span>
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/**
 * Un tramo con nombre dentro de un bloque (Transportista · Conductor ·
 * Vehículo). Cada uno trae su propia libreta al lado del nombre: así queda
 * claro qué completa cada botón.
 */
export function SubBloque({
  etiqueta,
  acciones,
  children,
}: {
  etiqueta: string;
  acciones?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:col-span-12 sm:grid-cols-12 [&:not(:first-child)]:mt-0.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-[var(--rule-soft)] [&:not(:first-child)]:pt-2.5"
    >
      <div className="flex min-h-9 flex-wrap items-center gap-2 sm:col-span-12">
        <span id={id} className="text-xs font-bold uppercase tracking-[var(--ls-wide)] text-[var(--text-secondary)]">
          {etiqueta}
        </span>
        {acciones && <div className={`ml-auto flex flex-wrap items-center gap-2 ${CLASE_SIN_CAJA}`}>{acciones}</div>}
      </div>
      {children}
    </div>
  );
}
