"use client";

/**
 * TarjetaEstrategia — una estrategia dentro de su celda de la matriz
 * (ADR-497): qué se va a hacer, en qué quedó, los puntos del FODA que usa
 * (con el color de su cuadrante) y su objetivo si ya se convirtió. Lo demás,
 * en su «⋯».
 */
import { Flag, MoreHorizontal, Pencil, Target, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import type { CuadranteFoda } from "@/lib/planificacion/secciones";
import { cn } from "@/lib/utils";
import { PASTILLA, PASTILLA_TONO } from "../piezas/clases";
import { CUADRANTE, ESTADO_ESTRATEGIA, type Estrategia, type PuntoFoda } from "./foda-config";

interface Props {
  estrategia: Estrategia;
  puntos: ReadonlyMap<string, { punto: PuntoFoda; cuadrante: CuadranteFoda }>;
  /** El título del objetivo que la lleva a la práctica, si existe. */
  objetivo: string | null;
  puedeEditar: boolean;
  onEditar: () => void;
  onConvertir: () => void;
  onVerObjetivo: () => void;
  onBorrar: () => void;
}

export function TarjetaEstrategia({ estrategia: e, puntos, objetivo, puedeEditar, onEditar, onConvertir, onVerObjetivo, onBorrar }: Props) {
  const estado = ESTADO_ESTRATEGIA[e.estado];
  const usados = e.usa.flatMap((id) => {
    const p = puntos.get(id);
    return p ? [p] : [];
  });
  const acciones: MenuAccion[] = [
    ...(puedeEditar ? [{ id: "editar", label: "Editar", icon: Pencil, onSelect: onEditar }] : []),
    objetivo !== null
      ? { id: "ver", label: "Ver su objetivo", hint: objetivo, icon: Target, onSelect: onVerObjetivo }
      : {
          id: "convertir",
          label: "Convertir en objetivo",
          hint: "Crea el objetivo con este texto y lo abre para ponerle fechas y acciones",
          icon: Flag,
          onSelect: onConvertir,
          disabled: !puedeEditar,
        },
    ...(puedeEditar ? [{ id: "borrar", label: "Borrar", icon: Trash2, tone: "danger" as const, onSelect: onBorrar }] : []),
  ];

  return (
    <li className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
      <div className="flex items-start gap-2">
        <p className={cn("flex-1 text-sm leading-snug text-[var(--text-primary)]", e.estado === "descartada" && "text-[var(--text-tertiary)] line-through")}>{e.texto}</p>
        <div className="shrink-0">
          <ActionMenu label={`Opciones de «${e.texto.slice(0, 30)}»`} icon={MoreHorizontal} actions={acciones} soloIcono size="md" />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={cn(PASTILLA, PASTILLA_TONO[estado.tono])}>{estado.nombre}</span>
        {usados.map(({ punto, cuadrante }) => (
          <span
            key={punto.id}
            title={`${CUADRANTE[cuadrante].nombre}: ${punto.texto}`}
            className={cn(PASTILLA, PASTILLA_TONO[CUADRANTE[cuadrante].tono], "max-w-full font-medium")}
          >
            <span className="truncate">{punto.texto}</span>
          </span>
        ))}
        {objetivo !== null && (
          <button
            type="button"
            onClick={onVerObjetivo}
            className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full px-1 text-xs font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
          >
            <Target className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{objetivo || "Su objetivo"}</span>
          </button>
        )}
      </div>
    </li>
  );
}
