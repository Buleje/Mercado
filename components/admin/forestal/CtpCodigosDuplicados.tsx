"use client";

/**
 * Los códigos de planta repetidos, y cómo salir de ellos (ADR-336).
 *
 * ## Por qué esta pantalla existe
 *
 * El código de planta es la marca FÍSICA que alguien pinta sobre la testa de la
 * troza. Desde ADR-336 no se puede crear uno repetido, pero el libro heredó los
 * de antes: 61 códigos puestos en dos piezas distintas. Mientras exista uno, dos
 * palos de la pila responden al mismo número y el inventario deja de probar nada
 * ante OSINFOR.
 *
 * ## Por qué no lo arregla un script
 *
 * Porque el número está pintado en la madera. Elegir cuál pieza CONSERVA su
 * código es una decisión del patio —la que sigue en la pila, la que ya se
 * consumió, la que se puede volver a marcar—, no de una migración. Acá se ve el
 * grupo entero con su guía, su especie y su estado, y se elige.
 *
 * Al resolver el último grupo, el sistema pone el índice único de Postgres solo:
 * a partir de ahí el problema no puede volver.
 */

import { useCallback, useEffect, useState } from "react";
import { CardTitle, EmptyState } from "@buleje/design-system";
import { AlertTriangle, Check, Hash, Loader2, ShieldCheck } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

interface PiezaDup {
  id: string;
  codigoPlanta: string;
  codificacion: string | null;
  especieComun: string | null;
  volumenM3: number | null;
  gtfNumber: string;
  entryDate: string;
  consumida: boolean;
  noRecepcionada: boolean;
  /** Su ingreso está anulado: no hay madera suya en el patio, pero su fila
   *  sigue ocupando la marca y por eso bloquea el candado. */
  ingresoAnulado: boolean;
}
interface GrupoDup {
  codigo: string;
  piezas: PiezaDup[];
}

const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-40";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Cuál conviene conservar, propuesto:
 *  1. la que **ya se consumió** — su código viajó a una corrida y renumerarla
 *     desharía ese rastro;
 *  2. si ninguna, la primera **viva** (de un ingreso no anulado): la marca vale
 *     para la madera que está en la pila, no para un acta anulada;
 *  3. y si todas están anuladas, la más antigua.
 */
function sugerirConservar(piezas: PiezaDup[]): string {
  const consumida = piezas.find((p) => p.consumida && !p.ingresoAnulado);
  const viva = piezas.find((p) => !p.ingresoAnulado);
  return (consumida ?? viva ?? piezas[0])!.id;
}

