"use client";

/**
 * AccionesEditor — los pasos de un objetivo dentro de su ventana (ADR-497):
 * qué, para cuándo y quién; se tildan al hacerse. Se agrega escribiendo y
 * presionando Enter. A 400 px el texto va arriba y fecha, responsable y
 * papelera debajo.
 */
import { useId, useState } from "react";
import { Plus, Trash2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { nuevoId } from "@/hooks/use-plan-empresa";
import { cn } from "@/lib/utils";
import { CAMPO_ALTO } from "../piezas/clases";
import type { Accion } from "./objetivos-config";

const MAX_ACCIONES = 60;

interface Props {
  acciones: readonly Accion[];
  onCambiar: (acciones: Accion[]) => void;
  /** Id del `<datalist>` con los nombres del equipo. */
  listaNombres: string;
}

export function AccionesEditor({ acciones, onCambiar, listaNombres }: Props) {
  const idNueva = useId();
  const [nueva, setNueva] = useState("");
  const lleno = acciones.length >= MAX_ACCIONES;

  const editar = (id: string, cambio: Partial<Omit<Accion, "id">>) => onCambiar(acciones.map((a) => (a.id === id ? { ...a, ...cambio } : a)));
  const agregar = () => {
    const texto = nueva.trim();
    if (!texto || lleno) return;
    onCambiar([...acciones, { id: nuevoId(), texto, hecha: false, fecha: "", responsable: "", tareaId: "" }]);
    setNueva("");
  };

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-xs font-semibold text-[var(--text-secondary)]">
        Acciones <span className="font-normal text-[var(--text-tertiary)]">({acciones.filter((a) => a.hecha).length} de {acciones.length} hechas)</span>
      </legend>
      {acciones.length > 0 && (
        <ul className="space-y-2">
          {acciones.map((a, i) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-soft)] p-2">
              <input
                type="checkbox"
                className="size-5 shrink-0 accent-[var(--accent)]"
                checked={a.hecha}
                aria-label={`Hecha: ${a.texto || `acción ${i + 1}`}`}
                onChange={(e) => editar(a.id, { hecha: e.target.checked })}
              />
              <input
                type="text"
                value={a.texto}
                maxLength={600}
                aria-label={`Acción ${i + 1}`}
                className={cn(CAMPO_ALTO, "flex-1 basis-48", a.hecha && "text-[var(--text-tertiary)] line-through")}
                onChange={(e) => editar(a.id, { texto: e.target.value })}
              />
              <div className="flex w-full gap-2 sm:w-auto">
                <input
                  type="date"
                  value={a.fecha}
                  aria-label={`Para cuándo: acción ${i + 1}`}
                  className={cn(CAMPO_ALTO, "flex-1 sm:w-40 sm:flex-none")}
                  onChange={(e) => editar(a.id, { fecha: e.target.value })}
                />
                <input
                  type="text"
                  value={a.responsable}
                  maxLength={160}
                  list={listaNombres}
                  placeholder="Quién"
                  aria-label={`Responsable: acción ${i + 1}`}
                  className={cn(CAMPO_ALTO, "flex-1 sm:w-36 sm:flex-none")}
                  onChange={(e) => editar(a.id, { responsable: e.target.value })}
                />
                <button
                  type="button"
                  className={button({ variant: "ghost", size: "icon" })}
                  aria-label={`Borrar acción ${i + 1}`}
                  title="Borrar"
                  onClick={() => onCambiar(acciones.filter((x) => x.id !== a.id))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <label htmlFor={idNueva} className="sr-only">
          Nueva acción
        </label>
        <input
          id={idNueva}
          type="text"
          value={nueva}
          maxLength={600}
          enterKeyHint="done"
          disabled={lleno}
          placeholder={lleno ? `Llegaste a ${MAX_ACCIONES} acciones` : "Un paso concreto y Enter"}
          className={cn(CAMPO_ALTO, "flex-1")}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              agregar();
            }
          }}
        />
        <button type="button" className={button({ variant: "secondary", size: "icon" })} aria-label="Agregar acción" title="Agregar acción" disabled={!nueva.trim() || lleno} onClick={agregar}>
          <Plus className="size-5" aria-hidden />
        </button>
      </div>
    </fieldset>
  );
}
