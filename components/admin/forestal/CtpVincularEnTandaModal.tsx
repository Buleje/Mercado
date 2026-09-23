"use client";

/**
 * Ponerle el lote a VARIAS producciones sin lote de una vez.
 *
 * Pedido de Brandon (2026-09-13): «marco esas 5 producciones sin lote, elijo el
 * lote, y se va restando lo usado hasta que quede el saldo». Las corridas no
 * cambian —siguen siendo las mismas cinco, con su fecha, su volumen y su
 * producto—: lo único que ganan es de qué madera salieron.
 *
 * Es la hermana en tanda de `CtpVincularMateriaPrimaModal` (ADR-408) y comparte
 * TODO lo que decide: las cinco reglas salen de `revisarVinculacion`, corrida
 * por corrida, y la escritura va por el mismo `sumar-corrida` que usa Consumos.
 * Lo único nuevo es el **reparto** (`vincular-en-tanda.ts`): el lote es uno y su
 * madera se gasta, así que lo que se lleva la primera ya no está para la
 * segunda.
 *
 * Se escribe **de a una y en orden**, no todas juntas: cada llamada toma el lock
 * del lote y sus trozas, y dispararlas en paralelo es pedir un abrazo mortal.
 * Si una falla, se para ahí y se dice cuántas alcanzaron a quedar — el libro
 * nunca queda diciendo algo que no pasó.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Layers, Loader2, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { piezasLibres, volumenLibre, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { largoMaxEnMetros, type TrozaAVincular } from "@/lib/forestal/vincular-produccion";
import { repartirEnTanda, resumenDeTanda, type CorridaEnTanda } from "@/lib/forestal/vincular-en-tanda";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { Btn } from "./ctp-shared";

const TH = "px-2 py-1.5 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 text-sm text-[var(--text-secondary)]";
const NUM = `${TD} text-right font-mono tabular-nums`;

/** Sin tildes ni mayúsculas — la misma comparación que usa el resto del módulo. */
const norma = (v: string | null | undefined): string =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const num = (v: number | string | null | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function CtpVincularEnTandaModal({
  corridas,
  lotes,
  onCerrar,
  onListo,
}: {
  /** Las producciones sin lote que se marcaron en la pantalla. */
  corridas: CorridaEnTanda[];
  lotes: LoteAserrio[];
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  /* Las especies que hay entre las marcadas: un lote es de UNA sola, así que si
     se marcaron dos maderas distintas conviene decirlo antes de que la tabla se
     llene de errores de especie. */
  const especies = useMemo(
    () => [...new Set(corridas.map((c) => norma(c.especie)).filter(Boolean))],
    [corridas],
  );

  /* Sólo lotes abiertos con piezas libres. Cuando todas las marcadas son de la
     misma especie se filtra también por ella; con especies mezcladas se
     muestran todos y cada fila dice lo suyo. */
  const candidatos = useMemo(
    () =>
      lotes.filter(
        (l) =>
          l.status === "abierto" &&
          piezasLibres(l).length > 0 &&
          (especies.length !== 1 || norma(l.speciesCommon) === especies[0]),
      ),
    [lotes, especies],
  );

  const [loteId, setLoteId] = useState<string>("");
  const lote = candidatos.find((l) => l.id === loteId) ?? null;
  const libres = useMemo(() => (lote ? piezasLibres(lote) : []), [lote]);

  /**
   * La lista marcada, como una clave estable.
   *
   * `corridas` es un array que el padre arma en cada render: colgar un `fetch`
   * de esa referencia es una ráfaga infinita de pedidos. Lo que de verdad cambia
   * es QUIÉNES están marcadas, y eso es esta cadena.
   */
  const idsKey = corridas.map((c) => c.id).join("|");
  const corridasRef = useRef(corridas);
  corridasRef.current = corridas;

  /** Las que entran a esta tanda: se pueden destildar acá mismo. */
  const [incluidas, setIncluidas] = useState<Set<string>>(() => new Set(corridas.map((c) => c.id)));
  /* Si una marcada desaparece de atrás, se va de la tanda. Podar y nada más:
     volver a tildarlas todas reviviría las que el operario destildó acá adentro. */
  useEffect(() => {
    setIncluidas((prev) => {
      const vivos = new Set(corridasRef.current.map((c) => c.id));
      return [...prev].every((id) => vivos.has(id)) ? prev : new Set([...prev].filter((id) => vivos.has(id)));
    });
  }, [idsKey]);

  /**
   * El largo de la pieza más larga de cada corrida sale de sus PAQUETES, que el
   * listado del libro no trae. Sin esto, la regla del largo sólo podría avisar
   * «no se puede comprobar» — y es justo la que impide declarar que de una troza
   * de 3 m salió una tabla de 6.
   */
  const [largos, setLargos] = useState<Record<string, number | null>>({});
  useEffect(() => {
    let vivo = true;
    /* En serie y no en paralelo: son pocas y el libro ya está cargando otras
       cosas; una ráfaga de fetches por cada marcada no compra nada. */
    void (async () => {
      for (const c of corridasRef.current) {
        try {
          const j = await ctpGet<{ entry?: { paquetes?: { largoM?: number | string | null }[] } }>(
            `/api/admin/forestal/ctp?entryId=${encodeURIComponent(c.id)}`,
          );
          if (!vivo) return;
          const ps = j.entry?.paquetes ?? [];
          if (ps.length > 0) {
            setLargos((m) => ({ ...m, [c.id]: largoMaxEnMetros(ps.map((x) => ({ largoM: num(x.largoM) }))) }));
          }
        } catch {
          /* Sin paquetes la regla del largo avisa, que es lo honesto. */
        }
      }
    })();
    return () => { vivo = false; };
  }, [idsKey]);

  const trozasDelLote: TrozaAVincular[] = useMemo(
    () =>
      libres.map((t) => ({
        id: t.id,
        codigo: t.codigoPlanta ?? t.codificacion,
        volumenM3: Number(t.volumenM3 ?? 0),
        largoM: t.largoM == null ? null : Number(t.largoM),
        /* El hook ya filtró las consumidas; lo que llegue acá está libre. Si el
           servidor ve otra cosa (T1, cierre, congelado), manda él. */
        noDisponible: null,
      })),
    [libres],
  );

  const reparto = useMemo(() => {
    if (!lote) return null;
    const elegidas = corridas
      .filter((c) => incluidas.has(c.id))
      .map((c) => ({ ...c, largoMaxPiezaM: largos[c.id] ?? c.largoMaxPiezaM }));
    return repartirEnTanda(
      elegidas,
      { code: lote.code, especie: lote.speciesCommon, status: lote.status },
      trozasDelLote,
    );
  }, [corridas, incluidas, largos, lote, trozasDelLote]);

  const [guardando, setGuardando] = useState(false);
  const [hechas, setHechas] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar: guardando ? undefined : onCerrar });

  const vincular = async () => {
    if (!lote || !reparto || reparto.vinculables === 0) return;
    setGuardando(true);
    setError(null);
    setHechas(0);
    const aEscribir = reparto.filas.filter((f) => f.alcanzo && f.revision.puedeVincular);
    let ok = 0;
    try {
      for (const f of aEscribir) {
        const r = await fetch("/api/admin/forestal/lotes-aserrio", {
          method: "PATCH",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            accion: "sumar-corrida",
            loteId: lote.id,
            corridaId: f.corrida.id,
            trozaIds: f.trozas.map((t) => t.id),
            fecha: f.corrida.fecha.slice(0, 10),
          }),
        });
        const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        if (!r.ok) {
          throw new Error(
            `Corrida N° ${f.corrida.lineNo ?? "—"}: ${j.message ?? j.error ?? `el servidor respondió ${r.status}`}`,
          );
        }
        ok += 1;
        setHechas(ok);
      }
      invalidarCtp();
      onListo(
        `${ok} producci${ok === 1 ? "ón quedó" : "ones quedaron"} con su materia prima del lote ${lote.code} · ` +
          `${fmtM3(reparto.usadoM3)} m³ de troza atribuidos · quedan ${fmtM3(reparto.saldoM3)} m³ de saldo en el lote.`,
      );
    } catch (e) {
      invalidarCtp();
      /* Lo que YA se escribió queda escrito: decir cuánto entró es la diferencia
         entre un error y un libro que nadie sabe en qué estado quedó. */
      setError(
        (ok > 0 ? `Se vincularon ${ok} de ${aEscribir.length} y se paró acá. ` : "") +
          (e instanceof Error ? e.message : String(e)),
      );
      setGuardando(false);
      return;
    }
    setGuardando(false);
  };

  const volLibre = lote ? volumenLibre(lote) : 0;

  return (
    <div className="modal-backdrop fixed inset-0 z-modal flex items-center justify-center bg-black/60 p-3">
      <div
        ref={cajaRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Ponerle el lote a varias producciones"
        className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-display text-lg text-[var(--text-primary)]">
              <Layers className="h-5 w-5 text-[var(--accent)]" aria-hidden /> Ponerles el lote
            </h3>
            <p className="text-xs text-[var(--text-tertiary)]">
              {corridas.length} producci{corridas.length === 1 ? "ón marcada" : "ones marcadas"} sin materia prima.
              Siguen siendo las mismas: sólo pasan a decir de qué madera salieron.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-xl p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5 sm:px-6">
          {especies.length > 1 && (
            <p className="flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
              Marcaste {especies.length} especies distintas y un lote es de una sola. Las que no
              coincidan van a quedar afuera — destildalas o hacelas en otra tanda.
            </p>
          )}

          <label className="block">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              Lote de aserrío
            </span>
            <select
              value={loteId}
              onChange={(e) => setLoteId(e.target.value)}
              disabled={guardando}
              className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">Elige el lote que entró a la sierra…</option>
              {candidatos.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.speciesCommon ?? "sin especie"} · {fmtM3(volumenLibre(l))} m³ libres ·{" "}
                  {piezasLibres(l).length} troza(s)
                </option>
              ))}
            </select>
            {candidatos.length === 0 && (
              <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
                No hay ningún lote abierto con trozas libres
                {especies.length === 1 ? " de esa especie" : ""}. Arma uno en la pestaña Lotes.
              </span>
            )}
          </label>

          {lote && reparto && (
            <>
              <div className="overflow-x-auto rounded-xl border border-[var(--rule-soft)]">
                <table className="w-full">
                  <thead className="bg-[var(--surface-sunken)]">
                    <tr>
                      <th className={TH} scope="col">
                        <span className="sr-only">Incluir</span>
                      </th>
                      <th className={TH} scope="col">Corrida</th>
                      <th className={`${TH} text-right`} scope="col">Declarado</th>
                      <th className={`${TH} text-right`} scope="col">Troza que le toca</th>
                      <th className={`${TH} text-right`} scope="col">Rend.</th>
                      <th className={TH} scope="col">Qué pasa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--rule-soft)]">
                    {reparto.filas.map((f) => {
                      const errores = f.revision.hallazgos.filter((h) => h.severidad === "error");
                      const avisos = f.revision.hallazgos.filter((h) => h.severidad === "aviso");
                      const entra = f.alcanzo && f.revision.puedeVincular;
                      return (
                        <tr key={f.corrida.id} className={entra ? "" : "bg-[var(--surface-sunken)]/50"}>
                          <td className={TD}>
                            <input
                              type="checkbox"
                              checked
                              disabled={guardando}
                              onChange={() =>
                                setIncluidas((s) => {
                                  const n = new Set(s);
                                  n.delete(f.corrida.id);
                                  return n;
                                })
                              }
                              aria-label={`Sacar la corrida N° ${f.corrida.lineNo ?? "—"} de la tanda`}
                              className="h-4 w-4 accent-[var(--accent)]"
                            />
                          </td>
                          <td className={TD}>
                            <span className="font-bold text-[var(--text-primary)]">N° {f.corrida.lineNo ?? "—"}</span>{" "}
                            <span className="text-[var(--text-tertiary)]">
                              {f.corrida.especie ?? "sin especie"} · {f.corrida.fecha.slice(0, 10)}
                            </span>
                          </td>
                          <td className={NUM}>{fmtM3(f.corrida.producidoM3)} m³</td>
                          <td className={NUM}>
                            {f.alcanzo ? (
                              <>
                                {fmtM3(f.revision.trozaM3)} m³
                                <span className="ml-1 text-[var(--text-tertiary)]">({f.trozas.length})</span>
                              </>
                            ) : (
                              <span className="text-[var(--text-tertiary)]">—</span>
                            )}
                          </td>
                          <td className={NUM}>
                            {f.revision.rendimientoPct != null ? `${f.revision.rendimientoPct} %` : "—"}
                          </td>
                          <td className={`${TD} min-w-[16rem]`}>
                            {!f.alcanzo ? (
                              <span className="text-[var(--text-tertiary)]">
                                La madera del lote se acabó antes de llegarle. Queda sin vincular.
                              </span>
                            ) : errores.length > 0 ? (
                              <ul className="space-y-0.5">
                                {errores.map((h, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span>{h.mensaje}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : avisos.length > 0 ? (
                              <ul className="space-y-0.5">
                                {avisos.map((h, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span>{h.mensaje}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                                <Check className="h-4 w-4" aria-hidden /> Queda con su origen
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Lo que Brandon pidió ver: cuánto se usa y cuánto queda. */}
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2.5 text-center">
                {[
                  { k: "Tenía el lote", v: volLibre },
                  { k: "Se usa", v: reparto.usadoM3 },
                  { k: "Saldo", v: reparto.saldoM3 },
                ].map((x) => (
                  <div key={x.k}>
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                      {x.k}
                    </p>
                    <p className="font-mono text-sm tabular-nums text-[var(--text-primary)]">{fmtM3(x.v)} m³</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {error && (
            <p className="flex items-start gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" aria-hidden />
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--rule-base)] px-5 py-3.5 sm:px-6">
          <p className="min-w-0 flex-1 text-xs text-[var(--text-secondary)]">
            {reparto ? resumenDeTanda(reparto, fmtM3) : "Elige el lote para ver qué le toca a cada una."}
          </p>
          <div className="flex items-center gap-2">
            <Btn onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Btn>
            <Btn variant="primary" onClick={vincular} disabled={guardando || !reparto || reparto.vinculables === 0}>
              {guardando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Vinculando {hechas + 1} de{" "}
                  {reparto?.vinculables ?? 0}…
                </>
              ) : (
                `Ponerle el lote a ${reparto?.vinculables ?? 0}`
              )}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
