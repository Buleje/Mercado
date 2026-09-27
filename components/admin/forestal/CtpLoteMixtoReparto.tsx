"use client";

/**
 * «Terminar y repartir» el lote mixto (ADR-441): la vista previa de los lotes
 * que salen —uno por especie + permiso, nuevo o sumado a uno abierto que lo
 * acepte— antes de confirmar. El servidor reparte todo en UNA transacción: o
 * salen todos los lotes o ninguno, y el mixto queda `repartido`.
 */

import { useMemo, useState } from "react";
import { Layers, Loader2 } from "@buleje/design-system/icons";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { planDeReparto } from "@/lib/forestal/lote-mixto";
import { textoDelReparto } from "@/lib/forestal/lote-por-escaneo";
import { opcionesDeDestino, rotuloDelPt } from "@/lib/forestal/lote-mixto-vista";
import { CAMPO, plural } from "./armar-lote-escaneo-partes";
import { Btn } from "./ctp-shared";
import type { TarjetaDelMixto } from "./hooks/use-pila-del-mixto";

export default function CtpLoteMixtoReparto({
  code,
  pila,
  tarjetas,
  lotes,
  onVolver,
  onConfirmar,
}: {
  code: string;
  /** Las trozas del mixto, en orden de escaneo. */
  pila: readonly TrozaConsumible[];
  tarjetas: readonly TarjetaDelMixto[];
  /** Los lotes de aserrío (del patio): entre los abiertos se ofrece sumar. */
  lotes: readonly LoteAserrio[];
  onVolver: () => void;
  /** Lanza con el mensaje del servidor: se muestra acá y nada cambió. */
  onConfirmar: (p: { destinos: Record<string, string>; notas: string }) => Promise<void>;
}) {
  const [destinos, setDestinos] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abiertos = useMemo(() => lotes.filter((l) => l.status === "abierto"), [lotes]);
  const grupos = useMemo(() => tarjetas.map((t) => t.grupo), [tarjetas]);
  const opciones = useMemo(() => opcionesDeDestino(grupos, abiertos, destinos), [grupos, abiertos, destinos]);
  /* Un destino que ya no se ofrece (otro equipo lo consumió) vuelve a «lote nuevo». */
  const vigentes = useMemo(() => {
    const d: Record<string, string> = {};
    for (const [clave, id] of Object.entries(destinos)) if (opciones.get(clave)?.some((l) => l.id === id)) d[clave] = id;
    return d;
  }, [destinos, opciones]);
  /* La MISMA función con la que el servidor decide: si dice que no, no se manda. */
  const plan = useMemo(() => planDeReparto(pila, abiertos, vigentes), [pila, abiertos, vigentes]);
  const sumas = Object.keys(vigentes).length;
  const piezas = grupos.reduce((a, g) => a + g.piezas, 0);

  const confirmar = async () => {
    if (!plan.ok) return;
    setGuardando(true);
    setError(null);
    try {
      await onConfirmar({ destinos: vigentes, notas });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section aria-label={`Repartir ${code}`} className="space-y-3">
      <p className="text-base font-bold text-[var(--text-primary)]">
        {plural(piezas, "troza", "trozas")} de {code} → {textoDelReparto(grupos.length - sumas, sumas)}
      </p>
      <ul className="space-y-2">
        {grupos.map((g) => {
          const aceptan = opciones.get(g.clave) ?? [];
          return (
            <li key={g.clave} className="space-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
              <p className="text-base font-bold text-[var(--text-primary)]">
                {g.especie} · <span className="tabular-nums">{fmtPt(g.pt)}</span>{" "}
                <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotuloDelPt(g)}</span>
                <span className="block text-sm font-normal text-[var(--text-secondary)]">
                  <span className="tabular-nums">{fmtM3(g.m3)} m³</span> · {plural(g.piezas, "troza", "trozas")} ·{" "}
                  {g.permiso ? `Permiso ${g.permiso}` : "Sin permiso en sus guías"}
                </span>
              </p>
              <label className="block text-sm">
                <span className="mb-1 block font-bold text-[var(--text-secondary)]">Va a</span>
                <select
                  value={vigentes[g.clave] ?? "nuevo"}
                  onChange={(e) =>
                    setDestinos((prev) => {
                      const n = { ...prev };
                      if (e.target.value === "nuevo") delete n[g.clave];
                      else n[g.clave] = e.target.value;
                      return n;
                    })
                  }
                  disabled={guardando}
                  className={CAMPO}
                >
                  <option value="nuevo">Un lote nuevo de {g.especie}</option>
                  {aceptan.map((l) => (
                    <option key={l.id} value={l.id}>
                      Sumar al {l.code}
                      {l.permiso ? ` · ${l.permiso}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          );
        })}
      </ul>

      {grupos.length - sumas > 0 && (
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-[var(--text-secondary)]">
            Nota {grupos.length - sumas === 1 ? "del lote nuevo" : "de los lotes nuevos"} (opcional)
          </span>
          <input
            type="text"
            value={notas}
            maxLength={500}
            onChange={(e) => setNotas(e.target.value)}
            disabled={guardando}
            placeholder="ej: pila junto al carro 2"
            className={CAMPO}
          />
        </label>
      )}

      {!plan.ok && (
        <p role="alert" className="rounded-xl bg-[var(--data-warning-500)]/10 px-3 py-2 text-base font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
          {plan.error}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-[var(--data-error-500)]/10 px-3 py-2 text-base font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
          No se repartió: {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Btn variant="secondary" onClick={onVolver} disabled={guardando}>
          Seguir escaneando
        </Btn>
        <Btn variant="primary" onClick={() => void confirmar()} disabled={guardando || grupos.length === 0 || !plan.ok} className="grow sm:grow-0">
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Layers className="h-4 w-4" aria-hidden />}
          {grupos.length === 1 ? "Repartir en 1 lote" : `Repartir en ${grupos.length} lotes`}
        </Btn>
      </div>
    </section>
  );
}
