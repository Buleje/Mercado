"use client";

/**
 * El buscador del patio: se tipea el número de la testa y contesta si esa pieza
 * se puede mandar a la sierra.
 *
 * Sale de `PatioModo` porque el módulo pasó a coordinar tres bloques y este solo
 * traía su propio estado, su fetch y la ficha de resultado.
 *
 * El veredicto lo arma `fichaDeTroza()`, que a su vez reusa `motivoBloqueo()`:
 * las reglas de qué se puede consumir viven en un solo lugar y el servidor las
 * espeja al guardar (T1, ADR-326).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Search, WifiOff, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fichaDeTroza, type TonoPatio } from "@/lib/forestal/patio-vista";
import { antiguedad, buscarLocal, esViejo, guardar, leer } from "@/lib/forestal/patio-cache";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

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


export default function PatioBuscador() {
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [hallazgos, setHallazgos] = useState<TrozaConsumible[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Cuándo se guardó lo que se está mostrando. `null` = vino del servidor. */
  const [desdeCache, setDesdeCache] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Se abre enfocado: la primera acción del patio es tipear un número.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const buscar = useCallback(async () => {
    const texto = q.trim();
    if (!texto) return;
    setBuscando(true);
    setError(null);
    setDesdeCache(null);
    try {
      const r = await fetch(
        `/api/admin/forestal/trozas?codificacion=${encodeURIComponent(texto)}&limite=20`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
      const d = (await r.json()) as {
        trozas?: (TrozaConsumible & { ingreso?: { gtfNumber?: string | null } })[];
      };
      // El buscador devuelve la guía anidada en `ingreso`; el endpoint del patio
      // la manda plana. Se normaliza acá y no se toca el contrato: hay otras
      // vistas leyendo `ingreso`, y sin esto la ficha mostraba "Guía —" teniendo
      // el dato — que en el patio es justo lo que hace falta para ir a buscarla.
      const normalizadas = (d.trozas ?? []).map((t) => ({
        ...t,
        gtfNumber: t.gtfNumber ?? t.ingreso?.gtfNumber ?? null,
      }));
      setHallazgos(normalizadas);
      // Se acumula lo consultado para poder responder lo mismo sin señal. Se
      // fusiona por id: cada búsqueda trae un pedacito del patio y pisar el
      // caché con la última dejaría al operario con una sola pieza consultable.
      void (async () => {
        const previo = (await leer<TrozaConsumible>("trozas"))?.datos ?? [];
        const porId = new Map(previo.map((t) => [t.id, t]));
        for (const t of normalizadas) porId.set(t.id, t);
        await guardar("trozas", [...porId.values()]);
      })();
    } catch {
      // El servidor no contestó: se busca en lo último que se alcanzó a ver.
      // No es un error que tape la pantalla — es el caso normal en el patio.
      const cache = await leer<TrozaConsumible>("trozas");
      if (!cache || cache.datos.length === 0) {
        setError("Sin señal y sin nada guardado todavía. Conectate una vez para poder consultar después.");
        setHallazgos(null);
      } else {
        setHallazgos(buscarLocal(cache.datos, texto));
        setDesdeCache(cache.guardadoEn);
      }
    } finally {
      setBuscando(false);
    }
  }, [q]);

  return (
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

        {/* Sin esto el patio mostraría una pieza como libre sin aclarar que el
            dato puede ser de ayer — y esa troza pudo consumirse hace dos horas
            en otra tablet. El aviso sube de tono pasadas las dos horas. */}
        {desdeCache && (
          <p
            className={cn(
              "flex items-start gap-2 rounded-2xl border-2 px-4 py-3 text-base font-bold",
              esViejo(desdeCache, new Date())
                ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]"
                : "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]",
            )}
          >
            <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span>
              Sin señal — esto es lo último guardado, {antiguedad(desdeCache, new Date())}.
              {esViejo(desdeCache, new Date()) && " Puede haber cambiado: confirmá antes de aserrar."}
            </span>
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
                  <Dato k="Volumen" v={t.volumenM3 != null ? `${fmtM3(Number(t.volumenM3))} m³` : "—"} />
                  <Dato k="Guía" v={t.gtfNumber ?? "—"} mono />
                  {f.codigoAlterno && <Dato k="Cód. guía" v={f.codigoAlterno} mono />}
                </dl>
              </li>
            );
          })}
        </ul>
      </section>
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
