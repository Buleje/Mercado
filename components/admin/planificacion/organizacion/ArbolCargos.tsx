"use client";

/**
 * ArbolCargos — el organigrama dibujado desde `reportaA` (ADR-497): la cabeza
 * arriba, sus reportes debajo, unidos por líneas. Desde 640 px es un árbol
 * (con scroll propio si es ancho); a 400 px, una lista con sangría.
 */
import { MoreHorizontal, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { PASTILLA, PASTILLA_TONO } from "../piezas/clases";
import type { Cargo, NodoCargo } from "./organigrama-arbol";

const LINEA = "bg-[var(--rule-strong)]";

interface Acciones {
  puedeEditar: boolean;
  nombreArea: (id: string) => string;
  onEditar: (c: Cargo) => void;
  onAgregarReporte: (c: Cargo) => void;
  onBorrar: (c: Cargo) => void;
}

export function ArbolCargos({ raices, ...acciones }: { raices: readonly NodoCargo[] } & Acciones) {
  return (
    <>
      <div className="hidden overflow-x-auto pb-2 sm:block" role="region" aria-label="Organigrama" tabIndex={0}>
        <ul className="mx-auto flex w-max items-start gap-6">
          {raices.map((n) => (
            <NodoArbol key={n.cargo.id} nodo={n} raiz primero ultimo {...acciones} />
          ))}
        </ul>
      </div>
      <ul className="space-y-2 sm:hidden" aria-label="Organigrama">
        {raices.map((n) => (
          <NodoLista key={n.cargo.id} nodo={n} {...acciones} />
        ))}
      </ul>
    </>
  );
}

interface PropsNodo extends Acciones {
  nodo: NodoCargo;
  raiz?: boolean;
  primero?: boolean;
  ultimo?: boolean;
}

function NodoArbol({ nodo, raiz = false, primero = false, ultimo = false, ...acciones }: PropsNodo) {
  const { hijos } = nodo;
  return (
    <li className={cn("relative flex flex-col items-center px-2", !raiz && "pt-6")}>
      {!raiz && (
        <>
          <span aria-hidden className={cn("absolute top-0 left-1/2 h-6 w-px", LINEA)} />
          {!primero && <span aria-hidden className={cn("absolute top-0 left-0 h-px w-1/2", LINEA)} />}
          {!ultimo && <span aria-hidden className={cn("absolute top-0 right-0 h-px w-1/2", LINEA)} />}
        </>
      )}
      <TarjetaCargo cargo={nodo.cargo} reportes={hijos.length} className="w-56" {...acciones} />
      {hijos.length > 0 && (
        <>
          <span aria-hidden className={cn("h-6 w-px", LINEA)} />
          <ul className="flex items-start">
            {hijos.map((h, i) => (
              <NodoArbol key={h.cargo.id} nodo={h} primero={i === 0} ultimo={i === hijos.length - 1} {...acciones} />
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

function NodoLista({ nodo, ...acciones }: PropsNodo) {
  return (
    <li>
      <TarjetaCargo cargo={nodo.cargo} reportes={nodo.hijos.length} {...acciones} />
      {nodo.hijos.length > 0 && (
        <ul className="mt-2 ml-3 space-y-2 border-l-2 border-[var(--rule-strong)] pl-3">
          {nodo.hijos.map((h) => (
            <NodoLista key={h.cargo.id} nodo={h} {...acciones} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TarjetaCargo({ cargo: c, reportes, className, puedeEditar, nombreArea, onEditar, onAgregarReporte, onBorrar }: { cargo: Cargo; reportes: number; className?: string } & Acciones) {
  const area = c.areaId ? nombreArea(c.areaId) : "";
  const menu: MenuAccion[] = [
    { id: "editar", label: "Editar", icon: Pencil, onSelect: () => onEditar(c) },
    { id: "reporte", label: "Agregar alguien que le reporta", icon: Plus, onSelect: () => onAgregarReporte(c) },
    {
      id: "borrar",
      label: "Borrar",
      hint: reportes > 0 ? "Sus reportes pasan a reportar a su jefe" : undefined,
      icon: Trash2,
      tone: "danger",
      onSelect: () => onBorrar(c),
    },
  ];
  const cuerpo = (
    <>
      <span className="block text-sm font-bold leading-snug text-[var(--text-primary)]">{c.nombre || "Sin nombre"}</span>
      <span className={cn("block text-sm", c.persona ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]")}>{c.persona || "Sin asignar"}</span>
      {(area || c.funciones.length > 0) && (
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {area && <span className={cn(PASTILLA, PASTILLA_TONO.info)}>{area}</span>}
          {c.funciones.length > 0 && (
            <span className="text-xs text-[var(--text-tertiary)]">
              {c.funciones.length} {c.funciones.length === 1 ? "función" : "funciones"}
            </span>
          )}
        </span>
      )}
    </>
  );
  return (
    <div className={cn("flex items-start gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2", className)}>
      {puedeEditar ? (
        <button
          type="button"
          onClick={() => onEditar(c)}
          className="min-h-12 flex-1 rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          title={c.funciones.join(" · ") || undefined}
        >
          {cuerpo}
        </button>
      ) : (
        <div className="flex-1 px-1" title={c.funciones.join(" · ") || undefined}>
          {cuerpo}
        </div>
      )}
      {puedeEditar && (
        <div className="shrink-0">
          <ActionMenu label={`Opciones de ${c.nombre || "este cargo"}`} icon={MoreHorizontal} actions={menu} soloIcono size="md" />
        </div>
      )}
    </div>
  );
}
