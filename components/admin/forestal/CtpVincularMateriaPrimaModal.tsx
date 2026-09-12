"use client";

/**
 * «Esta producción no dice de qué madera salió» — vincularle su lote (ADR-408).
 *
 * La corrida nació en «Producir sin lote»: la sierra cortó, el parte se anotó y
 * el lote se armó después. Acá se le pone el origen que le falta, y NO se firma
 * a ciegas: antes de escribir, la pantalla corre las cinco reglas acordadas
 * (especie, volumen, largo, fecha y disponibilidad) y muestra qué pasa con ESTAS
 * trozas contra ESTA corrida.
 *
 * Los **errores** bloquean el botón; los **avisos** se leen y se firma igual. Un
 * error dice «esto no puede haber pasado»; un aviso, «esto puede haber pasado y
 * hay que poder explicarlo».
 *
 * La escritura la hace el MISMO endpoint que usa Consumos (`sumar-corrida`): los
 * consumos por guía, el volumen de entrada y el marcado de las trozas viven en
 * un solo lugar, con sus locks y sus invariantes. Acá no hay una segunda forma
 * de atribuir materia prima.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Layers, Loader2, Ruler, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { ptDesdeM3 } from "@/lib/forestal/cubicacion";
import { piezasLibres, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import {
  largoMaxEnMetros,
  revisarVinculacion,
  type CorridaAVincular,
  type TrozaAVincular,
} from "@/lib/forestal/vincular-produccion";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { Btn } from "./ctp-shared";

/** Un paquete declarado por la corrida, como lo devuelve el detalle. */
interface PaqueteDeclarado {
  id?: string;
  codigo?: string | null;
  productType?: string | null;
  presentacion?: string | null;
  cantidad?: number | null;
  volumenM3?: number | string | null;
  espesorCm?: number | string | null;
  anchoCm?: number | string | null;
  largoM?: number | string | null;
  observations?: string | null;
}

