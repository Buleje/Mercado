"use client";

/**
 * Armar una guía eligiendo por LOTE.
 *
 * Pedido de Brandon (2026-09-12): «que permita seleccionar a un lado qué lotes
 * usar tipo check, y al otro lado las tablas de esos productos disponibles
 * (aserrada), poder escoger en conjunto varios o sólo uno, y un botón que
 * permita usarlo para ponerlos directo para hacer el despacho — ahí nomás
 * aparece el modal de GTF».
 *
 * El despacho por producto ya existía en «Productos disponibles»; lo que
 * faltaba era entrar por el lote, que es como se piensa en el patio («sacá lo
 * del 13 y el 15»). Por eso esto NO es un despacho nuevo: arma la misma lista
 * de `uid`s y se la pasa a la misma guía (`presetUids`). Una segunda forma de
 * emitir sería una segunda verdad.
 *
 * Sólo entra lo DISPONIBLE. Lo despachado ya salió y lo marcado como uso propio
 * no va a salir: ponerlos en una guía declararía madera que no se mueve.
 */

import { useEffect, useMemo, useState } from "react";
import { Layers, Loader2, PackageOpen, Truck } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn, MODAL_BODY, ModalFooter } from "./ctp-shared";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { uidDeFila } from "@/lib/forestal/despacho-lista";
import {
  agruparPorLote,
  type CorridaConSaldo,
  type ProductoDeLote,
  type ResumenDeLote,
} from "@/lib/forestal/productos-de-lote";

const CELDA = "px-3 py-2.5 text-sm";
const CIFRA = `${CELDA} text-right font-mono tabular-nums`;

const productoLegible = (p: string | null) =>
  !p ? "—" : p.length > 3 && p === p.toUpperCase() ? p.charAt(0) + p.slice(1).toLowerCase() : p;

/** Las filas que se pueden tildar: un paquete, o la corrida entera si no tiene. */
interface FilaElegible {
  uid: string;
  lote: string;
  producto: string | null;
  especie: string | null;
  corridaNo: number | null;
  /** Código del paquete, cuando la fila ES un paquete. */
  codigo: string | null;
  m3: number;
  piezas: number | null;
}

function filasDe(resumen: ResumenDeLote): FilaElegible[] {
  const filas: FilaElegible[] = [];
  for (const p of resumen.productos) {
    if (p.destino !== "disponible") continue;
    if (p.corrida.paquetes.length > 0) {
      for (const paq of p.corrida.paquetes) {
        filas.push({
          uid: uidDeFila(p.corrida.id, paq.id),
          lote: resumen.lote,
          producto: paq.producto ?? p.corrida.producto,
          especie: p.corrida.especie,
          corridaNo: p.corrida.lineNo,
          codigo: paq.codigo,
          m3: paq.volumenM3,
          piezas: paq.cantidad,
        });
      }
    } else {
      filas.push({
        uid: uidDeFila(p.corrida.id, null),
        lote: resumen.lote,
        producto: p.corrida.producto,
        especie: p.corrida.especie,
        corridaNo: p.corrida.lineNo,
        codigo: null,
        m3: p.corrida.disponible,
        piezas: null,
      });
    }
  }
  return filas;
}

