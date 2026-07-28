"use client";

/**
 * BuscarEnDocumento — el Ctrl+F que faltaba adentro del archivo.
 *
 * "¿Este contrato dice algo del depósito de garantía?" hoy se contesta bajando
 * el archivo y abriéndolo en otro programa. Acá se contesta en el mismo lugar:
 * se busca sobre el texto que el sistema ya leyó del documento (el mismo con el
 * que busca el drive), con las coincidencias contadas, resaltadas y navegables.
 *
 * Es honesto sobre qué mira: el TEXTO leído, no el dibujo de la página. Por eso
 * el encabezado lo dice y muestra de dónde salió (leído del archivo o de la
 * foto). Ignora tildes y mayúsculas, como el buscador del drive.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronUp, ChevronDown, X, Eye, FileText } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { buscarIndice, contenidoCrudo } from "@/lib/documentos/relevancia";
import PreguntarAlDocumento from "./PreguntarAlDocumento";

interface Props {
  /** Para poder preguntarle al documento desde el mismo lugar. */
  docId: string;
  /** `ocrText` del documento (texto crudo + lo que agregó la IA). */
  ocrText: string | null;
  /** "vision" si el texto salió de mirar una foto. */
  origen?: string;
  /** El PDF era un escaneo: sólo se leyó su primera página. */
  escaneo?: boolean;
  /** Consulta inicial (la que venías escribiendo en el drive). */
  consultaInicial?: string;
}

/** Todas las posiciones donde aparece `aguja`, sin tildes ni mayúsculas. */
function posiciones(texto: string, aguja: string): number[] {
  if (aguja.trim().length < 2) return [];
  const out: number[] = [];
  let desde = 0;
  // `buscarIndice` trabaja sobre el texto plegado pero devuelve el índice del
  // ORIGINAL, así que se puede seguir cortando por posición sin desfasarse.
  for (;;) {
    const i = buscarIndice(texto.slice(desde), aguja);
    if (i === -1 || out.length >= 500) break;
    out.push(desde + i);
    desde += i + aguja.length;
  }
  return out;
}

export default function BuscarEnDocumento({ docId, ocrText, origen, escaneo, consultaInicial = "" }: Props) {
  const texto = useMemo(() => contenidoCrudo(ocrText).trim(), [ocrText]);
  const [consulta, setConsulta] = useState(consultaInicial);
  const [actual, setActual] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => posiciones(texto, consulta.trim()), [texto, consulta]);
  useEffect(() => setActual(0), [consulta]);

  // Traer a la vista la coincidencia elegida.
  useEffect(() => {
    if (hits.length === 0) return;
    contenedor.current?.querySelector(`[data-hit="${actual}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [actual, hits.length]);

  const ir = (delta: number) => {
    if (hits.length === 0) return;
    setActual((a) => (a + delta + hits.length) % hits.length);
  };

  if (!texto) {
    return (
      <div className="p-8 text-center">
        <FileText className="mx-auto mb-3 h-12 w-12 text-[var(--text-tertiary)]" aria-hidden />
        <p className="text-sm font-bold text-[var(--text-secondary)]">Todavía no leí el texto de este documento.</p>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">
          Usá <span className="font-bold">Analizar con IA</span> (o <span className="font-bold">Escanear</span> si es una
          foto) y después vas a poder buscar acá adentro.
        </p>
      </div>
    );
  }

  // El texto partido en trozos, marcando cada coincidencia.
  const partes: { txt: string; hit: number | null }[] = [];
  let cursor = 0;
  hits.forEach((pos, i) => {
    if (pos > cursor) partes.push({ txt: texto.slice(cursor, pos), hit: null });
    partes.push({ txt: texto.slice(pos, pos + consulta.trim().length), hit: i });
    cursor = pos + consulta.trim().length;
  });
  if (cursor < texto.length) partes.push({ txt: texto.slice(cursor), hit: null });

  return (
    <div className="flex h-full flex-col">
      {/* Dos formas de sacarle algo al mismo texto: buscar una palabra, o
          preguntar en castellano. Van juntas porque son el mismo momento. */}
      <PreguntarAlDocumento docId={docId} />

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            autoFocus
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); ir(e.shiftKey ? -1 : 1); }
              if (e.key === "Escape") setConsulta("");
            }}
            placeholder="Buscar adentro del documento…"
            aria-label="Buscar adentro del documento"
            className="h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
        {consulta.trim().length >= 2 && (
          <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums text-[var(--text-secondary)]">
            {hits.length === 0 ? "Sin coincidencias" : `${actual + 1} de ${hits.length}`}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <button onClick={() => ir(-1)} disabled={hits.length === 0} className="rounded-lg border-2 border-[var(--rule-base)] p-1.5 text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary disabled:opacity-40" aria-label="Coincidencia anterior" title="Anterior (Shift+Enter)">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button onClick={() => ir(1)} disabled={hits.length === 0} className="rounded-lg border-2 border-[var(--rule-base)] p-1.5 text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary disabled:opacity-40" aria-label="Coincidencia siguiente" title="Siguiente (Enter)">
            <ChevronDown className="h-4 w-4" />
          </button>
          {consulta && (
            <button onClick={() => setConsulta("")} className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" aria-label="Limpiar la búsqueda">
              <X className="h-4 w-4" />
            </button>
          )}
        </span>
      </div>

      <p className="flex items-center gap-1.5 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-1.5 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
        {origen === "vision" ? <Eye className="h-3 w-3 shrink-0" aria-hidden /> : <FileText className="h-3 w-3 shrink-0" aria-hidden />}
        {escaneo
          ? "Este PDF es un escaneo: la IA leyó su PRIMERA PÁGINA mirándola. Lo que esté en las otras páginas todavía no se busca."
          : origen === "vision"
          ? "Este texto lo leyó la IA mirando la foto: puede tener errores de transcripción."
          : "Texto extraído del archivo. Buscá sin preocuparte por tildes ni mayúsculas."}
      </p>

      <div ref={contenedor} className="flex-1 overflow-auto bg-[var(--surface-canvas)] px-4 py-3">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-secondary)]">
          {partes.map((p, i) =>
            p.hit === null ? (
              <span key={i}>{p.txt}</span>
            ) : (
              <mark
                key={i}
                data-hit={p.hit}
                className={cn(
                  "rounded px-0.5",
                  p.hit === actual
                    ? "bg-[var(--accent)] font-bold text-white"
                    : "bg-[var(--data-warning-500)]/25 text-[var(--text-primary)] dark:bg-[var(--data-warning-500)]/35",
                )}
              >
                {p.txt}
              </mark>
            ),
          )}
        </p>
      </div>
    </div>
  );
}
