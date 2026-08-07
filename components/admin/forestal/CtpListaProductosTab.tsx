"use client";

/**
 * Pestaña 2 · «Creación de Lista de Productos».
 *
 * La guía ampara un viaje; lo que viaja es una LISTA: tantos renglones como
 * productos suban al camión, con su especie, su código de paquete, sus piezas y
 * su volumen. Abajo, el total movilizado y el cuadro resumen por especie —los
 * dos números que un puesto de control compara contra la carga.
 *
 * Los renglones no se tipean: salen de «Producción» (el stock real de la
 * planta), porque cada uno tiene que poder decir de qué corrida salió. Esa es la
 * atribución que después sostiene el certificado de trazabilidad (I4/I5).
 */

import { Boxes, Info, Trash2, TreePine } from "@buleje/design-system/icons";
import {
  piezasTotales,
  resumenPorProducto,
  volumenTotal,
  type FilaDespacho,
} from "@/lib/forestal/despacho-lista";
import { Btn, Field, I, productLabel } from "./ctp-shared";
import { Bloque } from "./ctp-guia-bloques";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

const CELDA_NUM =
  "h-9 w-24 rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const MEDIDA: Record<string, string> = { m3: "Metros cúbicos", pt: "Pies tablares", kg: "Kilogramos", unidad: "Unidades" };

