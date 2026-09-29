"use client";

/**
 * El pie fijo del alta: los avisos que piden leer antes de guardar, lo que
 * falta, y el botón que dice qué se registra («Registrar adelanto», «Registrar
 * abono», «Registrar lo recibido»). En el celular «La cuenta» queda arriba del
 * scroll: acá va la versión de una línea de cómo queda.
 */

import { AlertTriangle, CheckCircle2 } from "@buleje/design-system/icons";
import { requiereAtencion } from "@/lib/adelantos/limite-credito";
import type { AltaAdelanto } from "../hooks/use-alta-adelanto";
import { fmtMon } from "../shared";

export default function PieAlta({ alta, onClose }: { alta: AltaAdelanto; onClose: () => void }) {
  const { excedeTope, confirmandoTope, credito, err, hecho, saving, problema, persona, proyeccion, montoNum, moneda } = alta;
  const { camposPorReintentar, registrado } = alta;
  const etiqueta = saving
    ? "Guardando…"
    : camposPorReintentar
      ? "Reintentar los campos"
      : hecho
        ? "Listo"
        : confirmandoTope
          ? "Autorizar igual y registrar"
          : alta.def.boton;

  return (
    <div className="space-y-2.5">
      {excedeTope && !hecho && (
        <p
          className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
            confirmandoTope
              ? "bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)]"
              : "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)]"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <span className="hidden sm:inline">{requiereAtencion(credito) ? credito.aviso : ""}</span>
            <span className="sm:hidden">Pasa su tope de crédito.</span>
            {confirmandoTope && " Queda anotado que se autorizó por encima."}
          </span>
        </p>
      )}
      {hecho && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-[var(--data-success-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--data-success-ink)]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Quedó registrado. {hecho}</span>
        </p>
      )}
      {err && (!hecho || camposPorReintentar) && (
        <p role="alert" className="text-base font-semibold text-[var(--data-error-ink)]">
          {err}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* `basis-full` + `truncate` en el celular: una línea propia arriba de los
            botones. Con `flex-1` solo (base 0 %) se partía palabra por palabra
            en una columna de 60 px al lado de ellos. */}
        <p className="min-w-0 basis-full truncate text-sm font-medium text-[var(--text-secondary)] sm:basis-0 sm:flex-1 sm:whitespace-normal sm:text-base">
          {problema && !hecho && !registrado ? (
            <span className="text-[var(--text-tertiary)]">{problema}</span>
          ) : persona && montoNum > 0 ? (
            <span className="lg:hidden">
              <strong className="text-[var(--text-primary)]">{persona.nombre}</strong>
              {proyeccion.cifra === "te-debe" ? " · te debe " : " · le debes "}
              <strong className="tabular-nums text-[var(--text-primary)]">{fmtMon(Math.max(0, proyeccion.despues), moneda)}</strong>
            </span>
          ) : null}
        </p>
        <div className="flex shrink-0 gap-2">
          {!hecho && (
            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-xl px-5 text-base font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              {registrado ? "Cerrar" : "Cancelar"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void alta.submit()}
            disabled={saving || (!!problema && !hecho && !camposPorReintentar)}
            title="Ctrl + Enter"
            className={`h-12 rounded-xl px-6 text-base font-bold text-white shadow-[var(--shadow-sm)] transition-[filter,background-color] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${
              /* `--accent-dark`, no `bg-primary`: blanco sobre #00A0A0 da 3,21:1 (axe, 28-09). */
              confirmandoTope ? "bg-[var(--data-error-700)] hover:brightness-110" : "bg-[var(--accent-dark)] hover:brightness-110"
            }`}
          >
            {etiqueta}
          </button>
        </div>
      </div>
    </div>
  );
}
