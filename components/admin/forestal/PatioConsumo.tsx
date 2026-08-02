"use client";

/**
 * Cargar los palos que entran al carro, desde el patio (ADR-326).
 *
 * Acá NO se da de alta la corrida. Una corrida son quince campos —producto,
 * presentación, línea, código de paquete, costo de proceso— y llenarlos parado
 * frente a la sierra es cómo se registra mal. La corrida se abre en la oficina;
 * el patio le va sumando las piezas, que es lo único que se sabe estando ahí.
 *
 * El picker es el MISMO del libro (`CtpTrozasPicker`): sus reglas de bloqueo son
 * las que el servidor espeja al guardar (T1). Si el patio tuviera su propia
 * versión, tarde o temprano dejaría tildar algo que la base rechaza.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Boxes } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { URL_TROZAS_CONSUMO, escribirDelPatio } from "@/lib/forestal/patio-cola";
import { cn } from "@/lib/utils";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import CtpTrozasPicker from "./CtpTrozasPicker";

export interface CorridaPatio {
  id: string;
  lineNo: number;
  entryDate: string;
  productType: string | null;
  speciesCommon: string | null;
  quantity: number | string | null;
  unit: string | null;
  status: string;
}

const fmtFecha = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });
  } catch {
    return iso;
  }
};

export default function PatioConsumo() {
  const [corridas, setCorridas] = useState<CorridaPatio[] | null>(null);
  const [elegida, setElegida] = useState<CorridaPatio | null>(null);
  const [trozas, setTrozas] = useState<TrozaConsumible[]>([]);
  const [cargandoTrozas, setCargandoTrozas] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  const pedir = useCallback(async <T,>(url: string): Promise<T> => {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
    return (await r.json()) as T;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const d = await pedir<{ entries?: CorridaPatio[] }>(
          "/api/admin/forestal/ctp?section=produccion&limit=30",
        );
        // El backend ordena por N° de línea, que deja PRIMERO las más viejas: la
        // de arriba era la #1 de hace meses, casi siempre de un período cerrado,
        // y el operario perdía el viaje eligiéndola. La que se está aserrando es
        // la más reciente, así que se ordena por fecha descendente acá.
        setCorridas(
          (d.entries ?? [])
            .filter((e) => e.status === "registrado")
            .sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()),
        );
      } catch {
        // Sin señal no hay corridas que ofrecer, pero el resto del patio sigue
        // sirviendo: se muestra la lista vacía, no un error que tape la pantalla.
        setCorridas([]);
      }
    })();
  }, [pedir]);

  /** Las trozas se piden al elegir la corrida, no antes: son muchas y en el
   *  patio la señal se paga cara. */
  const abrir = useCallback(
    async (c: CorridaPatio) => {
      setElegida(c);
      setSeleccion(new Set());
      setListo(null);
      setError(null);
      setCargandoTrozas(true);
      try {
        const d = await pedir<{ trozas?: TrozaConsumible[] }>(URL_TROZAS_CONSUMO);
        setTrozas(d.trozas ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setCargandoTrozas(false);
      }
    },
    [pedir],
  );

  const guardar = useCallback(async () => {
    if (!elegida || seleccion.size === 0) return;
    setGuardando(true);
    setError(null);
    const cuantas = seleccion.size;
    const piezas = `${cuantas} pieza${cuantas === 1 ? "" : "s"}`;
    try {
      const r = await escribirDelPatio({
        section: "consumo",
        url: URL_TROZAS_CONSUMO,
        payload: { ctpEntryId: elegida.id, trozaIds: [...seleccion] },
      });

      if (r.estado === "error") {
        // El libro opinó (mes cerrado, troza ya consumida): se muestra tal cual.
        // Encolarlo sería prometerle al operario que se va a arreglar solo.
        setError(r.mensaje ?? "El libro rechazó la carga.");
        return;
      }

      setSeleccion(new Set());
      if (r.estado === "encolada") {
        // Se dice SIN VUELTAS que todavía no está en el libro: dar por hecho lo
        // que está en cola es cómo se pierde madera en el conteo.
        setListo(`${piezas} anotada${cuantas === 1 ? "" : "s"} en el equipo. Se suben al libro cuando vuelva la señal.`);
        return;
      }

      setListo(`${piezas} cargada${cuantas === 1 ? "" : "s"} a la corrida #${elegida.lineNo}.`);
      // Se recargan: las que se acaban de cargar ya no están disponibles y
      // dejarlas a la vista invitaría a tildarlas de nuevo. Sólo tras un OK
      // real — sin señal la lista no se puede refrescar y quedaría vacía.
      const d = await pedir<{ trozas?: TrozaConsumible[] }>(URL_TROZAS_CONSUMO);
      setTrozas(d.trozas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }, [elegida, seleccion, pedir]);

  const etiqueta = useMemo(
    () =>
      elegida
        ? `#${elegida.lineNo} · ${elegida.productType ?? "—"}${elegida.speciesCommon ? ` · ${elegida.speciesCommon}` : ""}`
        : "",
    [elegida],
  );

  return (
    <section className="space-y-3">
      <SectionTitle as="h2" className="text-base font-bold text-[var(--text-primary)]">
        Cargar piezas a una corrida
      </SectionTitle>

      {!elegida ? (
        <>
          <p className="text-base text-[var(--text-secondary)]">
            Elegí la corrida que está aserrando. Se abre en la oficina; acá se le suman los palos.
          </p>
          {corridas === null ? (
            <p className="flex items-center gap-2 py-4 text-base text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Buscando las corridas abiertas…
            </p>
          ) : corridas.length === 0 ? (
            <p className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-6 text-center text-base text-[var(--text-secondary)]">
              No hay corridas de producción registradas. Se dan de alta desde el Libro CTP.
            </p>
          ) : (
            <ul className="space-y-2">
              {corridas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void abrir(c)}
                    className="flex w-full items-center gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)]"
                  >
                    <Boxes className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-bold text-[var(--text-primary)]">
                        #{c.lineNo} · {c.productType ?? "—"}
                      </span>
                      <span className="block truncate text-base text-[var(--text-secondary)]">
                        {c.speciesCommon ?? "—"} · {Number(c.quantity ?? 0).toFixed(4)} {c.unit ?? ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-base text-[var(--text-tertiary)]">{fmtFecha(c.entryDate)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--surface-sunken)] px-4 py-3">
            <span className="text-base font-bold text-[var(--text-primary)]">Corrida {etiqueta}</span>
            <button
              type="button"
              onClick={() => { setElegida(null); setSeleccion(new Set()); setListo(null); }}
              className="h-11 rounded-2xl border-2 border-[var(--rule-base)] px-4 text-base font-bold text-[var(--text-secondary)]"
            >
              Cambiar
            </button>
          </div>

          {listo && (
            <p className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] px-4 py-3 text-base font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/10 dark:text-[var(--data-success-500)]">
              <Check className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {listo}
            </p>
          )}
          {error && (
            <p className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-base text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {error}
            </p>
          )}

          <CtpTrozasPicker
            trozas={trozas}
            cargando={cargandoTrozas}
            seleccion={seleccion}
            onSeleccion={setSeleccion}
            corridaId={elegida.id}
          />

          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || seleccion.size === 0}
            className={cn(
              "flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-bold text-white transition",
              "bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)]",
              "disabled:opacity-40",
            )}
          >
            {guardando && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            {seleccion.size === 0
              ? "Elegí las piezas"
              : `Cargar ${seleccion.size} pieza${seleccion.size === 1 ? "" : "s"}`}
          </button>
        </>
      )}
    </section>
  );
}
