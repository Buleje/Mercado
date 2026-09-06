"use client";

/**
 * El import de carpetas, visible desde CUALQUIER pestaña del panel.
 *
 * Mientras sube, se puede encoger a una pastilla que no molesta y seguir
 * trabajando; al terminar avisa y se descarta. Vive en los providers del admin,
 * así que sobrevive a cambiar de módulo (no a recargar la página).
 *
 * Va más arriba que el FAB de acciones rápidas (right-6 bottom-6) y que el
 * panel de subida del propio drive (bottom-24): los tres pueden coexistir.
 */

import { AlertCircle, Check, ChevronDown, Loader2, X as XIcon } from "@buleje/design-system/icons";
import { useImportCarpeta } from "@/contexts/import-carpeta-context";
import ImportarProgreso from "./ImportarProgreso";

export default function ImportacionFlotante() {
  const { estado, desplegado, setDesplegado, detener, descartar } = useImportCarpeta();
  if (!estado) return null;

  const subiendo = estado.fase === "subiendo";
  const pct = estado.bytesTotal === 0 ? 0 : Math.round((estado.bytesListos / estado.bytesTotal) * 100);

  // Encogido: una pastilla con el porcentaje. Lo justo para saber que sigue.
  if (!desplegado) {
    return (
      <button
        type="button"
        onClick={() => setDesplegado(true)}
        className="fixed bottom-44 right-4 z-50 flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] py-2 pl-3 pr-4 shadow-xl transition-colors hover:bg-[var(--surface-canvas)] sm:bottom-28"
      >
        {subiendo
          ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent-ink)] dark:text-[var(--accent)]" />
          : estado.fallados > 0 || estado.abortado
            ? <AlertCircle className="h-4 w-4 shrink-0 text-[var(--data-warning-500)]" />
            : <Check className="h-4 w-4 shrink-0 text-[var(--data-success-500)]" />}
        <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
          {subiendo ? `Importando ${pct}%` : "Importación lista"}
        </span>
        <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
          {estado.subidosOk}/{estado.total}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-44 right-4 z-50 w-[26rem] max-w-[calc(100vw-2rem)] rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-xl sm:bottom-28">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          Importando {estado.destinoNombre ? `en ${estado.destinoNombre}` : "en el drive"}
        </p>
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setDesplegado(false)}
            title="Encoger"
            aria-label="Encoger el panel de importación"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          {!subiendo && (
            <button
              type="button"
              onClick={descartar}
              title="Cerrar"
              aria-label="Cerrar el panel de importación"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </span>
      </div>

      <ImportarProgreso
        archivos={estado.filas}
        estados={estado.estados}
        motivos={estado.motivos}
        bytesListos={estado.bytesListos}
        bytesTotal={estado.bytesTotal}
        archivosListos={estado.subidosOk}
        carpetasListas={estado.carpetasListas}
        carpetasTotal={estado.carpetasTotal}
        segundos={estado.segundos}
        terminado={!subiendo}
        abortado={estado.abortado}
        paso={estado.paso}
      />

      {!subiendo && !estado.abortado && (
        estado.detenido ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)]">
            <AlertCircle className="h-4 w-4 shrink-0" /> Lo detuviste: subieron {estado.subidosOk} de {estado.total}.
            Reimportá la carpeta cuando quieras seguir.
          </p>
        ) : estado.fallados > 0 ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-sm font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <AlertCircle className="h-4 w-4 shrink-0" /> Subieron {estado.subidosOk} de {estado.total}.
            Volvé a importar la carpeta y se reintentan sólo los que faltan.
          </p>
        ) : (
          <p className="mt-3 flex items-center gap-2 rounded-xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] px-3 py-2 text-sm font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
            <Check className="h-4 w-4 shrink-0" /> {estado.subidosOk} archivo{estado.subidosOk === 1 ? "" : "s"} en el drive
            {estado.aCrear > 0 && ` · ${estado.aCrear} carpeta${estado.aCrear === 1 ? "" : "s"} nueva${estado.aCrear === 1 ? "" : "s"}`}.
            {estado.paraLaProxima > 0 && ` Quedan ${estado.paraLaProxima} para la próxima tanda.`}
          </p>
        )
      )}

      {estado.errores.length > 0 && (
        <ul className="mt-2 max-h-20 space-y-0.5 overflow-auto text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {estado.errores.slice(0, 6).map((e, i) => <li key={i} className="truncate">{e}</li>)}
        </ul>
      )}

      {subiendo && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={detener}
            disabled={estado.detenido}
            className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-bold text-[var(--data-error-700)] transition-colors hover:bg-[var(--data-error-500)]/10 disabled:opacity-50 dark:text-[var(--data-error-500)]"
          >
            {estado.detenido ? "Deteniendo…" : "Detener"}
          </button>
        </div>
      )}
    </div>
  );
}