export default function CtpDespacharDesdeLotesModal({
  onClose,
  onDespachar,
}: {
  onClose: () => void;
  /** Abre la guía de transporte con estos `uid`s ya cargados. */
  onDespachar: (uids: string[]) => void;
}) {
  const [corridas, setCorridas] = useState<CorridaConSaldo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lotesElegidos, setLotesElegidos] = useState<Set<string>>(new Set());
  const [filasElegidas, setFilasElegidas] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    /* Sin `incluirUsados`: acá sólo interesa lo que puede salir. Lo marcado como
       usado se explica en el modal de productos del lote, no acá. */
    ctpGet<{ corridas?: CorridaConSaldo[] }>("/api/admin/forestal/ctp?disponibles=1", { ttlMs: 15_000 })
      .then((r) => {
        if (vivo) setCorridas(r.corridas ?? []);
      })
      .catch((e) => {
        if (vivo) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      vivo = false;
    };
  }, []);

  /** Los lotes que tienen algo para sacar, de mayor a menor volumen. */
  const conSaldo = useMemo(() => {
    if (!corridas) return [];
    return [...agruparPorLote(corridas).values()]
      .filter((r) => r.disponible > 1e-4)
      .sort((a, b) => b.disponible - a.disponible);
  }, [corridas]);

  /** La tabla de la derecha: los productos de los lotes tildados. */
  const filas = useMemo(
    () => conSaldo.filter((r) => lotesElegidos.has(r.lote)).flatMap(filasDe),
    [conSaldo, lotesElegidos],
  );

  /* Destildar un lote OLVIDA lo que estaba marcado de él.
     El conteo ya lo ignora —`elegidas` se filtra por las filas a la vista—,
     así que esto no evita que salga madera de más: evita que la selección
     REVIVA. Sin esto, destildar el lote 13 y volver a tildarlo devolvía sus
     paquetes ya marcados, y el operador armaba la guía con algo que creía
     haber soltado. */
  useEffect(() => {
    const vivos = new Set(filas.map((f) => f.uid));
    setFilasElegidas((prev) => {
      const next = new Set([...prev].filter((u) => vivos.has(u)));
      return next.size === prev.size ? prev : next;
    });
  }, [filas]);

  const elegidas = useMemo(() => filas.filter((f) => filasElegidas.has(f.uid)), [filas, filasElegidas]);
  const totalM3 = useMemo(
    () => Math.round(elegidas.reduce((a, f) => a + (Number(f.m3) || 0), 0) * 1000) / 1000,
    [elegidas],
  );

  const alternarLote = (code: string) =>
    setLotesElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const todasTildadas = filas.length > 0 && filas.every((f) => filasElegidas.has(f.uid));

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Despachar desde lotes"
      description="Elige los lotes, marca qué sale y arma la guía con eso"
      icon={Truck}
      variant="info"
      footer={
        <ModalFooter
          nota={
            elegidas.length > 0
              ? `${elegidas.length} producto${elegidas.length === 1 ? "" : "s"} de ${new Set(elegidas.map((f) => f.lote)).size} lote(s) · ${fmtM3(totalM3)} m³`
              : lotesElegidos.size === 0
                ? "Primero elige uno o más lotes de la izquierda."
                : "Marca los productos que salen."
          }
        >
          <Btn
            variant="primary"
            disabled={elegidas.length === 0}
            title={
              elegidas.length === 0
                ? "Marca al menos un producto"
                : "Abre la guía de transporte con lo marcado ya cargado"
            }
            onClick={() => onDespachar(elegidas.map((f) => f.uid))}
          >
            <Truck className="h-4 w-4" /> Armar la guía ({elegidas.length})
          </Btn>
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>
        {error ? (
          <p className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            No se pudo leer el patio: {error}
          </p>
        ) : !corridas ? (
          <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando qué hay para despachar…
          </p>
        ) : conSaldo.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-10 text-center">
            <PackageOpen className="mx-auto h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
            <p className="mt-2 text-sm font-bold text-[var(--text-primary)]">
              Ningún lote tiene madera en patio.
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              O ya se despachó todo, o lo que queda está marcado como uso propio — eso se ve en
              «Productos» de cada lote.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
            {/* Izquierda: qué lotes usar. */}
            <section className="rounded-xl border border-[var(--rule-base)]">
              <header className="flex items-center gap-2 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
                <Layers className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                  Lotes con madera ({conSaldo.length})
                </span>
              </header>
              <ul className="max-h-[46vh] overflow-auto">
                {conSaldo.map((r) => {
                  const tildado = lotesElegidos.has(r.lote);
                  return (
                    <li key={r.lote} className="border-b border-[var(--rule-soft)] last:border-0">
                      <label
                        className={`flex cursor-pointer items-center gap-2.5 px-3 py-2.5 transition-colors ${
                          tildado ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={tildado}
                          onChange={() => alternarLote(r.lote)}
                          className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                          aria-label={`Usar el lote ${r.lote}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-sm font-bold text-[var(--text-primary)]">
                            {r.lote}
                          </span>
                          <span className="block text-xs text-[var(--text-tertiary)]">
                            {r.productos.filter((p) => p.destino === "disponible").length} producto(s) en
                            patio
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                          {fmtM3(r.disponible)}
                          <span className="ml-0.5 font-sans text-xs font-normal text-[var(--text-tertiary)]">
                            m³
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Derecha: qué sale de esos lotes. */}
            <section className="min-w-0 rounded-xl border border-[var(--rule-base)]">
              {lotesElegidos.size === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Layers className="mx-auto h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
                  <p className="mt-2 text-sm font-bold text-[var(--text-primary)]">
                    Elige un lote para ver su madera.
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Puedes marcar varios: lo de todos se junta en una sola guía.
                  </p>
                </div>
              ) : (
                <div className="max-h-[46vh] overflow-auto">
                  <table className="w-full min-w-[34rem] border-collapse">
                    <thead className="sticky top-0 z-[1]">
                      <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] [&>th]:border-b [&>th]:border-[var(--rule-base)]">
                        <th className={`${CELDA} w-10`}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[var(--accent)]"
                            aria-label="Marcar todo lo de estos lotes"
                            checked={todasTildadas}
                            onChange={() =>
                              setFilasElegidas(todasTildadas ? new Set() : new Set(filas.map((f) => f.uid)))
                            }
                          />
                        </th>
                        <th className={CELDA}>Producto</th>
                        <th className={`${CELDA} whitespace-nowrap`}>Lote · corrida</th>
                        <th className={`${CELDA} text-right`}>Piezas</th>
                        <th className={`${CELDA} text-right`}>m³</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f) => {
                        const tildada = filasElegidas.has(f.uid);
                        return (
                          <tr
                            key={f.uid}
                            className={`border-t border-[var(--rule-soft)] ${tildada ? "bg-primary/5" : ""}`}
                          >
                            <td className={CELDA}>
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-[var(--accent)]"
                                checked={tildada}
                                aria-label={`Despachar ${f.codigo ?? productoLegible(f.producto)}`}
                                onChange={() =>
                                  setFilasElegidas((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(f.uid)) next.delete(f.uid);
                                    else next.add(f.uid);
                                    return next;
                                  })
                                }
                              />
                            </td>
                            <td className={CELDA}>
                              <span className="font-medium text-[var(--text-primary)]">
                                {productoLegible(f.producto)}
                              </span>
                              {f.codigo && (
                                <span className="ml-1.5 font-mono text-xs text-[var(--text-tertiary)]">
                                  {f.codigo}
                                </span>
                              )}
                            </td>
                            <td className={`${CELDA} whitespace-nowrap text-[var(--text-secondary)]`}>
                              <span className="font-mono">{f.lote}</span>
                              {f.corridaNo != null && (
                                <span className="ml-1.5 text-[var(--text-tertiary)]">N° {f.corridaNo}</span>
                              )}
                            </td>
                            <td className={CIFRA}>{f.piezas ?? "—"}</td>
                            <td className={`${CIFRA} font-bold`}>{fmtM3(f.m3)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </AdminModal>
  );
}

export type { ProductoDeLote };
