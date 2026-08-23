"use client";

/**
 * La ficha de un paquete: «tengo este atado delante, ¿de dónde salió?» (ADR-366).
 *
 * Es la pregunta del cliente que llama con un código en la mano y la del
 * fiscalizador que camina la pila. El libro tenía la respuesta entera —la corrida
 * declaró el paquete, la corrida consumió trozas, las trozas vinieron de una
 * GTF— pero repartida en tres pantallas y sin ninguna puerta que empezara por el
 * código.
 *
 * Va de atrás para adelante, en el orden en que se pregunta: qué es este bulto ·
 * de qué corrida salió · de qué madera está hecho.
 *
 * ⚠️ El saldo es de la **corrida**, no del paquete (ADR-362): el libro registra
 * cuántos m³ salieron, no cuál de los atados. Decir «este paquete ya se
 * despachó» sería inventar un dato, así que se dice lo que sí se sabe.
 */

import { useEffect, useState } from "react";
import { AlertCircle, Boxes, Copy, Loader2, PackageOpen, TreePine } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { ModalBody } from "./ctp-shared";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

export interface PaqueteEncontrado {
  id: string;
  codigo: string;
  productType: string | null;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number | null;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
  observations: string | null;
  createdAt: string;
  corrida: {
    id: string;
    lineNo: number;
    entryDate: string;
    status: string;
    speciesCommon: string | null;
    speciesScientific: string | null;
    productType: string | null;
    unit: string | null;
    quantity: number | null;
    volumeInputM3: number | null;
    rendimientoPct: number | null;
    lote: string | null;
    lineaProduccion: string | null;
  };
  saldoCorrida: { producido: number; despachado: number; reprocesado: number; disponible: number };
}

interface TrozaDeLaCorrida {
  id: string;
  codificacion: string | null;
  codigoPlanta: string | null;
  especieComun: string | null;
  volumenM3: number | string | null;
  entry?: { gtfNumber: string | null } | null;
}

interface GuiaDeOrigen {
  woodEntryId: string;
  volumeM3: number | null;
  gtfNumber: string | null;
  especie: string | null;
  fechaIngreso: string | null;
}

const n = (v: number | string | null | undefined, dec = 4) =>
  v == null || v === "" ? "—" : Number(v).toFixed(dec);
const fmtDia = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-PE", { timeZone: "UTC" });
};

