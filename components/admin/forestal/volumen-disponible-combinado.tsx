"use client";

/**
 * La vista SUMADA de «Volumen disponible» (dos o más pilas elegidas): cuánto
 * hay en total, de qué pila sale y cómo se reparte por permiso y por especie.
 *
 * Una tarjeta por pila con «Ver sola» lleva al detalle de esa pila (trozas,
 * paquetes, lotes o guías) sin perder el filtro de permiso.
 */

import { useId } from "react";
import { ArrowRight } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import {
  DETALLE_FUENTE,
  ETIQUETA_FUENTE,
  UNIDAD_FUENTE,
  type FilaVolumen,
  type FuenteVolumen,
} from "@/lib/forestal/volumen-disponible";
import CtpApartados, { CtpApartadoPanel, useApartado, type Apartado } from "./ctp-apartados";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";
import { COLOR_FUENTE } from "./volumen-disponible-chips";
import type { EstadoVolumenDisponible } from "./hooks/use-volumen-disponible";

const nf = (n: number) => formatNumber(n);
const PESTANAS: readonly Apartado[] = [
  { id: "permiso", label: "Por permiso" },
  { id: "especie", label: "Por especie" },
];

export function VolumenCombinado({
  v,
  fuentes,
  permisos,
  especies,
  onSolo,
  onElegirPermiso,
  onElegirEspecie,
}: {
  v: EstadoVolumenDisponible;
  fuentes: readonly FuenteVolumen[];
  permisos: readonly string[];
  especies: readonly string[];
  onSolo: (f: FuenteVolumen) => void;
  onElegirPermiso: (clave: string) => void;
  onElegirEspecie: (clave: string) => void;
}) {
  const idBase = useId();
  const { activo, ir } = useApartado("volumen-disponible", PESTANAS);
  const r = v.resumen;
  const total = r.total.m3;
  /* Grupos CON nombre (lección de Trozas: «5 permisos» sobre un pie de 4); si
     sólo queda lo que no lo declara, se dice así y no «1 permiso». */
  const apartados: Apartado[] = PESTANAS.map((p) => {
    const filas = p.id === "permiso" ? v.porPermiso : v.porEspecie;
    const n = filas.filter((g) => g.clave !== "").length;
    if (v.sinDatosAun) return { ...p, contador: "…" };
    if (n === 0 && filas.length > 0) return { ...p, contador: `sin ${p.id}` };
    return { ...p, contador: n, unidad: p.id === "permiso" ? (n === 1 ? "permiso" : "permisos") : n === 1 ? "especie" : "especies" };
  });

  return (
    <div className="space-y-4">
      {/* El total y de dónde sale: lo que se mira primero. */}
      <section aria-label="Total disponible" className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)]">
              Total para trabajar
              <InfoTip
                title="Total para trabajar"
                what="La suma de los m³ de las pilas elegidas. Cada m³ está en una sola pila: nada se cuenta dos veces."
                affects="Suma troza y madera aserrada tal como están. Los pt aprovechables son un estimado: la troza al 56 %, lo aserrado a m³ × 424."
                example="Trozas 13.5 + Lotes 8.6 + Productos 7.0 = 29.1 m³."
              />
            </p>
            <p className="text-3xl font-bold tabular-nums text-[var(--text-primary)]">
              {v.sinDatosAun ? "…" : `${fmtM3(total)} m³`}
            </p>
          </div>
          <p className="pb-1 text-base tabular-nums text-[var(--text-secondary)]">
            ≈ {v.sinDatosAun ? "…" : nf(r.total.pt)} pt aprovechables
          </p>
        </div>
        {total > 0 && (
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]" role="img" aria-label={`Reparto: ${fuentes.map((f) => `${ETIQUETA_FUENTE[f]} ${fmtM3(r.porFuente[f].m3)} m³`).join(", ")}`}>
            {fuentes.map((f) =>
              r.porFuente[f].m3 > 0 ? (
                <span key={f} style={{ width: `${(r.porFuente[f].m3 / total) * 100}%`, background: COLOR_FUENTE[f] }} />
              ) : null,
            )}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {fuentes.map((f) => {
            const p = r.porFuente[f];
            const pct = total > 0 ? Math.round((p.m3 / total) * 1000) / 10 : 0;
            return (
              <div key={f} className="min-w-0 rounded-xl border border-[var(--rule-base)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR_FUENTE[f] }} />
                    <span className="truncate">{ETIQUETA_FUENTE[f]}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => onSolo(f)}
                    className="-mr-1 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-1.5 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
                    aria-label={`Ver solo ${ETIQUETA_FUENTE[f]}`}
                  >
                    Ver <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <p className="whitespace-nowrap text-xl font-bold tabular-nums text-[var(--text-primary)]">
                  {v.sinDatosAun ? "…" : `${fmtM3(p.m3)} m³`}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {nf(p.unidades)} {UNIDAD_FUENTE[f][p.unidades === 1 ? 0 : 1]} · {pct}% · {DETALLE_FUENTE[f]}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="Reparto" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CtpApartados apartados={apartados} activo={activo} onIr={ir} idBase={idBase} etiqueta="Reparto del volumen" />
          <InfoTip
            title={activo === "permiso" ? "Por permiso" : "Por especie"}
            what="Una columna por pila elegida y su total."
            affects={activo === "permiso" ? "Clic en un permiso: toda la pestaña muestra solo lo suyo." : "Clic en una especie: toda la pestaña muestra solo esa."}
            example="Elige solo Trozas y Lotes arriba para ver la madera en troza."
          />
        </div>
        <CtpApartadoPanel idBase={idBase} id={activo}>
          <TablaVolumen
            dim={activo === "especie" ? "especie" : "permiso"}
            filas={activo === "especie" ? v.porEspecie : v.porPermiso}
            fuentes={fuentes}
            activos={activo === "permiso" ? permisos : especies}
            onElegir={activo === "permiso" ? onElegirPermiso : onElegirEspecie}
            total={r.total}
            cargando={v.sinDatosAun}
          />
        </CtpApartadoPanel>
      </section>
    </div>
  );
}

function TablaVolumen({
  dim,
  filas,
  fuentes,
  activos,
  onElegir,
  total,
  cargando,
}: {
  dim: "permiso" | "especie";
  filas: readonly FilaVolumen[];
  fuentes: readonly FuenteVolumen[];
  activos: readonly string[];
  onElegir?: (clave: string) => void;
  /** El del resumen: la fila Total dice lo mismo que la cifra grande (pt sin redondeos sumados). */
  total: { m3: number; pt: number };
  cargando: boolean;
}) {
  const celda = "px-3 py-2";
  const cols = fuentes.length + 4;
  const suma = (f: FuenteVolumen) => filas.reduce((a, x) => a + x.porFuente[f], 0);
  return (
    <TablaCtp>
      <caption className="sr-only">Volumen disponible por {dim}</caption>
      <TheadCtp>
        <tr>
          <th scope="col" className={celda}>{dim === "permiso" ? "Permiso" : "Especie"}</th>
          {fuentes.map((f) => (
            <th key={f} scope="col" className={`${celda} text-right`}>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: COLOR_FUENTE[f] }} />
                {ETIQUETA_FUENTE[f]}
              </span>
              <span className="sr-only"> en m³</span>
            </th>
          ))}
          <th scope="col" className={`${celda} text-right`}>Total m³</th>
          <th scope="col" className={`${celda} text-right`}>≈pt<span className="sr-only"> aprovechables, estimado</span></th>
          <th scope="col" className={`${celda} max-sm:hidden! text-right`}>% del total</th>
        </tr>
      </TheadCtp>
      <TbodyCtp>
        {cargando && filas.length === 0 && <FilaVacia cols={cols}>Leyendo el volumen…</FilaVacia>}
        {!cargando && filas.length === 0 && <FilaVacia cols={cols}>No hay volumen en las pilas elegidas.</FilaVacia>}
        {filas.map((g) => {
          const activa = activos.includes(g.clave) || (g.clave.includes(" · ") && g.clave.split(" · ").some((k) => activos.includes(k)));
          return (
            <tr key={g.clave || "sin"} className={activa ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]"}>
              <td className={celda}>
                {onElegir && g.clave && !g.clave.includes(" · ") ? (
                  <button
                    type="button"
                    onClick={() => onElegir(g.clave)}
                    aria-pressed={activa}
                    aria-label={`Filtrar por ${g.etiqueta}: ${fmtM3(g.m3)} m³`}
                    className={`min-h-8 rounded-lg border-2 px-2 py-1 text-left font-bold text-[var(--text-primary)] transition-colors ${activa ? "border-[var(--accent)]" : "border-transparent hover:border-[var(--accent)]"}`}
                  >
                    {g.etiqueta}
                  </button>
                ) : (
                  <span className={`px-2 font-bold ${g.clave ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{g.etiqueta}</span>
                )}
              </td>
              {fuentes.map((f) => (
                <td key={f} className={`${celda} text-right tabular-nums ${g.porFuente[f] > 0 ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                  {g.porFuente[f] > 0 ? fmtM3(g.porFuente[f]) : "—"}
                </td>
              ))}
              <td className={`${celda} text-right font-bold tabular-nums text-[var(--text-primary)]`}>{fmtM3(g.m3)}</td>
              <td className={`${celda} text-right tabular-nums text-[var(--text-secondary)]`}>{nf(g.pt)}</td>
              <td className={`${celda} max-sm:hidden! text-right tabular-nums text-[var(--text-secondary)]`}>{g.pct}%</td>
            </tr>
          );
        })}
        {filas.length > 1 && (
          <tr className="border-t-2 border-[var(--rule-base)] font-bold">
            <th scope="row" className={`${celda} text-left text-[var(--text-primary)]`}>Total</th>
            {fuentes.map((f) => (
              <td key={f} className={`${celda} text-right tabular-nums text-[var(--text-primary)]`}>{fmtM3(suma(f))}</td>
            ))}
            <td className={`${celda} text-right tabular-nums text-[var(--text-primary)]`}>{fmtM3(total.m3)}</td>
            <td className={`${celda} text-right tabular-nums text-[var(--text-secondary)]`}>{nf(total.pt)}</td>
            <td className={`${celda} max-sm:hidden! text-right tabular-nums text-[var(--text-secondary)]`}>100%</td>
          </tr>
        )}
      </TbodyCtp>
    </TablaCtp>
  );
}
