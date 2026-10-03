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
 *
 * 2026-09-25 (Brandon, alta de ingreso): los bloques van DE A DOS por fila —la
 * guía junto al propietario, el destinatario junto al transportista— porque a
 * ancho completo cada uno dejaba media pantalla en blanco y la guía entera
 * pedía varias pantallas de scroll. La lista de trozas se fue a su propio
 * apartado (`CtpGuiaSerforTrozas`): es lo que se coteja pieza por pieza y
 * merecía buscador y columnas separadas. Vive dentro de una `Seccion`
 * tarjeta, así que no dibuja marco propio.
 */

import { useMemo, useState } from "react";
import { revisarTiposGTF } from "@/lib/forestal/gtf-validador-tipo";
import { AvisoTipoGtf } from "./aviso-tipo-gtf";
import { CardTitle, DataTable } from "@buleje/design-system";
import { ChevronDown, ChevronRight, FileText, Printer } from "@buleje/design-system/icons";
import {
  bloquesDeGuia,
  camposNoMapeados,
  completitudGuia,
  type CasilleroGtf,
} from "@/lib/forestal/gtf-serfor-bloques";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { Btn } from "./ctp-shared";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { formatNumber } from "@/lib/format";
import { pieTablarAserrableDe } from "@/lib/forestal/cubicacion";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";

/**
 * Pies tablares de un volumen de la guía, como madera ASERRABLE: m³ × 56 % ×
 * 424 (Brandon 2026-09-25). La guía trae rolliza; el pt que se le puede sacar
 * es el del rendimiento meta, no m³ × 424 — ése es para madera ya aserrada y
 * daba casi el doble (ver `pieTablarAserrableDe`). Es un DERIVADO: se rotula
 * con «≈» y se explica, nunca se presenta como dato del documento.
 */
const ptAserrable = (m3: number | null | undefined) =>
  m3 == null ? "—" : `≈ ${formatNumber(pieTablarAserrableDe(m3, RENDIMIENTO_META), 0)}`;

/* En el celular, dos casilleros por renglón (los de ancho completo, uno): de a
   uno, la guía entera eran ~38 renglones de scroll. */
const SPAN: Record<number, string> = {
  3: "col-span-1 sm:col-span-3",
  4: "col-span-1 sm:col-span-4",
  6: "col-span-1 sm:col-span-6",
  12: "col-span-2 sm:col-span-12",
};

const n3 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(3));

/**
 * Un casillero del documento: número, rótulo y lo que dice.
 *
 * El rótulo va en minúsculas con el número en insignia, igual que los campos
 * de la carga manual: en versalitas espaciadas de 11 px («(3) FECHA DE
 * EXPEDICIÓN») el rótulo pesaba lo mismo que el dato y costaba encontrar cuál
 * era cuál.
 */
