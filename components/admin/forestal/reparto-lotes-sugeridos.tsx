"use client";

/**
 * «Crear lotes sugeridos» en la Distribución de rolliza (ADR-464, fase 2).
 *
 * Cada bloque traído del Libro (guía + especie + permiso) sabe sus trozas;
 * acá se le arma UN lote con exactamente esas trozas. Se previsualiza primero
 * —el servidor dice qué lote saldría o por qué no— y se crea al confirmar.
 * Los bloques que no pueden se ven igual, apagados y con su motivo: un bloque
 * cargado a mano dice «Tráelo del Libro», uno que ya tiene lote lo dice.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Loader2, PackagePlus, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import {
  avisosDelBloque,
  estadoLocalDelBloque,
  TEXTO_ESTADO_LOCAL,
  type LoteCreadoDeBloque,
  type LoteDelBloque,
  type ResultadoLotesPorBloque,
} from "@/lib/forestal/lotes-por-bloque";
import { crearLotesPorBloque, previsualizarLotesPorBloque } from "./reparto-lotes-sugeridos-api";

const BTN = "inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50";
const BTN_PRIMARIO = "inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50";
const TD = "px-2 py-2 align-top";

type Props = {
  bloques: BloqueRolliza[];
  /** El código del lote de un bloque que ya tiene uno, si se conoce. */
  codigoDeLote: (loteId: string) => string | null;
  /** Los lotes recién armados: quien llama les pone el `loteId` a sus bloques y guarda. */
  onCreados: (creados: LoteCreadoDeBloque[]) => void;
  /** Ya llegó la lista de lotes del Libro: recién ahí un lote que no aparece es un lote borrado. */
  lotesCargados?: boolean;
  /** Le saca al bloque la marca de un lote que ya no está en el Libro. */
  onQuitarLote?: (bloqueId: string) => void;
};

/** El botón de la barra de la Distribución + su modal. */
export default function RepartoLotesSugeridos({ bloques, codigoDeLote, onCreados, lotesCargados, onQuitarLote }: Props) {
  const [abierto, setAbierto] = useState(false);
  const pedibles = bloques.filter((b) => estadoLocalDelBloque(b) === "pedible").length;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={bloques.length === 0}
        title={pedibles > 0 ? `Armar un lote por cada bloque traído del Libro (${pedibles})` : "Ningún bloque traído del Libro está sin lote"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        <PackagePlus className="h-3.5 w-3.5" aria-hidden /> Crear lotes{pedibles > 0 ? ` (${pedibles})` : ""}
      </button>
      {abierto && (
        <ModalLotesSugeridos bloques={bloques} codigoDeLote={codigoDeLote} onCreados={onCreados} lotesCargados={lotesCargados} onQuitarLote={onQuitarLote} onCerrar={() => setAbierto(false)} />
      )}
    </>
  );
}

