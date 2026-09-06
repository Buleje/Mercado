"use client";

/**
 * Modo patio — la pantalla del que está parado frente a la pila.
 *
 * No es el Libro de Operaciones achicado. El libro se usa sentado, con las 133
 * pestañas del panel alrededor; esto se usa con una tablet, guantes, sol y mala
 * señal, y contesta DOS preguntas:
 *
 *   1. *"¿La 118 la puedo mandar a la sierra?"* — el buscador de arriba.
 *   2. *"Llegó el camión, ¿qué le falta a esta guía?"* — la lista del medio.
 *   3. *"Estos palos van al carro, ¿a qué corrida?"* — el bloque de abajo.
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

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Loader2, PackageCheck, TreePine, WifiOff,
} from "@buleje/design-system/icons";
import { PageTitle, SectionTitle } from "@buleje/design-system";
import { usePatioCola } from "@/hooks/use-patio-cola";
import { pendienteDeRecepcion } from "@/lib/forestal/patio-vista";
import { antiguedad, guardar, leer } from "@/lib/forestal/patio-cache";
import CtpPatioBandeja from "./CtpPatioBandeja";
import CtpRecepcionTrozas, { type TrozaEditable } from "./CtpRecepcionTrozas";
import PatioBuscador from "./PatioBuscador";
import PatioConsumo from "./PatioConsumo";

interface GuiaPatio {
  id: string;
  gtfNumber: string;
  providerName: string;
  speciesCommonName: string;
  volumeM3: number | string;
  entryDate: string;
}


const GUIAS_VISIBLES = 6;

const fmtFecha = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });
  } catch {
    return iso;
  }
};

export default function PatioModo() {
  const cola = usePatioCola();
  const [guias, setGuias] = useState<GuiaPatio[] | null>(null);
  const [recibiendo, setRecibiendo] = useState<{ guia: GuiaPatio; trozas: TrozaEditable[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** El camión que acaba de llegar es de los últimos: mostrar quince empuja el
   *  bloque de carga fuera de pantalla y ahí ya nadie lo encuentra. */
  const [verTodasLasGuias, setVerTodasLasGuias] = useState(false);
  const [avisoCola, setAvisoCola] = useState<string | null>(null);
  const [guiasDeCache, setGuiasDeCache] = useState<string | null>(null);


  const pedir = useCallback(async <T,>(url: string): Promise<T> => {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
    return (await r.json()) as T;
  }, []);

  const cargarGuias = useCallback(async () => {
    try {
      const d = await pedir<{ entries?: GuiaPatio[] }>("/api/admin/forestal/wood-entries?limit=15");
      setGuias(d.entries ?? []);
      setGuiasDeCache(null);
      void guardar("guias", d.entries ?? []);
    } catch {
      // Sin señal se muestra lo último guardado, DICIENDO de cuándo es: una
      // lista de guías sin fecha invita a abrir una recepción ya cerrada.
      const cache = await leer<GuiaPatio>("guias");
      setGuias(cache?.datos ?? []);
      setGuiasDeCache(cache?.guardadoEn ?? null);
    }
  }, [pedir]);

  useEffect(() => {
    void cargarGuias();
  }, [cargarGuias]);


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
          offline
          onCerrar={() => setRecibiendo(null)}
          onGuardado={(encolada) => {
            setRecibiendo(null);
            // Encolada: la lista del servidor NO cambió todavía, y refrescarla
            // mostraría la guía como si no se hubiera tocado. La bandeja de
            // arriba es la que dice qué falta subir.
            if (!encolada) void cargarGuias();
            else setAvisoCola("Recepción anotada en el equipo. Se sube al libro cuando vuelva la señal.");
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

      {avisoCola && (
        <p className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-base font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {avisoCola}
        </p>
      )}

      <CtpPatioBandeja cola={cola} />

      {/* Pregunta 1: ¿qué es esta pieza? */}
      <PatioBuscador />

      {/* Pregunta 2: llegó el camión, ¿qué le falta a esta guía? */}
      <section className="space-y-2">
        <SectionTitle as="h2" className="text-base font-bold text-[var(--text-primary)]">
          Guías para recibir
          {guiasDeCache && (
            <span className="ml-2 font-normal text-[var(--text-tertiary)]">
              · guardadas {antiguedad(guiasDeCache, new Date())}
            </span>
          )}
        </SectionTitle>
        {/* El bloque de error vivía con el buscador; al mudarse, abrir una guía
            sin señal fallaba en silencio. Va acá, junto a lo que lo produce. */}
        {error && (
          <p className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-base text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {error}
          </p>
        )}
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
            {(verTodasLasGuias ? guias : guias.slice(0, GUIAS_VISIBLES)).map((g) => (
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
            {!verTodasLasGuias && guias.length > GUIAS_VISIBLES && (
              <li>
                <button
                  type="button"
                  onClick={() => setVerTodasLasGuias(true)}
                  className="h-12 w-full rounded-2xl border-2 border-dashed border-[var(--rule-base)] text-base font-bold text-[var(--text-secondary)]"
                >
                  Ver las {guias.length - GUIAS_VISIBLES} guías más viejas
                </button>
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Pregunta 3: los palos ya están junto al carro, ¿a qué corrida van? */}
      <PatioConsumo />
    </main>
  );
}

