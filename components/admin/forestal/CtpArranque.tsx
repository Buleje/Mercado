"use client";

/**
 * Los primeros pasos de un Libro de Operaciones CTP.
 *
 * El libro tiene doce pestañas pensadas para un centro que ya opera. Un CTP que
 * lo abre por primera vez las ve todas vacías y sin un orden — y el orden
 * importa, porque cada paso habilita al siguiente.
 *
 * Se apaga solo: cuando el libro dio la vuelta completa —de la guía de ingreso
 * a la de salida— esto deja de mostrarse. Una guía de primeros pasos que sigue
 * ahí cuando ya sabés operar es ruido, y el ruido permanente se aprende a
 * ignorar (por eso tampoco hay un «todo listo» verde que quede fijo).
 *
 * El orden y los estados los decide `arranque-del-libro.ts`, que es puro y
 * tiene sus tests. Acá sólo se pinta.
 */

import { useEffect, useState } from "react";
import { ArrowRight, Check, Circle, Sparkles } from "@buleje/design-system/icons";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { logger } from "@/lib/logger";
import {
  avanceDeArranque,
  hayQueGuiar,
  pasosDeArranque,
  type EstadoDelLibro,
  type PasoDeArranque,
} from "@/lib/forestal/arranque-del-libro";

export default function CtpArranque({ onIr }: { onIr?: (vista: string) => void }) {
  const [pasos, setPasos] = useState<PasoDeArranque[] | null>(null);
  const [estado, setEstado] = useState<EstadoDelLibro | null>(null);
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    let vivo = true;
    ctpGet<{ estado?: EstadoDelLibro }>("/api/admin/forestal/ctp?arranque=1", { ttlMs: 60_000 })
      .then((r) => {
        if (vivo && r.estado) {
          setEstado(r.estado);
          setPasos(pasosDeArranque(r.estado));
        }
      })
      .catch((err) => {
        /* Los primeros pasos son una ayuda, no el libro: si no se pueden leer,
           el centro sigue trabajando sin esto. */
        logger.warn("[ctp] no se pudo leer el arranque", { error: String(err).slice(0, 120) });
        if (vivo) setPasos([]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!pasos || pasos.length === 0 || !estado || !hayQueGuiar(pasos, estado) || oculto) return null;
  const { hechos, total } = avanceDeArranque(pasos);
  const ahora = pasos.find((p) => p.estado === "ahora");

  return (
    <section
      aria-label="Primeros pasos del libro"
      className="rounded-2xl border-2 border-[var(--accent)]/40 bg-primary/5 px-4 py-3.5"
    >
      <header className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
        <p className="text-sm font-bold text-[var(--text-primary)]">
          {hechos === 0 ? "Tu libro está recién abierto" : "Terminá de poner en marcha el libro"}
        </p>
        <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
          {hechos} de {total}
        </span>
        <button
          type="button"
          onClick={() => setOculto(true)}
          className="ml-auto text-xs font-medium text-[var(--text-tertiary)] underline underline-offset-2 hover:text-[var(--text-secondary)]"
        >
          Ocultar por ahora
        </button>
      </header>

      {ahora && (
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">Lo que sigue:</b> {ahora.porque}
        </p>
      )}

      <ol className="mt-3 space-y-1">
        {pasos.map((p) => {
          const esAhora = p.estado === "ahora";
          return (
            <li key={p.clave}>
              <button
                type="button"
                onClick={() => onIr?.(p.vista)}
                disabled={!onIr}
                className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                  esAhora
                    ? "bg-[var(--surface-raised)] ring-1 ring-[var(--accent)]"
                    : "hover:bg-[var(--surface-raised)]"
                } ${!onIr ? "cursor-default" : ""}`}
              >
                <span className="mt-0.5 shrink-0" aria-hidden>
                  {p.estado === "hecho" ? (
                    <Check className="h-4 w-4 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" />
                  ) : esAhora ? (
                    <ArrowRight className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" />
                  ) : (
                    <Circle className="h-4 w-4 text-[var(--text-tertiary)]" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm ${
                      p.estado === "hecho"
                        ? "text-[var(--text-tertiary)] line-through decoration-1"
                        : esAhora
                          ? "font-bold text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {p.titulo}
                    {p.estado === "opcional" && (
                      <span className="ml-1.5 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs font-normal text-[var(--text-tertiary)]">
                        si ya venías operando
                      </span>
                    )}
                  </span>
                  {p.detalle && p.estado !== "hecho" && (
                    <span className="block text-xs text-[var(--text-tertiary)]">{p.detalle}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
