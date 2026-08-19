"use client";

/**
 * CtpBuscarGtf — "tengo este número en la mano, ¿qué es?" desde cualquier vista.
 *
 * Es la pregunta de toda fiscalización y de todo cliente que llama. Hasta ahora
 * había que adivinar en qué registro cayó —ir a Ingresos y buscar, y si no
 * estaba, a Despacho y buscar de nuevo— porque el mismo papel puede ser una guía
 * de ENTRADA (con la que llegó la madera) o de SALIDA (la que emitió el CTP).
 *
 * Desde ADR-366 hay un tercer registro donde puede caer lo que alguien lee: el
 * **código de un paquete**, pintado en el atado que está mirando. Los tres se
 * buscan de una y la pantalla dice cuál es cuál.
 *
 * Se abre con `b` o desde la lupa de la cabina. No clona queries: usa los mismos
 * listados que las vistas, con `search`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Boxes,
  Loader2,
  PackageOpen,
  Search,
  Truck,
  X as XIcon,
} from "@buleje/design-system/icons";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { formatDate, productLabel, StatusBadge, type WoodEntry } from "./ctp-shared";

interface DespachoHit {
  id: string;
  lineNo: number;
  entryDate: string;
  gtfNumber: string | null;
  speciesCommon: string | null;
  productType: string | null;
  quantity: string | null;
  unit: string | null;
  destino: string | null;
  status: string;
}

/** Un paquete de producción encontrado por su código. */
interface PaqueteHit {
  id: string;
  codigo: string;
  productType: string | null;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number | null;
  corrida: { lineNo: number; entryDate: string; speciesCommon: string | null; lote: string | null };
  saldoCorrida: { disponible: number };
}

