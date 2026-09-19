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
 * consumió, la que se puede volver a marcar—, no de una migración.
 *
 * ## Por qué es una línea y no un panel
 *
 * Es lo primero que se lee, pero no es lo que se viene a hacer: ocupaba 400 px
 * con la lista desplegada antes del primer número del patio. Ahora anuncia el
 * problema en un renglón —cuántos códigos, cuántas piezas— con el botón que lo
 * resuelve entero al lado; el detalle, para elegir a mano cuál conserva la
 * marca, se abre al tocarlo.
 *
 * Al resolver el último grupo, el sistema pone el índice único de Postgres solo:
 * a partir de ahí el problema no puede volver.
 */

import { useCallback, useEffect, useState } from "react";
import { CardTitle, EmptyState } from "@buleje/design-system";
import { AlertTriangle, Check, ChevronDown, Hash, Loader2, ShieldCheck } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import CtpCodigosDuplicadosGrupos, { type GrupoDup, type PiezaDup } from "./CtpCodigosDuplicadosGrupos";

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
  const [abierto, setAbierto] = useState(false);
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
      <p className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 py-2 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Revisando los códigos de planta…
      </p>
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

  const lista = grupos ?? [];
  const total = lista.reduce((a, g) => a + g.piezas.length, 0);
  const anuladas = lista.reduce((a, g) => a + g.piezas.filter((p) => p.ingresoAnulado).length, 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--data-warning-500)]/50 bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-600)]" aria-hidden />
        <CardTitle as="h3" className="text-sm">
          {lista.length} {lista.length === 1 ? "código de planta repetido" : "códigos de planta repetidos"}
        </CardTitle>
        {/* Se recorta para que el aviso entre en un renglón, pero la frase
            entera queda en el `title`: la explicación es la que justifica el
            botón que está al lado. */}
        <span
          title={`${total} piezas comparten marca: mientras dos palos respondan al mismo número, el patio no los distingue.${
            anuladas > 0 ? ` ${anuladas} son de ingresos anulados — renumerarlas es gratis.` : ""
          }`}
          className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]"
        >
          {total} piezas comparten marca: mientras dos palos respondan al mismo número, el patio no los distingue.
          {anuladas > 0 && ` ${anuladas} son de ingresos anulados — renumerarlas es gratis.`}
        </span>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
        >
          {abierto ? "Cerrar" : "Elegir cuál conserva"}
          <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => void renumerar(lista)}
          disabled={trabajando || lista.length === 0}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-3 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {trabajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hash className="h-4 w-4" />}
          Resolver todos
        </button>
      </div>

      {aviso && (
        <p className="flex items-start gap-1.5 border-t border-[var(--rule-soft)] px-3 py-2 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <Check className="mt-0.5 h-4 w-4 shrink-0" /> {aviso}
        </p>
      )}
      {error && (
        <p className="flex items-start gap-1.5 border-t border-[var(--rule-soft)] px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {abierto && (
        <div className="border-t border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
          <CtpCodigosDuplicadosGrupos
            grupos={lista}
            conservar={conservar}
            onConservar={(codigo, piezaId) => setConservar((prev) => ({ ...prev, [codigo]: piezaId }))}
            onRenumerar={(g) => void renumerar(g)}
            trabajando={trabajando}
          />
        </div>
      )}
    </section>
  );
}
