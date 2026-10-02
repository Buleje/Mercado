"use client";

/**
 * Dónde está el volumen de cada especie de una plantación, y su corrección en
 * la misma fila (ADR-459).
 *
 * Cada fila cuenta la especie de izquierda a derecha: lo que dice el registro
 * (árboles, año, superficie, m³) y la cascada que va descontando cada proceso
 * del libro — talado → sin trozar → en patio → despachado — con lo que queda en
 * pie. Las cuentas son de `cascadaDelPlan` (pura y probada): esta tabla sólo
 * las pinta. La MISMA madera pasa por tala, trozado y despacho: los casilleros
 * no se suman entre sí.
 *
 * Corregir una especie es tocar su fila: árboles, año, superficie, m³, nombre
 * científico y precio. El nombre común no se edita (el saldo cruza por él);
 * para cambiarlo, se quita y se vuelve a agregar.
 */

import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Check, Loader2, Pencil, Trash2, X } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { CascadaEspecie, CascadaPlan } from "@/lib/forestal/loth-saldo-cascada";
import { CitesPill, CitesToggle } from "./loth-plan-ui";
import { aEspecieParaGuardar, conCites, filaDesdeEspecie, problemaDeFila, type FilaEspecie } from "./loth-plan-especies-api";
import type { Species } from "./loth-plan-shared";

const m3 = (v: number) => formatNumber(v, 3);
/* Sin ancho: lo pone cada input. Con `w-full` adentro de una celda de tabla
   el input medía lo que la celda le dejaba (el año se veía «2»). */
const EDIT = "h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20";
/* Sin las flechitas del input numérico: en una celda de 64 px se comían el
   año (medido: la fila en edición desbordaba la caja 95 px a 1280). */
const SIN_FLECHAS = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const EDIT_NUM = `${EDIT} ${SIN_FLECHAS} text-right font-mono tabular-nums`;
const NUM = "text-right font-mono tabular-nums whitespace-nowrap";
/* `px-2` y no el `px-3` del DS: con doce columnas, 8 px por lado son los que
   hacen que la última entre a 1280 sin scroll lateral. */
const COMPACTA = "[&_thead_th]:px-2 [&_tbody_td]:px-2 [&_tfoot_td]:px-2 [&_tfoot_th]:px-2 [&_thead_th]:normal-case [&_thead_th]:tracking-normal";

export interface AccionesTabla {
  guardar: (id: string, fila: FilaEspecie) => Promise<string | null>;
  quitar: (s: Species, c: CascadaEspecie | null) => void;
}

