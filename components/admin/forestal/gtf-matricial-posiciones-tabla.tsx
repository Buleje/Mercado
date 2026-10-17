"use client";

/**
 * La tabla de «Posición de cada campo»: un renglón por campo de la hoja con
 * su N° y nombre como en el papel, lo que imprime (recortado; «no entra» si
 * no cabe en su ancho), X desde el borde izquierdo, Y desde el de arriba,
 * ancho, letra y si se imprime. Cada cifra se tipea con coma o punto, se
 * mueve con las flechas (0,5 mm; con Shift, 5 mm) y se ve al instante en la
 * hoja de atrás. Las flechas sostenidas sobre una misma cifra son UN paso de
 * deshacer (misma clave en `editar`). Al entrar a un renglón, ese campo queda
 * elegido en la hoja.
 */

import { DataTable } from "@buleje/design-system";
import { TriangleAlert } from "@buleje/design-system/icons";
import { ANCHO_MAX_MM, ANCHO_MIN_MM, LETRA_MAX_PT, LETRA_MIN_PT } from "@/lib/forestal/gtf-matricial-disposicion";
import { fijarEnHoja, type CambioPos } from "@/lib/forestal/gtf-matricial-posiciones";
import { NumeroMm } from "./gtf-matricial-controles";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import type { SeleccionTalonario } from "./hooks/use-gtf-matricial-seleccion";

/** Lo que muestra un renglón (campo o columna de la tabla). `y`/`letraPt` null = no tiene propia. */
export interface RenglonPosicion {
  tipo: "campo" | "columna";
  id: string;
  clave: string;
  nombre: string;
  valor: string;
  x: number;
  y: number | null;
  anchoMm: number;
  letraPt: number | null;
  visible: boolean;
}

/** La primera columna queda quieta al deslizar la tabla de lado (a 400 px no entran las cifras). */
const FIJA = "sticky left-0 z-[1] bg-[var(--surface-raised)]";

/** Lo que imprime, recortado; con el aviso si no entra en su ancho. */
export function ValorImpreso({ valor, noEntra, className = "" }: { valor: string; noEntra: boolean; className?: string }) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${className}`}>
      {noEntra && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--data-warning-100)] px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> no entra
        </span>
      )}
      <span className="min-w-0 truncate font-mono text-[var(--text-secondary)]" title={valor || undefined}>
        {valor || "—"}
      </span>
    </span>
  );
}

export default function TablaPosiciones({
  t,
  s,
  renglones,
  noEntran,
  titulo,
}: {
  t: EstadoGtfMatricial;
  s: SeleccionTalonario;
  renglones: RenglonPosicion[];
  noEntran: ReadonlySet<string>;
  /** Para el lector de pantalla: qué lista es. */
  titulo: string;
}) {
  const conY = renglones.some((r) => r.y != null);
  const conLetra = renglones.some((r) => r.letraPt != null);
  /* Una clave por cifra: las flechas sostenidas en la X de (2) juntan un paso; pasar a su Y abre otro. */
  const cambiar = (r: RenglonPosicion, que: keyof CambioPos, c: CambioPos) =>
    t.editar((h) => fijarEnHoja(h, r.tipo, r.id, c), `posiciones:${r.clave}:${que}`);

  return (
    <DataTable
      stickyHeader
      aria-label={titulo}
      className="[&_tbody_td]:py-1 [&_tbody_th]:py-1"
      wrapperClassName="max-h-[min(55vh,36rem)] overflow-y-auto overscroll-contain bg-[var(--surface-raised)]"
    >
      <thead>
        <tr>
          <th scope="col" className="sticky left-0">Campo</th>
          <th scope="col" className="max-md:hidden">Valor que imprime</th>
          <th scope="col" title="Desde el borde izquierdo de la hoja">X (mm)</th>
          {conY && <th scope="col" title="Desde el borde de arriba de la hoja">Y (mm)</th>}
          <th scope="col">Ancho (mm)</th>
          {conLetra && <th scope="col">Letra (pt)</th>}
          <th scope="col" className="text-center">Imprimir</th>
        </tr>
      </thead>
      <tbody>
        {renglones.map((r) => {
          const no = noEntran.has(r.clave);
          const elegido = s.elegidos.includes(r.clave);
          const elegir = () => {
            if (!elegido) s.elegir(r.clave);
          };
          return (
            <tr key={r.clave} data-clave={r.clave}>
              <th
                scope="row"
                className={`${FIJA} max-w-[11rem] text-left align-middle font-semibold sm:max-w-[18rem] ${r.visible ? "" : "text-[var(--text-tertiary)]"} ${
                  elegido ? "shadow-[inset_3px_0_0_var(--accent)]" : ""
                }`}
              >
                <span className="block">{r.nombre}</span>
                <ValorImpreso valor={r.valor} noEntra={no} className="mt-0.5 text-sm font-normal md:hidden" />
              </th>
              <td className="max-w-[16rem] max-md:hidden">
                <ValorImpreso valor={r.valor} noEntra={no} />
              </td>
              <td>
                <NumeroMm compacto vivo label={`X de ${r.nombre}`} value={r.x} onChange={(v) => cambiar(r, "x", { x: v })} onFocus={elegir} qa={`pos-x-${r.clave}`} />
              </td>
              {conY && (
                <td>
                  {r.y != null && (
                    <NumeroMm compacto vivo label={`Y de ${r.nombre}`} value={r.y} onChange={(v) => cambiar(r, "y", { y: v })} onFocus={elegir} qa={`pos-y-${r.clave}`} />
                  )}
                </td>
              )}
              <td>
                <NumeroMm
                  compacto
                  vivo
                  label={`Ancho de ${r.nombre}`}
                  value={r.anchoMm}
                  min={ANCHO_MIN_MM}
                  max={ANCHO_MAX_MM}
                  onChange={(v) => cambiar(r, "anchoMm", { anchoMm: v })}
                  onFocus={elegir}
                  qa={`pos-ancho-${r.clave}`}
                />
              </td>
              {conLetra && (
                <td>
                  {r.letraPt != null && (
                    <NumeroMm
                      compacto
                      vivo
                      label={`Letra de ${r.nombre}`}
                      sufijo="pt"
                      value={r.letraPt}
                      min={LETRA_MIN_PT}
                      max={LETRA_MAX_PT}
                      onChange={(v) => cambiar(r, "letraPt", { letraPt: v })}
                      onFocus={elegir}
                    />
                  )}
                </td>
              )}
              <td className="text-center">
                <label className="inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    aria-label={`Imprimir ${r.nombre}`}
                    checked={r.visible}
                    onFocus={elegir}
                    onChange={(e) => cambiar(r, "visible", { visible: e.target.checked })}
                    className="h-5 w-5 accent-[var(--accent-dark)]"
                  />
                </label>
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