export default function CtpListaProductosTab({
  filas,
  onCambiarFila,
  onQuitar,
  listaNro,
  onListaNro,
  observaciones,
  onObservaciones,
  onAbrirStock,
  onAbrirTrozas,
  problemas,
}: {
  filas: FilaDespacho[];
  onCambiarFila: (uid: string, campo: "cantidad" | "volumen", valor: number) => void;
  onQuitar: (uid: string) => void;
  /** Casillero (35): N° de la lista de trozas/productos que acompaña la guía. */
  listaNro: string;
  onListaNro: (v: string) => void;
  observaciones: string;
  onObservaciones: (v: string) => void;
  onAbrirStock: () => void;
  /** El otro origen: las trozas que salen sin aserrar (ADR-363). */
  onAbrirTrozas: () => void;
  problemas: string[];
}) {
  const total = volumenTotal(filas);
  const piezas = piezasTotales(filas);
  const resumen = resumenPorProducto(filas);
  const unidad = filas[0]?.unidad ?? "m3";

  return (
    <div className="space-y-3">
      <Bloque titulo="Lista de trozas / productos" hint="Lo que sube al camión, renglón por renglón">
        <Field span={4} label="N° lista de trozas / producto" casillero={35}>
          <input type="text" className={`${I} font-mono`} value={listaNro} onChange={(e) => onListaNro(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-8">
          <Btn variant="primary" onClick={onAbrirStock}>
            <Boxes className="h-4 w-4" /> Producción
          </Btn>
          {/* El otro origen (ADR-363): la madera que sale como entró. Su saldo
              vive en el patio, no en producción, y su cadena termina en el
              ingreso — más corta, igual de completa. */}
          <Btn variant="secondary" onClick={onAbrirTrozas}>
            <TreePine className="h-4 w-4" /> Trozas / productos ingresados
          </Btn>
          <p className="flex items-start gap-1.5 text-xs text-[var(--text-tertiary)]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Cada renglón guarda de dónde salió —la corrida o la guía de ingreso—: eso es lo que después permite emitir el certificado.
          </p>
        </div>
      </Bloque>

      <TablaCtp altoMax="max-h-[46vh]">
        <TheadCtp>
          <tr>
            <th className="px-3 py-2 font-bold">Item</th>
            <th className="px-3 py-2 font-bold">Nombre de especie</th>
            <th className="px-3 py-2 font-bold">Producto</th>
            <th className="px-3 py-2 font-bold">Código</th>
            <th className="px-3 py-2 text-right font-bold">Cantidad</th>
            <th className="px-3 py-2 font-bold">Presentación</th>
            <th className="px-3 py-2 text-right font-bold">Espesor</th>
            <th className="px-3 py-2 text-right font-bold">Ancho</th>
            <th className="px-3 py-2 text-right font-bold">Largo</th>
            <th className="px-3 py-2 text-right font-bold">Volumen</th>
            <th className="px-3 py-2 font-bold">U. medida</th>
            <th className="px-3 py-2 text-right font-bold">Eliminar</th>
          </tr>
        </TheadCtp>
        <TbodyCtp>
          {filas.length === 0 && (
            <FilaVacia cols={12}>
              La guía todavía no tiene productos. Abrí <b>Producción</b> y elegí lo que sale de la planta.
            </FilaVacia>
          )}
          {filas.map((f, i) => (
            <tr key={f.uid} className="hover:bg-[var(--surface-sunken)]">
              <td className="px-3 py-2 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{i + 1}</td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">
                {f.especie ?? "—"}
                {f.especieCientifica && <div className="text-xs italic text-[var(--text-tertiary)]">{f.especieCientifica}</div>}
              </td>
              <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                {productLabel(f.producto ?? "")}
                {/* De dónde salió: la corrida (producto transformado) o la guía
                    con la que entró (troza que sale sin aserrar, ADR-363). */}
                <div className="font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  {f.trozaId
                    ? `troza · GTF ${f.gtfOrigen[0] ?? "—"}`
                    : `corrida #${f.lineNo ?? "—"}${f.lote ? ` · lote ${f.lote}` : ""}`}
                </div>
              </td>
              <td className="px-3 py-2 font-mono text-sm font-bold text-[var(--text-primary)]">{f.codigo ?? "—"}</td>
              <td className="px-3 py-2 text-right">
                {/* Una troza es UNA pieza: su cantidad no se tipea. */}
                <input
                  type="number" min="0" step="1" value={f.cantidad}
                  disabled={Boolean(f.trozaId)}
                  onChange={(e) => onCambiarFila(f.uid, "cantidad", Number(e.target.value))}
                  aria-label={`Cantidad del ítem ${i + 1}`}
                  className={`${CELDA_NUM} disabled:cursor-not-allowed disabled:opacity-60`}
                />
              </td>
              <td className="px-3 py-2 text-xs text-[var(--text-tertiary)]">{f.presentacion ?? "—"}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{f.espesorCm ?? "—"}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{f.anchoCm ?? "—"}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{f.largoM ?? "—"}</td>
              <td className="px-3 py-2 text-right">
                <input
                  type="number" min="0" step="0.0001" value={f.volumen}
                  onChange={(e) => onCambiarFila(f.uid, "volumen", Number(e.target.value))}
                  aria-label={`Volumen del ítem ${i + 1}`}
                  className={CELDA_NUM}
                />
                <div className="mt-0.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  {f.trozaId ? "mide" : "saldo"} {f.disponibleCorrida.toFixed(4)}
                </div>
              </td>
              <td className="px-3 py-2 text-xs text-[var(--text-tertiary)]">{MEDIDA[f.unidad] ?? f.unidad}</td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onQuitar(f.uid)}
                  aria-label={`Quitar el ítem ${i + 1} de la lista`}
                  className="rounded-lg p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
          {filas.length > 0 && (
            <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
              <td colSpan={4} className="px-3 py-2.5 text-[var(--text-primary)]">Total volumen movilizado</td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{piezas.toLocaleString("es-PE")}</td>
              <td colSpan={4} />
              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{total.toFixed(4)}</td>
              <td className="px-3 py-2.5 text-xs font-normal text-[var(--text-tertiary)]">{MEDIDA[unidad] ?? unidad}</td>
              <td />
            </tr>
          )}
        </TbodyCtp>
      </TablaCtp>

      {problemas.length > 0 && (
        <ul className="space-y-1 rounded-2xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3 dark:bg-[var(--data-warning-500)]/10">
          {problemas.map((p) => (
            <li key={p} className="text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{p}</li>
          ))}
        </ul>
      )}

      {/* El cuadro de abajo del formato: qué se lleva, por especie y producto. */}
      {resumen.length > 0 && (
        <TablaCtp>
          <TheadCtp>
            <tr>
              <th className="px-3 py-2 font-bold">Especie</th>
              <th className="px-3 py-2 font-bold">Producto</th>
              <th className="px-3 py-2 text-right font-bold">Cantidad</th>
              <th className="px-3 py-2 text-right font-bold">Volumen</th>
            </tr>
          </TheadCtp>
          <TbodyCtp>
            {resumen.map((r) => (
              <tr key={`${r.especie}|${r.producto}`}>
                <td className="px-3 py-2 text-[var(--text-secondary)]">{r.especie}</td>
                <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{productLabel(r.producto)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{r.cantidad.toLocaleString("es-PE")}</td>
                <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{r.volumen.toFixed(4)}</td>
              </tr>
            ))}
          </TbodyCtp>
        </TablaCtp>
      )}

      <Bloque titulo="Observaciones">
        <Field span={12} label="Notas de la guía" casillero={12}>
          <textarea
            value={observaciones}
            onChange={(e) => onObservaciones(e.target.value)}
            rows={3}
            placeholder="Lo que haga falta aclarar sobre esta salida…"
            className={`${I} h-auto resize-none py-2.5`}
          />
        </Field>
      </Bloque>
    </div>
  );
}