export default function LothPlantacionTabla({ species, cascada, acciones }: {
  species: Species[];
  cascada: CascadaPlan;
  acciones: AccionesTabla;
}) {
  const [editando, setEditando] = useState<FilaEspecie | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const porClave = new Map(cascada.especies.map((c) => [claveEspecie(c.especie), c]));

  async function guardar() {
    if (!editando) return;
    const problema = problemaDeFila(editando);
    if (problema) { setError(problema); return; }
    setGuardando(true);
    const e = await acciones.guardar(editando.uid, editando);
    setGuardando(false);
    if (e) { setError(e); return; }
    setEditando(null);
    setError(null);
  }

  const arbTotal = species.some((s) => s.arbolesAutorizados == null) ? null : species.reduce((a, s) => a + (s.arbolesAutorizados ?? 0), 0);
  const supTotal = species.reduce((a, s) => a + Number(s.superficieHa ?? 0), 0);
  const t = cascada.total;

  return (
    <div className="space-y-2">
      <DataTable className={`text-sm ${COMPACTA}`} wrapperClassName="rounded-xl" data-tabla-registro>
        <thead>
          <tr>
            <th scope="col">Especie</th>
            <th scope="col" className="text-right" data-label="N° de árboles">Árboles</th>
            <th scope="col" className="text-right" data-label="Año de instalación">Año</th>
            <th scope="col" className="text-right" data-label="Superficie (ha)">Sup. ha</th>
            <th scope="col" className="text-right" data-label="Registrado (m³)">Registrado</th>
            <th scope="col" className="text-right" data-label="Talado (m³)">Talado</th>
            <th scope="col" className="text-right" data-label="En pie (m³)">En pie</th>
            <th scope="col" className="text-right" data-label="Talado sin trozar (m³)" title="Talado que todavía no se trozó">Sin trozar</th>
            <th scope="col" className="text-right" data-label="Trozas en patio (m³)" title="Trozado que todavía no salió ni se consumió">En patio</th>
            <th scope="col" className="text-right" data-label="Despachado (m³)">Despachado</th>
            <th scope="col" data-label="% talado">% talado</th>
            <th scope="col" aria-label="Acciones"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {species.flatMap((s) => {
            const c = porClave.get(claveEspecie(s.speciesCommon)) ?? null;
            const enEdicion = editando?.uid === s.id;
            const fila = enEdicion && editando ? editando : null;
            const set = (k: keyof FilaEspecie, v: string) => setEditando((x) => (x ? { ...x, [k]: v } : x));
            return [
              <tr
                key={s.id}
                data-especie={s.speciesCommon}
                className={c?.excedido ? "bg-[var(--data-error-500)]/10" : enEdicion ? "bg-[var(--surface-canvas)]" : undefined}
              >
                <td>
                  <span className="font-semibold text-[var(--text-primary)]">{s.speciesCommon}</span>
                  {fila ? (
                    <CitesToggle
                      activo={fila.cites}
                      onCambiar={(v) => setEditando((x) => (x ? conCites(x, v) : x))}
                      especie={s.speciesCommon}
                      className="ml-1.5"
                    />
                  ) : (
                    s.cites && <CitesPill />
                  )}
                  {!fila && s.speciesScientific && <span className="block text-xs italic text-[var(--text-tertiary)]">{s.speciesScientific}</span>}
                  {c?.excedido && !fila && (
                    <span className="block text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">Se pasó de lo registrado</span>
                  )}
                </td>
                <td className={NUM}>
                  {fila ? <input type="number" min="0" step="1" value={fila.arboles} onChange={(e) => set("arboles", e.target.value)} aria-label={`N° de árboles de ${s.speciesCommon}`} className={`${EDIT_NUM} w-16`} /> : s.arbolesAutorizados != null ? formatNumber(s.arbolesAutorizados) : "—"}
                </td>
                <td className={NUM}>
                  {fila ? <input type="number" min="1900" max="2100" step="1" value={fila.anioInstalacion} onChange={(e) => set("anioInstalacion", e.target.value)} aria-label={`Año de instalación de ${s.speciesCommon}`} className={`${EDIT_NUM} w-16`} /> : s.anioInstalacion ?? "—"}
                </td>
                <td className={NUM}>
                  {fila ? <input type="number" min="0" step="0.01" value={fila.superficieHa} onChange={(e) => set("superficieHa", e.target.value)} aria-label={`Superficie en hectáreas de ${s.speciesCommon}`} className={`${EDIT_NUM} w-16`} /> : s.superficieHa ? formatNumber(Number(s.superficieHa), 2) : "—"}
                </td>
                <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                  {fila ? <input type="number" min="0" step="0.001" value={fila.volumenM3} onChange={(e) => set("volumenM3", e.target.value)} aria-label={`m³ registrados de ${s.speciesCommon}`} className={`${EDIT_NUM} w-[4.5rem]`} /> : m3(Number(s.volumenAutorizadoM3 ?? 0))}
                </td>
                <Celda v={c?.taladoM3} />
                <EnPie v={c?.enPieM3} />
                <Celda v={c?.taladoSinTrozarM3} />
                <Celda v={c?.enPatioM3} />
                <td className={NUM}>
                  {c ? m3(c.despachadoM3) : "—"}
                  {c && c.consumidoM3 > 0 && <span className="block text-xs text-[var(--text-tertiary)]">+{m3(c.consumidoM3)} consumido</span>}
                </td>
                <td><BarraTalado pct={c?.pctTalado ?? null} excedido={Boolean(c?.excedido)} /></td>
                <td className="whitespace-nowrap text-right">
                  {fila ? (
                    <span className="inline-flex items-center gap-0.5">
                      <button type="button" onClick={() => void guardar()} disabled={guardando} aria-label={`Guardar ${s.speciesCommon}`} title="Guardar" className="grid h-9 w-8 place-items-center rounded-lg text-[var(--data-success-700)] hover:bg-[var(--surface-sunken)] disabled:opacity-50 dark:text-[var(--data-success-500)]">
                        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => { setEditando(null); setError(null); }} aria-label="Cancelar la corrección" title="Cancelar" className="grid h-9 w-8 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
                        <X className="h-4 w-4" />
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5">
                      <button type="button" onClick={() => { setEditando(filaDesdeEspecie(s)); setError(null); }} aria-label={`Corregir ${s.speciesCommon}`} title="Corregir" className="grid h-9 w-8 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--accent)]">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => acciones.quitar(s, c)} aria-label={`Quitar ${s.speciesCommon} del registro`} title="Quitar del registro" className="grid h-9 w-8 place-items-center rounded-lg text-[var(--data-error-700)] hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:hover:bg-[var(--data-error-500)]/12">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  )}
                </td>
              </tr>,
              /* Lo que no es número va en una segunda línea de la misma
                 especie: en la celda del nombre empujaba la tabla a scroll
                 lateral y escondía «Guardar». */
              fila && (
                <tr key={`${s.id}-mas`} className="border-t-0! bg-[var(--surface-canvas)]">
                  <td colSpan={12} className="pt-0!">
                    <span className="flex flex-wrap items-center gap-2">
                      <input value={fila.speciesScientific} onChange={(e) => set("speciesScientific", e.target.value)} placeholder="Nombre científico" aria-label={`Nombre científico de ${s.speciesCommon}`} className={`${EDIT} w-60 italic`} />
                      <input type="number" step="0.01" min="0" value={fila.precioM3} onChange={(e) => set("precioM3", e.target.value)} placeholder="S/ por m³ (opcional)" aria-label={`Precio de venta por m³ de ${s.speciesCommon}`} className={`${EDIT} ${SIN_FLECHAS} w-56 font-mono tabular-nums`} />
                    </span>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
        {species.length > 1 && (
          <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
            <tr className={t.excedido ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : undefined}>
              <td>Total</td>
              <td className={NUM}>{arbTotal == null ? "—" : formatNumber(arbTotal)}</td>
              {/* Vacías: en la tarjeta del celular no se pintan (un rótulo sin dato es ruido). */}
              <td className={`${NUM} max-sm:hidden!`} />
              <td className={NUM}>{supTotal > 0 ? formatNumber(supTotal, 2) : "—"}</td>
              <td className={NUM}>{m3(t.baseM3)}</td>
              <Celda v={t.taladoM3} />
              <EnPie v={t.enPieM3} />
              <Celda v={t.taladoSinTrozarM3} />
              <Celda v={t.enPatioM3} />
              <td className={NUM}>
                {m3(t.despachadoM3)}
                {t.consumidoM3 > 0 && <span className="block text-xs font-normal text-[var(--text-tertiary)]">+{m3(t.consumidoM3)} consumido</span>}
              </td>
              <td><BarraTalado pct={t.pctTalado} excedido={t.excedido} /></td>
              <td className="max-sm:hidden!" />
            </tr>
          </tfoot>
        )}
      </DataTable>
      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>
      )}
    </div>
  );
}

/** Para el padre: la fila corregida, en lo que manda el PATCH. */
export const cambiosDeFila = (f: FilaEspecie) => {
  const e = aEspecieParaGuardar(f);
  return {
    speciesScientific: e.speciesScientific,
    cites: e.cites,
    volumenAutorizadoM3: e.volumenAutorizadoM3,
    arbolesAutorizados: e.arbolesAutorizados,
    anioInstalacion: e.anioInstalacion,
    superficieHa: e.superficieHa,
    precioVentaSoles: e.precioVentaSoles,
  };
};

function Celda({ v }: { v: number | undefined }) {
  if (v == null) return <td className={`${NUM} text-[var(--text-tertiary)]`}>—</td>;
  return <td className={`${NUM} ${v > 0 ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}>{m3(v)}</td>;
}

/** Negativo = se taló más de lo registrado: va en rojo y dice cuánto de más. */
function EnPie({ v }: { v: number | undefined }) {
  if (v == null) return <td className={`${NUM} text-[var(--text-tertiary)]`}>—</td>;
  if (v < 0) {
    return (
      <td className={`${NUM} font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]`}>
        {m3(v)}
        <span className="block text-xs font-semibold">de más</span>
      </td>
    );
  }
  return <td className={`${NUM} font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]`}>{m3(v)}</td>;
}

function BarraTalado({ pct, excedido }: { pct: number | null; excedido: boolean }) {
  if (pct == null) return <span className="text-[var(--text-tertiary)]">—</span>;
  const ancho = Math.max(0, Math.min(100, pct));
  return (
    <span className="flex items-center justify-end gap-2" title={`${formatNumber(pct, 1)} % de lo registrado ya se taló`}>
      <span className="relative h-2 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden="true">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${excedido ? "bg-[var(--data-error-500)]" : "bg-[var(--accent)]"}`}
          style={{ width: `${ancho}%` }}
        />
      </span>
      <span className={`shrink-0 font-mono text-xs font-bold tabular-nums ${excedido ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-secondary)]"}`}>
        {formatNumber(pct, 1)}%
      </span>
    </span>
  );
}
