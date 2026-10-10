"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2 } from "@buleje/design-system/icons";
import type { AprobacionPendiente, ResolverAprobacion } from "./tipos";

/**
 * La tarjeta «¿Confirmas?» de una acción que va a tocar datos.
 *
 * El asistente NUNCA escribe solo: el servidor guarda el pedido con su payload
 * y hasta que no se aprieta Confirmar no pasa nada. Se muestra el payload
 * completo a propósito —qué producto, qué número, con qué motivo— porque una
 * confirmación a ciegas no es una confirmación.
 */
export function TarjetasDeAprobacion({
  aprobaciones,
  onResolver,
}: {
  aprobaciones?: AprobacionPendiente[];
  onResolver: ResolverAprobacion;
}) {
  const [enCurso, setEnCurso] = useState<string | null>(null);
  if (!aprobaciones || aprobaciones.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {aprobaciones.map((a) => {
        if (a.estado === "hecha") {
          return (
            <div
              key={a.id}
              className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 text-sm text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <strong>Hecho.</strong> {a.detalle}
              </span>
            </div>
          );
        }
        if (a.estado === "cancelada" || a.estado === "error") {
          const malo = a.estado === "error";
          return (
            <div
              key={a.id}
              className={`flex items-start gap-2 rounded-xl border-2 p-3 text-sm ${
                malo
                  ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
              }`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {malo ? (
                  <>
                    <strong>No se pudo:</strong> {a.detalle}
                  </>
                ) : (
                  "Cancelado. No se tocó nada."
                )}
              </span>
            </div>
          );
        }
        return (
          <div
            key={a.id}
            className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-4 dark:bg-[var(--data-warning-500)]/12"
          >
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              {a.titulo} — esto cambia tus datos
            </p>
            {a.resumen && (
              <p className="mt-1.5 text-sm font-medium text-[var(--text-primary)]">{a.resumen}</p>
            )}
            <dl className="mt-2 grid gap-1 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
              {Object.entries(a.payload).map(([k, v]) => (
                <div key={k} className="flex gap-1.5">
                  <dt className="font-semibold text-[var(--text-tertiary)]">{k}:</dt>
                  <dd className="min-w-0 break-words text-[var(--text-primary)]">{String(v)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={enCurso === a.id}
                onClick={() => {
                  setEnCurso(a.id);
                  onResolver(a.id, "approve");
                }}
                className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {enCurso === a.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Confirmar
              </button>
              <button
                type="button"
                disabled={enCurso === a.id}
                onClick={() => {
                  setEnCurso(a.id);
                  onResolver(a.id, "reject");
                }}
                className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
