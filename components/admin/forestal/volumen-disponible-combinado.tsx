"use client";

/**
 * La vista SUMADA de «Volumen disponible» (dos o más pilas elegidas): cómo se
 * reparte por permiso y por especie, una columna por pila.
 *
 * El total y cada pila (con su «Ver →») viven en la fila de tarjetas de arriba
 * (`SelectorDePilas`), que es filtro y resumen a la vez: acá no se repiten
 * (Brandon 17-10). Los filtros de permiso y especie van en la fila de esta
 * tabla, que es lo que filtran.
 */

import { useId, type ReactNode } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import {
  ETIQUETA_FUENTE,
  sonTodas,
  type FilaVolumen,
  type FuenteVolumen,
  type UnidadVolumen,
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
  unidad,
  permisos,
  especies,
  filtros,
  onElegirPermiso,
  onElegirEspecie,
}: {
  v: EstadoVolumenDisponible;
  fuentes: readonly FuenteVolumen[];
  unidad: UnidadVolumen;
  permisos: readonly string[];
  especies: readonly string[];
  /** Permiso y especie: a la derecha de «Por permiso | Por especie». */
  filtros?: ReactNode;
  onElegirPermiso: (clave: string) => void;
  onElegirEspecie: (clave: string) => void;
}) {
  const idBase = useId();
  const { activo, ir } = useApartado("volumen-disponible", PESTANAS);
  const r = v.resumen;
  const enPt = unidad === "pt";
  /* Grupos CON nombre (lección de Trozas: «5 permisos» sobre un pie de 4); si
     sólo queda lo que no lo declara, se dice así y no «1 permiso». */
  const apartados: Apartado[] = PESTANAS.map((p) => {
    const filas = p.id === "permiso" ? v.porPermiso : v.porEspecie;
    const n = filas.filter((g) => g.clave !== "").length;
    if (v.sinDatosAun) return { ...p, contador: "…" };
    if (n === 0 && filas.length > 0) return { ...p, contador: `sin ${p.id}` };
    return { ...p, contador: n, unidad: p.id === "permiso" ? (n === 1 ? "permiso" : "permisos") : n === 1 ? "especie" : "especies" };
  });
  /* Con dos o tres pilas elegidas, su suma (la que antes era «Total para
     trabajar»): «Todo», arriba, es la de las cuatro. */
  const suma = sonTodas(fuentes) || v.sinDatosAun
    ? null
    : `${fuentes.map((f) => ETIQUETA_FUENTE[f]).join(" + ")}: ${enPt ? `${nf(r.total.pt)} pt = ${fmtM3(r.total.m3)} m³` : `${fmtM3(r.total.m3)} m³ ≈ ${nf(r.total.pt)} pt`}`;

  return (
    <section aria-label="Reparto" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <CtpApartados apartados={apartados} activo={activo} onIr={ir} idBase={idBase} etiqueta="Reparto del volumen" />
          <InfoTip
            title={activo === "permiso" ? "Por permiso" : "Por especie"}
            what="Una columna por pila elegida y su total. Cada m³ está en una sola pila: nada se cuenta dos veces."
            affects={`${activo === "permiso" ? "Clic en un permiso: toda la pestaña muestra solo lo suyo." : "Clic en una especie: toda la pestaña muestra solo esa."} Los pt aprovechables son un estimado: la troza al 56 %, lo aserrado a m³ × 424.`}
            example="Elige solo Trozas y Lotes arriba para ver la madera en troza: Trozas 13.5 + Lotes 8.6 = 22.1 m³."
          />
          {suma && <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">{suma}</span>}
        </div>
        {filtros && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto">{filtros}</div>}
      </div>
      <CtpApartadoPanel idBase={idBase} id={activo}>
        <TablaVolumen
          dim={activo === "especie" ? "especie" : "permiso"}
          filas={activo === "especie" ? v.porEspecie : v.porPermiso}
          fuentes={fuentes}
          activos={activo === "permiso" ? permisos : especies}
          onElegir={activo === "permiso" ? onElegirPermiso : onElegirEspecie}
          unidad={unidad}
          total={r.total}
          cargando={v.sinDatosAun}
        />
      </CtpApartadoPanel>
    </section>
  );
}

function TablaVolumen({
  dim,
  filas,
  fuentes,
  activos,
  onElegir,
  unidad,
  total,
  cargando,
}: {
  dim: "permiso" | "especie";
  filas: readonly FilaVolumen[];
  fuentes: readonly FuenteVolumen[];
  activos: readonly string[];
  onElegir?: (clave: string) => void;
  unidad: UnidadVolumen;
  /** El del resumen: la fila Total dice lo mismo que la cifra grande (pt sin redondeos sumados). */
  total: { m3: number; pt: number };
  cargando: boolean;
}) {
  const celda = "";
  const cols = fuentes.length + 4;
  const enPt = unidad === "pt";
  const celdaDe = (g: FilaVolumen, f: FuenteVolumen) => (enPt ? g.ptPorFuente[f] : g.porFuente[f]);
  const fmt = (n: number) => (enPt ? nf(n) : fmtM3(n));
  const suma = (f: FuenteVolumen) => filas.reduce((a, x) => a + celdaDe(x, f), 0);
  const pctDe = (g: FilaVolumen) => (enPt ? (total.pt > 0 ? Math.round((g.pt / total.pt) * 1000) / 10 : 0) : g.pct);
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
              <span className="sr-only"> en {enPt ? "pt" : "m³"}</span>
            </th>
          ))}
          <th scope="col" className={`${celda} text-right`}>{enPt ? "Total pt" : "Total m³"}</th>
          <th scope="col" className={`${celda} text-right`}>
            {enPt ? "m³" : <>≈pt<span className="sr-only"> aprovechables, estimado</span></>}
          </th>
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
                  {g.porFuente[f] > 0 ? fmt(celdaDe(g, f)) : "—"}
                </td>
              ))}
              <td className={`${celda} text-right font-bold tabular-nums`}>{enPt ? nf(g.pt) : fmtM3(g.m3)}</td>
              <td className={`${celda} text-right tabular-nums text-[var(--text-secondary)]`}>{enPt ? fmtM3(g.m3) : nf(g.pt)}</td>
              <td className={`${celda} max-sm:hidden! text-right tabular-nums text-[var(--text-secondary)]`}>{pctDe(g)}%</td>
            </tr>
          );
        })}
        {filas.length > 1 && (
          <tr className="border-t-2 border-[var(--rule-base)] font-bold">
            <th scope="row" className={`${celda} text-left`}>Total</th>
            {fuentes.map((f) => (
              <td key={f} className={`${celda} text-right tabular-nums`}>{fmt(suma(f))}</td>
            ))}
            {/* En pt, el pie suma las filas que se ven (cada una ya redondeada). */}
            <td className={`${celda} text-right tabular-nums`}>{enPt ? nf(filas.reduce((a, g) => a + g.pt, 0)) : fmtM3(total.m3)}</td>
            <td className={`${celda} text-right tabular-nums text-[var(--text-secondary)]`}>{enPt ? fmtM3(total.m3) : nf(filas.reduce((a, g) => a + g.pt, 0))}</td>
            <td className={`${celda} max-sm:hidden! text-right tabular-nums text-[var(--text-secondary)]`}>100%</td>
          </tr>
        )}
      </TbodyCtp>
    </TablaCtp>
  );
}
