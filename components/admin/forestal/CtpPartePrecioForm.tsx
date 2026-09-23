"use client";

/**
 * El formulario de UN precio de cliente (ADR-430): Global o Por grupos, con
 * excepciones opcionales por especie y por tipo, y desde cuándo rige.
 *
 * Controlado: el borrador vive en `CtpPartePrecios`, que decide cuándo se
 * guarda. Acá sólo se escribe.
 */

import { useId } from "react";
import { Layers, Plus } from "@buleje/design-system/icons";
import { ORDEN_TIPO, type TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import type { BorradorPrecio, ModoPrecio } from "@/lib/forestal/precio-cliente-borrador";
import type { GrupoEspecies } from "@/lib/forestal/precio-cliente";
import { Btn, I } from "./ctp-shared";
import type { EspecieDelCatalogo } from "./CtpEspeciesGrupos";
import { CampoPrecio, QuitarFila, Rotulado } from "./ctp-precio-campos";

const CHIP_ON =
  "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";
const CHIP_OFF =
  "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]";

const MODOS: { id: ModoPrecio; titulo: string; ayuda: string }[] = [
  { id: "global", titulo: "Global", ayuda: "Toda especie al mismo precio" },
  { id: "grupos", titulo: "Por grupos", ayuda: "Cada grupo con su precio; lo demás al general" },
];

export default function CtpPartePrecioForm({
  borrador: b,
  onCambio,
  grupos,
  especies,
  onEditarGrupos,
  notaFecha,
}: {
  borrador: BorradorPrecio;
  onCambio: (b: BorradorPrecio) => void;
  grupos: GrupoEspecies[];
  /** El catálogo de especies de la planta. */
  especies: EspecieDelCatalogo[];
  onEditarGrupos: () => void;
  /** Qué pasa al guardar con esa fecha (nueva versión o corrección del mismo día). */
  notaFecha?: string;
}) {
  const set = (v: Partial<BorradorPrecio>) => onCambio({ ...b, ...v });
  const idDesde = useId();
  const idNota = useId();
  const tiposLibres = ORDEN_TIPO.filter((t) => !b.tipos.some((x) => x.tipo === t));
  const nombreDe = (clave: string) => especies.find((e) => e.clave === clave)?.nombre ?? clave;
  const nombres = especies.map((e) => e.nombre);
  const hayExcepciones = b.especies.length > 0 || b.tipos.length > 0;

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Cómo se le pone precio" className="grid gap-2 sm:grid-cols-2">
        {MODOS.map((m) => {
          const on = b.modo === m.id;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => set({ modo: m.id })}
              className={`flex min-h-12 flex-col items-start justify-center rounded-xl border-2 px-3.5 py-2 text-left transition-colors ${on ? CHIP_ON : CHIP_OFF}`}
            >
              <span className="text-sm font-bold">{m.titulo}</span>
              <span className="text-xs text-[var(--text-secondary)]">{m.ayuda}</span>
            </button>
          );
        })}
      </div>

      {b.modo === "global" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoPrecio
            etiqueta="Precio por pie, toda especie"
            valor={b.basePt}
            onCambio={(v) => set({ basePt: v })}
            ayuda="Reemplaza a la tarifa de la planta, sin sus recargos por tipo o largo."
          />
        </div>
      ) : (
        <div className="space-y-2">
          {grupos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-3 text-sm text-[var(--text-secondary)]">
              La planta todavía no tiene grupos de especies. Ármalos una vez y sirven para todos los
              clientes.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {grupos.map((g) => (
                <CampoPrecio
                  key={g.id}
                  etiqueta={g.nombre}
                  valor={b.grupos[g.id] ?? ""}
                  onCambio={(v) => set({ grupos: { ...b.grupos, [g.id]: v } })}
                  ayuda={
                    g.claves.length ? g.claves.map(nombreDe).join(", ") : "Sin especies todavía"
                  }
                />
              ))}
              <CampoPrecio
                etiqueta="Lo demás (general)"
                valor={b.basePt}
                onCambio={(v) => set({ basePt: v })}
                ayuda="Las especies que no están en un grupo con precio. Vacío = tarifa de la planta."
              />
            </div>
          )}
        </div>
      )}
      <Btn variant="ghost" onClick={onEditarGrupos}>
        <Layers className="h-4 w-4" aria-hidden />
        {grupos.length ? "Editar los grupos de especies" : "Armar grupos de especies"}
      </Btn>

      <details
        open={hayExcepciones || undefined}
        className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2"
      >
        <summary className="cursor-pointer text-sm font-bold text-[var(--text-primary)]">
          Precio por especie o por tipo{" "}
          <span className="font-normal text-[var(--text-tertiary)]">(opcional)</span>
        </summary>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Gana la especie, después su grupo; el precio por tipo sólo cuenta si la especie no tiene
          precio propio.
        </p>
        <div className="mt-2 space-y-2">
          {b.especies.map((e, i) => (
            <div key={`e${i}`} className="flex items-end gap-2">
              <Rotulado etiqueta="Especie">
                {(id) => (
                  <select
                    id={id}
                    className={I}
                    value={e.nombre}
                    onChange={(ev) =>
                      set({
                        especies: b.especies.map((x, j) =>
                          j === i ? { ...x, nombre: ev.target.value } : x,
                        ),
                      })
                    }
                  >
                    <option value="">Elige…</option>
                    {[...new Set([e.nombre, ...nombres].filter(Boolean))].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
              </Rotulado>
              <div className="w-32 shrink-0">
                <CampoPrecio
                  etiqueta="Por pie"
                  nombre={`Precio por pie de ${e.nombre || "la especie"}`}
                  valor={e.precio}
                  onCambio={(v) =>
                    set({ especies: b.especies.map((x, j) => (j === i ? { ...x, precio: v } : x)) })
                  }
                />
              </div>
              <QuitarFila
                etiqueta={`Quitar el precio de ${e.nombre || "esta especie"}`}
                onQuitar={() => set({ especies: b.especies.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
          {b.tipos.map((t, i) => (
            <div key={`t${i}`} className="flex items-end gap-2">
              <Rotulado etiqueta="Tipo">
                {(id) => (
                  <select
                    id={id}
                    className={I}
                    value={t.tipo}
                    onChange={(ev) =>
                      set({
                        tipos: b.tipos.map((x, j) =>
                          j === i ? { ...x, tipo: ev.target.value as TipoComercial } : x,
                        ),
                      })
                    }
                  >
                    {[t.tipo, ...tiposLibres].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
              </Rotulado>
              <div className="w-32 shrink-0">
                <CampoPrecio
                  etiqueta="Por pie"
                  nombre={`Precio por pie del tipo ${t.tipo}`}
                  valor={t.precio}
                  onCambio={(v) =>
                    set({ tipos: b.tipos.map((x, j) => (j === i ? { ...x, precio: v } : x)) })
                  }
                />
              </div>
              <QuitarFila
                etiqueta={`Quitar el precio de ${t.tipo}`}
                onQuitar={() => set({ tipos: b.tipos.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => set({ especies: [...b.especies, { nombre: "", precio: "" }] })}>
              <Plus className="h-4 w-4" aria-hidden /> Por especie
            </Btn>
            {tiposLibres.length > 0 && (
              <Btn
                onClick={() => set({ tipos: [...b.tipos, { tipo: tiposLibres[0]!, precio: "" }] })}
              >
                <Plus className="h-4 w-4" aria-hidden /> Por tipo
              </Btn>
            )}
          </div>
        </div>
      </details>

      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div>
          <label
            htmlFor={idDesde}
            className="mb-1 block text-sm font-medium text-[var(--text-primary)]"
          >
            Rige desde
          </label>
          <input
            id={idDesde}
            type="date"
            className={I}
            value={b.vigenteDesde}
            aria-describedby={notaFecha ? `${idDesde}-nota` : undefined}
            onChange={(e) => set({ vigenteDesde: e.target.value })}
          />
          {notaFecha && (
            <span
              id={`${idDesde}-nota`}
              className="mt-1 block text-xs leading-snug text-[var(--text-tertiary)]"
            >
              {notaFecha}
            </span>
          )}
        </div>
        <div>
          <label
            htmlFor={idNota}
            className="mb-1 block text-sm font-medium text-[var(--text-primary)]"
          >
            Nota
          </label>
          <input
            id={idNota}
            type="text"
            className={I}
            maxLength={300}
            placeholder="Pactado por WhatsApp el lunes…"
            value={b.nota}
            onChange={(e) => set({ nota: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