export default function CtpCodigosDuplicados() {
  const [grupos, setGrupos] = useState<GrupoDup[] | null>(null);
  const [candado, setCandado] = useState<{ creado: boolean; duplicadosRestantes: number } | null>(null);
  const [conservar, setConservar] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/trozas?duplicados=1", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { grupos: GrupoDup[]; candado: typeof candado };
      setGrupos(j.grupos ?? []);
      setCandado(j.candado ?? null);
      setConservar(Object.fromEntries((j.grupos ?? []).map((g) => [g.codigo, sugerirConservar(g.piezas)])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGrupos([]);
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  /** Renumera todo lo que NO se conserva de los grupos indicados. */
  const renumerar = async (deGrupos: GrupoDup[]) => {
    const ids = deGrupos.flatMap((g) => g.piezas.filter((p) => p.id !== conservar[g.codigo]).map((p) => p.id));
    if (ids.length === 0) return;
    setTrabajando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch("/api/admin/forestal/trozas/renumerar", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ trozaIds: ids }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
      const omitidas: { motivo: string }[] = j.omitidas ?? [];
      setAviso(
        `${j.renumeradas?.length ?? 0} pieza(s) renumeradas.` +
          (omitidas.length > 0 ? ` ${omitidas.length} quedaron sin tocar: ${omitidas[0]?.motivo}` : ""),
      );
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrabajando(false);
    }
  };

  if (cargando && grupos === null) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--rule-base)] p-4 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Revisando los códigos de planta…
      </div>
    );
  }

  /* Un libro sano no tiene por qué cargar con un cartel permanente: sin
     duplicados el panel no existe. La excepción es el rato después de
     limpiarlos —`aviso` puesto—, donde desaparecer sin decir nada dejaría la
     duda de si se hizo. */
  if (grupos !== null && grupos.length === 0 && !aviso) return null;

  // Recién limpiado: se dice qué significa, no un vacío mudo.
  if (grupos !== null && grupos.length === 0) {
    return (
      <section className="rounded-2xl border border-[var(--data-success-500)]/40 bg-[var(--surface-raised)] p-4">
        <EmptyState
          icon={candado?.creado ? ShieldCheck : Check}
          title={candado?.creado ? "Cada troza tiene su propio número" : "Sin códigos repetidos"}
          description={
            (aviso ? `${aviso} ` : "") +
            (candado?.creado
              ? "El candado quedó puesto: la base ya no acepta dos piezas con la misma marca, ni por un bug ni por una importación."
              : "Ninguna pieza de este libro comparte código de planta.")
          }
        />
      </section>
    );
  }

  const total = (grupos ?? []).reduce((a, g) => a + g.piezas.length, 0);
  const anuladas = (grupos ?? []).reduce((a, g) => a + g.piezas.filter((p) => p.ingresoAnulado).length, 0);

  return (
    <section className="space-y-3 rounded-2xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle as="h3" className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
            <AlertTriangle className="h-4 w-4 text-[var(--data-warning-600)]" aria-hidden />
            {grupos?.length} código(s) de planta repetidos
          </CardTitle>
          <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
            {total} piezas comparten marca. El código se pinta sobre la testa: mientras dos palos respondan al mismo
            número, el patio no los distingue. Elegí cuál lo conserva y el resto recibe un correlativo nuevo.
            {anuladas > 0 && (
              <> Hay <b>{anuladas}</b> de ingresos anulados: no tienen madera en el patio, pero su fila sigue
              ocupando la marca y por eso el candado no entra — renumerarlas es gratis.</>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void renumerar(grupos ?? [])}
          disabled={trabajando || !grupos?.length}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {trabajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hash className="h-4 w-4" />}
          Resolver todos
        </button>
      </div>

      {aviso && (
        <p className="flex items-start gap-1.5 rounded-lg bg-[var(--data-success-50)] px-3 py-2 text-sm font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/10 dark:text-[var(--data-success-500)]">
          <Check className="mt-0.5 h-4 w-4 shrink-0" /> {aviso}
        </p>
      )}
      {error && (
        <p className="flex items-start gap-1.5 rounded-lg bg-[var(--data-error-50)] px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <ul className="space-y-2">
        {(grupos ?? []).map((g) => (
          <li key={g.codigo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                Código {g.codigo} · {g.piezas.length} piezas
              </span>
              <button type="button" onClick={() => void renumerar([g])} disabled={trabajando} className={BTN}>
                <Hash className="h-4 w-4" /> Renumerar las otras
              </button>
            </div>
            <ul className="space-y-1.5">
              {g.piezas.map((p) => {
                const elegida = conservar[g.codigo] === p.id;
                return (
                  <li key={p.id}>
                    <label
                      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border-2 px-3 py-2 text-sm transition-colors ${
                        elegida
                          ? "border-[var(--data-success-500)] bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/10"
                          : "border-transparent bg-[var(--surface-sunken)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`conservar-${g.codigo}`}
                        checked={elegida}
                        onChange={() => setConservar((prev) => ({ ...prev, [g.codigo]: p.id }))}
                        className="h-4 w-4 accent-[var(--data-success-600)]"
                      />
                      <span className="font-mono font-bold text-[var(--text-primary)]">{p.codificacion ?? "sin codificación"}</span>
                      <span className="text-[var(--text-secondary)]">{p.especieComun ?? "—"}</span>
                      <span className="font-mono tabular-nums text-[var(--text-tertiary)]">
                        {p.volumenM3 != null ? `${fmtM3(p.volumenM3)} m³` : "—"}
                      </span>
                      <span className="text-[var(--text-tertiary)]">GTF {p.gtfNumber} · {fecha(p.entryDate)}</span>
                      {p.consumida && (
                        <span className="rounded bg-[var(--data-info-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]">
                          ya se aserró
                        </span>
                      )}
                      {p.ingresoAnulado && (
                        <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                          ingreso anulado
                        </span>
                      )}
                      {p.noRecepcionada && (
                        <span className="rounded bg-[var(--data-warning-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
                          no llegó
                        </span>
                      )}
                      <span className="ml-auto text-xs font-bold text-[var(--text-tertiary)]">
                        {elegida ? "conserva el código" : "recibe uno nuevo"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <p className="text-xs text-[var(--text-tertiary)]">
        Se propone conservar el código de la pieza que ya se aserró —su marca viajó a una corrida— y, si ninguna,
        el de la primera que sigue viva. Las piezas de un mes cerrado no se tocan: hay que reabrir el período.
      </p>
    </section>
  );
}
