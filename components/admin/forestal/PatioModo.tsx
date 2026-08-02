"use client";

/**
 * Modo patio — la pantalla del que está parado frente a la pila.
 *
 * No es el Libro de Operaciones achicado. El libro se usa sentado, con las 133
 * pestañas del panel alrededor; esto se usa con una tablet, guantes, sol y mala
 * señal, y contesta DOS preguntas:
 *
 *   1. *"¿La 118 la puedo mandar a la sierra?"* — el buscador de arriba.
 *   2. *"Llegó el camión, ¿qué le falta a esta guía?"* — la lista de abajo.
 *
 * Sin sidebar ni tabs a propósito: cada elemento que no sirve en el patio es un
 * lugar donde tocar por error con el guante puesto. Lo que se anota sin señal
 * viaja por la cola de siempre (`patio-cola`), que ya sabe distinguir un corte
 * de señal de un rechazo del libro.
 *
 * El fondo no se pinta acá: lo pone el body, que ya sigue el tema. Repetirlo en
 * el `<main>` sólo agrega una superficie más que mantener sincronizada — el
 * `<main>` del panel es transparente por lo mismo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Loader2, PackageCheck, Search, TreePine, WifiOff, X,
} from "@buleje/design-system/icons";
import { PageTitle, SectionTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { usePatioCola } from "@/hooks/use-patio-cola";
import { fichaDeTroza, pendienteDeRecepcion, type TonoPatio } from "@/lib/forestal/patio-vista";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import CtpPatioBandeja from "./CtpPatioBandeja";
import CtpRecepcionTrozas, { type TrozaEditable } from "./CtpRecepcionTrozas";

interface GuiaPatio {
  id: string;
  gtfNumber: string;
  providerName: string;
  speciesCommonName: string;
  volumeM3: number | string;
  entryDate: string;
}

/** El tono decide el color de TODA la ficha: se lee de lejos, no en detalle. */
const TONO: Record<TonoPatio, { caja: string; chip: string }> = {
  libre: {
    caja: "border-[var(--data-success-500)] bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/10",
    chip: "bg-[var(--data-success-500)] text-white",
  },
  bloqueada: {
    caja: "border-[var(--rule-strong)] bg-[var(--surface-sunken)]",
    chip: "bg-[var(--text-tertiary)] text-white",
  },
  ausente: {
    caja: "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10",
    chip: "bg-[var(--data-error-500)] text-white",
  },
};

const fmtFecha = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });
  } catch {
    return iso;
  }
};

