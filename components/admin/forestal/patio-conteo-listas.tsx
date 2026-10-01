"use client";

/**
 * Las tres listas de «Contar el patio»: Faltan (agrupadas por especie o guía),
 * Encontradas y Sorpresas. Separadas de `PatioConteo` para que la pantalla
 * quede en su flujo.
 */

import { useMemo, useState } from "react";
import { X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  agruparFaltan,
  codigoDeTroza,
  motivoDeSorpresa,
  type AgruparPor,
  type LecturaConteo,
  type ResumenConteo,
} from "@/lib/forestal/conteo-patio";

export type ListaConteo = "faltan" | "encontradas" | "sorpresas";

const BOTON_OPCION =
  "inline-flex min-h-12 flex-1 items-center justify-center gap-x-2 rounded-xl px-2 py-1 text-base font-bold leading-tight transition-colors max-sm:flex-col";

function Opcion({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={cn(
        BOTON_OPCION,
        activa
          ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)] ring-2 ring-[var(--accent)]"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
      )}
    >
      {children}
    </button>
  );
}

function BotonQuitar({ codigo, onQuitar }: { codigo: string; onQuitar: () => void }) {
  return (
    <button
      type="button"
      onClick={onQuitar}
      aria-label={`Quitar ${codigo} del conteo`}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-[var(--data-error-500)] hover:text-[var(--data-error-ink)] dark:hover:text-[var(--data-error-500)]"
    >
      <X className="h-5 w-5" aria-hidden />
    </button>
  );
}

export default function ListasDelConteo({
  resumen,
  onQuitar,
}: {
  resumen: ResumenConteo;
  /** Sin `onQuitar` (conteo terminado) las listas son sólo lectura. */
  onQuitar?: (l: Pick<LecturaConteo, "trozaId" | "codigo">) => void;
}) {
  const [lista, setLista] = useState<ListaConteo>("faltan");
  const [agrupar, setAgrupar] = useState<AgruparPor>("especie");
  const grupos = useMemo(() => agruparFaltan(resumen.faltan, agrupar), [resumen.faltan, agrupar]);

  return (
    <section className="space-y-3" aria-label="Listas del conteo">
      <div
        role="group"
        aria-label="Qué lista ver"
        className="flex gap-1 rounded-2xl bg-[var(--surface-sunken)] p-1"
      >
        <Opcion activa={lista === "faltan"} onClick={() => setLista("faltan")}>
          Faltan <span className="tabular-nums">{resumen.faltan.length}</span>
        </Opcion>
        <Opcion activa={lista === "encontradas"} onClick={() => setLista("encontradas")}>
          Encontradas <span className="tabular-nums">{resumen.encontradas.length}</span>
        </Opcion>
        <Opcion activa={lista === "sorpresas"} onClick={() => setLista("sorpresas")}>
          Sorpresas <span className="tabular-nums">{resumen.sorpresas.length}</span>
        </Opcion>
      </div>

      {lista === "faltan" && (
        <div className="space-y-3" data-lista-conteo="faltan">
          <div className="flex items-center gap-2">
            <span className="text-base text-[var(--text-secondary)]">Agrupar por</span>
            <div role="group" aria-label="Agrupar lo que falta" className="flex flex-1 gap-1 rounded-2xl bg-[var(--surface-sunken)] p-1">
              <Opcion activa={agrupar === "especie"} onClick={() => setAgrupar("especie")}>
                Especie
              </Opcion>
              <Opcion activa={agrupar === "guia"} onClick={() => setAgrupar("guia")}>
                Guía
              </Opcion>
            </div>
          </div>
          {grupos.length === 0 ? (
            <Vacio texto="No falta ninguna: todo lo esperado está contado." />
          ) : (
            grupos.map((g) => (
              <div key={g.clave} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-base font-bold text-[var(--text-primary)]">
                  <span className={cn(agrupar === "guia" && "font-mono")}>{g.clave}</span>
                  <span className="tabular-nums text-[var(--text-secondary)]">
                    {g.trozas.length} · {fmtM3(g.m3)} m³
                  </span>
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {g.trozas.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1 font-mono text-base tabular-nums text-[var(--text-primary)]"
                    >
                      {codigoDeTroza(t)}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {lista === "encontradas" &&
        (resumen.encontradas.length === 0 ? (
          <Vacio texto="Todavía no escaneas ninguna troza del patio." />
        ) : (
          <ul className="space-y-2" data-lista-conteo="encontradas">
            {resumen.encontradas.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-lg font-bold text-[var(--text-primary)]">{codigoDeTroza(t)}</span>
                  <span className="block truncate text-base text-[var(--text-secondary)]">
                    {[t.especieComun, t.gtfNumber && `guía ${t.gtfNumber}`].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <span className="shrink-0 text-base tabular-nums text-[var(--text-tertiary)]">{formatTime(t.en)}</span>
                {onQuitar && (
                  <BotonQuitar codigo={codigoDeTroza(t)} onQuitar={() => onQuitar({ trozaId: t.id, codigo: "" })} />
                )}
              </li>
            ))}
          </ul>
        ))}

      {lista === "sorpresas" &&
        (resumen.sorpresas.length === 0 ? (
          <Vacio texto="Ninguna sorpresa: todo lo escaneado era del patio." />
        ) : (
          <ul className="space-y-2" data-lista-conteo="sorpresas">
            {resumen.sorpresas.map((s) => {
              const codigo = s.troza ? codigoDeTroza(s.troza) : s.codigo;
              return (
                <li
                  key={s.troza ? s.troza.id : s.tipo === "fuera" ? s.trozaId : `?${s.codigo}`}
                  className="flex items-center gap-3 rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-lg font-bold text-[var(--text-primary)]">{codigo}</span>
                    <span className="block text-base font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
                      {motivoDeSorpresa(s)}
                    </span>
                    {s.troza && (
                      <span className="block truncate text-base text-[var(--text-secondary)]">
                        {[s.troza.especieComun, s.troza.gtfNumber && `guía ${s.troza.gtfNumber}`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  {onQuitar && (
                    <BotonQuitar
                      codigo={codigo}
                      onQuitar={() =>
                        onQuitar(
                          s.troza
                            ? { trozaId: s.troza.id, codigo: "" }
                            : { trozaId: s.tipo === "fuera" ? s.trozaId : null, codigo: s.codigo },
                        )
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-6 text-center text-base text-[var(--text-secondary)]">
      {texto}
    </p>
  );
}
