"use client";

/**
 * Qué salió de un lote, y en qué terminó cada cosa.
 *
 * Pedido de Brandon (2026-09-12): «en cada lote un botón donde al presionar
 * abra un modal y ahí se vean los productos disponibles según lo usado en el
 * lote, y los ya usados o despachados o consumo local, según el uso que se dio».
 *
 * El libro tenía las dos mitades separadas —el lote en una pestaña, el saldo de
 * sus corridas en otra— y cruzarlas era trabajo de memoria. Acá se ve de una:
 * cuánto produjo, cuánto queda en patio, cuánto salió con guía y cuánto se
 * marcó como uso propio.
 *
 * Es de **sólo lectura** sobre los saldos: el `disponible` lo da el endpoint
 * (que a su vez lo toma de `saldosDeCorridas`, ADR-316). Lo único que se hace
 * desde acá es llevar lo disponible a una guía.
 */

import { useEffect, useMemo, useState } from "react";
import { Boxes, Loader2, PackageOpen, Truck } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn, MODAL_BODY, ModalFooter } from "./ctp-shared";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  AYUDA_DESTINO,
  ETIQUETA_DESTINO,
  agruparPorLote,
  totalDespachable,
  uidsDespachables,
  type CorridaConSaldo,
  type DestinoProducto,
  type ResumenDeLote,
} from "@/lib/forestal/productos-de-lote";
import { formatDate } from "@/lib/format";

const CELDA = "px-3 py-2.5 text-sm";
const CIFRA = `${CELDA} text-right font-mono tabular-nums`;

const TONO_DESTINO: Record<DestinoProducto, string> = {
  disponible:
    "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  despachado: "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
  usado: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  reprocesado: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  agotado: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
};

/** «MADERA ASERRADA (COMERCIAL)» se lee a los gritos en una tabla. */
const productoLegible = (p: string | null) =>
  !p ? "—" : p.length > 3 && p === p.toUpperCase() ? p.charAt(0) + p.slice(1).toLowerCase() : p;

/**
 * ¿El motivo dice algo que la pastilla no diga ya?
 *
 * `usadoMotivo` viene «Usado» cuando nadie escribió uno: repetirlo al lado de
 * «Uso propio» ocupa lugar y no agrega información.
 */
const motivoQueAporta = (motivo: string | null) => {
  const m = (motivo ?? "").trim().toLowerCase();
  return m.length > 0 && m !== "usado" && m !== "uso propio";
};

const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : formatDate(d, { soloFecha: true });
};