export default function PatioModo() {
  const cola = usePatioCola();
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [hallazgos, setHallazgos] = useState<TrozaConsumible[] | null>(null);
  const [guias, setGuias] = useState<GuiaPatio[] | null>(null);
  const [recibiendo, setRecibiendo] = useState<{ guia: GuiaPatio; trozas: TrozaEditable[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pedir = useCallback(async <T,>(url: string): Promise<T> => {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
    return (await r.json()) as T;
  }, []);

  const cargarGuias = useCallback(async () => {
    try {
      const d = await pedir<{ entries?: GuiaPatio[] }>("/api/admin/forestal/wood-entries?limit=15");
      setGuias(d.entries ?? []);
    } catch {
      // Sin señal la lista queda como estaba: el patio sigue pudiendo buscar
      // por código lo que ya tenga en pantalla. No se rompe la vista por esto.
      setGuias((g) => g ?? []);
    }
  }, [pedir]);

  useEffect(() => {
    void cargarGuias();
  }, [cargarGuias]);

  const buscar = useCallback(async () => {
    const texto = q.trim();
    if (!texto) return;
    setBuscando(true);
    setError(null);
    try {
      const d = await pedir<{ trozas?: (TrozaConsumible & { ingreso?: { gtfNumber?: string | null } })[] }>(
        `/api/admin/forestal/trozas?codificacion=${encodeURIComponent(texto)}&limite=20`,
      );
      // El buscador devuelve la guía anidada en `ingreso`; el endpoint del patio
      // la manda plana. Se normaliza acá y no se toca el contrato: hay otras
      // vistas leyendo `ingreso`, y sin esto la ficha mostraba "Guía —" teniendo
      // el dato — que en el patio es justo lo que se necesita para ir a buscarla.
      setHallazgos((d.trozas ?? []).map((t) => ({ ...t, gtfNumber: t.gtfNumber ?? t.ingreso?.gtfNumber ?? null })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setHallazgos(null);
    } finally {
      setBuscando(false);
    }
  }, [q, pedir]);

  const abrirRecepcion = useCallback(
    async (guia: GuiaPatio) => {
      setError(null);
      try {
        const d = await pedir<{ trozas?: TrozaEditable[] }>(
          `/api/admin/forestal/trozas?woodEntryId=${encodeURIComponent(guia.id)}`,
        );
        setRecibiendo({ guia, trozas: d.trozas ?? [] });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [pedir],
  );

  // Se abre enfocado: la primera acción del patio es tipear un número.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (recibiendo) {
    const p = pendienteDeRecepcion(recibiendo.trozas);
    const avanceRecepcion = p.completa
      ? `Las ${p.total} piezas ya están marcadas.`
      : p.sinEmpezar
        ? `${p.total} piezas por marcar.`
        : `Faltan ${p.faltan} de ${p.total}${p.noLlegaron > 0 ? ` · ${p.noLlegaron} no llegaron` : ""}.`;
    return (
      <main className="mx-auto min-h-dvh max-w-[64rem] p-4">
        <button
          type="button"
          onClick={() => setRecibiendo(null)}
          className="mb-3 inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] px-4 text-base font-bold text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden /> Volver al patio
        </button>
        <p className="mb-1 text-base text-[var(--text-secondary)]">
          Guía <b className="font-mono text-[var(--text-primary)]">{recibiendo.guia.gtfNumber}</b> ·{" "}
          {recibiendo.guia.providerName}
        </p>
        {/* Lo primero que se quiere saber al abrirla: cuánto falta por marcar. */}
        <p className="mb-3 text-base font-bold text-[var(--text-primary)]">{avanceRecepcion}</p>
        <CtpRecepcionTrozas
          entryId={recibiendo.guia.id}
          trozas={recibiendo.trozas}
          volumenDelIngreso={Number(recibiendo.guia.volumeM3) || null}
          onCerrar={() => setRecibiendo(null)}
          onGuardado={() => {
            setRecibiendo(null);
            void cargarGuias();
          }}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-[48rem] space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <PageTitle className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
          <TreePine className="h-6 w-6 text-[var(--accent)]" aria-hidden /> Patio
        </PageTitle>
        {!cola.online && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-warning-500)]/15 px-3 py-1.5 text-base font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <WifiOff className="h-4 w-4" aria-hidden /> Sin señal
          </span>
        )}
      </header>

      <CtpPatioBandeja cola={cola} />

      {/* Pregunta 1: ¿qué es esta pieza? */}
      <section className="space-y-3">
        <label htmlFor="patio-buscar" className="block text-base font-bold text-[var(--text-primary)]">
          ¿Qué troza estás mirando?
        </label>
        <div className="flex gap-2">
          <div className="flex h-14 flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]">
            <Search className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            <input
              id="patio-buscar"
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void buscar()}
              inputMode="search"
              placeholder="El número de la testa: 118"
              className="w-full bg-transparent text-lg text-[var(--text-primary)] outline-none"
            />
            {q && (
              <button
                type="button"
                onClick={() => { setQ(""); setHallazgos(null); inputRef.current?.focus(); }}
                aria-label="Borrar la búsqueda"
                className="shrink-0 rounded-full p-1 text-[var(--text-tertiary)]"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => void buscar()}
            disabled={buscando || !q.trim()}
            className="inline-flex h-14 shrink-0 items-center gap-2 rounded-2xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-5 text-base font-bold text-white disabled:opacity-40"
          >
            {buscando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Search className="h-5 w-5" aria-hidden />}
            Buscar
          </button>
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-base text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {error}
          </p>
        )}

        {hallazgos?.length === 0 && (
          <p className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-6 text-center text-base text-[var(--text-secondary)]">
            Ninguna troza con ese número. Probá con la codificación de la guía.
          </p>
        )}

        <ul className="space-y-2" aria-live="polite">
          {(hallazgos ?? []).map((t) => {
            const f = fichaDeTroza(t);
            const tono = TONO[f.tono];
            return (
              <li key={t.id} className={cn("rounded-2xl border-2 p-4", tono.caja)}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-bold text-[var(--text-primary)]">{f.codigo}</span>
                  <span className={cn("rounded-full px-3 py-1 text-base font-bold", tono.chip)}>{f.titulo}</span>
                </div>
                {f.detalle && <p className="mt-1 text-base text-[var(--text-secondary)]">{f.detalle}</p>}
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-base">
                  <Dato k="Especie" v={t.especieComun ?? "—"} />
                  <Dato k="Volumen" v={t.volumenM3 != null ? `${Number(t.volumenM3).toFixed(4)} m³` : "—"} />
                  <Dato k="Guía" v={t.gtfNumber ?? "—"} mono />
                  {f.codigoAlterno && <Dato k="Cód. guía" v={f.codigoAlterno} mono />}
                </dl>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Pregunta 2: llegó el camión, ¿qué le falta a esta guía? */}
      <section className="space-y-2">
        <SectionTitle as="h2" className="text-base font-bold text-[var(--text-primary)]">Guías para recibir</SectionTitle>
        {guias === null ? (
          <p className="flex items-center gap-2 py-4 text-base text-[var(--text-tertiary)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Buscando las últimas guías…
          </p>
        ) : guias.length === 0 ? (
          <p className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-6 text-center text-base text-[var(--text-secondary)]">
            No hay guías cargadas todavía.
          </p>
        ) : (
          <ul className="space-y-2">
            {guias.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => void abrirRecepcion(g)}
                  className="flex w-full items-center gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)]"
                >
                  <PackageCheck className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-lg font-bold text-[var(--text-primary)]">{g.gtfNumber}</span>
                    <span className="block truncate text-base text-[var(--text-secondary)]">
                      {g.speciesCommonName} · {g.providerName}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-base text-[var(--text-tertiary)]">
                    {fmtFecha(g.entryDate)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Dato({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-[var(--text-tertiary)]">{k}</dt>
      <dd className={cn("text-right text-[var(--text-primary)]", mono && "font-mono")}>{v}</dd>
    </>
  );
}
