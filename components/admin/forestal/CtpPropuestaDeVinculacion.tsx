"use client";

/**
 * Lo que los códigos del cubicado proponen, con los números a la vista.
 *
 * Es la MITAD DE ARRIBA del acto de vincular: dice qué trozas señalan los
 * códigos que se escribieron, de qué guía y de qué permiso son, cuánto suman y
 * si ese volumen alcanza para lo declarado — todo ANTES de confirmar nada.
 *
 * No tiene botón de guardar a propósito. La propuesta no vincula: deja las
 * trozas marcadas abajo y quien registra confirma. Un origen que nadie eligió
 * es un origen inventado, y el libro es lo que se presenta ante SERFOR.
 *
 * Los códigos que no cerraron se listan con su motivo: uno que no se encontró,
 * uno que lleva a dos trozas, uno de una guía que todavía no llegó. Esconderlos
 * dejaría una propuesta que parece completa y no lo es.
 */
import type { ReactNode } from "react";
import { AlertTriangle, Check, FileText, Sparkles } from "@buleje/design-system/icons";
import { BlockTitle } from "@buleje/design-system";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { CodigoLeido, PropuestaVinculacion } from "@/lib/forestal/propuesta-de-vinculacion";

/** El tono de cada código que no terminó en una troza propuesta. */
const TONO_CODIGO: Record<CodigoLeido["estado"], string> = {
  propuesto: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  "sin-codigo": "text-[var(--text-tertiary)]",
  ambiguo: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  "no-disponible": "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  "sin-recepcion": "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  desconocido: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
};

const CAJA_POR_VEREDICTO: Record<PropuestaVinculacion["alcance"]["veredicto"], string> = {
  alcanza: "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10",
  "sobre-el-tope": "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10",
  imposible: "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10",
  "sin-trozas": "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
  "sin-comparar": "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
};

const DATO = "font-mono tabular-nums text-[var(--text-primary)]";

export default function CtpPropuestaDeVinculacion({
  propuesta,
  cargando,
  error,
  armar,
}: {
  propuesta: PropuestaVinculacion | null;
  cargando: boolean;
  error: string | null;
  /**
   * El bloque que aparta la madera en un lote, cuando hace falta.
   *
   * Llega como nodo y no como datos porque escribir es cosa del modal —esta
   * pantalla sólo muestra— y porque va JUSTO acá: entre el volumen y el lote
   * elegido, que es el orden en que se lee la decisión.
   */
  armar?: ReactNode;
}) {
  if (cargando) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-2 text-sm text-[var(--text-tertiary)]">
        Buscando en el patio las trozas de los códigos anotados…
      </p>
    );
  }
  if (error) {
    return (
      <p className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
        {error} Elige la madera a mano abajo.
      </p>
    );
  }
  if (!propuesta) return null;

  const { alcance, origenes, trozas, codigos, lotes, otraEspecie } = propuesta;
  const noResueltos = codigos.filter((c) => c.estado !== "propuesto");

  return (
    <section
      aria-label="Propuesta a partir de los códigos del cubicado"
      className="space-y-2 rounded-xl border border-[var(--accent)]/40 bg-primary/5 p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <BlockTitle className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          Lo que proponen los códigos del cubicado
        </BlockTitle>
        <p className="text-xs text-[var(--text-tertiary)]">
          {codigos.length} {codigos.length === 1 ? "código anotado" : "códigos anotados"} ·{" "}
          <span className={DATO}>{trozas.length}</span> {trozas.length === 1 ? "troza" : "trozas"} ·{" "}
          <span className={DATO}>{fmtM3(propuesta.volumenM3)}</span> m³
        </p>
      </div>

      {/* Nada se escribe acá: esto se confirma abajo, troza por troza. */}
      <p className="text-xs text-[var(--text-tertiary)]">
        Es una propuesta: revisa las trozas abajo y confirma. Vincular la materia prima sigue siendo un acto tuyo.
      </p>

      {origenes.length > 0 && (
        <ul className="space-y-1">
          {origenes.map((o) => (
            <li
              key={`${o.guia}-${o.permiso}`}
              className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-sm"
            >
              <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <FileText className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden />
                Guía <b className="text-[var(--text-primary)]">{o.guia ?? "sin guía"}</b>
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  · permiso {o.permiso ?? "sin permiso"}
                </span>
              </span>
              <span className={DATO}>
                {o.trozas} {o.trozas === 1 ? "troza" : "trozas"} · {fmtM3(o.volumenM3)} m³
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* El volumen, ANTES de confirmar: qué hace falta para el tope del 56 %. */}
      <div className={`rounded-lg border px-2.5 py-2 text-sm ${CAJA_POR_VEREDICTO[alcance.veredicto]}`}>
        <p className="flex items-start gap-1.5 text-[var(--text-secondary)]">
          {alcance.veredicto === "alcanza" ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>
            {alcance.mensaje ??
              `La corrida declara ${fmtM3(alcance.producidoM3)} m³ y estas trozas suman ${fmtM3(alcance.propuestoM3)} m³` +
                (alcance.rendimientoPct != null ? `: rendimiento ${alcance.rendimientoPct} %.` : ".")}
          </span>
        </p>
        {alcance.propuestoM3 > 0 && (
          <p className="mt-1 pl-5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Declarado <span className={DATO}>{fmtM3(alcance.producidoM3)}</span> m³ · propuesto{" "}
            <span className={DATO}>{fmtM3(alcance.propuestoM3)}</span> m³ · hace falta{" "}
            <span className={DATO}>{fmtM3(alcance.necesarioM3)}</span> m³ de troza para no pasar del tope
          </p>
        )}
      </div>

      {/* El paso que falta —armar el lote— lo resuelve `CtpArmarLoteDesdePropuesta`,
          que el modal monta acá abajo: antes esto sólo decía «ármalo en Lotes y
          vuelve», y el operador tenía que rehacer a mano lo que la propuesta ya
          sabía. */}
      {armar}
      {lotes.length > 0 && (
        <p className="text-xs text-[var(--text-tertiary)]">
          Ya apartadas en{" "}
          {lotes.map((l) => (
            <b key={l.id} className="font-mono text-[var(--text-secondary)]">
              {l.code ?? l.id}{" "}
            </b>
          ))}
          — el lote queda elegido abajo.
        </p>
      )}

      {otraEspecie.length > 0 && (
        <p className="rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-2.5 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {otraEspecie.length} {otraEspecie.length === 1 ? "troza es" : "trozas son"} de otra especie que la que declara
          la corrida: <span className="font-mono">{otraEspecie.map((t) => `${t.codigo} (${t.especie})`).join(", ")}</span>.
        </p>
      )}

      {/* Lo que no cerró se dice: un código ignorado en silencio es un hueco. */}
      {noResueltos.length > 0 && (
        <div>
          <p className="mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            {noResueltos.length} {noResueltos.length === 1 ? "código sin resolver" : "códigos sin resolver"}
          </p>
          <ul className="space-y-1">
            {noResueltos.map((c, i) => (
              <li key={`${c.codigo}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className={`font-mono font-bold ${TONO_CODIGO[c.estado]}`}>{c.codigo}</span>
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{c.detalle}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
