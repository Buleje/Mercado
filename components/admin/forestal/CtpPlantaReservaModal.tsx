"use client";

/**
 * CtpPlantaReservaModal — el bloque apartado: qué hay y qué sale en este viaje.
 *
 * Una cancha de reserva junta lo aserrado de un cliente, pero rara vez sale
 * todo junto: el camión de hoy lleva tres paquetes y el resto espera al de la
 * semana que viene. Por eso acá se ELIGE, paquete por paquete, y recién después
 * se abre la guía.
 *
 * Los paquetes salen de `?disponibles=1` —la única fuente con medidas, código y
 * el techo de saldo de cada corrida— y no de lo que el mapa tiene en memoria:
 * lo del mapa alcanza para dibujar un icono, no para llenar una guía.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Truck } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import {
  filasDeCorridas,
  volumenTotal,
  type CorridaDisponible,
  type FilaDespacho,
} from "@/lib/forestal/despacho-lista";
import { Btn, ModalFooter } from "./ctp-shared";

const n4 = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 4 });

export interface CtpPlantaReservaModalProps {
  /** Título del bloque: el nombre de la cancha («Lote 1 · Juan»). */
  titulo: string;
  /** Corridas apiladas en esa cancha. */
  corridas: readonly string[];
  onClose: () => void;
  /** Los `uid` elegidos, listos para entrar a la guía. */
  onDespachar: (uids: string[]) => void;
}

export default function CtpPlantaReservaModal({ titulo, corridas, onClose, onDespachar }: CtpPlantaReservaModalProps) {
  const [filas, setFilas] = useState<FilaDespacho[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    const quiero = new Set(corridas);
    ctpGet<{ corridas?: CorridaDisponible[] }>("/api/admin/forestal/ctp?disponibles=1")
      .then((r) => {
        if (!vivo) return;
        const propias = filasDeCorridas(r.corridas ?? []).filter((f) => quiero.has(f.corridaId));
        setFilas(propias);
        // Todo tildado al abrir: lo más común es que salga la cancha entera, y
        // destildar dos es menos trabajo que tildar diez.
        setElegidos(new Set(propias.map((f) => f.uid)));
        setError(null);
      })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [corridas]);

  const seleccion = useMemo(() => filas.filter((f) => elegidos.has(f.uid)), [filas, elegidos]);
  const total = volumenTotal(seleccion);
  const unidades = useMemo(() => [...new Set(seleccion.map((f) => f.unidad))], [seleccion]);
  const todos = filas.length > 0 && elegidos.size === filas.length;

  const alternar = (uid: string) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(uid)) s.delete(uid); else s.add(uid);
      return s;
    });

  return (
    <AdminModal
      open
      onClose={onClose}
      title={titulo}
      description="Elegí qué paquetes salen en este viaje; el resto se queda apartado"
      icon={Truck}
      className="max-w-4xl"
      footer={
        <ModalFooter>
          <span className="mr-auto text-sm text-[var(--text-secondary)]">
            <b className="text-[var(--text-primary)]">{seleccion.length}</b> de {filas.length} elegidos
            {seleccion.length > 0 && (
              <>
                {" · "}
                <b className="font-mono tabular-nums text-[var(--text-primary)]">{n4(total)}</b>{" "}
                {unidades.length === 1 ? unidades[0] : <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">en unidades distintas</span>}
              </>
            )}
          </span>
          <Btn onClick={onClose}>Cerrar</Btn>
          <Btn
            variant="primary"
            disabled={seleccion.length === 0}
            onClick={() => onDespachar(seleccion.map((f) => f.uid))}
          >
            <Truck className="h-4 w-4" /> Nuevo despacho ({seleccion.length})
          </Btn>
        </ModalFooter>
      }
    >
      <div className="max-h-[60vh] overflow-y-auto px-1">
        {cargando && (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-5 w-5 animate-spin" /> Buscando lo apartado acá…
          </p>
        )}
        {error && (
          <p className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}
        {!cargando && !error && filas.length === 0 && (
          <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-tertiary)]">
            Lo que estaba apartado acá ya no figura como disponible: puede haberse despachado desde otra pantalla.
          </p>
        )}

        {filas.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--surface-raised)]">
              <tr className="border-b-2 border-[var(--rule-base)] text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                <th className="w-10 py-2">
                  <input
                    type="checkbox"
                    checked={todos}
                    aria-label="Elegir todos los paquetes"
                    onChange={() => setElegidos(todos ? new Set() : new Set(filas.map((f) => f.uid)))}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                </th>
                <th className="py-2">Paquete</th>
                <th className="py-2">Especie</th>
                <th className="py-2">Producto</th>
                <th className="py-2 text-right">Piezas</th>
                <th className="py-2 text-right">Volumen</th>
                <th className="py-2 text-right">Saldo corrida</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const on = elegidos.has(f.uid);
                return (
                  <tr
                    key={f.uid}
                    onClick={() => alternar(f.uid)}
                    className={`cursor-pointer border-b border-[var(--rule-soft)] transition ${on ? "bg-primary/10 dark:bg-[var(--accent)]/12" : "hover:bg-[var(--surface-sunken)]"}`}
                  >
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => alternar(f.uid)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Elegir ${f.codigo ?? `corrida #${f.lineNo}`}`}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </td>
                    <td className="py-2">
                      <b className="text-[var(--text-primary)]">{f.codigo ?? `Corrida #${f.lineNo}`}</b>
                      {f.lote && <span className="ml-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{f.lote}</span>}
                    </td>
                    <td className="py-2 text-[var(--text-secondary)]">
                      {f.especie ?? "—"}
                      {f.cites && <span className="ml-1 rounded bg-[var(--data-error-500)]/15 px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">CITES</span>}
                    </td>
                    <td className="py-2 text-[var(--text-secondary)]">{f.producto ?? "—"}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{f.cantidad || "—"}</td>
                    <td className="py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{n4(f.volumen)} {f.unidad}</td>
                    <td className="py-2 text-right font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">{n4(f.disponibleCorrida)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </AdminModal>
  );
}
