"use client";

/**
 * Una fila de la tabla del patio (`CtpTrozasIngresadas`): la misma sea la tabla
 * plana o el detalle de un grupo abierto. Salió a su archivo (ADR-431) para que
 * la tabla quede bajo las 300 líneas.
 *
 * Lo que antes vivía sólo en `title` —de dónde salió el dato, la fecha del
 * asiento contra la recepción— ahora va en texto: `title` no llega por teclado
 * ni en táctil.
 */

import { FileCheck, PenLine } from "@buleje/design-system/icons";
import { LABEL_BLOQUEO, motivoBloqueo, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { diasEnPatio, SEVERIDAD_TRAMO_DIAS, tramoDeDias } from "@/lib/forestal/patio-resumen";
import { fechaCorta } from "@/lib/forestal/plazo-de-apartado";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatDateShort, formatNumber } from "@/lib/format";

const fmtDia = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : formatDateShort(d, { soloFecha: true });
};

/** Las medidas como las canta el patio, en UN renglón: dos diámetros y el largo. */
function Medidas({ t }: { t: TrozaConsumible }) {
  const d1 = t.d1Cm != null ? Number(t.d1Cm).toFixed(0) : null;
  const d2 = t.d2Cm != null ? Number(t.d2Cm).toFixed(0) : null;
  const largo = t.largoM != null ? formatNumber(Number(t.largoM), 2) : null;
  if (!d1 && !d2 && !largo) return <>{t.dimensiones ?? "—"}</>;
  /* Las unidades (cm · m) van en la cabecera: repetidas en cada fila ensanchaban la tabla. */
  return (
    <span className="whitespace-nowrap">
      {d1 || d2 ? `Ø ${d1 ?? "—"}×${d2 ?? "—"}` : "Ø —"} · {largo ?? "—"}
    </span>
  );
}

/**
 * De dónde salió el dato de la troza. Es un DERIVADO: SERFOR cuando la guía
 * trae su N° de constancia del SNIFFS, «a mano» si no. Sólo el ícono (la
 * leyenda va en la cabecera de la tabla) y el texto para lectores de pantalla:
 * la palabra repetida fila tras fila empujaba la tabla fuera de la pantalla.
 */
function OrigenDelDato({ origen }: { origen?: "serfor" | "manual" }) {
  if (origen == null) return null;
  const deSerfor = origen === "serfor";
  return (
    <span
      className={`relative inline-grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[var(--text-primary)] ${
        deSerfor ? "bg-primary/10" : "bg-[var(--surface-sunken)]"
      }`}
    >
      {deSerfor ? <FileCheck className="h-4 w-4" aria-hidden /> : <PenLine className="h-4 w-4" aria-hidden />}
      <span className="sr-only">
        {deSerfor ? "Dato de SERFOR (la guía trae su constancia del SNIFFS)" : "Dato cargado a mano (la guía no trae constancia del SNIFFS)"}
      </span>
    </span>
  );
}

/** La leyenda del ícono que acompaña a cada guía (de dónde salió el dato). */
export function LeyendaOrigenDato() {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
      <span className="inline-flex items-center gap-1">
        <FileCheck className="h-4 w-4 text-[var(--text-primary)]" aria-hidden /> bajó de SERFOR (SNIFFS)
      </span>
      <span className="inline-flex items-center gap-1">
        <PenLine className="h-4 w-4 text-[var(--text-primary)]" aria-hidden /> cargada a mano
      </span>
    </span>
  );
}

/**
 * Días EN EL PATIO con la severidad en texto (la escala única, ADR-431), en un
 * renglón: «06/08 · 49 d · añeja». La fecha es la de la recepción; sin ella,
 * los días se cuentan desde el asiento de la guía y no se inventa una fecha.
 */
function EnElPatio({ t, ahora }: { t: TrozaConsumible; ahora: Date }) {
  const dias = diasEnPatio(t, ahora);
  const tramo = tramoDeDias(dias);
  if (dias == null || !tramo) return <span className="text-[var(--text-secondary)]">—</span>;
  const severidad = SEVERIDAD_TRAMO_DIAS[tramo];
  return (
    <span className="relative whitespace-nowrap">
      {/* La fecha de recepción sólo en pantalla muy ancha: a 1280 px con el menú
          abierto empujaba la última columna fuera de la tabla (medido). Para el
          lector de pantalla va siempre. */}
      {t.fechaRecepcion && (
        <span className="text-[var(--text-secondary)]">
          <span className="sr-only">recibida el </span>
          <span className="hidden 2xl:inline">{fechaCorta(t.fechaRecepcion)} · </span>
          <span className="sr-only 2xl:hidden">{fechaCorta(t.fechaRecepcion)}, </span>
        </span>
      )}
      <span className="font-semibold text-[var(--text-primary)]">
        {formatNumber(dias)} <span aria-hidden>d</span><span className="sr-only">días</span>
        {severidad !== "fresca" ? ` · ${severidad}` : ""}
      </span>
    </span>
  );
}

