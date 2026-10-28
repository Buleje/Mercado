/**
 * La franja de estado de la producción: qué entró, qué se declaró, cuánto
 * queda hasta el tope y con qué rendimiento. En «Piezas» y en «Revisar» va
 * debajo de la barra de pasos y, al bajar, se pega arriba encima de ella (el
 * `sticky` lo pone el modal; movida tal cual desde
 * `CtpRegistrarProduccionModal.tsx`, 28-10).
 */
import { AlertTriangle, Gauge } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { RENDIMIENTO_TOPE_PCT } from "@/lib/forestal/produccion-paquetes";
import type { RegistrarProduccion } from "./use-registrar-produccion";
import type { MaterialAConsumir } from "./tipos";

export default function FranjaDeProduccion({
  r,
  material,
}: {
  r: RegistrarProduccion;
  material: MaterialAConsumir;
}) {
  const { margen, acumulado, previo, totales, rendimientoPct, veredicto, tope } = r;
  return (
    <>
      {/**
       * La FRANJA DE ESTADO: el único renglón que gobierna la tarea.
       *
       * Antes esto vivía adentro del bloque «Material», en una columna
       * lateral: el dato que decide si entra otro paquete estaba enterrado
       * al costado, y el rendimiento se repetía en tres lugares distintos.
       * Acá va a lo ancho, arriba de todo y pegado al scroll — se lee la
       * cuenta completa de izquierda a derecha: qué entró, qué se declaró,
       * cuánto queda.
       */}
      <div
        className={`rounded-xl border-2 px-3 py-2 ${
          margen > 0
            ? "border-[var(--rule-base)] bg-[var(--surface-raised)]"
            : "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10"
        }`}
      >
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          <span className="text-[var(--text-secondary)]">
            Entró{" "}
            <b className="font-mono tabular-nums text-[var(--text-primary)]">
              {fmtM3(material.volumenM3)} m³
            </b>
          </span>
          <span aria-hidden className="text-[var(--text-tertiary)]">
            →
          </span>
          <span className="text-[var(--text-secondary)]">
            Declarado{" "}
            <b className="font-mono text-base tabular-nums text-[var(--text-primary)]">
              {fmtM3(acumulado)} m³
            </b>
            {previo > 0 && (
              <span className="ml-1 text-xs text-[var(--text-tertiary)]">
                ({fmtM3(previo)} de antes + {fmtM3(totales.volumen)} ahora)
              </span>
            )}
          </span>
          <span
            className={`font-bold ${
              margen > 0
                ? "text-[var(--text-secondary)]"
                : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
            }`}
          >
            {margen > 0 ? (
              <>
                Quedan <b className="font-mono text-base tabular-nums">{fmtM3(margen)} m³</b>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> Sin margen: saca
                volumen para guardar
              </span>
            )}
          </span>
          {/* El rendimiento, UNA sola vez en todo el modal. */}
          <span className="ml-auto flex items-center gap-1.5">
            <Gauge className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            <b className="font-mono text-base tabular-nums text-[var(--text-primary)]">
              {rendimientoPct != null ? `${rendimientoPct} %` : "—"}
            </b>
            <span className="text-xs text-[var(--text-tertiary)]">{veredicto.texto}</span>
          </span>
        </div>
        {tope > 0 && (
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={tope}
            aria-valuenow={Math.min(acumulado, tope)}
            aria-label={`Declarado ${fmtM3(acumulado)} de ${fmtM3(tope)} m³ que permite el tope`}
          >
            <div
              className={`h-full rounded-full transition-[width] ${
                margen > 0 ? "bg-[var(--accent)]" : "bg-[var(--data-error-500)]"
              }`}
              style={{ width: `${Math.min(100, (acumulado / tope) * 100)}%` }}
            />
          </div>
        )}
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Tope de rendimiento {RENDIMIENTO_TOPE_PCT} % · máximo declarable{" "}
          <b className="font-mono tabular-nums text-[var(--text-secondary)]">{fmtM3(tope)} m³</b>
        </p>
      </div>
    </>
  );
}