function ModalLotesSugeridos({ bloques, codigoDeLote, onCreados, lotesCargados, onQuitarLote, onCerrar }: Props & { onCerrar: () => void }) {
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar });
  const ventana = useVentanaDeModal(true, { ref: cajaRef, asaAutomatica: true, aplicarTranslate: true, claveMemoria: "reparto-lotes-sugeridos" });

  /* La foto de los bloques al abrir: si la tabla cambia detrás, la lista que
     se confirma es la que se vio. */
  const [foto] = useState(bloques);
  const pedidos = useMemo(
    () =>
      foto
        .filter((b) => estadoLocalDelBloque(b) === "pedible")
        .map((b) => ({ bloqueId: b.id, etiqueta: b.etiqueta, trozaIds: b.trozaIds ?? [] })),
    [foto],
  );
  const [previa, setPrevia] = useState<Map<string, LoteDelBloque> | null>(pedidos.length === 0 ? new Map() : null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoLotesPorBloque | null>(null);
  /* Bloques a los que se les sacó la marca de un lote borrado en esta apertura. */
  const [quitados, setQuitados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (pedidos.length === 0) return;
    let vivo = true;
    previsualizarLotesPorBloque(pedidos)
      .then((r) => {
        if (!vivo) return;
        setPrevia(new Map(r.map((x) => [x.bloqueId, x])));
        setElegidos(new Set(r.filter((x) => x.listo).map((x) => x.bloqueId)));
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setError(e instanceof Error ? e.message : String(e));
        // Sin esto las filas quedaban girando en «Revisando…» para siempre.
        setPrevia(new Map());
      });
    return () => {
      vivo = false;
    };
  }, [pedidos]);

  const alternar = (id: string) =>
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const crear = async () => {
    const lista = pedidos.filter((p) => elegidos.has(p.bloqueId));
    if (lista.length === 0 || creando) return;
    setCreando(true);
    setError(null);
    try {
      const r = await crearLotesPorBloque(lista);
      setResultado(r);
      if (r.creados.length > 0) onCreados(r.creados);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreando(false);
    }
  };

  const etiquetaDe = (id: string) => foto.find((b) => b.id === id)?.etiqueta || "Sin etiqueta";

  return (
    <div className="modal-backdrop fixed inset-0 z-modal flex items-center justify-center bg-black/60 p-3" onClick={(e) => { if (e.target === e.currentTarget && !ventana.fijado) onCerrar(); }}>
      <div ref={cajaRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Crear lotes sugeridos" className="relative flex max-h-[94vh] w-full max-w-4xl flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-lg)]">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle as="h3" className="flex items-center gap-2 font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              <PackagePlus className="h-5 w-5 text-[var(--accent)]" aria-hidden /> Crear lotes sugeridos
            </CardTitle>
            <InfoTip
              title="Un lote por bloque"
              what="Cada bloque traído del Libro (guía + especie + permiso) se vuelve un lote de aserrío con exactamente sus trozas. Es lo que después se produce, jornada por jornada."
              affects="Un bloque cargado a mano no sabe de qué trozas sale: no crea lote (tráelo del Libro). Uno que ya tiene lote no se repite. Si una sola troza ya no puede, el bloque no se arma y se dice por qué."
              example="Guía 019-001-0000011 · Tornillo · 12 trozas · 8,412 m³ → lote LA-2026-014 con esas 12 trozas."
            />
          </div>
          <div className="flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
            <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-xl p-2 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
          </p>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-auto">
          {resultado ? (
            <Resultado resultado={resultado} etiquetaDe={etiquetaDe} />
          ) : (
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="sticky top-0 bg-[var(--surface-raised)] text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                <tr>
                  <th className="w-8 px-2 py-1.5"><span className="sr-only">Elegir</span></th>
                  <th className="px-2 py-1.5">Bloque</th>
                  <th className="px-2 py-1.5">Especie</th>
                  <th className="px-2 py-1.5">Permiso</th>
                  <th className="px-2 py-1.5 text-right">Trozas</th>
                  <th className="px-2 py-1.5 text-right">m³</th>
                  <th className="px-2 py-1.5">Estado</th>
                </tr>
              </thead>
              <tbody>
                {foto.map((b) => (
                  <FilaBloque
                    key={b.id}
                    bloque={b}
                    previa={previa}
                    elegido={elegidos.has(b.id)}
                    onAlternar={() => alternar(b.id)}
                    codigoDeLote={codigoDeLote}
                    loteBorrado={Boolean(lotesCargados && b.loteId && !codigoDeLote(b.loteId))}
                    quitado={quitados.has(b.id)}
                    onQuitar={onQuitarLote ? () => { onQuitarLote(b.id); setQuitados((prev) => new Set(prev).add(b.id)); } : undefined}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--rule-soft)] pt-3">
          {resultado ? (
            <button type="button" onClick={onCerrar} className={BTN_PRIMARIO}><Check className="h-4 w-4" aria-hidden /> Listo</button>
          ) : (
            <>
              <button type="button" onClick={onCerrar} className={BTN}>Cancelar</button>
              <button type="button" onClick={crear} disabled={elegidos.size === 0 || creando || !previa} className={BTN_PRIMARIO}>
                {creando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PackagePlus className="h-4 w-4" aria-hidden />}
                {creando ? "Creando…" : elegidos.size === 0 ? "Nada para crear" : `Crear ${elegidos.size} ${elegidos.size === 1 ? "lote" : "lotes"}`}
              </button>
            </>
          )}
        </div>
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}

function FilaBloque({ bloque: b, previa, elegido, onAlternar, codigoDeLote, loteBorrado, quitado, onQuitar }: {
  bloque: BloqueRolliza;
  previa: Map<string, LoteDelBloque> | null;
  elegido: boolean;
  onAlternar: () => void;
  codigoDeLote: (loteId: string) => string | null;
  loteBorrado: boolean;
  quitado: boolean;
  onQuitar?: () => void;
}) {
  const local = estadoLocalDelBloque(b);
  const d = local === "pedible" ? previa?.get(b.id) : undefined;
  const lote = d && d.listo ? d : null;
  const apagado = !lote;
  const avisos = lote ? avisosDelBloque(b, lote) : [];
  let estado: ReactNode;
  if (local === "ya-tiene-lote" && quitado) {
    estado = <span className="text-[var(--text-secondary)]">Marca quitada: vuelve a abrir «Crear lotes» para armar su lote.</span>;
  } else if (local === "ya-tiene-lote" && loteBorrado) {
    /* El lote se borró en el Libro: sin esto el bloque decía «Ya tiene lote» para siempre. */
    estado = (
      <span className="flex flex-wrap items-center gap-2 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
        No encuentro su lote en el Libro (¿se borró?).
        {onQuitar && (
          <button type="button" onClick={onQuitar} className="rounded-lg border border-[var(--rule-base)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Quitar la marca
          </button>
        )}
      </span>
    );
  } else if (local === "ya-tiene-lote") {
    const code = b.loteId ? codigoDeLote(b.loteId) : null;
    estado = <span className="text-[var(--text-secondary)]">{TEXTO_ESTADO_LOCAL["ya-tiene-lote"]}{code ? ` ${code}` : ""}</span>;
  } else if (local !== "pedible") {
    estado = <span className="text-[var(--text-tertiary)]">{TEXTO_ESTADO_LOCAL[local]}</span>;
  } else if (!previa) {
    estado = <span className="inline-flex items-center gap-1 text-[var(--text-tertiary)]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Revisando sus trozas…</span>;
  } else if (!d) {
    estado = <span className="text-[var(--text-tertiary)]">Sin respuesta del servidor</span>;
  } else if (!d.listo) {
    estado = <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{d.motivo}</span>;
  } else {
    estado = (
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">Listo para crear</span>
        {avisos.map((a) => <span key={a} className="text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{a}</span>)}
      </span>
    );
  }
  return (
    <tr className={`border-t border-[var(--rule-soft)] ${apagado ? "opacity-70" : ""}`}>
      <td className={TD}>
        <input type="checkbox" checked={Boolean(lote) && elegido} disabled={!lote} onChange={onAlternar} aria-label={`Crear el lote del bloque ${b.etiqueta || "sin etiqueta"}`} className="h-4 w-4 accent-[var(--accent)]" />
      </td>
      <td className={`${TD} font-semibold text-[var(--text-primary)]`}>{b.etiqueta || "Sin etiqueta"}</td>
      <td className={TD}>{lote?.especie ?? (b.especie || "—")}</td>
      <td className={`${TD} break-all`}>{lote ? (lote.permiso ?? "—") : (b.permiso || "—")}</td>
      <td className={`${TD} text-right tabular-nums`}>{lote?.trozas ?? (b.trozaIds?.length || "—")}</td>
      <td className={`${TD} text-right tabular-nums`}>{fmtM3(lote?.m3 ?? (Number(b.m3) || 0))}</td>
      <td className={TD}>{estado}</td>
    </tr>
  );
}

function Resultado({ resultado, etiquetaDe }: { resultado: ResultadoLotesPorBloque; etiquetaDe: (id: string) => string }) {
  return (
    <ul className="space-y-2" aria-label="Lotes creados">
      {resultado.creados.map((c) => (
        <li key={c.bloqueId} className="flex flex-wrap items-center gap-x-2 rounded-lg border border-[var(--data-success-500)] bg-[var(--data-success-100)] px-3 py-2 text-sm dark:bg-[var(--data-success-500)]/12">
          <Check className="h-4 w-4 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
          <span className="font-bold text-[var(--text-primary)]">{c.code}</span>
          <span className="text-[var(--text-secondary)]">bloque «{etiquetaDe(c.bloqueId)}» · {c.especie}{c.permiso ? ` · ${c.permiso}` : ""} · {c.trozas} trozas · {fmtM3(c.m3)} m³</span>
        </li>
      ))}
      {resultado.noCreados.map((n) => (
        <li key={n.bloqueId} className="flex flex-wrap items-center gap-x-2 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-sm dark:bg-[var(--data-warning-500)]/12">
          <AlertTriangle className="h-4 w-4 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
          <span className="font-bold text-[var(--text-primary)]">«{etiquetaDe(n.bloqueId)}»</span>
          <span className="text-[var(--text-secondary)]">{n.motivo}</span>
        </li>
      ))}
    </ul>
  );
}
