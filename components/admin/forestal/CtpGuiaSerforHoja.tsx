"use client";

/**
 * La guía de SERFOR en pantalla, con la forma del documento (ADR-338).
 *
 * Antes esto era una caja gris con dieciséis pares «rótulo: valor» en dos
 * columnas, mezclando el titular con el conductor y el destinatario. El papel
 * que se está copiando no está ordenado así: tiene una cabecera con el emisor y
 * el N° de guía, y después cinco bloques —la guía, el propietario del producto,
 * el destinatario, el transportista, el detalle— cada uno con sus casilleros
 * numerados. Quien coteja mira UN bloque a la vez.
 *
 * El orden y los rótulos salen de `lib/forestal/gtf-serfor-bloques` (puro, con
 * tests): la pantalla y el PDF imprimible no pueden declarar casilleros
 * distintos del mismo documento.
 *
 * **No se edita nada**: es la declaración de un documento ajeno. Y no se rellena
 * nada: un casillero que la consulta pública no devuelve se dice ausente, no
 * vacío — son dos cosas distintas ante una fiscalización.
 */

import { useMemo, useState } from "react";
import { ChevronRight, FileText, Printer } from "@buleje/design-system/icons";
import {
  bloquesDeGuia,
  camposNoMapeados,
  completitudGuia,
  type CasilleroGtf,
} from "@/lib/forestal/gtf-serfor-bloques";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { Btn } from "./ctp-shared";

const SPAN: Record<number, string> = {
  3: "sm:col-span-3",
  4: "sm:col-span-4",
  6: "sm:col-span-6",
  12: "sm:col-span-12",
};

const n3 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(3));

/** Un casillero del documento: número, rótulo y lo que dice. */
function Casillero({ c }: { c: CasilleroGtf }) {
  return (
    <div className={`min-w-0 ${SPAN[c.span ?? 6]}`}>
      <p className="flex items-baseline gap-1.5 text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {c.n && <span className="font-mono font-bold">({c.n})</span>}
        <span className="truncate">{c.label}</span>
      </p>
      {c.noPublicado ? (
        <p
          title="El casillero existe en la guía impresa, pero la consulta pública de SERFOR no lo devuelve"
          className="mt-0.5 text-sm italic text-[var(--text-tertiary)]"
        >
          No lo publica la consulta
        </p>
      ) : (
        <p
          title={c.valor ?? undefined}
          className={`mt-0.5 break-words text-sm font-bold text-[var(--text-primary)] ${c.mono ? "font-mono" : ""} ${
            c.valor ? "" : "font-normal text-[var(--text-tertiary)]"
          }`}
        >
          {c.valor ?? "—"}
        </p>
      )}
    </div>
  );
}

/**
 * Encabezado de bloque: la regla y el rótulo, como las secciones del papel.
 *
 * La separación la pone el CONTENEDOR del bloque y no `first:` acá: cada bloque
 * vive en su propio `<div>`, así que el título siempre era «el primer hijo» y
 * los modificadores se aplicaban a los cinco — «PROPIETARIO DEL PRODUCTO»
 * terminaba pegado al distrito del bloque anterior, sin línea ni aire.
 */
function TituloBloque({ children, casilleros }: { children: string; casilleros: string }) {
  return (
    <div className="mb-2.5 flex items-baseline gap-2">
      <h4 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
        {children}
      </h4>
      <span className="font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{casilleros}</span>
    </div>
  );
}

/** Rango de casilleros del bloque, para el rótulo: "13 – 21". */
function rango(nums: (string | undefined)[]): string {
  const n = nums.filter(Boolean).map(Number).filter((x) => Number.isFinite(x));
  if (n.length === 0) return "";
  const min = Math.min(...n);
  const max = Math.max(...n);
  return min === max ? `${min}` : `${min} – ${max}`;
}

