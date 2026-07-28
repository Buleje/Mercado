"use client";

/**
 * PreguntarAlDocumento — hacerle una pregunta al papel que estás mirando.
 *
 * "¿Cuánto es la renta?", "¿cuándo vence?", "¿quién firma?": preguntas que hoy
 * se contestan leyendo el archivo entero. Acá se contestan sobre el texto que
 * el sistema ya leyó, y —esto es lo importante— **con la frase del documento
 * que sostiene la respuesta**, verificada contra el archivo en el servidor. Si
 * la cita no está en el documento, no se muestra: sobre un contrato o una
 * factura, una respuesta sin respaldo vale menos que ninguna.
 */

import { useState } from "react";
import { Sparkles, Loader2, Quote, AlertTriangle } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

interface Respuesta {
  respuesta: string;
  cita: string | null;
  respaldada: boolean;
}

/** Lo que casi siempre se quiere saber; ahorra escribir. */
const SUGERENCIAS = ["¿Cuánto es el total?", "¿Cuándo vence?", "¿Quiénes firman?", "¿Qué plazo tiene?"];

export default function PreguntarAlDocumento({ docId }: { docId: string }) {
  const [pregunta, setPregunta] = useState("");
  const [cargando, setCargando] = useState(false);
  const [r, setR] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preguntar = async (texto: string) => {
    const q = texto.trim();
    if (q.length < 3 || cargando) return;
    setCargando(true);
    setError(null);
    setR(null);
    try {
      const res = await fetch(`/api/admin/documents/${docId}/preguntar`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ pregunta: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "No pude responder ahora. Probá de nuevo.");
        return;
      }
      setR(data as Respuesta);
    } catch {
      setError("Se cortó la conexión antes de poder responder.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="border-b border-[var(--rule-base)] bg-[var(--accent)]/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`preg-${docId}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          <Sparkles className="h-4 w-4 text-[var(--accent)]" aria-hidden /> Preguntale a este documento
        </label>
        <div className="flex min-w-[240px] flex-1 items-center gap-2">
          <input
            id={`preg-${docId}`}
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") preguntar(pregunta); }}
            placeholder="Ej: ¿cuánto hay que pagar y hasta cuándo?"
            className="h-10 min-w-0 flex-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={() => preguntar(pregunta)}
            disabled={cargando || pregunta.trim().length < 3}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {cargando ? "Leyendo…" : "Preguntar"}
          </button>
        </div>
      </div>

      {!r && !error && !cargando && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              onClick={() => { setPregunta(s); preguntar(s); }}
              className="rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1 text-[length:var(--ts-2xs,11px)] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {r && (
        <div className="mt-2 rounded-xl border border-[var(--accent)]/25 bg-[var(--surface-raised)] p-3">
          <p className="text-sm leading-relaxed text-[var(--text-primary)]">{r.respuesta}</p>
          {r.cita ? (
            <p className="mt-2 flex items-start gap-1.5 border-l-2 border-[var(--accent)] pl-2 text-xs italic leading-snug text-[var(--text-secondary)]">
              <Quote className="mt-0.5 h-3 w-3 shrink-0 text-[var(--accent)]" aria-hidden />
              {r.cita}
            </p>
          ) : (
            // Sin cita comprobada la respuesta puede ser una deducción: decirlo
            // es lo que evita que alguien firme algo por una frase inventada.
            <p className="mt-2 flex items-start gap-1.5 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              No pude señalar la frase exacta del documento que lo respalda: tomalo como una ayuda, no como el dato final.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
