"use client";

/**
 * TarjetaObjetivo — un objetivo en la lista (ADR-497): título, estado,
 * «atrasado», plazo, área, responsable, fecha y la barra de avance. Al
 * abrirlo se ven sus acciones como lista para tildar ahí mismo, cada una con
 * «Pasar a Tareas del equipo».
 */
import { Check, ChevronDown, Compass, MoreHorizontal, Pencil, Send, Target, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import { avanceObjetivo, objetivoAtrasado } from "@/lib/planificacion/calculos";
import { cn } from "@/lib/utils";
import { BARRA_TONO, PASTILLA, PASTILLA_TONO, TARJETA, type Tono } from "../piezas/clases";
import { fechaCorta } from "../piezas/fechas";
import { ESTADO_OBJETIVO, NOMBRE_PLAZO, type Accion, type Objetivo } from "./objetivos-config";
import type { EstadoEnvio } from "./use-pasar-a-tareas";

interface Props {
  objetivo: Objetivo;
  hoy: string;
  abierto: boolean;
  puedeEditar: boolean;
  /** Texto de la estrategia de donde sale, si existe. */
  estrategia: string | null;
  envios: Readonly<Record<string, EstadoEnvio>>;
  onAlternar: () => void;
  onTildar: (accionId: string, hecha: boolean) => void;
  onPasarATareas: (a: Accion) => void;
  onEditar: () => void;
  onBorrar: () => void;
}

export function TarjetaObjetivo({ objetivo: o, hoy, abierto, puedeEditar, estrategia, envios, onAlternar, onTildar, onPasarATareas, onEditar, onBorrar }: Props) {
  const avance = avanceObjetivo(o);
  const atrasado = objetivoAtrasado(o, hoy);
  const estado = ESTADO_OBJETIVO[o.estado];
  const tonoBarra: Tono = o.estado === "hecho" ? "exito" : atrasado ? "error" : o.estado === "pausado" ? "aviso" : "info";
  const hechas = o.acciones.filter((a) => a.hecha).length;
  const idCuerpo = `objetivo-${o.id}`;
  const datos = [NOMBRE_PLAZO[o.plazo], o.area, o.responsable, o.fin ? `hasta el ${fechaCorta(o.fin, hoy)}` : ""].filter(Boolean);
  const acciones: MenuAccion[] = puedeEditar
    ? [
        { id: "editar", label: "Editar", icon: Pencil, onSelect: onEditar },
        { id: "borrar", label: "Borrar", icon: Trash2, tone: "danger", onSelect: onBorrar },
      ]
    : [];

  return (
    <li className={cn(TARJETA, "p-3")}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierto}
          aria-controls={idCuerpo}
          className="flex min-h-12 flex-1 items-start gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          <ChevronDown aria-hidden className={cn("mt-0.5 size-5 shrink-0 text-[var(--text-tertiary)] transition-transform", abierto && "rotate-180")} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-snug text-[var(--text-primary)]">{o.titulo || "Sin título"}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={cn(PASTILLA, PASTILLA_TONO[estado.tono])}>{estado.nombre}</span>
              {atrasado && <span className={cn(PASTILLA, PASTILLA_TONO.error)}>Atrasado</span>}
              <span className="text-xs text-[var(--text-secondary)]">{datos.join(" · ")}</span>
            </span>
          </span>
        </button>
        {acciones.length > 0 && (
          <div className="shrink-0">
            <ActionMenu label={`Opciones de «${o.titulo.slice(0, 30)}»`} icon={MoreHorizontal} actions={acciones} soloIcono size="md" />
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3 pl-7">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={avance} aria-label="Avance">
          <div className={cn("h-full rounded-full", BARRA_TONO[tonoBarra])} style={{ width: `${avance}%` }} />
        </div>
        <span className="w-24 shrink-0 text-right text-xs text-[var(--text-secondary)] tabular-nums">
          {avance} %{o.acciones.length > 0 && ` · ${hechas}/${o.acciones.length}`}
        </span>
      </div>

      {abierto && (
        <div id={idCuerpo} className="mt-3 space-y-3 border-t border-[var(--rule-soft)] pt-3 sm:pl-7">
          {(o.indicador || o.meta) && (
            <p className="text-sm text-[var(--text-secondary)]">
              {o.indicador && <>Se mide con: <span className="text-[var(--text-primary)]">{o.indicador}</span></>}
              {o.indicador && o.meta && " · "}
              {o.meta && <>Meta: <span className="font-semibold text-[var(--text-primary)]">{o.meta}</span></>}
            </p>
          )}
          {o.acciones.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Sin acciones: agrégalas al editar el objetivo.</p>
          ) : (
            <ul className="space-y-1">
              {o.acciones.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <label className="flex min-h-12 flex-1 cursor-pointer items-center gap-3 rounded-lg px-1 hover:bg-[var(--surface-sunken)]">
                    <input type="checkbox" className="size-5 shrink-0 accent-[var(--accent)]" checked={a.hecha} disabled={!puedeEditar} onChange={(e) => onTildar(a.id, e.target.checked)} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm text-[var(--text-primary)]", a.hecha && "text-[var(--text-tertiary)] line-through")}>{a.texto}</span>
                      {(a.fecha || a.responsable) && (
                        <span className="block text-xs text-[var(--text-tertiary)]">{[a.fecha && fechaCorta(a.fecha, hoy), a.responsable].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                  </label>
                  {puedeEditar && !a.hecha && (
                    <button
                      type="button"
                      className={button({ variant: "ghost", size: "icon" })}
                      disabled={(a.tareaId ? "hecho" : envios[a.id]) !== undefined}
                      aria-label={(a.tareaId || envios[a.id] === "hecho") ? `«${a.texto.slice(0, 40)}» ya está en Tareas del equipo` : `Pasar «${a.texto.slice(0, 40)}» a Tareas del equipo`}
                      title={(a.tareaId || envios[a.id] === "hecho") ? "Ya está en Tareas del equipo" : "Pasar a Tareas del equipo"}
                      onClick={() => onPasarATareas(a)}
                    >
                      {a.tareaId || envios[a.id] === "hecho" ? <Check className="size-4 text-[var(--data-success-ink)]" aria-hidden /> : <Send className="size-4" aria-hidden />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <EnlacePanel href="/admin?tab=metas-logros" className="inline-flex min-h-12 items-center gap-1.5">
              <Target className="size-4" aria-hidden />
              Medir con una meta
            </EnlacePanel>
            {estrategia && (
              <EnlacePanel href="/admin?tab=planificacion&vista=foda&sub=estrategias" className="inline-flex min-h-12 max-w-full items-center gap-1.5">
                <Compass className="size-4 shrink-0" aria-hidden />
                <span className="truncate">Sale de: {estrategia}</span>
              </EnlacePanel>
            )}
          </div>
          {o.nota && <p className="text-sm text-[var(--text-secondary)]">{o.nota}</p>}
        </div>
      )}
    </li>
  );
}
