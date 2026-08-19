"use client";

/**
 * ApartadosPanel — la vista de "Apartados" del cubicador: separar el lote en
 * bloques (10, 14, los que hagan falta) con su propio total, uno por fila de
 * la tabla. Es una capa aparte de la cubicación normal (ver
 * `lib/forestal/cubicacion-apartados.ts`) — este componente sólo pinta lo que
 * esa lib ya calculó.
 */
import { Layers, Undo2, Printer, Volume2 } from "@buleje/design-system/icons";
import type { ApartadoResumen, NombresApartado, TotalPiezas } from "@/lib/forestal/cubicacion-apartados";

/**
 * Un color de texto por apartado — mismo criterio que la barra de composición
 * de Resúmenes (`resumen-vistas.tsx`): rota sobre los 4 tonos semánticos del
 * DS más el acento, así que a partir del 6º apartado el color se repite (no
 * hay más familias sin inventar hex nuevos). Combos copiados TAL CUAL de
 * usos ya verificados en dark en este mismo archivo (línea del aviso "Medida
 * fuera de lo común", los banners de éxito) — nada de tokens sin probar.
 */
const COLOR_APARTADO = [
  "text-[var(--accent)]",
  "text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
  "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  "text-[var(--text-secondary)]",
] as const;

/** Clase de color para el número de apartado — SINGLE SOURCE: la usa esta
 *  tabla y la columna "Apartado" de la tabla principal del cubicador. */
export const colorClaseApartado = (numero: number): string => COLOR_APARTADO[(numero - 1) % COLOR_APARTADO.length];

interface ApartadosPanelProps {
  pendientes: number;
  marcadasCount: number;
  resumen: ApartadoResumen[];
  /** Número que va a tomar el PRÓXIMO apartado — no siempre `resumen.length + 1`
   *  (si se deshizo uno del medio, el siguiente sigue después del más alto). */
  proximoNumero: number;
  /** Total de lo que ENTRARÍA al próximo apartado si se cierra ahora — lo
   *  marcado si hay algo marcado, si no todo lo pendiente. Se ve ANTES de
   *  cerrar, para no tener que cerrar a ciegas y recién ahí enterarse. */
  totalPendiente: TotalPiezas;
  /** Nombres puestos a mano por apartado ("Camión A", "Cliente López"). */
  nombres: NombresApartado;
  onCerrar: () => void;
  onQuitar: (numero: number) => void;
  onRenombrar: (numero: number, nombre: string) => void;
  /** Marca (tilda) las filas de este apartado — así "Anexo 04", "Excel" y el
   *  PDF detallado, que ya respetan lo tildado, salen SÓLO con este bloque. */
  onUsarParaImprimir: (ids: string[]) => void;
  /** Dicta en voz espesor · ancho · largo de estas filas, una por una. */
  onLeerFilas: (ids: string[]) => void;
  fmtPt: (v: number) => string;
  fmtM3: (v: number) => string;
}

export default function ApartadosPanel({
  pendientes, marcadasCount, resumen, proximoNumero, totalPendiente, nombres,
  onCerrar, onQuitar, onRenombrar, onUsarParaImprimir, onLeerFilas, fmtPt, fmtM3,
}: ApartadosPanelProps) {
  const candidatas = marcadasCount > 0 ? marcadasCount : pendientes;
  const totalPt = resumen.reduce((a, r) => a + r.pieTablar, 0);
  const totalM3 = resumen.reduce((a, r) => a + r.m3, 0);
  const totalPiezas = resumen.reduce((a, r) => a + r.piezas, 0);

  return (
    <div className="mb-3 rounded-xl border-2 border-[var(--accent)]/40 bg-primary/10 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-[var(--text-secondary)]">
          <p>
            {marcadasCount > 0
              ? <>Cierra el apartado con las <b className="text-[var(--text-primary)]">{marcadasCount} filas marcadas</b>.</>
              : pendientes > 0
                ? <><b className="text-[var(--text-primary)]">{pendientes}</b> {pendientes === 1 ? "fila" : "filas"} sin apartar todavía.</>
                : "No hay filas sin apartar. Dictá o cargá más piezas para armar el próximo bloque."}
          </p>
          {candidatas > 0 && (
            <p className="mt-0.5 font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">
              Va a llevar: <b className="text-[var(--text-primary)]">{totalPendiente.piezas}</b> piezas ·{" "}
              <b className="text-[var(--text-primary)]">{fmtPt(totalPendiente.pieTablar)}</b> PT ·{" "}
              <b className="text-[var(--text-primary)]">{fmtM3(totalPendiente.m3)}</b> m³
              {totalPendiente.especies.length > 0 ? ` · ${totalPendiente.especies.join(" · ")}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onLeerFilas(totalPendiente.ids)}
            disabled={candidatas === 0}
            title="Dicta en voz espesor · ancho · largo de estas filas, una por una"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-30"
          >
            <Volume2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCerrar}
            disabled={candidatas === 0}
            title={marcadasCount > 0 ? "Cierra el apartado con las filas marcadas" : "Cierra el apartado con todo lo pendiente"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            <Layers className="h-3.5 w-3.5" /> Cerrar apartado {proximoNumero}{candidatas > 0 ? ` (${candidatas})` : ""}
          </button>
        </div>
      </div>

      {resumen.length === 0 ? (
        <p className="py-3 text-center text-sm text-[var(--text-tertiary)]">Todavía no cerraste ningún apartado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--accent)]/20 bg-[var(--surface-raised)]">
          <table className="w-full min-w-[460px] text-sm">
            <thead>
              <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                <th className="px-3 py-2">Apartado</th>
                <th className="px-3 py-2">Especie</th>
                <th className="px-3 py-2 text-right">Piezas</th>
                <th className="px-3 py-2 text-right">Pie tablar</th>
                <th className="px-3 py-2 text-right">m³</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {resumen.map((r) => (
                <tr key={r.numero} className="border-t border-[var(--accent)]/15">
                  <td className="px-3 py-2">
                    <div className={`font-bold ${colorClaseApartado(r.numero)}`}>Apartado {r.numero}</div>
                    <input
                      type="text"
                      value={nombres[r.numero] ?? ""}
                      onChange={(e) => onRenombrar(r.numero, e.target.value)}
                      placeholder="Ponele un nombre…"
                      maxLength={40}
                      aria-label={`Nombre del apartado ${r.numero}`}
                      className="mt-0.5 w-full min-w-[120px] rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold text-[var(--text-secondary)] outline-none placeholder:font-normal placeholder:text-[var(--text-tertiary)] hover:border-[var(--rule-base)] focus:border-[var(--accent)] focus:bg-[var(--surface-base)]"
                    />
                  </td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{r.especies.join(" · ")}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{r.piezas}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtPt(r.pieTablar)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{fmtM3(r.m3)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onLeerFilas(r.ids)}
                        title="Dicta en voz espesor · ancho · largo de este apartado, una pieza por vez"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onUsarParaImprimir(r.ids)}
                        title="Marcar estas filas — Anexo 04, Excel y PDF salen sólo con este apartado"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onQuitar(r.numero)}
                        title="Deshacer este apartado — sus filas vuelven a quedar pendientes"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--accent)]/40 font-bold text-[var(--text-primary)]">
                <td className="px-3 py-2" colSpan={2}>Total · {resumen.length} {resumen.length === 1 ? "apartado" : "apartados"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{totalPiezas}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--accent)]">{fmtPt(totalPt)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{fmtM3(totalM3)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
