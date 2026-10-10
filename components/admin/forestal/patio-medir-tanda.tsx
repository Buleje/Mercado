"use client";

/**
 * Lo medido en esta tanda de «Medir escaneando»: cada troza con sus tres
 * medidas y su PT, lo último arriba, y el total. Tocar una la vuelve a abrir
 * para corregirla. Separada de `PatioMedir` para que la pantalla quede en su
 * flujo.
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, RotateCcw, WifiOff } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fmtPt } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { resumenDeTanda, type EstadoMedida, type MedidaDeLaTanda } from "@/lib/forestal/medir-patio";

const CHIP: Record<EstadoMedida, { texto: string; clase: string }> = {
  guardada: {
    texto: "Guardada",
    clase: "bg-[var(--data-success-500)]/15 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]",
  },
  "en-equipo": {
    texto: "En la tablet",
    clase: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  },
  "con-aviso": {
    texto: "Con aviso",
    clase: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  },
  borrada: {
    texto: "Borrada",
    clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  },
  rechazada: {
    texto: "No se guardó",
    clase: "bg-[var(--data-error-500)]/15 text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]",
  },
};

const medidaTexto = (v: number | null, unidad: string) => (v == null ? "—" : `${formatNumber(v)}${unidad}`);

export default function TandaMedida({
  tanda,
  onElegir,
  onVaciar,
}: {
  tanda: readonly MedidaDeLaTanda[];
  onElegir: (id: string) => void;
  onVaciar: () => void;
}) {
  const [vaciando, setVaciando] = useState(false);
  const r = resumenDeTanda(tanda);

  return (
    <section className="space-y-2" aria-label="Lo medido en esta tanda" data-tanda-medida>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <CardTitle as="h2" className="text-sm font-bold text-[var(--text-primary)]">
          Medidas de esta tanda
        </CardTitle>
        <span className="text-base font-bold tabular-nums text-[var(--text-primary)]" data-total-tanda>
          {r.trozas} troza{r.trozas === 1 ? "" : "s"} · {fmtPt(r.pt)} PT
        </span>
      </div>

      {r.enEquipo > 0 && (
        <p className="flex items-start gap-2 text-base font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          {r.enEquipo === 1 ? "1 está" : `${r.enEquipo} están`} en esta tablet: se suben solas al volver la señal.
        </p>
      )}
      {r.rechazadas > 0 && (
        <p
          className="flex items-start gap-2 text-base font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]"
          data-tanda-rechazadas
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          {r.rechazadas === 1
            ? "1 no se guardó en el libro: tócala para ver por qué y reenviarla."
            : `${r.rechazadas} no se guardaron en el libro: tócalas para ver por qué y reenviarlas.`}
        </p>
      )}

      {tanda.length === 0 ? (
        <p className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-6 text-center text-base text-[var(--text-secondary)]">
          Todavía no mides ninguna troza en esta tanda.
        </p>
      ) : (
        <ul className="space-y-2">
          {tanda.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onElegir(m.id)}
                aria-label={`${m.estado === "rechazada" ? "Reenviar" : "Corregir"} la troza ${m.codigo}`}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-left transition-colors hover:border-[var(--accent)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-lg font-bold text-[var(--text-primary)]">{m.codigo}</span>
                  <span className="block truncate text-base text-[var(--text-secondary)]">
                    {[m.especie, `${medidaTexto(m.d1, "″")} · ${medidaTexto(m.d2, "″")} · ${medidaTexto(m.largo, "′")}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {m.aviso && (
                    <span
                      className={cn(
                        "block text-sm font-bold",
                        m.estado === "rechazada"
                          ? "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]"
                          : "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
                      )}
                    >
                      {m.aviso}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xl font-bold tabular-nums text-[var(--text-primary)]">
                    {m.pt != null ? `${fmtPt(m.pt)} PT` : "—"}
                  </span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-bold", CHIP[m.estado].clase)}>
                    {CHIP[m.estado].texto}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {tanda.length > 0 &&
        (vaciando ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-[var(--text-primary)]">¿Empezar otra tanda? Lo medido no se borra.</span>
            <button
              type="button"
              onClick={() => {
                setVaciando(false);
                onVaciar();
              }}
              className="inline-flex h-12 items-center rounded-2xl border-2 border-[var(--accent)] px-4 text-base font-bold text-[var(--text-primary)]"
            >
              Sí, otra tanda
            </button>
            <button
              type="button"
              onClick={() => setVaciando(false)}
              className="inline-flex h-12 items-center rounded-2xl border border-[var(--rule-base)] px-4 text-base font-bold text-[var(--text-primary)]"
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setVaciando(true)}
            className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--rule-base)] px-4 text-base font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]"
          >
            <RotateCcw className="h-5 w-5" aria-hidden /> Empezar otra tanda
          </button>
        ))}
    </section>
  );
}
