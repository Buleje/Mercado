"use client";

/**
 * Qué le falta a este ingreso para el LO-CTP, en un solo lugar.
 *
 * El modal ya decía qué falta, pero repartido: cada bloque cierra con su propia
 * línea "Sin registrar: Serie · Distrito · Humedad…". Con quince campos vacíos
 * —lo normal en un ingreso recién cargado— eso son cinco listas separadas, y
 * ninguna distingue lo que IMPIDE presentar el libro de lo que es complemento.
 * La tabla, mientras tanto, decía "faltan 2 p/ SERFOR": el mismo ingreso
 * contestando 2 y 15 según dónde se lo mire.
 *
 * Acá manda la MISMA fuente que la tabla —`faltantesIngreso()`, los casilleros
 * del formato oficial— y se separa en dos:
 *
 *   · obligatorios → bloquean. Van arriba, con el número de casillero, porque
 *     es lo que el fiscalizador busca con el dedo.
 *   · opcionales → se nombran, sin alarma. Un ingreso sin observaciones está
 *     bien; teñirlo de rojo enseña a rellenar por rellenar.
 *
 * No dice "listo para presentar": los faltantes son de ESTA fila. El libro se
 * presenta completo o no, y eso lo juzga el cierre de período.
 */

import { AlertTriangle, CheckCircle2, Pencil } from "@buleje/design-system/icons";
import { faltantesIngresoPorTipo, type CampoFaltante } from "@/lib/forestal/loctp-campos";

/** Un casillero por línea, ordenado por su número en el formato. */
function Lista({ campos }: { campos: CampoFaltante[] }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
      {[...campos]
        .sort((a, b) => a.col - b.col)
        .map((c) => (
          <li key={c.col} className="text-sm">
            <span className="font-mono font-bold">({c.col})</span> {c.label}
          </li>
        ))}
    </ul>
  );
}

export default function CtpIngresoCompletitud({
  entry,
  onCompletar,
}: {
  /** La fila del ingreso tal cual llega del listado. */
  entry: Record<string, unknown>;
  /** Abre el editor. Sin esto el panel informa pero no resuelve. */
  onCompletar?: () => void;
}) {
  const { obligatorios, opcionales } = faltantesIngresoPorTipo(entry);

  if (obligatorios.length === 0 && opcionales.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] px-4 py-3 text-base font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/10 dark:text-[var(--data-success-500)]">
        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
        Los 13 casilleros del formato están completos.
      </p>
    );
  }

  const bloquea = obligatorios.length > 0;
  return (
    <section
      className={
        bloquea
          ? "rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 dark:bg-[var(--data-warning-500)]/10"
          : "rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {bloquea ? (
            <>
              <p className="flex items-center gap-2 text-base font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
                {obligatorios.length === 1
                  ? "Falta 1 casillero obligatorio del formato"
                  : `Faltan ${obligatorios.length} casilleros obligatorios del formato`}
              </p>
              <div className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                <Lista campos={obligatorios} />
              </div>
            </>
          ) : (
            <p className="text-base font-bold text-[var(--text-primary)]">
              Los casilleros obligatorios están completos.
            </p>
          )}

          {opcionales.length > 0 && (
            <div className="mt-2 text-[var(--text-secondary)]">
              <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                Complementarios ({opcionales.length}) — no impiden presentar
              </p>
              <Lista campos={opcionales} />
            </div>
          )}
        </div>

        {onCompletar && (
          <button
            type="button"
            onClick={onCompletar}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-5 text-base font-bold text-white transition hover:brightness-110"
          >
            <Pencil className="h-4 w-4" aria-hidden /> Completar
          </button>
        )}
      </div>
    </section>
  );
}
