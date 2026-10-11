"use client";
/**
 * Una categoría de la lista: arrastrar · nombre (se edita ahí mismo) · cuántos
 * productos · visible/oculta · «⋯» con SEO, subir, bajar y quitar.
 * Brief 10-10: la acción principal a la vista (48 px) y el resto en el menú de
 * la fila — antes eran 6 botones sueltos de 32 px por fila.
 */
import { ArrowDown, ArrowUp, Eye, EyeOff, Globe, GripVertical, MoreHorizontal, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { PanelSeo } from "./PanelSeo";
import { cuentaDeProductos, puntajeSeo, ROTULO_SEO, type FilaCategoria as Fila } from "./tipos";
import type { EditorCategorias } from "./use-categorias";

export function FilaCategoria({ cat, indice, total, puedeReordenar, arrastrada, seoAbierto, onAlternarSeo, onArrastrar, onSoltar, editor }: {
  cat: Fila;
  /** Posición en la lista completa (no en la filtrada). */
  indice: number;
  total: number;
  puedeReordenar: boolean;
  arrastrada: boolean;
  seoAbierto: boolean;
  onAlternarSeo: () => void;
  onArrastrar: (indice: number | null) => void;
  onSoltar: (hasta: number) => void;
  editor: Pick<EditorCategorias, "mover" | "alternarVisible" | "cambiarNombre" | "cambiarSeo" | "generarSeo" | "eliminar">;
}) {
  const cuenta = cuentaDeProductos(cat);
  const renombra = cat.valores.length > 0 && cat.label.trim() !== cat.labelOriginal && cat.label.trim() !== "";
  const nombre = cat.label.trim() || cat.labelOriginal;
  const acciones: MenuAccion[] = [
    { id: "seo", label: seoAbierto ? "Cerrar SEO" : "Editar SEO", hint: ROTULO_SEO[puntajeSeo(cat)], icon: Globe, onSelect: onAlternarSeo },
    { id: "subir", label: "Subir", icon: ArrowUp, onSelect: () => editor.mover(indice, indice - 1), disabled: !puedeReordenar || indice === 0 },
    { id: "bajar", label: "Bajar", icon: ArrowDown, onSelect: () => editor.mover(indice, indice + 1), disabled: !puedeReordenar || indice === total - 1 },
    {
      id: "quitar",
      label: "Quitar categoría",
      hint: cat.productos > 0
        ? `Tiene ${cat.productos} producto${cat.productos === 1 ? "" : "s"}: renómbrala o cámbialos de categoría antes`
        : "No tiene productos; se quita al guardar",
      icon: Trash2,
      tone: "danger",
      disabled: cat.productos > 0,
      onSelect: () => void editor.eliminar(cat.clave),
    },
  ];

  return (
    <li
      className={cn("bg-[var(--surface-raised)]", arrastrada && "opacity-60 ring-2 ring-inset ring-[var(--accent)]")}
      onDragOver={puedeReordenar ? (e) => e.preventDefault() : undefined}
      onDrop={puedeReordenar ? (e) => { e.preventDefault(); onSoltar(indice); } : undefined}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1 sm:flex-nowrap sm:px-3">
        <span
          draggable={puedeReordenar}
          onDragStart={puedeReordenar ? () => onArrastrar(indice) : undefined}
          onDragEnd={() => onArrastrar(null)}
          className={cn(
            "flex h-12 w-6 shrink-0 items-center justify-center text-[var(--text-tertiary)]",
            puedeReordenar ? "cursor-grab active:cursor-grabbing" : "opacity-30",
          )}
          title={puedeReordenar ? "Arrastra para reordenar" : "Limpia el buscador para reordenar"}
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <input
          value={cat.label}
          onChange={(e) => editor.cambiarNombre(cat.clave, e.target.value)}
          aria-label={`Nombre de la categoría ${cat.labelOriginal}`}
          className={cn(
            "h-12 min-w-0 flex-1 rounded-xl border border-transparent bg-transparent dark:bg-transparent px-3 text-sm font-semibold transition-colors",
            "hover:border-[var(--rule-base)] focus:border-[var(--accent)] focus:bg-[var(--surface-canvas)] focus:outline-none",
            cat.visible ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
          )}
        />
        <span className="order-last w-full pb-1 pl-11 text-sm tabular-nums sm:order-none sm:w-52 sm:shrink-0 sm:pb-0 sm:pl-0">
          {renombra ? (
            <span className="font-semibold text-[var(--data-warning-ink)]" title={`Al guardar, «${cat.labelOriginal}» pasa a «${nombre}» en sus productos`}>
              Renombra {cat.productos} al guardar
            </span>
          ) : (
            <>
              <span className={cat.productos > 0 ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]"}>{cuenta.principal}</span>
              {cuenta.extra && <span className="text-[var(--text-tertiary)]"> · {cuenta.extra}</span>}
            </>
          )}
        </span>
        <button
          type="button"
          onClick={() => editor.alternarVisible(cat.clave)}
          aria-pressed={!cat.visible}
          aria-label={cat.visible ? `Ocultar ${nombre}` : `Mostrar ${nombre}`}
          title={cat.visible ? "Visible: toca para ocultarla" : "Oculta: toca para mostrarla"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-[var(--surface-sunken)]"
        >
          {cat.visible
            ? <Eye className="h-5 w-5 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
            : <EyeOff className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />}
        </button>
        <ActionMenu
          label={`Más acciones de ${nombre}`}
          icon={MoreHorizontal}
          actions={acciones}
          soloIcono
          size="md"
          /* Sin marco: 23 cuadros con borde, uno por fila, pesaban más que los nombres. */
          className="w-12! border-transparent! bg-transparent! hover:bg-[var(--surface-sunken)]!"
          title="SEO, subir, bajar y quitar"
        />
      </div>
      {seoAbierto && (
        <PanelSeo
          cat={cat}
          onCambiar={(campo, valor) => editor.cambiarSeo(cat.clave, campo, valor)}
          onGenerar={() => editor.generarSeo(cat.clave)}
        />
      )}
    </li>
  );
}
