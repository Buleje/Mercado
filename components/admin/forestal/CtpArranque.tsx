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
 *
 * Una sola línea de 44 px (Brandon 17-10: «compactar… reducir espacios»):
 * «1 de 6 · Sigue: <paso> [Ir] [Ver todo] [×]». La tarjeta con la lista
 * entera medía 482 px a 1280 y 614 a 400, y empujaba el libro debajo del
 * primer pantallazo; la lista sigue a un clic («Ver todo»). La × se recuerda
 * por negocio en este navegador: antes volvía en cada carga.
 */

import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Circle, Sparkles, X } from "@buleje/design-system/icons";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { logger } from "@/lib/logger";
import { getActiveTenantSlug } from "@/lib/tenant-fetch";
import { button } from "@/components/ui-system/button-variants";
import {
  avanceDeArranque,
  hayQueGuiar,
  pasosDeArranque,
  type EstadoDelLibro,
  type PasoDeArranque,
} from "@/lib/forestal/arranque-del-libro";

/** Por negocio: el mismo navegador puede llevar el libro de dos CTP. */
function claveOculto(): string {
  try {
    return `ctp-arranque-oculto:${getActiveTenantSlug()}`;
  } catch {
    return "ctp-arranque-oculto"; /* almacenamiento bloqueado */
  }
}

function leerOculto(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(claveOculto()) === "1";
  } catch {
    return false; /* modo privado */
  }
}

/* 40 px (`md`) y no los 48 del panel: la franja entera mide 44. */
const IR = button({ variant: "primary", size: "md", className: "shrink-0 gap-1.5 px-4 max-sm:w-10 max-sm:px-0" });
const VER = button({ variant: "ghost", size: "md", className: "shrink-0 gap-1.5 px-3 max-sm:w-10 max-sm:px-0" });
const CERRAR = button({ variant: "ghost", size: "md", className: "w-10 shrink-0 px-0" });

export default function CtpArranque({ onIr }: { onIr?: (vista: string) => void }) {
  const [pasos, setPasos] = useState<PasoDeArranque[] | null>(null);
  const [estado, setEstado] = useState<EstadoDelLibro | null>(null);
  /* Se lee al montar: en el primer pintado `pasos` es null y no se dibuja
     nada, así que el servidor y el navegador coinciden igual. */
  const [oculto, setOculto] = useState(leerOculto);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    /* Oculto = ni se pregunta: un pedido menos al abrir el libro. */
    if (oculto) return;
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
  }, [oculto]);

  if (!pasos || pasos.length === 0 || !estado || !hayQueGuiar(pasos, estado) || oculto) return null;
  const { hechos, total } = avanceDeArranque(pasos);
  const ahora = pasos.find((p) => p.estado === "ahora");

  const ocultar = () => {
    setOculto(true);
    try {
      localStorage.setItem(claveOculto(), "1");
    } catch {
      /* cuota o modo privado: queda oculto hasta recargar */
    }
  };

  return (
    <section
      aria-label="Primeros pasos del libro"
      className="rounded-2xl border border-[var(--accent)]/40 bg-primary/5"
    >
      <div className="flex min-h-[42px] items-center gap-2 py-px pl-3 pr-1">
        <Sparkles
          className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          aria-hidden
        />
        <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
          {hechos} de {total}
        </span>
        <p
          className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]"
          title={ahora ? `${ahora.titulo} — ${ahora.porque}` : undefined}
        >
          {ahora ? (
            <>
              <b className="text-[var(--text-primary)] max-sm:sr-only">Sigue: </b>
              <span className="font-semibold text-[var(--text-primary)]">{ahora.titulo}</span>
            </>
          ) : (
            <b className="text-[var(--text-primary)]">
              {hechos === 0
                ? "Tu libro está recién abierto"
                : "Termina de poner en marcha el libro"}
            </b>
          )}
        </p>
        {ahora && onIr && (
          <button
            type="button"
            onClick={() => onIr(ahora.vista)}
            aria-label={`Ir a: ${ahora.titulo}`}
            className={IR}
          >
            <span className="max-sm:sr-only">Ir</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-label={abierto ? "Ocultar la lista de pasos" : "Ver todos los pasos"}
          className={VER}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`}
            aria-hidden
          />
          <span className="max-sm:sr-only">Ver todo</span>
        </button>
        <button
          type="button"
          onClick={ocultar}
          title="Ocultar los primeros pasos en este navegador"
          aria-label="Ocultar los primeros pasos"
          className={CERRAR}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {abierto && (
        <div className="border-t border-[var(--accent)]/20 px-3 pb-3 pt-2">
          {ahora && (
            <p className="text-sm text-[var(--text-secondary)]">
              <b className="text-[var(--text-primary)]">Lo que sigue:</b> {ahora.porque}
            </p>
          )}
          <ol className="mt-2 space-y-1">
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
                        <span className="block text-xs text-[var(--text-tertiary)]">
                          {p.detalle}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
