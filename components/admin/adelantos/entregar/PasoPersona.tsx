"use client";

/**
 * Paso 1 de «Entregar adelanto»: a quién. Las 3 personas de siempre como
 * tarjetas grandes (un toque y listo), el buscador por nombre o DNI y, si el
 * navegador lee QR, el fotocheck. Elegida, queda una tarjeta con «Cambiar».
 */

import { useState, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Loader2, QrCode, RefreshCw, Search } from "@buleje/design-system/icons";
import { enmascararDocumento, type PersonaEntregar } from "@/lib/adelantos/entregar-tipos";
import { montoConMoneda } from "@/lib/adelantos/comprobante";
import EscanearFotocheck, { puedeLeerFotocheck } from "./EscanearFotocheck";
import type { EntregaAdelanto } from "./use-entregar-adelanto";

/** El encabezado de cada paso: número + título del bloque (+ algo a la derecha). */
export function CabezaPaso({ n, children, extra }: { n: number; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--surface-sunken)] text-sm font-bold tabular-nums text-[var(--text-secondary)]">
        {n}
      </span>
      <CardTitle className="min-w-0 flex-1 text-sm font-bold text-[var(--text-primary)]">{children}</CardTitle>
      {extra}
    </div>
  );
}

const inicial = (nombre: string) => nombre.trim().charAt(0).toUpperCase() || "?";
const documentoVisible = (p: PersonaEntregar) => (p.documentoFinal ? `DNI ${enmascararDocumento(p.documentoFinal)}` : "Sin DNI en la ficha");

function Avatar({ nombre }: { nombre: string }) {
  return (
    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/12 text-base font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
      {inicial(nombre)}
    </span>
  );
}

/** Una persona de la lista de resultados: fila de 56 px, todo el ancho. */
function FilaPersona({ p, onElegir }: { p: PersonaEntregar; onElegir: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onElegir}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:bg-[var(--surface-sunken)]"
        data-persona-resultado={p.id}
      >
        <Avatar nombre={p.nombre} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-[var(--text-primary)]">{p.nombre}</span>
          <span className="block truncate text-sm text-[var(--text-tertiary)]">{documentoVisible(p)}</span>
        </span>
        {p.ultimoMonto != null && <span className="shrink-0 text-sm tabular-nums text-[var(--text-secondary)]">último {montoConMoneda(p.ultimoMonto)}</span>}
      </button>
    </li>
  );
}

export default function PasoPersona({ e }: { e: EntregaAdelanto }) {
  const { personas, persona } = e;
  const [escaneando, setEscaneando] = useState(false);
  const [avisoQr, setAvisoQr] = useState<string | null>(null);
  const [leeQr] = useState(puedeLeerFotocheck);
  const ocupado = e.fase === "guardando" || e.incierto;

  if (persona) {
    return (
      <section className="space-y-2" aria-label="A quién le entregas">
        <CabezaPaso n={1}>A quién le entregas</CabezaPaso>
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-3" data-persona-elegida={persona.id}>
          <Avatar nombre={persona.nombre} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-[var(--text-primary)]">{persona.nombre}</p>
            <p className="truncate text-sm text-[var(--text-tertiary)]">
              {documentoVisible(persona)}
              {persona.saldo != null && persona.saldo > 0.005 && <> · debe {montoConMoneda(persona.saldo)}</>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => e.elegir(null)}
            disabled={ocupado}
            className="inline-flex min-h-12 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            Cambiar
          </button>
        </div>
      </section>
    );
  }

  const leer = async (texto: string) => {
    const r = await personas.porCodigo(texto);
    setEscaneando(false);
    setAvisoQr(r.aviso);
    if (r.persona) e.elegir(r.persona);
  };

  const frecuentes = personas.contexto?.frecuentes ?? [];
  const buscandoAlgo = personas.resultados != null || personas.buscando;

  return (
    <section className="space-y-3" aria-label="A quién le entregas">
      <CabezaPaso n={1}>¿A quién le entregas?</CabezaPaso>

      {personas.errorCarga ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-[var(--data-error)]/10 px-3 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-error)]" aria-hidden />
          <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">{personas.errorCarga}</p>
          <button type="button" onClick={personas.releer} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">
            <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
          </button>
        </div>
      ) : personas.cargando ? (
        <div className="grid grid-cols-3 gap-2" aria-label="Cargando a quién entregar">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />
          ))}
        </div>
      ) : (
        !buscandoAlgo &&
        frecuentes.length > 0 && (
          <ul className="grid grid-cols-3 gap-2" aria-label="Las de siempre">
            {frecuentes.slice(0, 3).map((p) => (
              <li key={p.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => e.elegir(p)}
                  className="flex h-full min-h-24 w-full flex-col items-start justify-between gap-1 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-left transition-colors hover:border-[var(--text-secondary)] focus-visible:border-[var(--accent)]"
                  data-persona-frecuente={p.id}
                >
                  <span className="line-clamp-2 break-words text-sm font-bold leading-snug text-[var(--text-primary)]">{p.nombre}</span>
                  <span className="text-sm tabular-nums text-[var(--text-tertiary)]">{p.ultimoMonto != null ? montoConMoneda(p.ultimoMonto) : "—"}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar por nombre o DNI</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            value={personas.q}
            onChange={(ev) => personas.setQ(ev.target.value)}
            placeholder="Buscar por nombre o DNI"
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-10 pr-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
            data-buscar-persona
          />
        </label>
        {leeQr && !escaneando && (
          <button
            type="button"
            onClick={() => {
              setAvisoQr(null);
              setEscaneando(true);
            }}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--text-secondary)]"
            data-leer-fotocheck
          >
            <QrCode className="h-5 w-5" aria-hidden /> <span className="max-sm:sr-only">Fotocheck</span>
          </button>
        )}
      </div>

      {escaneando && <EscanearFotocheck onCodigo={(t) => void leer(t)} onCerrar={() => setEscaneando(false)} />}
      {avisoQr && (
        <p role="status" className="flex items-start gap-2 text-sm font-semibold text-[var(--data-warning-ink)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {avisoQr}
        </p>
      )}

      {personas.buscando ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando…
        </p>
      ) : personas.errorBusqueda ? (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error)]">No se pudo buscar. Revisa la conexión.</p>
      ) : personas.resultados?.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Nadie con «{personas.q.trim()}» en Adelantos.</p>
      ) : personas.resultados ? (
        <ul className="-mx-1 space-y-0.5" aria-label="Resultados">
          {personas.resultados.map((p) => (
            <FilaPersona key={p.id} p={p} onElegir={() => e.elegir(p)} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