/** Decimal de Prisma → número; `null` si no se puede leer (nunca 0 inventado). */
const num = (v: number | string | null | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const TH = "px-2 py-1.5 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 text-sm text-[var(--text-secondary)]";
const NUM = `${TD} text-right font-mono tabular-nums`;

/** Sin tildes ni mayúsculas — la misma comparación que usa el resto del módulo. */
const norma = (v: string | null | undefined): string =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Las medidas que esa corrida declaró, completas.
 *
 * Sin esto, vincular es elegir un lote a ciegas: la pregunta que se hace el
 * operario es «¿esta producción pudo salir de ESTAS trozas?», y para eso hay
 * que ver qué se cortó — cada paquete con su escuadría, su cantidad y su
 * volumen, y el resumen por producto abajo (Brandon, 2026-09-10).
 */
function MedidasDeclaradas({ paquetes, onCerrar }: {
  paquetes: PaqueteDeclarado[];
  onCerrar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  useModalAccesible(caja, { onCerrar });

  const filas = paquetes.map((p) => ({
    codigo: p.codigo ?? "—",
    producto: p.productType ?? "—",
    presentacion: p.presentacion ?? "—",
    cantidad: p.cantidad ?? 0,
    m3: num(p.volumenM3) ?? 0,
    espesorCm: num(p.espesorCm),
    anchoCm: num(p.anchoCm),
    largoM: num(p.largoM),
    observaciones: p.observations ?? "",
  }));
  const total = filas.reduce(
    (a, f) => ({ cantidad: a.cantidad + f.cantidad, m3: a.m3 + f.m3 }),
    { cantidad: 0, m3: 0 },
  );
  /* El resumen que se lee para decidir: por producto, no paquete por paquete. */
  const porProducto = [...filas.reduce((m, f) => {
    const prev = m.get(f.producto) ?? { producto: f.producto, cantidad: 0, m3: 0, medidas: 0 };
    prev.cantidad += f.cantidad;
    prev.m3 += f.m3;
    prev.medidas += 1;
    m.set(f.producto, prev);
    return m;
  }, new Map<string, { producto: string; cantidad: number; m3: number; medidas: number }>()).values()]
    .sort((a, b) => b.m3 - a.m3);

  return (
    <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3">
      <div
        ref={caja}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Medidas declaradas"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4 sm:px-6">
          <div>
            <h4 className="flex items-center gap-2 font-display text-lg text-[var(--text-primary)]">
              <Ruler className="h-5 w-5 text-[var(--accent)]" aria-hidden /> Medidas declaradas
            </h4>
            <p className="text-xs text-[var(--text-tertiary)]">
              {filas.length} {filas.length === 1 ? "paquete" : "paquetes"} ·{" "}
              {fmtPiezas(total.cantidad)} piezas · {fmtM3(total.m3)} m³ · {fmtPt(ptDesdeM3(total.m3))} PT
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar el detalle"
            className="rounded-xl p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5 sm:px-6">
          {filas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-6 text-center text-sm text-[var(--text-tertiary)]">
              Esta corrida declaró su volumen sin detallar paquetes.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
                <table className="w-full">
                  <caption className="sr-only">Paquetes declarados por la corrida</caption>
                  <thead className="bg-[var(--surface-sunken)]">
                    <tr>
                      <th scope="col" className={TH}>Paquete</th>
                      <th scope="col" className={TH}>Producto</th>
                      <th scope="col" className={TH}>Presentación</th>
                      <th scope="col" className={TH}>Medida (E × A × L)</th>
                      {/* Piezas · m³ · PT, la convención del módulo. */}
                      <th scope="col" className={`${TH} text-right`}>Piezas</th>
                      <th scope="col" className={`${TH} text-right`}>m³</th>
                      <th scope="col" className={`${TH} text-right`}>PT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => (
                      <tr key={`${f.codigo}-${i}`} className="border-t border-[var(--rule-soft)]">
                        <td className={`${TD} font-mono font-bold text-[var(--text-primary)]`}>{f.codigo}</td>
                        <td className={TD}>{f.producto}</td>
                        <td className={TD}>{f.presentacion}</td>
                        <td className={`${TD} font-mono`}>
                          {f.espesorCm != null && f.anchoCm != null && f.largoM != null
                            ? `${f.espesorCm} × ${f.anchoCm} cm × ${f.largoM} m`
                            : "—"}
                        </td>
                        <td className={NUM}>{fmtPiezas(f.cantidad)}</td>
                        <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(f.m3)}</td>
                        <td className={NUM}>{fmtPt(ptDesdeM3(f.m3))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      <th scope="row" className={`${TD} text-left`} colSpan={4}>Total declarado</th>
                      <td className={NUM}>{fmtPiezas(total.cantidad)}</td>
                      <td className={NUM}>{fmtM3(total.m3)}</td>
                      <td className={NUM}>{fmtPt(ptDesdeM3(total.m3))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div>
                <p className="mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                  Resumen por producto
                </p>
                <ul className="space-y-1">
                  {porProducto.map((p) => (
                    <li key={p.producto} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-sm">
                      <span className="font-bold text-[var(--text-primary)]">
                        {p.producto}
                        <span className="ml-1 text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">
                          · {p.medidas} {p.medidas === 1 ? "medida" : "medidas"}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                        {fmtPiezas(p.cantidad)} pzas · {fmtM3(p.m3)} m³ · {fmtPt(ptDesdeM3(p.m3))} PT
                        {total.m3 > 0 && (
                          <span className="ml-2 text-[var(--text-tertiary)]">
                            {Math.round((p.m3 / total.m3) * 1000) / 10} %
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CtpVincularMateriaPrimaModal({
  corrida,
  lotes,
  onCerrar,
  onListo,
}: {
  corrida: CorridaAVincular & { id: string };
  /** Los lotes del tenant (ya vienen con sus trozas del hook). */
  lotes: LoteAserrio[];
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  /* Sólo lotes abiertos y de la MISMA especie: ofrecer los otros es ofrecer un
     error que la revisión va a rechazar dos clics después. */
  const candidatos = useMemo(
    () => lotes.filter(
      (l) => l.status === "abierto" &&
        (!corrida.especie || norma(l.speciesCommon) === norma(corrida.especie)) &&
        piezasLibres(l).length > 0,
    ),
    [lotes, corrida.especie],
  );
  const [loteId, setLoteId] = useState<string>("");
  const lote = candidatos.find((l) => l.id === loteId) ?? null;
  const libres = useMemo(() => (lote ? piezasLibres(lote) : []), [lote]);

  /* Al elegir lote se tildan TODAS sus piezas libres: el caso normal es «este
     lote entero fue el que se aserró». Destildar es más rápido que tildar 40. */
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  useEffect(() => { setElegidas(new Set(libres.map((t) => t.id))); }, [libres]);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar: guardando ? undefined : onCerrar });

  /**
   * El largo de la pieza más larga sale de los PAQUETES de la corrida, que el
   * listado del libro no trae. Sin esto la regla del largo sólo podría avisar
   * «no se puede comprobar» — y es justo la que impide declarar que de una
   * troza de 3 m salió una tabla de 6.
   */
  const [largoMaxM, setLargoMaxM] = useState<number | null>(corrida.largoMaxPiezaM);
  const [paquetes, setPaquetes] = useState<PaqueteDeclarado[]>([]);
  const [verMedidas, setVerMedidas] = useState(false);
  useEffect(() => {
    let vivo = true;
    /* Por `entryId` y no por «disponibles»: desde 2026-09-10 una corrida sin
       origen NO está en la foto del depósito —justamente porque todavía no se
       puede despachar— pero sus medidas hay que poder verlas igual. */
    ctpGet<{ entry?: { paquetes?: PaqueteDeclarado[] } }>(
      `/api/admin/forestal/ctp?entryId=${encodeURIComponent(corrida.id)}`,
    )
      .then((j) => {
        if (!vivo) return;
        const ps = j.entry?.paquetes ?? [];
        setPaquetes(ps);
        /* La API manda decimales como string (Prisma `Decimal`): convertir acá
           y no confiar en el tipo es lo que evita un `NaN` en la regla. */
        if (ps.length > 0) {
          setLargoMaxM(largoMaxEnMetros(ps.map((x) => ({ largoM: num(x.largoM) }))));
        }
      })
      .catch(() => { /* sin paquetes la regla del largo avisa, que es lo honesto */ });
    return () => { vivo = false; };
  }, [corrida.id]);

  const trozas: TrozaAVincular[] = useMemo(
    () => libres.filter((t) => elegidas.has(t.id)).map((t) => ({
      id: t.id,
      codigo: t.codigoPlanta ?? t.codificacion,
      volumenM3: Number(t.volumenM3 ?? 0),
      largoM: t.largoM == null ? null : Number(t.largoM),
      /* El hook ya filtró las consumidas; lo que llegue acá está libre. Si el
         servidor ve otra cosa (T1, cierre, congelado), manda él. */
      noDisponible: null,
    })),
    [libres, elegidas],
  );

  const revision = useMemo(
    () => (lote
      ? revisarVinculacion(
          { ...corrida, largoMaxPiezaM: largoMaxM },
          { code: lote.code, especie: lote.speciesCommon, status: lote.status },
          trozas,
        )
      : null),
    [corrida, lote, trozas, largoMaxM],
  );

  const vincular = async () => {
    if (!lote || !revision?.puedeVincular) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/lotes-aserrio", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          accion: "sumar-corrida",
          loteId: lote.id,
          corridaId: corrida.id,
          trozaIds: trozas.map((t) => t.id),
          fecha: corrida.fecha.slice(0, 10),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string; volumenM3?: number };
      if (!r.ok) throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);
      invalidarCtp();
      onListo(
        `Materia prima vinculada: ${trozas.length} troza(s) · ${fmtM3(revision.trozaM3)} m³ del lote ${lote.code} ` +
          `quedaron atribuidas a la corrida N° ${corrida.lineNo ?? "—"}` +
          (revision.rendimientoPct != null ? ` · rendimiento ${revision.rendimientoPct} %` : "") + ".",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const errores = revision?.hallazgos.filter((h) => h.severidad === "error") ?? [];
  const avisos = revision?.hallazgos.filter((h) => h.severidad === "aviso") ?? [];

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
      {verMedidas && <MedidasDeclaradas paquetes={paquetes} onCerrar={() => setVerMedidas(false)} />}
      <div
        ref={cajaRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Vincular materia prima"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-display text-lg text-[var(--text-primary)]">
              <Layers className="h-5 w-5 text-[var(--accent)]" aria-hidden /> Vincular materia prima
            </h3>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--text-tertiary)]">
              <span>
                Corrida N° {corrida.lineNo ?? "—"} · {corrida.especie ?? "sin especie"} ·{" "}
                <span className="font-mono">{fmtM3(corrida.producidoM3)} m³</span> declarados el {corrida.fecha.slice(0, 10)}
              </span>
              {/* Contra qué se está vinculando: las medidas que salieron. */}
              <button
                type="button"
                onClick={() => setVerMedidas(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 py-0.5 font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              >
                <Ruler className="h-3.5 w-3.5" aria-hidden /> Ver las medidas
                {paquetes.length > 0 && (
                  <span className="font-mono font-normal opacity-80">({paquetes.length})</span>
                )}
              </button>
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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5 sm:px-6">
          <label className="block">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              Lote de aserrío
            </span>
            <select
              value={loteId}
              onChange={(e) => setLoteId(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">Elegí el lote que entró a la sierra…</option>
              {candidatos.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.speciesCommon} · {piezasLibres(l).length} trozas libres
                </option>
              ))}
            </select>
            {candidatos.length === 0 && (
              <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
                No hay lotes abiertos de {corrida.especie ?? "esa especie"} con trozas libres. Armá el lote
                primero en <b>Lotes</b> y volvé.
              </span>
            )}
          </label>

          {lote && (
            <>
              <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
                <table className="w-full">
                  <caption className="sr-only">Trozas del lote {lote.code}</caption>
                  <thead className="bg-[var(--surface-sunken)]">
                    <tr>
                      <th scope="col" className={`${TH} w-8 text-center`}>
                        <input
                          type="checkbox"
                          checked={elegidas.size === libres.length && libres.length > 0}
                          onChange={() =>
                            setElegidas((prev) => (prev.size === libres.length ? new Set() : new Set(libres.map((t) => t.id))))
                          }
                          aria-label="Elegir todas las trozas"
                          className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                        />
                      </th>
                      <th scope="col" className={TH}>Troza</th>
                      <th scope="col" className={`${TH} text-right`}>m³</th>
                      <th scope="col" className={`${TH} text-right`}>Largo (m)</th>
                      <th scope="col" className={TH}>Guía</th>
                    </tr>
                  </thead>
                  <tbody>
                    {libres.map((t) => (
                      <tr key={t.id} className="border-t border-[var(--rule-soft)]">
                        <td className={`${TD} text-center`}>
                          <input
                            type="checkbox"
                            checked={elegidas.has(t.id)}
                            onChange={() =>
                              setElegidas((prev) => {
                                const next = new Set(prev);
                                if (next.has(t.id)) next.delete(t.id);
                                else next.add(t.id);
                                return next;
                              })
                            }
                            aria-label={`Elegir la troza ${t.codigoPlanta ?? t.codificacion ?? t.id}`}
                            className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                          />
                        </td>
                        <td className={`${TD} font-mono text-[var(--text-primary)]`}>
                          {t.codigoPlanta ?? t.codificacion ?? "—"}
                        </td>
                        <td className={NUM}>{fmtM3(Number(t.volumenM3 ?? 0))}</td>
                        <td className={NUM}>{t.largoM == null ? "—" : Number(t.largoM).toFixed(2)}</td>
                        <td className={`${TD} text-[length:var(--ts-2xs)]`}>{t.gtfNumber ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      <td className={TD} />
                      <th scope="row" className={`${TD} text-left`}>
                        {elegidas.size} de {libres.length} trozas
                      </th>
                      <td className={NUM}>{fmtM3(revision?.trozaM3 ?? 0)}</td>
                      <td className={NUM} colSpan={2}>
                        {revision?.rendimientoPct != null ? `rendimiento ${revision.rendimientoPct} %` : ""}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* La revisión: lo que impide firmar y lo que hay que poder explicar. */}
              {errores.length > 0 && (
                <ul className="space-y-1.5 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 p-3">
                  {errores.map((h, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span>{h.mensaje}</span>
                    </li>
                  ))}
                </ul>
              )}
              {avisos.length > 0 && (
                <ul className="space-y-1.5 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 p-3">
                  {avisos.map((h, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-[var(--text-secondary)]">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
                      <span>{h.mensaje}</span>
                    </li>
                  ))}
                </ul>
              )}
              {errores.length === 0 && avisos.length === 0 && elegidas.size > 0 && (
                <p className="flex items-center gap-1.5 rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
                  <Check className="h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
                  Especie, volumen, largo, fechas y disponibilidad: las cinco cuadran.
                </p>
              )}
            </>
          )}

          {error && (
            <p className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-3.5 sm:px-6">
          <Btn onClick={onCerrar} disabled={guardando}>Cancelar</Btn>
          <button
            type="button"
            onClick={() => void vincular()}
            disabled={guardando || !revision?.puedeVincular || elegidas.size === 0}
            title={
              revision?.puedeVincular
                ? "Escribe los consumos, marca las trozas y deja la corrida con su origen"
                : "Hay algo que no cuadra: mirá los avisos rojos"
            }
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Layers className="h-4 w-4" aria-hidden />}
            {guardando ? "Vinculando…" : "Vincular al lote"}
          </button>
        </div>
      </div>
    </div>
  );
}