function Casillero({ c }: { c: CasilleroGtf }) {
  return (
    <div className={`min-w-0 ${SPAN[c.span ?? 6]}`}>
      <p className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
        {c.n && (
          <span
            aria-hidden="true"
            className="shrink-0 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold tabular-nums"
          >
            {c.n}
          </span>
        )}
        <span className="truncate">{c.label}</span>
      </p>
      {c.noPublicado ? (
        <p
          title="El casillero existe en la guía impresa, pero la consulta pública de SERFOR no lo devuelve"
          className="mt-1 text-sm italic text-[var(--text-tertiary)]"
        >
          No lo publica la consulta
        </p>
      ) : (
        <p
          title={c.valor ?? undefined}
          className={`mt-1 break-words text-sm font-semibold text-[var(--text-primary)] ${c.mono ? "font-mono" : ""} ${
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
    <div className="mb-3 flex items-baseline gap-2">
      <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">
        {children}
      </CardTitle>
      {casilleros && (
        <span className="font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">casilleros {casilleros}</span>
      )}
    </div>
  );
}

/** Un dato del resumen plegado: rótulo chico y valor; lo ausente se dice. */
function Resumen({ etiqueta, valor, mono }: { etiqueta: string; valor: string | null | undefined; mono?: boolean }) {
  return (
    <span className="min-w-0">
      <span className="text-[var(--text-tertiary)]">{etiqueta}: </span>
      <span className={`font-semibold text-[var(--text-primary)] ${mono ? "font-mono" : ""} ${valor ? "" : "font-normal text-[var(--text-tertiary)]"}`}>
        {valor || "—"}
      </span>
    </span>
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
  recordarComo = "ctp:alta:ver-casilleros-guia",
  casillerosAbiertos = false,
}: {
  gtf: GtfSerfor;
  /** Abre el documento oficial (mismo dato, formato del papel). */
  onImprimir?: () => void;
  /** Dónde se recuerda si los casilleros van abiertos (cada pantalla, el suyo). */
  recordarComo?: string;
  /** Abiertos la primera vez (el importador del Libro TH: ahí se viene a mirar la guía entera). */
  casillerosAbiertos?: boolean;
}) {
  const bloques = useMemo(() => bloquesDeGuia(gtf), [gtf]);
  const completitud = useMemo(() => completitudGuia(bloques), [bloques]);
  const extra = useMemo(() => camposNoMapeados(gtf), [gtf]);
  const [verExtra, setVerExtra] = useState(false);
  /* Los casilleros 2-36 arrancan PLEGADOS (Brandon 2026-09-25, «menos
     scroll»): son una declaración ajena que no se edita, y abiertos eran la
     mitad del alto del modal. Plegado no es esconder: queda una línea con lo
     que se coteja. Se recuerda para quien los quiere siempre abiertos. */
  const [verCasilleros, setVerCasilleros] = useLocalStorage<boolean>(recordarComo, casillerosAbiertos);

  const ubicacion = [gtf.distrito, gtf.provincia, gtf.departamento].filter(Boolean).join(" · ");
  const productos = gtf.productos ?? [];
  /* Fase 3 (2026-10-03): una guía ajena también puede traer el tipo cambiado; se avisa antes de aceptarla. */
  const avisosTipo = useMemo(
    () => revisarTiposGTF(productos.map((p) => ({ comun: p.comun, cientifico: p.cientifico, tipoProducto: p.tipoProducto, cantidad: p.cantidad, total: p.volumen, unidad: p.unidad }))),
    [productos],
  );

  return (
    <div className="min-w-0 space-y-3 sm:col-span-12">
      {/* ── Cabecera: quién la emitió y qué guía es ─────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-[var(--surface-sunken)] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold uppercase text-[var(--text-primary)]">{gtf.titular ?? "—"}</p>
          {gtf.direccionTitular && <p className="truncate text-sm text-[var(--text-secondary)]">{gtf.direccionTitular}</p>}
          <p className="text-sm text-[var(--text-tertiary)]">
            {ubicacion}
            {/* Es el RUC de la instancia que REGISTRÓ la guía (la ATFFS), no el del
                titular: debajo del nombre del titular parecía suyo (memoria
                `providerdocument-serfor-es-ruc-de-la-instancia`). */}
            {gtf.rucInstancia && (
              <span className="ml-2" title="RUC de la instancia que registró la guía (no es el del titular)">
                RUC de la instancia <span className="font-mono">{gtf.rucInstancia}</span>
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-medium text-[var(--text-tertiary)]">Guía de Transporte Forestal</p>
          <p className="font-mono text-lg font-bold leading-tight text-[var(--text-primary)]">N° {gtf.gtfNumber ?? "—"}</p>
          <p className="mt-0.5 flex flex-wrap items-center justify-end gap-1.5">
            {gtf.estado && (
              <span className="rounded-full bg-[var(--data-success-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                {gtf.estado}
              </span>
            )}
            <span className="font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Reg. {gtf.numeroRegistro}</span>
          </p>
        </div>
      </header>

      {/* ── Plegado: una línea con lo que se coteja ─────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-[var(--rule-base)] px-3.5 py-2.5 text-sm">
        <Resumen etiqueta="Vigencia" valor={[gtf.fechaExpedicion, gtf.fechaVencimiento].filter(Boolean).join(" → ") || null} />
        <Resumen etiqueta="Propietario" valor={gtf.propietario} />
        <Resumen etiqueta="Destinatario" valor={gtf.destinatario} />
        <Resumen etiqueta="Placa" valor={gtf.placa} mono />
        <button
          type="button"
          onClick={() => setVerCasilleros((v) => !v)}
          aria-expanded={verCasilleros}
          className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
        >
          {verCasilleros ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
          {verCasilleros ? "Ocultar los casilleros" : "Ver los casilleros 2 – 36"}
        </button>
      </div>

      {/* ── Los bloques del documento, de a dos por fila ──────────────────
          La guía | el propietario · el destinatario | el transportista. El
          detalle del producto ocupa la fila entera. */}
      {verCasilleros && (
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {bloques.map((b) => (
          <div
            key={b.id}
            className={`min-w-0 rounded-xl border border-[var(--rule-base)] p-3.5 ${b.id === "producto" ? "xl:col-span-2" : ""}`}
          >
            <TituloBloque casilleros={rango(b.casilleros.map((c) => c.n))}>{b.titulo}</TituloBloque>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-12">
              {b.casilleros.map((c, i) => (
                <Casillero key={`${c.n ?? "s"}-${c.label}-${i}`} c={c} />
              ))}
            </div>

          </div>
        ))}
      </div>
      )}

      {/* ── (37) El detalle, SIEMPRE a la vista: especie, cantidad, volumen y
          su equivalente en pies tablares. Es lo que se registra. ─────────── */}
            {/* (37) El detalle, con la cabecera agrupada del papel. */}
            <AvisoTipoGtf avisos={avisosTipo} />
            {productos.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-[var(--rule-base)]">
                <DataTable className="w-full text-sm">
                  <thead className="bg-[var(--surface-sunken)] text-left text-xs text-[var(--text-tertiary)]">
                    <tr>
                      <th rowSpan={2} className="px-3 py-2 font-semibold">(37a) Nombre científico</th>
                      <th rowSpan={2} className="px-3 py-2 font-semibold">(37b) Nombre común</th>
                      <th rowSpan={2} className="px-3 py-2 font-semibold">(37c) Tipo de producto</th>
                      <th colSpan={2} className="border-l border-[var(--rule-base)] px-3 py-1.5 text-center font-semibold">
                        Forma de embalaje o presentación
                      </th>
                      <th colSpan={2} className="border-l border-[var(--rule-base)] px-3 py-1.5 text-center font-semibold">
                        Cantidad
                      </th>
                      <th rowSpan={2} className="border-l border-[var(--rule-base)] px-3 py-2 text-right font-semibold">
                        <span className="inline-flex items-center gap-1">
                          Pies tablares
                          <InfoTip
                            title="Pies tablares (estimado)"
                            what="No lo declara la guía: es el volumen convertido a madera aserrable, para saber cuánto pie tablar se le puede sacar."
                            affects="Sirve para cotizar y planificar; en el libro se registra el m³ de la guía."
                            example="13,939 m³ × 56 % × 424 ≈ 3 310 pt"
                            ariaLabel="Cómo se calculan los pies tablares"
                          />
                        </span>
                      </th>
                    </tr>
                    <tr>
                      <th className="border-l border-[var(--rule-base)] px-3 py-1.5 font-semibold">(37d) Descripción</th>
                      <th className="px-3 py-1.5 text-right font-semibold">(37e) Cantidad</th>
                      <th className="border-l border-[var(--rule-base)] px-3 py-1.5 font-semibold">(37f) Unidad</th>
                      <th className="px-3 py-1.5 text-right font-semibold">(37g) Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--rule-soft)]">
                    {productos.map((pr, i) => (
                      <tr key={`${pr.cientifico}-${i}`}>
                        <td className="px-3 py-2 italic text-[var(--text-secondary)]">{pr.cientifico ?? "—"}</td>
                        <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{pr.comun ?? "—"}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{pr.tipoProducto ?? "—"}</td>
                        <td className="border-l border-[var(--rule-soft)] px-3 py-2 text-[var(--text-secondary)]">{pr.presentacion ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                          {pr.cantidad != null ? pr.cantidad : "—"}
                        </td>
                        <td className="border-l border-[var(--rule-soft)] px-3 py-2 text-[var(--text-secondary)]">{pr.unidad ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                          {n3(pr.volumen)}
                        </td>
                        <td className="border-l border-[var(--rule-soft)] px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                          {ptAserrable(pr.volumen)}
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
                        <td className="border-l border-[var(--rule-base)] px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                          {ptAserrable(gtf.volumenTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </DataTable>
              </div>
            )}

      {/* ── Pie: qué tan completa vino y de dónde salió ───────────────────── */}
      <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-[var(--surface-sunken)] px-3.5 py-2.5">
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
        <dl className="grid grid-cols-1 gap-x-5 gap-y-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-3 sm:grid-cols-2">
          {extra.map((c) => (
            <div key={c.etiqueta} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden /> {c.etiqueta}
              </dt>
              <dd className="break-words text-sm text-[var(--text-primary)]">{c.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