export default function CtpBuscarGtf({
  period,
  onCerrar,
  onVerIngreso,
  onVerPaquete,
  onIrA,
}: {
  period: CtpPeriod;
  onCerrar: () => void;
  /** Abre la ficha completa del ingreso (con su trazabilidad hacia adelante). */
  onVerIngreso: (entry: WoodEntry) => void;
  /** Abre la ficha del paquete: de qué corrida y de qué madera salió (ADR-366). */
  onVerPaquete?: (codigo: string) => void;
  /** Salta a una vista del libro (para ver el despacho en su registro). */
  onIrA: (vista: string) => void;
}) {
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingresos, setIngresos] = useState<WoodEntry[]>([]);
  const [despachos, setDespachos] = useState<DespachoHit[]>([]);
  /** Paquetes cuyo cartel dice eso (ADR-366). */
  const [paquetes, setPaquetes] = useState<PaqueteHit[]>([]);
  const [buscado, setBuscado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  /**
   * Busca SIN el filtro de período: quien tiene una guía en la mano no sabe (ni
   * tiene por qué) en qué trimestre cayó. El período sí se usa para el registro
   * de salida, que no acepta búsqueda global — ahí se avisa si no aparece.
   */
  const buscar = useCallback(async () => {
    const termino = q.trim();
    if (termino.length < 3) return;
    setBuscando(true);
    setError(null);
    try {
      const pSalida = applyCtpPeriodParams(new URLSearchParams({ section: "despacho" }), period);
      pSalida.set("search", termino);
      const [rIng, rDes, rPaq] = await Promise.all([
        fetch(`/api/admin/forestal/wood-entries?search=${encodeURIComponent(termino)}&limit=20`, {
          credentials: "include",
        }),
        fetch(`/api/admin/forestal/ctp?${pSalida}`, { credentials: "include" }),
        /* El tercer registro donde puede caer un número que alguien tiene en la
           mano: el cartel de un atado en la pila (ADR-366). Sin período — el que
           lee el cartel no sabe de qué mes es la corrida. */
        fetch(`/api/admin/forestal/ctp?paquete=${encodeURIComponent(termino)}`, { credentials: "include" }),
      ]);
      if (!rIng.ok) throw new Error(`No se pudo buscar en ingresos (HTTP ${rIng.status})`);
      const dataIng: { entries?: WoodEntry[] } = await rIng.json();
      const dataDes: { entries?: DespachoHit[] } = rDes.ok ? await rDes.json() : { entries: [] };
      const dataPaq: { resultados?: PaqueteHit[] } = rPaq.ok ? await rPaq.json() : { resultados: [] };
      setPaquetes(dataPaq.resultados ?? []);
      setIngresos(dataIng.entries ?? []);
      setDespachos(
        (dataDes.entries ?? []).filter((d) =>
          (d.gtfNumber ?? "").toLowerCase().includes(termino.toLowerCase()),
        ),
      );
      setBuscado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBuscando(false);
    }
  }, [q, period]);

  const sinResultados = buscado && ingresos.length === 0 && despachos.length === 0 && paquetes.length === 0;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 backdrop-blur-sm sm:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Buscar en el libro"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-[42rem] overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de búsqueda: el foco entra acá y Enter busca. */}
        <div className="flex items-center gap-3 border-b-2 border-[var(--rule-soft)] px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void buscar();
            }}
            placeholder="N° de guía, código de paquete, proveedor o especie…"
            aria-label="Buscar una guía o un paquete en el libro"
            className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none"
          />
          {buscando && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--text-tertiary)]" />}
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {error && (
            <p className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              {error}
            </p>
          )}

          {!buscado && !error && (
            <div className="px-2 py-6 text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                Escribí el número y apretá <strong>Enter</strong>.
              </p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Busca en los tres registros a la vez: la guía con la que <strong>entró</strong> la madera, la
                que el CTP <strong>emitió</strong> al despachar y el <strong>código del paquete</strong> pintado
                en la pila. Ingresos y paquetes se buscan en todo el histórico, no sólo en el período elegido.
              </p>
            </div>
          )}

          {sinResultados && (
            <div className="px-2 py-6 text-center">
              <p className="text-sm font-bold text-[var(--text-primary)]">Eso no está en el libro.</p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Si es una guía de salida, fijate que el período elegido la incluya. Si es de ingreso y la madera
                ya llegó, todavía no está registrada.
              </p>
            </div>
          )}

          {/**
           * Los paquetes primero: si alguien tipeó un código de atado, ES lo que
           * está buscando — las guías son el otro extremo de la cadena.
           */}
          {paquetes.length > 0 && onVerPaquete && (
            <section className="mb-4">
              <h3 className="mb-2 flex items-center gap-2 border-b-2 border-[var(--rule-soft)] pb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                <Boxes className="h-4 w-4" aria-hidden="true" />
                Paquetes con ese código · {paquetes.length}
              </h3>
              <ul className="space-y-2">
                {paquetes.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => { onVerPaquete(p.codigo); onCerrar(); }}
                      className="group flex w-full items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 text-left transition-colors hover:border-[var(--accent)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{p.codigo}</span>
                          <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]">
                            corrida N° {p.corrida.lineNo}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-[var(--text-secondary)]">
                          {formatDate(p.corrida.entryDate)} · {productLabel(p.productType ?? "")} ·{" "}
                          {p.corrida.speciesCommon ?? "—"} · {Number(p.volumenM3 ?? 0).toFixed(4)} m³
                          {p.corrida.lote ? ` · lote ${p.corrida.lote}` : ""}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-colors group-hover:text-[var(--accent)]" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ingresos.length > 0 && (
            <section className="mb-4">
              <h3 className="mb-2 flex items-center gap-2 border-b-2 border-[var(--rule-soft)] pb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                <PackageOpen className="h-4 w-4" aria-hidden="true" />
                Entró con esta guía · {ingresos.length}
              </h3>
              <ul className="space-y-2">
                {ingresos.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onVerIngreso(e);
                        onCerrar();
                      }}
                      className="group flex w-full items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 text-left transition-colors hover:border-[var(--accent)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{e.gtfNumber}</span>
                          <StatusBadge status={e.status} />
                        </div>
                        <p className="mt-0.5 truncate text-sm text-[var(--text-secondary)]">
                          {formatDate(e.entryDate)} · {e.speciesCommonName} · {Number(e.volumeM3).toFixed(4)} m³ ·{" "}
                          {e.providerName}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                        Ver ficha
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {despachos.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 border-b-2 border-[var(--rule-soft)] pb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                <Truck className="h-4 w-4" aria-hidden="true" />
                Salió con esta guía · {despachos.length}
              </h3>
              <ul className="space-y-2">
                {despachos.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onIrA("despacho");
                        onCerrar();
                      }}
                      className="group flex w-full items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 text-left transition-colors hover:border-[var(--accent)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{d.gtfNumber}</span>
                          <span className="text-xs text-[var(--text-tertiary)]">línea #{d.lineNo}</span>
                          {d.status === "anulado" && (
                            <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]">
                              Anulado
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-sm text-[var(--text-secondary)]">
                          {formatDate(d.entryDate)} · {d.speciesCommon ?? "—"} ·{" "}
                          {d.quantity ? `${Number(d.quantity).toFixed(4)} ${d.unit ?? ""}` : "—"}
                          {d.destino ? ` · ${d.destino}` : ""}
                          {d.productType ? ` · ${productLabel(d.productType)}` : ""}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                        Ir al registro
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
