"use client";

/**
 * Las cuatro etapas del expediente, dibujadas. Este archivo NO decide nada:
 * `construirHistoriaLote` ya resolvió qué es cada cosa (y tiene los tests).
 *
 * Se leen como una línea de tiempo porque eso es lo que son —la madera pasa por
 * las cuatro en ese orden—, y cada etapa muestra su detalle abierto: un
 * expediente que hay que desplegar sección por sección obliga a nueve clics
 * para contestar la pregunta que trajo al que lo abre. La única que se colapsa
 * es la lista de piezas, que puede tener doscientas filas.
 */

import { useState } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { ChevronDown, ChevronRight } from "@buleje/design-system/icons";
import type { HistoriaLote } from "@/lib/forestal/historia-lote";

const n4 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(4));
const n2 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2));
const nf = (v: number) => v.toLocaleString("es-PE");
/** Las fechas del libro son date-only a medianoche UTC: leerlas en Lima las corre un día. */
const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
/** El schema guarda `m3`; el papel y la pantalla dicen `m³`. */
const unidad = (u: string | null | undefined) => (!u || u === "m3" ? "m³" : u);

export function Etapa({
  n,
  titulo,
  resumen,
  vacio,
  children,
}: {
  n: 1 | 2 | 3 | 4;
  titulo: string;
  resumen: string;
  /** Cuando la etapa no ocurrió: se dice POR QUÉ, no se esconde el bloque. */
  vacio?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative border-l-2 border-[var(--rule-base)] pb-6 pl-6 last:pb-0">
      {/* El número en la línea: marca el orden sin que haya que leerlo. */}
      <span
        className="absolute -left-[15px] top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] font-mono text-xs font-extrabold text-[var(--text-secondary)]"
        aria-hidden
      >
        {n}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <CardTitle as="h3" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          {titulo}
        </CardTitle>
        <p className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{resumen}</p>
      </div>
      {vacio ? (
        <p className="mt-2 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-tertiary)]">{vacio}</p>
      ) : (
        <div className="mt-3">{children}</div>
      )}
    </section>
  );
}

