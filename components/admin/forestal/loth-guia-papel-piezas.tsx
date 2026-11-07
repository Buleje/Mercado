"use client";

/**
 * Piezas de «Datos de la guía» del Libro TH con la cara del talonario
 * (Brandon 16-10-2026: «que se parezca lo más posible a esos formatos que te
 * envié, con ese color de texto, tamaños, formatos»). Sólo las usa el despacho
 * con guía del Libro TH: la guía del CTP conserva su formulario.
 *
 *   · `CLASE_PAPEL_FORM` — tiñe con la tinta del papel el borde y el foco de
 *     TODAS las cajas de adentro (las de los bloques compartidos incluidas) sin
 *     tocar esos bloques. `(0,1,1)` le gana a `border-[var(--rule-base)]` y el
 *     foco `(0,2,1)` a `focus:border-[var(--accent)]`; el ámbar de «falta»
 *     (`not-focus:`, `(0,2,0)`) sigue ganando. El modal va en un portal fuera de
 *     `[data-admin-shell]`, así que el `!important` de `rule-base` en oscuro de
 *     globals.css no lo alcanza.
 *   · `DatoDelPapel` — un casillero que no se tipea (sale del plan o la
 *     carátula): el valor sobre el renglón punteado, o «Falta · dónde».
 *   · `encabezadoDelDespacho` — lo que imprime la imprenta arriba del (1).
 */

import { CASILLEROS_GTF_2024 } from "@/lib/forestal/ctp-gtf-formato";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { Field, type CampoSpan } from "./ctp-shared";

export const CLASE_PAPEL_FORM =
  "[&_:is(input,select,textarea)]:border-[var(--gtf-linea)] [&_:is(input,select,textarea):focus]:border-[var(--gtf-tinta)] [&_:is(input,select,textarea):focus]:ring-[var(--gtf-franja)]";

/** El rótulo del formato 2024 del casillero `n` («21» → «Destinatario»). */
export function rotuloGtf2024(n: string): string {
  return CASILLEROS_GTF_2024.find((c) => c.n === n)?.rotulo ?? "";
}

/** Un casillero de sólo lectura con la forma de un campo: rótulo en tinta y el dato sobre el punteado. */
export function DatoDelPapel({
  label,
  casillero,
  valor,
  falta,
  span,
  mono = false,
}: {
  label: string;
  casillero?: string;
  valor: string | null | undefined;
  /** Dónde se carga si no está («en el plan de manejo»). */
  falta?: string;
  span?: CampoSpan;
  mono?: boolean;
}) {
  const hay = Boolean(valor?.trim());
  return (
    <Field span={span} label={label} casillero={casillero}>
      <div
        className="flex h-11 min-w-0 items-center border-b border-dotted border-[var(--gtf-linea)] px-1 text-base font-medium text-[var(--text-primary)]"
      >
        {hay ? (
          <span className={`truncate ${mono ? "font-mono" : ""}`} title={valor ?? undefined}>{valor}</span>
        ) : (
          <span className="text-sm font-semibold text-[var(--data-warning-ink)]">Falta{falta ? ` · ${falta}` : ""}</span>
        )}
      </div>
    </Field>
  );
}

/**
 * La cabecera de la imprenta: el titular del talonario, su RUC, el título
 * habilitante y la ubicación del título; a la derecha la serie y el N° de la
 * guía tal como se arman en «(1) N° de GTF».
 */
export function encabezadoDelDespacho(g: DespachoGuiaLoth) {
  const id = g.identidad;
  const guia = g.datos.guia;
  const partes = /^(.+)-(\d+)$/.exec(g.gtfNumber.trim());
  const ubicacion = [guia.distrito, guia.provincia, guia.departamento].filter((x) => x?.trim()).join(" - ");
  return {
    titular: id?.titular || g.datos.propietario.nombre || null,
    ruc: id?.docTipo === "RUC" && id.docNumero ? id.docNumero : null,
    titulo: g.datos.titulos[0] || id?.tituloHabilitante || null,
    ubicacion: ubicacion || null,
    serie: partes ? partes[1] : g.numero.serie || null,
    numero: partes ? partes[2] : null,
  };
}
