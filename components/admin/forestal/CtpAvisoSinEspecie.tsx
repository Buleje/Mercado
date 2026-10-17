"use client";

/**
 * Lo cubicado que no tiene especie NO se puede declarar (ADR-429).
 *
 * El Libro declara una especie por asiento, y así quedó la única producción
 * sin lote real del tenant: N.º 28 del 10/09, seis paquetes, sin especie y sin
 * permiso (ADR-417). Se dice cuánto falta y cómo ponerla: en la columna
 * «Especie» de lo cubicado —donde vive—, o acá mismo, sólo para lo que no la
 * tiene. Lo que ya tiene especie nunca se pisa: eso era lo que perdía la real.
 */
import { AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtPiezas } from "@/lib/forestal/cubicacion-formato";

export default function CtpAvisoSinEspecie({
  piezas,
  medidas,
  especies,
  onElegir,
}: {
  piezas: number;
  medidas: number;
  /** Lo cubicado, el patio y las de fábrica: la grafía que el Libro ya usa. */
  especies: readonly string[];
  onElegir: (nombre: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2.5">
      <AlertTriangle
        className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
        aria-hidden
      />
      {/* El `role="alert"` va en el texto, no en la caja: con el selector adentro,
          el lector anunciaba las catorce especies de la lista como parte del aviso. */}
      <div role="alert" className="flex min-w-0 flex-1 basis-[16rem] items-start gap-1.5 text-sm text-[var(--text-primary)]">
        <p className="font-bold">
          {piezas === 1 ? "1 pieza" : `${fmtPiezas(piezas)} piezas`} ({medidas}{" "}
          {medidas === 1 ? "medida" : "medidas"}) sin especie: así no se puede registrar.
        </p>
        <InfoTip
          title="Piezas sin especie"
          what="Vuelve a cubicar y pónsela en la columna Especie de la tabla."
          affects="O elige acá la especie para esas piezas: las que ya tienen especie no cambian."
        />
      </div>
      <select
        value=""
        onChange={(e) => e.target.value && onElegir(e.target.value)}
        aria-label="Especie para las piezas que no tienen"
        className="h-11 min-w-0 grow basis-[12rem] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] sm:grow-0"
      >
        <option value="">Ponles especie…</option>
        {especies.map((nombre) => (
          <option key={nombre} value={nombre}>
            {nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Ya se le puso especie a lo que no tenía: se dice cuál, y se puede deshacer. */
export function AvisoEspeciePuesta({
  especie,
  onDeshacer,
}: {
  especie: string;
  onDeshacer: () => void;
}) {
  return (
    <p className="mb-4 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
      Lo que no tenía especie se declara como{" "}
      <b className="text-[var(--text-primary)]">{especie}</b>.{" "}
      <button
        type="button"
        onClick={onDeshacer}
        className="font-semibold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]"
      >
        Deshacer
      </button>
    </p>
  );
}