/** La pila que se apartó, pieza por pieza. Colapsada: puede tener 200 filas. */
export function TablaDeTrozas({ trozas }: { trozas: HistoriaLote["armado"]["trozas"] }) {
  const [abierta, setAbierta] = useState(false);
  if (trozas.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--rule-base)]">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
      >
        {abierta ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
        Las {nf(trozas.length)} piezas, una por una
      </button>
      {abierta && (
        <div className="overflow-x-auto border-t border-[var(--rule-base)]">
          <DataTable className="w-full text-sm">
            <thead className="bg-[var(--surface-sunken)] text-xs">
              <tr>
                {["Cód. planta", "Codificación", "GTF de ingreso", "Permiso", "D1 (cm)", "D2 (cm)", "Largo (m)", "Volumen (m³)"].map((h, i) => (
                  <th key={h} className={`px-3 py-2 font-bold text-[var(--text-secondary)] ${i >= 4 ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trozas.map((t) => (
                <tr key={t.id} className="border-t border-[var(--rule-soft)]">
                  <td className="px-3 py-1.5 font-mono text-[var(--text-primary)]">{t.codigoPlanta ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-[var(--text-secondary)]">{t.codificacion ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-[var(--text-secondary)]">{t.gtfNumber ?? "—"}</td>
                  <td className="px-3 py-1.5 text-[var(--text-secondary)]">{t.permiso ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-secondary)]">{n2(t.d1Cm)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-secondary)]">{n2(t.d2Cm)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-secondary)]">{n2(t.largoM)}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{n4(t.volumenM3)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
              <tr>
                <td className="px-3 py-2 text-[var(--text-primary)]" colSpan={7}>
                  Total · {nf(trozas.length)} piezas
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">
                  {n4(trozas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0))}
                </td>
              </tr>
            </tfoot>
          </DataTable>
        </div>
      )}
    </div>
  );
}

/** Qué salió de cada corrida, con el detalle de sus paquetes. */
export function ProduccionDelLote({ produccion }: { produccion: HistoriaLote["produccion"] }) {
  return (
    <div className="space-y-3">
      {produccion.corridas.map((c) => (
        <div key={c.id} className="rounded-xl border border-[var(--rule-base)] p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Corrida N° {c.lineNo ?? "—"} · {c.producto ?? "sin tipo declarado"}
            </p>
            <p className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
              {c.cantidad == null ? "sin declarar" : `${n4(c.cantidad)} ${unidad(c.unit)}`}
              <span className="ml-2 font-sans text-xs font-normal text-[var(--text-tertiary)]">{fecha(c.fecha)}</span>
            </p>
          </div>
          {c.paquetes.length > 0 ? (
            <div className="mt-2 overflow-x-auto">
              <DataTable className="w-full text-sm">
                <thead className="bg-[var(--surface-sunken)] text-xs">
                  <tr>
                    {["Código", "Producto", "Presentación", "Piezas", "Volumen (m³)"].map((h, i) => (
                      <th key={h} className={`px-3 py-1.5 font-bold text-[var(--text-secondary)] ${i >= 3 ? "text-right" : "text-left"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.paquetes.map((p) => (
                    <tr key={p.id} className="border-t border-[var(--rule-soft)]">
                      <td className="px-3 py-1.5 font-mono font-bold text-[var(--text-primary)]">{p.codigo ?? "—"}</td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">{p.productType ?? "—"}</td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">{p.presentacion ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-secondary)]">{nf(p.cantidad)}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{n4(p.volumenM3)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          ) : (
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              {c.cantidad == null
                ? "Corrida abierta: consumió y todavía no declaró qué salió."
                : "Declarada sin detalle de paquetes."}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Con qué guía salió y junto a qué otros lotes viajó. */
export function SalidaDelLote({ salida }: { salida: HistoriaLote["salida"] }) {
  return (
    <div className="space-y-3">
      {salida.despachos.map((d) => (
        <div key={d.despachoEntryId} className="rounded-xl border border-[var(--rule-base)] p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              GTF {d.gtfNumber ?? `(línea N° ${d.lineNo ?? "—"})`}
              {d.destino && <span className="font-normal text-[var(--text-secondary)]"> · {d.destino}</span>}
            </p>
            <p className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{fecha(d.fecha)}</p>
          </div>

          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-[var(--text-secondary)]">De este lote</dt>
            <dd className="text-right font-mono font-extrabold tabular-nums text-[var(--text-primary)]">
              {n4(d.deEsteLote)} {unidad(d.unit)}
            </dd>
            <dt className="text-[var(--text-secondary)]">Total de la guía</dt>
            <dd className="text-right font-mono tabular-nums text-[var(--text-secondary)]">
              {n4(d.totalDeLaGuia)} {unidad(d.unit)}
            </dd>
          </dl>

          {d.companeros.length > 0 && (
            <>
              <p className="mt-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Viajó junto a
              </p>
              <ul className="mt-1 space-y-0.5">
                {d.companeros.map((c) => (
                  <li key={c.loteCode ?? "sin-lote"} className="flex justify-between gap-3 text-sm">
                    {/* Lo que no tiene lote de aserrío se NOMBRA. Descartarlo
                        dejaría el total de la guía sin explicar. */}
                    <span className={c.loteCode ? "text-[var(--text-primary)]" : "italic text-[var(--text-tertiary)]"}>
                      {c.loteCode ?? "sin lote de aserrío"}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                      {n4(c.cantidad)} {unidad(d.unit)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {d.compartida && (
            <p className="mt-2 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-medium text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
              Esta guía salió de una corrida que el lote comparte con otro: «de este lote» es un techo, no una medición.
              No se reparte por regla de tres — el dato que diría qué mitad salió no existe.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
