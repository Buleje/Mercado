"use client";

/**
 * «Una parte»: cuánto se llevó de cada grupo especie × tipo de la cubicación
 * (Brandon 28-10: «poner una tabla tipo especie y rellenarla a mano»). Una
 * fila por grupo que EXISTE en esa cubicación: lo cubicado, lo que ya salió en
 * otros viajes, lo que se lleva (piezas y m³ a mano) y lo que queda después.
 *
 * Al escribir piezas se sugiere el m³ (del PT a su promedio por pieza); si se
 * escribe el m³, manda ése. Pasarse de lo que queda avisa, no bloquea (puede
 * que la cubicación se haya quedado corta).
 */
import { AlertTriangle } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { m3DesdePt } from "@/lib/forestal/cubicacion";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { tipoCorto } from "@/lib/forestal/cubicacion-tipo";
import type { SaldoGrupo } from "@/lib/forestal/cubicacion-salidas";
import { conM3, conPiezas, FILA_VACIA, lineaDeFila, seExcede, totalDeLineas, type FilaBorrador } from "./cubicador-salidas-logica";

const NUM = "text-right font-mono tabular-nums";
const INPUT =
  "h-11 rounded-xl border bg-[var(--surface-raised)] px-2 text-right font-mono text-base tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const SOLO_ANCHO = "hidden sm:table-cell";

const nombre = (g: Pick<SaldoGrupo, "especie">) => g.especie || "Sin especie";
/** «130 · 2.830»: piezas y el m³ que sale del PT. */
const pzM3 = (piezas: number, pt: number) => `${fmtPiezas(piezas)} · ${fmtM3(m3DesdePt(pt))}`;

export function TablaDeLaParte({ grupos, filas, onFila, idBase }: {
  /** Los grupos con su saldo SIN el viaje que se escribe. */
  grupos: readonly SaldoGrupo[];
  filas: Record<string, FilaBorrador>;
  onFila: (clave: string, fila: FilaBorrador) => void;
  idBase: string;
}) {
  const conLinea = grupos.map((g) => ({ g, l: lineaDeFila(g, filas[g.clave]) }));
  const lleva = totalDeLineas(conLinea.flatMap(({ l }) => (l ? [l] : [])));
  const excedidas = conLinea.filter(({ g, l }) => l && seExcede(g, l)).map(({ g }) => g);
  const suma = (f: (g: SaldoGrupo) => number) => grupos.reduce((a, g) => a + f(g), 0);
  const quedaTotalPt = suma((g) => g.queda.pt);

  return (
    <div className="space-y-2" data-tabla="salida-una-parte">
      <DataTable className="w-full">
        <caption className="sr-only">Cuánto se lleva de cada especie y tipo</caption>
        <thead>
          <tr>
            <th scope="col">Especie · tipo</th>
            <th scope="col" className={`${SOLO_ANCHO} text-right`}>Cubicado</th>
            <th scope="col" className={`${SOLO_ANCHO} text-right`}>Ya salió</th>
            <th scope="col" className="text-right">Piezas</th>
            <th scope="col" className="text-right">m³</th>
            <th scope="col" className={`${SOLO_ANCHO} text-right`}>Queda</th>
          </tr>
        </thead>
        <tbody>
          {conLinea.map(({ g, l }) => {
            const f = filas[g.clave] ?? FILA_VACIA;
            const excede = l ? seExcede(g, l) : false;
            const despuesPz = g.queda.piezas - (l?.piezas ?? 0);
            const despuesPt = g.queda.pt - (l?.pt ?? 0);
            const id = `${idBase}-${g.clave.replace(/[^a-z0-9]+/gi, "-")}`;
            const borde = excede ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]";
            return (
              <tr key={g.clave} data-grupo={g.clave} data-excede={excede || undefined}>
                <th scope="row" className="text-left">
                  <span className="block font-bold text-[var(--text-primary)]">{nombre(g)}</span>
                  <span className="block text-sm text-[var(--text-secondary)]">{tipoCorto(g.tipo)}</span>
                  <span className="block font-mono text-sm tabular-nums text-[var(--text-tertiary)] sm:hidden">queda {pzM3(g.queda.piezas, g.queda.pt)}</span>
                </th>
                <td className={`${SOLO_ANCHO} ${NUM}`}>{pzM3(g.piezas, g.pt)}</td>
                <td className={`${SOLO_ANCHO} ${NUM} text-[var(--text-secondary)]`}>{g.salio.piezas || g.salio.pt ? pzM3(g.salio.piezas, g.salio.pt) : "—"}</td>
                <td className="text-right">
                  <input
                    id={`${id}-pz`}
                    inputMode="numeric"
                    aria-label={`Piezas de ${nombre(g)} ${g.tipo} que se lleva`}
                    className={`${INPUT} ${borde} w-16 sm:w-20`}
                    value={f.piezas}
                    placeholder="0"
                    onChange={(e) => onFila(g.clave, conPiezas(g, f, e.target.value))}
                  />
                </td>
                <td className="text-right">
                  <input
                    id={`${id}-m3`}
                    inputMode="decimal"
                    aria-label={`m³ de ${nombre(g)} ${g.tipo} que se lleva`}
                    className={`${INPUT} ${borde} w-20 sm:w-24`}
                    value={f.m3}
                    placeholder="0.000"
                    title={f.aMano ? "Escrito a mano: las piezas ya no lo cambian. Bórralo para volver al sugerido." : "Sale de las piezas (promedio de esta especie y tipo). Puedes escribir otro."}
                    onChange={(e) => onFila(g.clave, conM3(g, f, e.target.value))}
                  />
                  {f.pt > 0 && (
                    <span className="mt-0.5 block font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                      {fmtPt(f.pt)} PT{f.aMano ? " · a mano" : ""}
                    </span>
                  )}
                </td>
                <td className={`${SOLO_ANCHO} ${NUM} ${excede ? "font-bold text-[var(--data-error-ink)]" : ""}`}>
                  {excede ? `se pasa ${pzM3(Math.max(0, -despuesPz), Math.max(0, -despuesPt))}` : pzM3(Math.max(0, despuesPz), Math.max(0, despuesPt))}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr data-fila="total-salida">
            <th scope="row" className="text-left font-bold">Total</th>
            <td className={`${SOLO_ANCHO} ${NUM}`}>{pzM3(suma((g) => g.piezas), suma((g) => g.pt))}</td>
            <td className={`${SOLO_ANCHO} ${NUM}`}>{suma((g) => g.salio.piezas) || suma((g) => g.salio.pt) ? pzM3(suma((g) => g.salio.piezas), suma((g) => g.salio.pt)) : "—"}</td>
            <td className={`${NUM} font-bold`} data-total="piezas">{fmtPiezas(lleva.piezas)}</td>
            <td className={`${NUM} font-bold`} data-total="m3">
              {fmtM3(lleva.m3)}
              <span className="block text-xs font-normal text-[var(--text-tertiary)]">{fmtPt(lleva.pt)} PT</span>
            </td>
            <td className={`${SOLO_ANCHO} ${NUM}`}>{pzM3(Math.max(0, suma((g) => g.queda.piezas) - lleva.piezas), Math.max(0, quedaTotalPt - lleva.pt))}</td>
          </tr>
        </tfoot>
      </DataTable>
      {excedidas.length > 0 && (
        <p role="status" className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-ink)]" data-aviso="salida-se-pasa">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {excedidas.map((g) => `${nombre(g)} ${tipoCorto(g.tipo)}`).join(", ")}: se lleva más de lo que queda. Se guarda igual; revisa las piezas o el m³.
        </p>
      )}
    </div>
  );
}
