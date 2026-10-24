"use client";

/**
 * Una guía de ingreso del permiso y todo lo que pasó con su madera (ADR-432):
 * cerrada, la guía con el estado de sus trozas en palabras; abierta, las
 * corridas que comieron de ella y, debajo de cada corrida, los despachos por
 * los que salió lo aserrado. Es el hilo guía → corrida → despacho.
 */

import { useCallback, useRef, useState } from "react";
import { ChevronRight, Axe, Camera, Truck, X } from "@buleje/design-system/icons";
import { fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import { srcDeFoto, type FotoCarga } from "@/lib/forestal/fotos-carga";
import { pieDeFoto } from "@/lib/forestal/sello-foto";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import type {
  CorridaDelPermiso,
  DespachoDelPermiso,
  GuiaDelPermiso,
  TrozasDeGuia,
} from "@/lib/forestal/volumen-del-permiso";
import { esNegativo, fechaDelLibro, m3, PASTILLA, TONO, tipoCorto } from "./permiso-volumen-ui";

/** Estado de las trozas, en el orden en que se recorren. Sólo los que tienen piezas. */
const ESTADOS: {
  k: keyof Omit<TrozasDeGuia, "total">;
  uno: string;
  varios: string;
  tono: keyof typeof TONO;
}[] = [
  { k: "libres", uno: "libre", varios: "libres", tono: "ok" },
  { k: "enLote", uno: "en lote", varios: "en lote", tono: "info" },
  { k: "porRecepcionar", uno: "por recepcionar", varios: "por recepcionar", tono: "aviso" },
  { k: "consumidas", uno: "consumida", varios: "consumidas", tono: "neutro" },
  { k: "despachadas", uno: "despachada en troza", varios: "despachadas en troza", tono: "neutro" },
  { k: "noRecepcionadas", uno: "no llegó", varios: "no llegaron", tono: "error" },
  { k: "retrozadas", uno: "retrozada", varios: "retrozadas", tono: "neutro" },
];

export function ChipsDeTrozas({ trozas }: { trozas: TrozasDeGuia | null }) {
  if (trozas == null)
    return <span className={`${PASTILLA} ${TONO.aviso}`}>sin lista de trozas</span>;
  const hay = ESTADOS.filter((e) => trozas[e.k] > 0);
  if (hay.length === 0) return <span className={`${PASTILLA} ${TONO.neutro}`}>sin trozas</span>;
  return (
    <>
      {hay.map((e) => (
        <span key={e.k} className={`${PASTILLA} ${TONO[e.tono]}`}>
          <span className="font-mono tabular-nums">{fmtPiezas(trozas[e.k])}</span>
          {trozas[e.k] === 1 ? e.uno : e.varios}
        </span>
      ))}
    </>
  );
}

/** «heredada — sin atar al contrato» / «de otro permiso: X». */
export function MarcaDeCorrida({
  origen,
  otro,
}: {
  origen?: CorridaDelPermiso["origen"];
  otro?: string | null;
}) {
  if (otro !== undefined) {
    return (
      <span className={`${PASTILLA} ${TONO.error}`}>de otro permiso{otro ? `: ${otro}` : ""}</span>
    );
  }
  if (origen === "heredada") {
    return <span className={`${PASTILLA} ${TONO.aviso}`}>heredada — sin atar al contrato</span>;
  }
  return null;
}

export const nLinea = (n: number | null | undefined) => (n == null ? "Sin N°" : `N° ${n}`);

/**
 * Miniaturas de las fotos de la guía + lightbox al tocarlas.
 *
 * Vive AFUERA del `<button>` que alterna la fila (abajo): ese botón ya cubre
 * toda la fila para expandir/colapsar, y un botón de miniatura anidado dentro
 * de otro botón es HTML inválido y le rompe el foco a un lector de pantalla.
 * Por eso las fotos van en su propia franja, debajo del encabezado.
 */
function FotosDeGuia({ fotos, gtf }: { fotos: FotoCarga[]; gtf: string }) {
  const [ampliada, setAmpliada] = useState<FotoCarga | null>(null);
  const cerrar = useCallback(() => setAmpliada(null), []);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalAccesible(dialogRef, { onCerrar: cerrar, activo: ampliada != null });

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--rule-soft)] px-3 py-2">
        <Camera className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        {fotos.map((f, i) => (
          <button
            key={f.url}
            type="button"
            onClick={() => setAmpliada(f)}
            aria-label={`Ampliar foto ${i + 1} de la GTF ${gtf}`}
            className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[var(--rule-base)] transition-colors hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- subida del tenant, sin dominio fijo */}
            <img src={srcDeFoto(f)} alt="" className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>

      {ampliada && (
        <div
          role="presentation"
          className="fixed inset-0 z-system bg-black/85 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && cerrar()}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Foto de la GTF ${gtf}`}
            tabIndex={-1}
            className="pointer-events-none absolute inset-0 flex items-center justify-center p-4"
          >
            <button
              type="button"
              aria-label="Cerrar"
              className="pointer-events-auto absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); cerrar(); }}
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={srcDeFoto(ampliada)}
              alt={`Foto de la GTF ${gtf}`}
              className="pointer-events-auto max-h-[85vh] max-w-full rounded-2xl object-contain shadow-[var(--shadow-xl)]"
            />
            {(ampliada.tomadaEn || ampliada.por) && (
              <p className="pointer-events-auto absolute inset-x-4 bottom-4 text-center text-sm font-semibold text-white">
                {pieDeFoto(ampliada)}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function CtpPermisoTrazaGuia({
  guia: g,
  abierta,
  onAlternar,
  corridas,
  despachosPorCorrida,
  deOtroPermiso,
}: {
  guia: GuiaDelPermiso;
  abierta: boolean;
  onAlternar: () => void;
  corridas: Map<string, CorridaDelPermiso>;
  despachosPorCorrida: Map<string, DespachoDelPermiso[]>;
  /** corridaId → código del otro contrato, para las que comieron de acá y no suman acá. */
  deOtroPermiso: Map<string, string | null>;
}) {
  const panel = `traza-guia-${g.id}`;
  const saldoNeg = esNegativo(g.saldoM3);
  return (
    <li className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        aria-controls={panel}
        className="flex w-full items-start gap-2 rounded-xl p-3 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <ChevronRight
          className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierta ? "rotate-90" : ""}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
            <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
              GTF {g.gtf}
            </span>
            <span className="text-[var(--text-secondary)]">{fechaDelLibro(g.fecha)}</span>
            <span className="font-semibold text-[var(--text-primary)]">{g.especie}</span>
            {g.proveedor && (
              <span className="truncate text-[var(--text-tertiary)]">{g.proveedor}</span>
            )}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1">
            <ChipsDeTrozas trozas={g.trozas} />
            <span className={`${PASTILLA} ${TONO.neutro}`}>
              {g.consumos.length === 0
                ? "sin corridas"
                : `${g.consumos.length} ${g.consumos.length === 1 ? "corrida" : "corridas"}`}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-right text-sm leading-tight">
          <span className="block font-mono font-bold tabular-nums text-[var(--text-primary)]">
            {m3(g.m3)} m³
          </span>
          <span
            className={`block text-xs ${saldoNeg ? "font-bold text-[var(--data-error-ink)]" : "text-[var(--text-secondary)]"}`}
          >
            saldo <span className="font-mono tabular-nums">{m3(g.saldoM3)}</span>
            {saldoNeg && " · consumido de más"}
          </span>
        </span>
      </button>

      {g.fotos.length > 0 && <FotosDeGuia fotos={g.fotos} gtf={g.gtf} />}

      {abierta && (
        <div id={panel} className="border-t border-[var(--rule-soft)] px-3 py-2.5 text-sm">
          {g.consumos.length === 0 ? (
            <p className="text-[var(--text-secondary)]">
              Ninguna corrida comió de esta guía todavía.
            </p>
          ) : (
            <ul className="space-y-2" aria-label={`Corridas que comieron de la GTF ${g.gtf}`}>
              {g.consumos.map((c) => {
                const corrida = corridas.get(c.corridaId);
                const despachos = despachosPorCorrida.get(c.corridaId) ?? [];
                return (
                  <li key={c.corridaId} className="space-y-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Axe
                        className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]"
                        aria-hidden
                      />
                      <span className="font-mono font-bold tabular-nums">{nLinea(c.lineNo)}</span>
                      <span className="text-[var(--text-secondary)]">{fechaDelLibro(c.fecha)}</span>
                      <span>
                        tomó <b className="font-mono tabular-nums">{m3(c.m3)} m³</b>
                      </span>
                      {corrida && (
                        <span className="text-[var(--text-secondary)]">
                          → {tipoCorto(corrida.tipo)}
                          {corrida.m3DelPermiso != null && (
                            <>
                              {" "}
                              <span className="font-mono tabular-nums">
                                {m3(corrida.m3DelPermiso)} m³
                              </span>
                            </>
                          )}
                        </span>
                      )}
                      <MarcaDeCorrida
                        origen={corrida?.origen}
                        otro={
                          deOtroPermiso.has(c.corridaId)
                            ? deOtroPermiso.get(c.corridaId)
                            : undefined
                        }
                      />
                    </span>
                    {despachos.length > 0 && (
                      <ul className="ml-6 space-y-0.5 border-l-2 border-[var(--rule-soft)] pl-3">
                        {despachos.map((d) => (
                          <li
                            key={d.id}
                            className="flex flex-wrap items-center gap-x-2 text-[var(--text-secondary)]"
                          >
                            <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span>salió en</span>
                            <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
                              {d.gtf ? `GTF ${d.gtf}` : "despacho sin GTF"}
                            </span>
                            <span>{fechaDelLibro(d.fecha)}</span>
                            {d.destino && <span>→ {d.destino}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {g.despachadoRollizaM3 > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-[var(--text-secondary)]">
              <Truck className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                <b className="font-mono tabular-nums text-[var(--text-primary)]">
                  {m3(g.despachadoRollizaM3)} m³
                </b>{" "}
                salieron en troza, sin aserrar
              </span>
            </p>
          )}
        </div>
      )}
    </li>
  );
}