function Dato({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="text-sm">
      <span className="mb-1 block font-bold text-[var(--text-secondary)]">{label}</span>
      <p
        className={`flex min-h-11 items-center rounded-xl bg-[var(--surface-sunken)] px-2.5 font-mono tabular-nums ${
          fuerte ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

function Bloque({ titulo, meta, children }: { titulo: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--rule-base)]">
      <CardTitle as="h3" className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-xl bg-[var(--surface-sunken)] px-3 py-2">
        <span className="text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
        {meta && <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{meta}</span>}
      </CardTitle>
      <div className="p-3">{children}</div>
    </section>
  );
}

export default function CtpPaqueteFicha({
  codigo,
  onClose,
  onIrA,
}: {
  /** El código tal cual se leyó del cartel. */
  codigo: string;
  onClose: () => void;
  /** Saltar a una vista del libro (Producción, Productos disponibles). */
  onIrA?: (vista: string) => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<PaqueteEncontrado[]>([]);
  const [trozas, setTrozas] = useState<TrozaDeLaCorrida[]>([]);
  const [guias, setGuias] = useState<GuiaDeOrigen[]>([]);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    fetch(`/api/admin/forestal/ctp?paquete=${encodeURIComponent(codigo)}`, { credentials: "include" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.message ?? j?.error ?? `El servidor respondió ${r.status}`);
        return j as { resultados?: PaqueteEncontrado[]; trozas?: TrozaDeLaCorrida[]; guias?: GuiaDeOrigen[] };
      })
      .then((j) => {
        if (!vivo) return;
        setResultados(j.resultados ?? []);
        setTrozas(j.trozas ?? []);
        setGuias(j.guias ?? []);
      })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [codigo]);

  const p = resultados[0] ?? null;
  /* Varios: el código se tipeó parcial. Se listan para elegir, en vez de mostrar
     el primero como si fuera EL paquete. */
  const varios = resultados.length > 1;

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      icon={PackageOpen}
      title={p && !varios ? `Paquete ${p.codigo}` : `Paquetes que dicen «${codigo}»`}
      description={
        p && !varios
          ? `${p.productType ?? p.corrida.productType ?? "—"} · ${p.corrida.speciesCommon ?? "—"} · corrida N° ${p.corrida.lineNo}`
          : varios
            ? `${resultados.length} coincidencias — elegí cuál`
            : undefined
      }
    >
      <ModalBody className="space-y-3">
        {cargando && (
          <p className="flex items-center gap-2 px-1 py-6 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando el paquete en el libro…
          </p>
        )}

        {!cargando && error && (
          <p className="flex items-start gap-2 rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        )}

        {!cargando && !error && resultados.length === 0 && (
          <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-6 text-center text-sm text-[var(--text-secondary)]">
            <p className="font-bold text-[var(--text-primary)]">Ningún paquete se llama así.</p>
            <p className="mt-1">
              El código se pinta al declarar la producción. Si el atado es viejo puede estar cargado con otro
              código —probá con una parte, se busca por pedazo— o pertenecer a una corrida anulada.
            </p>
          </div>
        )}

        {/* Varias coincidencias: la lista, no una elección hecha por la pantalla. */}
        {!cargando && varios && (
          <TablaCtp>
            <TheadCtp>
              <tr>
                <th className="px-3 py-2 font-bold">Código</th>
                <th className="px-3 py-2 font-bold">Producto</th>
                <th className="px-3 py-2 text-right font-bold">Volumen</th>
                <th className="px-3 py-2 text-right font-bold">Corrida</th>
                <th className="px-3 py-2 font-bold">Lote</th>
              </tr>
            </TheadCtp>
            <TbodyCtp>
              {resultados.map((r) => (
                <tr key={r.id} className="hover:bg-[var(--surface-sunken)]">
                  <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{r.codigo}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{r.productType ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{n(r.volumenM3)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">N° {r.corrida.lineNo}</td>
                  <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{r.corrida.lote ?? "—"}</td>
                </tr>
              ))}
            </TbodyCtp>
          </TablaCtp>
        )}

        {!cargando && p && !varios && (
          <>
            {/* ── Qué es este bulto ── */}
            <Bloque titulo="El paquete" meta={`Cargado el ${fmtDia(p.createdAt)}`}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Dato label="Código" valor={p.codigo} fuerte />
                <Dato label="Presentación" valor={p.presentacion ?? "—"} />
                <Dato label="Piezas" valor={String(p.cantidad ?? "—")} />
                <Dato
                  label="Volumen"
                  valor={`${n(p.volumenM3)} m³ · ${pieTablarDe(Number(p.volumenM3 ?? 0)).toLocaleString("es-PE")} pt`}
                  fuerte
                />
              </div>
              {(p.espesorCm != null || p.anchoCm != null || p.largoM != null) && (
                <p className="mt-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--text-secondary)]">
                  {n(p.espesorCm, 2)} × {n(p.anchoCm, 2)} cm × {n(p.largoM, 2)} m
                </p>
              )}
              {p.observations && (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{p.observations}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(p.codigo)
                    .then(() => setCopiado(true))
                    /* Sin portapapeles (http, permisos) el código igual está a la
                       vista: se avisa apagando el «copiado», no con un error. */
                    .catch(() => setCopiado(false));
                }}
                className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              >
                <Copy className="h-4 w-4" aria-hidden />
                {copiado ? "Código copiado" : "Copiar el código"}
              </button>
            </Bloque>

            {/* ── De qué corrida salió ── */}
            <Bloque
              titulo="Salió de esta corrida"
              meta={`N° ${p.corrida.lineNo} · ${fmtDia(p.corrida.entryDate)}`}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Dato label="Especie" valor={p.corrida.speciesCommon ?? "—"} />
                <Dato label="Lote de aserrío" valor={p.corrida.lote ?? "—"} />
                <Dato label="Línea" valor={p.corrida.lineaProduccion ?? "—"} />
                <Dato
                  label="Rendimiento"
                  valor={p.corrida.rendimientoPct != null ? `${p.corrida.rendimientoPct} %` : "—"}
                />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Dato label="Produjo" valor={`${n(p.saldoCorrida.producido)} ${p.corrida.unit ?? "m3"}`} />
                <Dato label="Despachado" valor={n(p.saldoCorrida.despachado)} />
                <Dato label="Reprocesado" valor={n(p.saldoCorrida.reprocesado)} />
                <Dato label="Disponible" valor={n(p.saldoCorrida.disponible)} fuerte />
              </div>
              {/* Lo que el libro NO sabe, dicho antes de que alguien lo suponga. */}
              <p className="mt-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                Esas cifras son de la <b>corrida entera</b>, no de este atado: el libro registra cuántos m³
                salieron de la planta, no cuál de los paquetes. Si la corrida todavía tiene disponible, este
                paquete puede seguir en la pila.
              </p>
              {onIrA && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { onIrA("produccion"); onClose(); }}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                  >
                    <Boxes className="h-4 w-4" aria-hidden /> Ver la corrida en Producción
                  </button>
                  {p.saldoCorrida.disponible > 0 && (
                    <button
                      type="button"
                      onClick={() => { onIrA("disponibles"); onClose(); }}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-primary/10 px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:brightness-105 dark:text-[var(--accent)]"
                    >
                      <PackageOpen className="h-4 w-4" aria-hidden /> Ver qué queda para despachar
                    </button>
                  )}
                </div>
              )}
            </Bloque>

            {/* ── De qué madera está hecho ── */}
            <Bloque
              titulo="La madera que lo formó"
              meta={`${trozas.length} troza${trozas.length === 1 ? "" : "s"} · ${n(p.corrida.volumeInputM3)} m³ a la sierra`}
            >
              {guias.length > 0 && (
                <ul className="mb-3 divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border border-[var(--rule-base)]">
                  <li className="bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    Guías de transporte que ampararon esa madera
                  </li>
                  {guias.map((g) => (
                    <li key={g.woodEntryId} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-1.5 text-sm">
                      <span>
                        <b className="font-mono text-[var(--text-primary)]">{g.gtfNumber ?? "sin GTF"}</b>
                        <span className="ml-2 text-[var(--text-tertiary)]">
                          {g.especie ?? "—"} · ingresó {fmtDia(g.fechaIngreso)}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums text-[var(--text-secondary)]">{n(g.volumeM3)} m³</span>
                    </li>
                  ))}
                </ul>
              )}
              <TablaCtp>
                <TheadCtp>
                  <tr>
                    <th className="px-3 py-2 font-bold">Cod. planta</th>
                    <th className="px-3 py-2 font-bold">Codificación</th>
                    <th className="px-3 py-2 font-bold">Especie</th>
                    <th className="px-3 py-2 font-bold">GTF</th>
                    <th className="px-3 py-2 text-right font-bold">Volumen (m³)</th>
                  </tr>
                </TheadCtp>
                <TbodyCtp>
                  {trozas.length === 0 && (
                    <FilaVacia cols={5}>
                      Esta corrida no tiene piezas cargadas: su materia prima se registró como m³ por guía, sin
                      detalle troza por troza.
                    </FilaVacia>
                  )}
                  {trozas.map((t) => (
                    <tr key={t.id} className="hover:bg-[var(--surface-sunken)]">
                      <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{t.codigoPlanta ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{t.codificacion ?? "—"}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{t.especieComun ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                        {t.entry?.gtfNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">
                        {n(t.volumenM3)}
                      </td>
                    </tr>
                  ))}
                </TbodyCtp>
              </TablaCtp>
              <p className="mt-2 flex items-start gap-2 px-1 text-sm text-[var(--text-tertiary)]">
                <TreePine className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                De una tabla no se puede decir de qué árbol salió: lo que el libro afirma es que este paquete
                salió de esta corrida, y que esta corrida se hizo con estas trozas.
              </p>
            </Bloque>
          </>
        )}
      </ModalBody>
    </AdminModal>
  );
}
