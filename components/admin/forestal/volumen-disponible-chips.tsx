"use client";

/**
 * Las pilas de «Volumen disponible» en UNA fila que es filtro y resumen a la
 * vez (Brandon 17-10: «se ve muy mal… orden, organización y compactación»).
 *
 * Antes eran dos cosas que repetían las mismas cifras: una fila de chips para
 * elegir y, debajo, «Total para trabajar» con una tarjeta grande por pila.
 * Ahora cada tarjeta dice su m³ (o pt), cuántas piezas y qué % del total, y
 * tocarla es el filtro `?fuentes=` de siempre; «Todo» es el total con su ≈pt.
 * La flecha de cada tarjeta es el «Ver →» de antes: esa pila sola.
 */

import { ArrowRight, Check, Layers } from "@buleje/design-system/icons";
import { CHART_PALETTE } from "@/components/ui-system/charts";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import {
  DETALLE_FUENTE,
  ETIQUETA_FUENTE,
  FUENTES_VOLUMEN,
  UNIDAD_FUENTE,
  sonTodas,
  type FuenteVolumen,
  type ResumenVolumen,
  type UnidadVolumen,
} from "@/lib/forestal/volumen-disponible";

/** El color de cada pila: el mismo en la tarjeta, la barra y la tabla. */
export const COLOR_FUENTE: Record<FuenteVolumen, string> = {
  trozas: CHART_PALETTE.amber,
  lotes: CHART_PALETTE.purple,
  recepcion: CHART_PALETTE.info,
  productos: CHART_PALETTE.accent,
};

const nf = (n: number) => formatNumber(n);
const tarjeta =
  "flex h-full w-full min-h-12 flex-col items-start gap-0.5 rounded-xl border-2 px-2.5 py-1.5 text-left transition-colors";
const tono = (activo: boolean) =>
  activo
    ? "border-[var(--accent)] bg-primary/10"
    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]";
const marca = "h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]";

export function SelectorDePilas({
  fuentes,
  porPila,
  unidad,
  cargando,
  onAlternar,
  onSolo,
}: {
  fuentes: readonly FuenteVolumen[];
  /** Cada pila con el filtro de permiso y especie puesto (elegida o no). */
  porPila: ResumenVolumen;
  unidad: UnidadVolumen;
  cargando: boolean;
  onAlternar: (f: FuenteVolumen | "todo") => void;
  /** «Ver →»: esa pila sola, con su detalle completo. */
  onSolo: (f: FuenteVolumen) => void;
}) {
  const todas = sonTodas(fuentes);
  const una = fuentes.length === 1 ? fuentes[0] : null;
  const enPt = unidad === "pt";
  /* La barra y los % van en la unidad que se mira: en pt la troza pesa menos
     (56 % aserrable) que la madera ya aserrada. */
  const de = (x: { m3: number; pt: number }) => (enPt ? x.pt : x.m3);
  const escrito = (x: { m3: number; pt: number }) => (cargando ? "…" : enPt ? `${nf(x.pt)} pt` : `${fmtM3(x.m3)} m³`);
  const total = de(porPila.total);
  const pct = (x: { m3: number; pt: number }) => (total > 0 ? Math.round((de(x) / total) * 1000) / 10 : 0);
  const t = porPila.total;

  return (
    <div className="space-y-2">
      <div className="@container">
        <div
          role="group"
          aria-label="Qué volumen mirar"
          className="grid grid-cols-2 gap-2 @xl:grid-cols-3 @4xl:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))]"
        >
          <button
            type="button"
            onClick={() => onAlternar("todo")}
            aria-pressed={todas}
            title="Todo: las cuatro pilas sumadas, sin contar dos veces el mismo m³"
            className={`${tarjeta} ${tono(todas)} col-span-2 @xl:col-span-1`}
          >
            <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
              {todas ? <Check className={marca} aria-hidden /> : <Layers className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden />}
              Todo
            </span>
            {/* En el celular la tarjeta ocupa la fila: la cifra y su ≈pt van lado a lado. */}
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-lg/6 font-bold tabular-nums text-[var(--text-primary)]">{escrito(t)}</span>
              <span className="text-sm tabular-nums text-[var(--text-secondary)]">
                {cargando ? "Leyendo…" : enPt ? `= ${fmtM3(t.m3)} m³` : `≈ ${nf(t.pt)} pt aprovechables`}
              </span>
            </span>
          </button>
          {FUENTES_VOLUMEN.map((f) => {
            const activo = !todas && fuentes.includes(f);
            const p = porPila.porFuente[f];
            const piezas = `${nf(p.unidades)} ${UNIDAD_FUENTE[f][p.unidades === 1 ? 0 : 1]}`;
            return (
              <div key={f} className="relative min-w-0">
                <button
                  type="button"
                  onClick={() => onAlternar(f)}
                  aria-pressed={activo}
                  title={`${ETIQUETA_FUENTE[f]}: ${DETALLE_FUENTE[f]}`}
                  aria-label={`${ETIQUETA_FUENTE[f]}, ${DETALLE_FUENTE[f]}: ${cargando ? "leyendo" : `${escrito(p)} en ${piezas}, ${pct(p)} % del total`}`}
                  className={`${tarjeta} ${tono(activo)}`}
                >
                  <span className={`flex w-full min-w-0 items-center gap-1.5 text-sm font-bold text-[var(--text-primary)] ${una === f ? "" : "pr-6"}`}>
                    {activo ? (
                      <Check className={marca} aria-hidden />
                    ) : (
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR_FUENTE[f] }} />
                    )}
                    <span className="truncate">{ETIQUETA_FUENTE[f]}</span>
                  </span>
                  <span className="whitespace-nowrap text-lg/6 font-bold tabular-nums text-[var(--text-primary)]">{escrito(p)}</span>
                  <span className="text-sm tabular-nums text-[var(--text-secondary)]">
                    {cargando ? "…" : `${piezas} · ${pct(p)}\u00a0%`}
                  </span>
                </button>
                {una !== f && (
                  <button
                    type="button"
                    onClick={() => onSolo(f)}
                    aria-label={`Ver solo ${ETIQUETA_FUENTE[f]}`}
                    title={`Ver solo ${ETIQUETA_FUENTE[f]}, con todo su detalle`}
                    className="absolute top-0.5 right-0.5 inline-flex h-9 w-9 items-center @4xl:top-1 @4xl:right-1 @4xl:h-8 @4xl:w-8 justify-center rounded-lg text-[var(--accent-ink)] transition-colors hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
                  >
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {total > 0 && !cargando && (
        <div
          className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-[var(--surface-sunken)]"
          role="img"
          aria-label={`Reparto del total: ${FUENTES_VOLUMEN.map((f) => `${ETIQUETA_FUENTE[f]} ${pct(porPila.porFuente[f])} %`).join(", ")}`}
        >
          {FUENTES_VOLUMEN.map((f) =>
            de(porPila.porFuente[f]) > 0 ? (
              <span
                key={f}
                className={todas || fuentes.includes(f) ? "" : "opacity-30"}
                style={{ width: `${(de(porPila.porFuente[f]) / total) * 100}%`, background: COLOR_FUENTE[f] }}
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
