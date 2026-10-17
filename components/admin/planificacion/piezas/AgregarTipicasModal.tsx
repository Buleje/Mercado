"use client";

/**
 * AgregarTipicasModal — «Agregar las típicas» de políticas, pasos o
 * preguntas (ADR-497). Muestra sólo lo que todavía no tienes (compara por
 * título), todo marcado; eliges el rubro (parte del de la ficha) y desmarcas
 * lo que no va. Genérico: cada vista le pasa qué falta y qué hacer con lo
 * elegido. Se monta con `key`: cada apertura parte del rubro de la ficha.
 */
import { useId, useState } from "react";
import { ListChecks } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { NOMBRE_RUBRO, RUBROS_PLANTILLA, type RubroPlantilla } from "@/lib/planificacion/plantillas-politicas";
import { cn } from "@/lib/utils";
import { PASTILLA, PASTILLA_TONO, claseChip } from "./clases";

export interface ItemTipico<T> {
  titulo: string;
  detalle: string;
  /** Una pastilla al lado del título (la categoría de la política). */
  etiqueta?: string;
  dato: T;
}

interface Props<T> {
  abierto: boolean;
  /** «Agregar las políticas típicas». */
  titulo: string;
  /** «Ya tienes todas las políticas típicas de este rubro.» */
  yaTodas: string;
  rubroInicial: RubroPlantilla;
  /** Lo típico de ese rubro que todavía no está. */
  faltan: (rubro: RubroPlantilla) => ItemTipico<T>[];
  /** Cuántos más entran (el tope de la lista menos lo que ya hay). */
  lugar: number;
  onCerrar: () => void;
  onAgregar: (datos: T[]) => void;
}

export function AgregarTipicasModal<T>({ abierto, titulo, yaTodas, rubroInicial, faltan, lugar, onCerrar, onAgregar }: Props<T>) {
  const idLista = useId();
  const [rubro, setRubro] = useState<RubroPlantilla>(rubroInicial);
  /** Índices desmarcados del rubro elegido (al cambiar de rubro, vuelve todo marcado). */
  const [fuera, setFuera] = useState<ReadonlySet<number>>(new Set());
  const items = faltan(rubro);
  const elegidos = items.filter((_, i) => !fuera.has(i)).slice(0, Math.max(0, lugar));
  const sobran = items.length - fuera.size > lugar;

  const alternar = (i: number) =>
    setFuera((prev) => {
      const s = new Set(prev);
      if (s.has(i)) s.delete(i);
      else s.add(i);
      return s;
    });

  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title={titulo}
      icon={ListChecks}
      size="lg"
      footer={
        <ModalFooter aviso={sobran ? `Sólo entran ${lugar} más: se agregan los primeros.` : undefined}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className={button({ variant: "primary" })}
            disabled={elegidos.length === 0}
            onClick={() => {
              onAgregar(elegidos.map((x) => x.dato));
              onCerrar();
            }}
          >
            Agregar {elegidos.length}
          </button>
        </ModalFooter>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-4")}>
        <div role="radiogroup" aria-label="Rubro" className="flex flex-wrap gap-2">
          {RUBROS_PLANTILLA.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={rubro === r}
              className={claseChip(rubro === r)}
              onClick={() => {
                setRubro(r);
                setFuera(new Set());
              }}
            >
              {NOMBRE_RUBRO[r]}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-secondary)]">
            {yaTodas}
          </p>
        ) : (
          <fieldset aria-describedby={idLista} className="space-y-2">
            <legend id={idLista} className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">
              {items.length} que todavía no tienes · las palabras entre corchetes son para que las completes
            </legend>
            {items.map((it, i) => (
              <label
                key={`${rubro}-${i}`}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 transition-colors hover:border-[var(--accent)] has-[:checked]:border-[var(--accent)]"
              >
                <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" checked={!fuera.has(i)} onChange={() => alternar(i)} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{it.titulo}</span>
                    {it.etiqueta && <span className={cn(PASTILLA, PASTILLA_TONO.neutro)}>{it.etiqueta}</span>}
                  </span>
                  {it.detalle && <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--text-secondary)]">{it.detalle}</span>}
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
    </AdminModal>
  );
}