export default function CtpGuiaSerforHoja({
  gtf,
  onImprimir,
}: {
  gtf: GtfSerfor;
  /** Abre el documento oficial (mismo dato, formato del papel). */
  onImprimir?: () => void;
}) {
  const bloques = useMemo(() => bloquesDeGuia(gtf), [gtf]);
  const completitud = useMemo(() => completitudGuia(bloques), [bloques]);
  const extra = useMemo(() => camposNoMapeados(gtf), [gtf]);
  const [verExtra, setVerExtra] = useState(false);

  const ubicacion = [gtf.distrito, gtf.provincia, gtf.departamento].filter(Boolean).join(" · ");
  const productos = gtf.productos ?? [];
  const trozas = gtf.trozas ?? [];

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      {/* ── Cabecera: quién la emitió y qué guía es ─────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold uppercase text-[var(--text-primary)]">{gtf.titular ?? "—"}</p>
          {gtf.direccionTitular && <p className="truncate text-sm text-[var(--text-secondary)]">{gtf.direccionTitular}</p>}
          <p className="text-sm text-[var(--text-tertiary)]">
            {ubicacion}
            {gtf.rucInstancia && <span className="ml-2 font-mono">RUC {gtf.rucInstancia}</span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Guía de Transporte Forestal
          </p>
          <p className="font-mono text-lg font-bold leading-tight text-[var(--text-primary)]">
            N° {gtf.gtfNumber ?? "—"}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center justify-end gap-1.5">
            {gtf.estado && (
              <span className="rounded-full bg-[var(--data-success-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                {gtf.estado}
              </span>
            )}
            <span className="font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              Reg. {gtf.numeroRegistro}
            </span>
          </p>
        </div>
      </header>

      <div className="px-4 py-3">
        {/* ── Los cinco bloques del documento ───────────────────────────── */}
        {bloques.map((b, i) => (
          <div key={b.id} className={i > 0 ? "mt-4 border-t border-[var(--rule-base)] pt-3.5" : ""}>
            <TituloBloque casilleros={rango(b.casilleros.map((c) => c.n))}>{b.titulo}</TituloBloque>
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-12">
              {b.casilleros.map((c, i) => (
                <Casillero key={`${c.n ?? "s"}-${c.label}-${i}`} c={c} />
              ))}
            </div>
          </div>
        ))}

        {/* ── (37) El detalle, con la cabecera agrupada del papel ───────── */}
        {productos.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--rule-base)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                <tr>
                  <th rowSpan={2} className="px-3 py-2 font-bold">(37a) Nombre científico</th>
                  <th rowSpan={2} className="px-3 py-2 font-bold">(37b) Nombre común</th>
                  <th rowSpan={2} className="px-3 py-2 font-bold">(37c) Tipo de producto</th>
                  <th colSpan={2} className="border-l border-[var(--rule-base)] px-3 py-1.5 text-center font-bold">
                    Forma de embalaje o presentación
                  </th>
                  <th colSpan={2} className="border-l border-[var(--rule-base)] px-3 py-1.5 text-center font-bold">
                    Cantidad
                  </th>
                </tr>
                <tr>
                  <th className="border-l border-[var(--rule-base)] px-3 py-1.5 font-bold">(37d) Descripción</th>
                  <th className="px-3 py-1.5 text-right font-bold">(37e) Cantidad</th>
                  <th className="border-l border-[var(--rule-base)] px-3 py-1.5 font-bold">(37f) Unidad</th>
                  <th className="px-3 py-1.5 text-right font-bold">(37g) Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {productos.map((p, i) => (
                  <tr key={`${p.cientifico}-${i}`}>
                    <td className="px-3 py-2 italic text-[var(--text-secondary)]">{p.cientifico ?? "—"}</td>
                    <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{p.comun ?? "—"}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{p.tipoProducto ?? "—"}</td>
                    <td className="border-l border-[var(--rule-soft)] px-3 py-2 text-[var(--text-secondary)]">{p.presentacion ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {p.cantidad != null ? p.cantidad : "—"}
                    </td>
                    <td className="border-l border-[var(--rule-soft)] px-3 py-2 text-[var(--text-secondary)]">{p.unidad ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {n3(p.volumen)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {gtf.volumenTotal != null && (
                <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-right text-sm font-bold text-[var(--text-primary)]">
                      Volumen total
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {n3(gtf.volumenTotal)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── La lista de trozas: lo que se cuenta pieza por pieza ──────── */}
        {trozas.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--rule-base)]">
            <div className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Lista de trozas · {trozas.length} registro{trozas.length === 1 ? "" : "s"}
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                <tr>
                  <th className="px-3 py-1.5 font-bold">Especie</th>
                  <th className="px-3 py-1.5 font-bold">Codificación</th>
                  <th className="px-3 py-1.5 font-bold">Dimensiones</th>
                  <th className="px-3 py-1.5 text-right font-bold">Cant.</th>
                  <th className="px-3 py-1.5 text-right font-bold">Volumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {trozas.map((t, i) => (
                  <tr key={`${t.codificacion}-${i}`}>
                    <td className="px-3 py-1.5 text-[var(--text-secondary)]">{t.comun ?? t.cientifico ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-[var(--text-secondary)]">{t.dimensiones ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {t.cantidad != null ? t.cantidad : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{n3(t.volumen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pie: qué tan completa vino y de dónde salió ───────────────────── */}
      <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--rule-base)] px-4 py-2.5">
        <p className="min-w-0 flex-1 text-sm text-[var(--text-tertiary)]">
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">
            {completitud.conDato}/{completitud.publicables}
          </span>{" "}
          casilleros con dato
          {completitud.ausentes > 0 && ` · ${completitud.ausentes} no los publica la consulta`}
          {gtf.fechaRegistro && ` · registrada el ${gtf.fechaRegistro}`}
        </p>
        {extra.length > 0 && (
          <button
            type="button"
            onClick={() => setVerExtra((v) => !v)}
            aria-expanded={verExtra}
            className="inline-flex items-center gap-1 text-sm font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${verExtra ? "rotate-90" : ""}`} aria-hidden />
            Todo lo que publicó SERFOR ({extra.length})
          </button>
        )}
        {onImprimir && (
          <Btn size="sm" variant="secondary" onClick={onImprimir}>
            <Printer className="h-4 w-4" /> Ver la guía oficial
          </Btn>
        )}
      </footer>

      {/* Lo crudo, por si SERFOR agrega una etiqueta que ningún casillero mira. */}
      {verExtra && extra.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-5 gap-y-2 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-3 sm:grid-cols-2">
          {extra.map((c) => (
            <div key={c.etiqueta} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden /> {c.etiqueta}
              </dt>
              <dd className="break-words text-sm text-[var(--text-primary)]">{c.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
