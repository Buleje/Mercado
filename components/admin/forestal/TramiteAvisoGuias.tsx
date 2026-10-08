"use client";

/**
 * El aviso arriba del formulario cuando Trámites se abrió con guías elegidas en
 * la vista GTF del Libro TH o en «Guías emitidas» del CTP: cuántas se trajeron, qué hay que mirar antes de
 * presentar (un dato derivado, una anulada que también está emitida o que
 * anuló «Deshacer la importación») y, si se dejó afuera alguna de ésas, el
 * botón para incluirla igual (suma la fila sin rearmar el formulario).
 *
 * Un oficio por permiso (Brandon 08-10): con guías de 2+ permisos, un botón
 * por permiso arma SU oficio con sólo sus guías; las de otro permiso quedan
 * fuera con «Incluirlas igual».
 */

import { AlertTriangle, Loader2, Truck, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { contarGuias } from "@/lib/forestal/tramites-desde-guias";
import { deLosLibros, type TramiteDesdeGuias } from "./hooks/use-tramite-desde-guias";

const CAJA = "flex items-start gap-3 rounded-2xl border-2 p-4 text-sm";
const BOTON =
  "inline-flex h-10 items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]";
/* El oficio que está abierto: marcado, no apagado (el `button[disabled]` del panel lo deja al 60 % y no se lee). */
const BOTON_ACTUAL =
  "inline-flex h-10 cursor-default items-center rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] px-3 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]";

export default function TramiteAvisoGuias({ d }: { d: TramiteDesdeGuias }) {
  if (!d.pedido) return null;
  if (d.cargando) {
    return (
      <div className={`${CAJA} border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]`} role="status">
        <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" aria-hidden />
        Trayendo {d.pedido.ids.length === 1 ? "la guía elegida" : `las ${d.pedido.ids.length} guías elegidas`} {deLosLibros(d.libros)}…
      </div>
    );
  }
  const noSirve = !d.error && d.guias.length > 0 && !d.resultado ? "Las guías elegidas ya no sirven para este formato (cambiaron en el libro): vuelve a elegirlas." : null;
  const error = d.error ?? noSirve ?? (d.guias.length === 0 ? "Ninguna de las guías elegidas sigue en el libro." : null);
  if (error) {
    return (
      <div className={`${CAJA} border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]`} role="alert">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <span className="flex-1">{error}</span>
        <BotonCerrar onClick={d.descartar} />
      </div>
    );
  }
  if (!d.resultado) return null;

  /* Guías, no líneas: una GTF del CTP con dos líneas de despacho es UNA guía. Las de otro permiso no cuentan. */
  const permisos = d.resultado.permisos ?? [];
  const fuera = d.resultado.fueraDePermiso ?? [];
  const n = contarGuias(fuera.length ? d.guias.filter((g) => !fuera.includes(g.gtfNumber)) : d.guias);
  const avisos = d.faltan > 0 ? [...d.resultado.avisos, `${d.faltan} de las elegidas ya no están en el libro (se borraron): no se trajeron.`] : d.resultado.avisos;
  return (
    <div className={`${CAJA} border-[var(--data-info-500)]/50 bg-[var(--data-info-500)]/8 text-[var(--text-primary)]`} role="status">
      <Truck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex items-center gap-1.5 font-bold">
          Llenado con {n === 1 ? "1 guía" : `${n} guías`} {deLosLibros(d.libros)}
          {d.permiso && permisos.length > 1 ? ` · oficio del ${d.permiso}` : ""}
          <InfoTip
            title="Datos traídos de las guías"
            what="N°, fechas, permiso, volumen y lista de trozas salen de las guías que elegiste en el libro (vista GTF del Libro TH o Guías emitidas del CTP)."
            affects="Todo se puede corregir en el formulario antes de guardar."
          />
        </p>
        {avisos.length > 0 && (
          <ul className="space-y-1 text-[var(--data-warning-ink)]">
            {avisos.map((a) => (
              <li key={a} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {d.resultado.reemitidasExcluidas.length > 0 && (
            <button type="button" onClick={d.incluirReemitidas} className={BOTON}>
              Incluirla igual como anulada
            </button>
          )}
          {fuera.length > 0 && (
            <button type="button" onClick={d.incluirOtrosPermisos} className={BOTON}>
              Incluir{fuera.length === 1 ? "la" : "las"} igual en este oficio
            </button>
          )}
        </div>
        {permisos.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="flex items-center gap-1.5 font-semibold">
              Un oficio por permiso:
              <InfoTip
                title="Un oficio por permiso"
                what="Cada relación va a nombre del titular de UN permiso. Elige el permiso y se arma su oficio sólo con sus guías."
                affects="Arma uno, guárdalo o imprímelo, y vuelve acá para el siguiente."
              />
            </span>
            {permisos.map((p) => (
              <button
                key={p.clave}
                type="button"
                aria-pressed={p.codigo === d.permiso}
                onClick={() => p.codigo !== d.permiso && d.elegirPermiso(p.codigo)}
                className={`${p.codigo === d.permiso ? BOTON_ACTUAL : BOTON} font-mono`}
              >
                {p.codigo} · {p.guias === 1 ? "1 guía" : `${p.guias} guías`}
              </button>
            ))}
          </div>
        )}
      </div>
      <BotonCerrar onClick={d.descartar} />
    </div>
  );
}

function BotonCerrar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cerrar el aviso"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}