export interface FilaTrozaProps {
  t: TrozaConsumible;
  ahora: Date;
  seleccionable: boolean;
  elegida: boolean;
  onAlternar: (id: string) => void;
  /** El lote que se está cargando: sus piezas se ven y se eligen. */
  loteId?: string;
  onSacarDelLote?: (trozaId: string) => void;
}

export default function CtpTrozasIngresadasFila({
  t,
  ahora,
  seleccionable,
  elegida,
  onAlternar,
  loteId,
  onSacarDelLote,
}: FilaTrozaProps) {
  const bloqueo = motivoBloqueo(t);
  const enLote = Boolean(t.loteAserrioId);
  /** Apartada en el lote que se está cargando: ya cuenta. */
  const delLote = loteId != null && t.loteAserrioId === loteId;
  /* Las del lote SÍ se eligen: el operador decide cuáles entran hoy a la
     sierra. Las que deje sin tildar siguen apartadas. */
  const elegible = !bloqueo && (!enLote || delLote);
  const codigo = t.codigoPlanta ?? t.codificacion ?? "";
  return (
    <tr className={`${elegida ? "bg-primary/5" : ""} hover:bg-[var(--surface-sunken)]`}>
      {seleccionable && (
        <td className="px-3 py-2">
          <input
            type="checkbox"
            checked={elegida}
            disabled={!elegible}
            onChange={() => onAlternar(t.id)}
            aria-label={`Elegir la troza ${codigo}${delLote ? " (apartada en este lote: destíldala para dejarla para otra corrida)" : ""}`}
            className="h-6 w-6 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
          />
        </td>
      )}
      {/* La guía con de dónde salió su dato (SERFOR / a mano): era una columna
          propia que en el patio real decía lo mismo fila tras fila. */}
      <td className="whitespace-nowrap px-2! py-2 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="font-bold text-[var(--text-primary)]">{t.gtfNumber ?? "—"}</span>
          <OrigenDelDato origen={t.origenDato} />
        </span>
      </td>
      <td className="px-2! py-2 text-sm text-[var(--text-secondary)]">{t.permiso ?? "—"}</td>
      {/* Codificación del bosque y, si la tiene, el código de planta: dos
          columnas casi siempre vacías una de las dos (medido en main). */}
      <td className="whitespace-nowrap px-2! py-2 text-[var(--text-secondary)]">
        {t.codificacion ?? "—"}
        {t.codigoPlanta && <span className="text-sm"> · planta {t.codigoPlanta}</span>}
      </td>
      <td className="px-2! py-2 text-[var(--text-secondary)]">{t.especieComun ?? "—"}</td>
      <td className="px-2! py-2 text-sm text-[var(--text-secondary)]"><Medidas t={t} /></td>
      <td className="px-2! py-2 text-right font-bold tabular-nums text-[var(--text-primary)]">
        {t.volumenM3 != null ? fmtM3(Number(t.volumenM3)) : "—"}
      </td>
      <td className="px-2! py-2 text-sm">
        {delLote ? (
          <span className="inline-flex items-center gap-1">
            <span className="rounded-lg bg-primary/15 px-1.5 py-0.5 font-bold text-[var(--text-primary)]">en este lote</span>
            {onSacarDelLote && (
              <button
                type="button"
                onClick={() => onSacarDelLote(t.id)}
                aria-label={`Sacar la troza ${codigo} del lote y devolverla al patio`}
                className="inline-flex min-h-6 items-center rounded-lg px-1.5 text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
              >
                sacar
              </button>
            )}
          </span>
        ) : enLote ? (
          <span className="rounded-lg bg-primary/10 px-1.5 py-0.5 font-bold text-[var(--text-primary)]">
            {t.loteAserrioCode ?? "en un lote"}
          </span>
        ) : bloqueo ? (
          <span className="text-[var(--text-secondary)]">{LABEL_BLOQUEO[bloqueo]}</span>
        ) : (
          <span className="font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">Libre</span>
        )}
      </td>
      <td className="px-2! py-2 text-sm"><EnElPatio t={t} ahora={ahora} /></td>
      {/* Fecha del ASIENTO de la guía en el libro. No es la recepción física. */}
      <td className="whitespace-nowrap px-2! py-2 text-sm text-[var(--text-secondary)]">{fmtDia(t.fechaIngreso)}</td>
    </tr>
  );
}
