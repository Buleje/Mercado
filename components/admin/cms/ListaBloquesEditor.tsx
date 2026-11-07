"use client";

import { ArrowUp, ArrowDown, Eye, EyeOff, Trash2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BLOQUES_DISPONIBLES, nombreDeBloque } from "./campos-bloques";
import type { BloqueEditable } from "@/hooks/use-cms-page-editor";

const ICONO = "inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors";

interface Props {
  bloques: BloqueEditable[];
  elegido: string | null;
  onElegir: (id: string) => void;
  onAgregar: (type: string) => void;
  onMover: (id: string, delta: -1 | 1) => void;
  onVisible: (id: string, visible: boolean) => void;
  onEliminar: (id: string) => void;
}

/** Columna izquierda del editor: qué bloques sumar y los que ya tiene la página. */
export default function ListaBloquesEditor({ bloques, elegido, onElegir, onAgregar, onMover, onVisible, onEliminar }: Props) {
  return (
    <div className="w-full lg:w-64 shrink-0 bg-[var(--surface-sunken)] border-b lg:border-b-0 lg:border-r border-[var(--rule-base)] lg:overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <CardTitle className="text-sm font-bold">Agregar un bloque</CardTitle>
          <InfoTip title="Bloques" what="Cada bloque es una sección de la página. Se agregan al final; luego los subes o bajas con las flechas." />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
          {BLOQUES_DISPONIBLES.map((b) => (
            <button
              key={b.type}
              type="button"
              onClick={() => onAgregar(b.type)}
              className="w-full min-h-11 px-3 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-lg hover:border-[var(--accent)] text-left flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] transition-colors"
            >
              <b.icon className="h-5 w-5 text-[var(--accent)] shrink-0" />
              {b.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--rule-base)] p-4">
        <CardTitle className="text-sm font-bold mb-3">En esta página</CardTitle>
        {bloques.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Aún no hay bloques. Agrega el primero arriba.</p>
        ) : (
          <ul className="space-y-2">
            {bloques.map((b, i) => (
              <li
                key={b.id}
                className={`rounded-lg border-2 bg-[var(--surface-raised)] ${elegido === b.id ? "border-[var(--accent)]" : "border-[var(--rule-base)]"}`}
              >
                <button type="button" onClick={() => onElegir(b.id)} className="w-full text-left px-3 pt-2 text-sm font-semibold text-[var(--text-primary)]" aria-pressed={elegido === b.id}>
                  {nombreDeBloque(b.type)}
                  {!b.visible && <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">oculto</span>}
                </button>
                <div className="flex items-center px-1 pb-1">
                  <button type="button" className={ICONO} disabled={i === 0} onClick={() => onMover(b.id, -1)} aria-label={`Subir ${nombreDeBloque(b.type)}`}>
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button type="button" className={ICONO} disabled={i === bloques.length - 1} onClick={() => onMover(b.id, 1)} aria-label={`Bajar ${nombreDeBloque(b.type)}`}>
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button type="button" className={ICONO} onClick={() => onVisible(b.id, !b.visible)} aria-label={b.visible ? `Ocultar ${nombreDeBloque(b.type)}` : `Mostrar ${nombreDeBloque(b.type)}`}>
                    {b.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button type="button" className={`${ICONO} ml-auto hover:text-[var(--data-error-700)]`} onClick={() => onEliminar(b.id)} aria-label={`Eliminar ${nombreDeBloque(b.type)}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