export default function CtpLoteProductosModal({
  lote,
  onClose,
  onDespachar,
}: {
  /** El lote a mirar: su código es la clave del cruce («13-2026»). */
  lote: { code: string; especie?: string | null };
  onClose: () => void;
  /**
   * Llevar lo que queda en patio a una guía de transporte. Sólo se ofrece si
   * quien monta el modal sabe abrirla — desde una pantalla sin despacho a mano,
   * el botón no tendría a dónde ir.
   */
  onDespachar?: (uids: string[]) => void;
}) {
  const [corridas, setCorridas] = useState<CorridaConSaldo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCorridas(null);
    setError(null);
    /* `incluirUsados=1` no es opcional acá: la pregunta del modal incluye
       justamente lo que ya se usó, y sin esto esas corridas no vienen. */
    ctpGet<{ corridas?: CorridaConSaldo[] }>(
      "/api/admin/forestal/ctp?disponibles=1&incluirUsados=1",
      { ttlMs: 15_000 },
    )
      .then((r) => {
        if (vivo) setCorridas(r.corridas ?? []);
      })
      .catch((e) => {
        if (vivo) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      vivo = false;
    };
  }, [lote.code]);

  const resumen: ResumenDeLote | null = useMemo(() => {
    if (!corridas) return null;
    return agruparPorLote(corridas).get(lote.code) ?? null;
  }, [corridas, lote.code]);

  const despachable = useMemo(() => (resumen ? totalDespachable([resumen]) : null), [resumen]);

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Productos del lote ${lote.code}`}
      description={
        lote.especie
          ? `${lote.especie} — qué salió de este lote y en qué terminó`
          : "Qué salió de este lote y en qué terminó"
      }
      icon={PackageOpen}
      variant="info"
      /* Se abre desde la tarjeta del lote, que vive en la pantalla; pero la
         ficha del lote también puede abrirlo por encima de otro modal. */
      aboveModals
      footer={
        <ModalFooter
          nota={
            despachable && despachable.corridas > 0
              ? `${despachable.corridas} producto${despachable.corridas === 1 ? "" : "s"} en patio · ${fmtM3(despachable.m3)} m³ listos para una guía.`
              : "Los saldos salen del libro: para corregir una corrida, entra por ella."
          }
        >
          {onDespachar && despachable && despachable.corridas > 0 && (
            <Btn
              variant="primary"
              onClick={() => onDespachar(uidsDespachables([resumen!]))}
              title="Abre la guía de transporte con lo que queda en patio ya cargado"
            >
              <Truck className="h-4 w-4" /> Despachar lo que queda
            </Btn>
          )}
          <Btn onClick={onClose}>Listo</Btn>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {error ? (
          <p className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            No se pudieron leer los productos: {error}
          </p>
        ) : !corridas ? (
          <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo lo que salió del lote…
          </p>
        ) : !resumen ? (
          <div className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center">
            <Boxes className="mx-auto h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
            <p className="mt-2 text-sm font-bold text-[var(--text-primary)]">
              Este lote todavía no declaró producción.
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Cuando se declare la corrida que lo consume, sus productos aparecen acá con su saldo.
            </p>
          </div>
        ) : (
          <>
            {/* Las cuatro cifras del lote: producido arriba, y en qué se repartió. */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Cifra rotulo="Produjo" valor={fmtM3(resumen.producido)} unidad="m³" destacado />
              <Cifra rotulo="En patio" valor={fmtM3(resumen.disponible)} unidad="m³" />
              <Cifra rotulo="Despachado" valor={fmtM3(resumen.despachado)} unidad="m³" />
              <Cifra rotulo="Uso propio" valor={fmtM3(resumen.usado)} unidad="m³" />
            </div>

            {/* Lo que Brandon pidió ver: producto por producto, con su destino. */}
            <div className="max-h-[46vh] overflow-auto rounded-xl border border-[var(--rule-base)]">
              <table className="w-full min-w-[40rem] border-collapse">
                <thead className="sticky top-0 z-[1]">
                  <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] [&>th]:border-b [&>th]:border-[var(--rule-base)]">
                    <th className={CELDA}>Producto</th>
                    <th className={`${CELDA} whitespace-nowrap`}>Corrida</th>
                    <th className={`${CELDA} text-right`}>Produjo</th>
                    <th className={`${CELDA} text-right`}>Queda</th>
                    <th className={CELDA}>En qué terminó</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.productos.map((p) => (
                    <tr key={p.corrida.id} className="border-t border-[var(--rule-soft)]">
                      <td className={CELDA}>
                        <span className="font-medium text-[var(--text-primary)]">
                          {productoLegible(p.corrida.producto)}
                        </span>
                        {p.corrida.paquetes.length > 0 && (
                          <span className="ml-1.5 text-[var(--text-tertiary)]">
                            · {p.corrida.paquetes.length} paquete
                            {p.corrida.paquetes.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                      <td className={`${CELDA} whitespace-nowrap text-[var(--text-secondary)]`}>
                        <span className="font-mono tabular-nums">N° {p.corrida.lineNo ?? "—"}</span>
                        <span className="ml-1.5 text-[var(--text-tertiary)]">
                          {fmtFecha(p.corrida.fecha)}
                        </span>
                      </td>
                      <td className={CIFRA}>{fmtM3(p.corrida.producido)}</td>
                      <td className={`${CIFRA} font-bold`}>{fmtM3(p.corrida.disponible)}</td>
                      <td className={CELDA}>
                        <span
                          title={
                            p.destino === "usado" && p.corrida.usadoMotivo
                              ? `${AYUDA_DESTINO.usado} Motivo: ${p.corrida.usadoMotivo}`
                              : AYUDA_DESTINO[p.destino]
                          }
                          className={`inline-block whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-bold ${TONO_DESTINO[p.destino]}`}
                        >
                          {ETIQUETA_DESTINO[p.destino]}
                        </span>
                        {/* El motivo sólo cuando dice algo más que la pastilla:
                            el libro guarda «Usado» como motivo por defecto, y
                            escribirlo al lado de «Uso propio» era la misma
                            palabra dos veces. */}
                        {p.destino === "usado" && motivoQueAporta(p.corrida.usadoMotivo) && (
                          <span className="ml-1.5 text-xs text-[var(--text-tertiary)]">
                            {p.corrida.usadoMotivo}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Un lote entero marcado como usado no está «vacío»: está gastado,
                y decirlo evita que alguien lo busque en el patio. */}
            {resumen.disponible <= 1e-4 && resumen.usado > 1e-4 && (
              <p className="rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                De este lote no queda nada en patio: {fmtM3(resumen.usado)} m³ figuran marcados como uso
                propio. Si eso fue un error, se desmarca desde «Productos disponibles».
              </p>
            )}
          </>
        )}
      </div>
    </AdminModal>
  );
}

function Cifra({
  rotulo,
  valor,
  unidad,
  destacado = false,
}: {
  rotulo: string;
  valor: string;
  unidad: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3.5 py-3 ${
        destacado
          ? "border-transparent bg-primary/10 ring-1 ring-[var(--accent)]"
          : "border-[var(--rule-base)] bg-[var(--surface-sunken)]"
      }`}
    >
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        {rotulo}
      </p>
      <p className="mt-1 flex items-baseline gap-1.5 font-mono text-xl font-extrabold leading-none tabular-nums text-[var(--text-primary)]">
        {valor}{" "}
        <span className="font-sans text-xs font-normal leading-none text-[var(--text-tertiary)]">
          {unidad}
        </span>
      </p>
    </div>
  );
}
