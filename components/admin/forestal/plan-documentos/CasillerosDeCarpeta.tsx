"use client";

/**
 * Los documentos esperados de una carpeta, en grilla. Con la vista alineada
 * al tipo de plan (ADR-517), lo de la plantilla que este tipo no pide y está
 * vacío (el «Título de propiedad» en un PO) se esconde tras «Ver los que no
 * aplican»: no se borra, no cuenta y vuelve con un clic. Con algo subido se ve
 * siempre, con su pastilla «No aplica».
 */

import { useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { SubidaEnCurso } from "../hooks/use-plan-documentos";
import type { AccionesDocs } from "./acciones";
import CasilleroArchivos from "./CasilleroArchivos";
import type { CarpetaVista, CasilleroVista } from "./modelo";

export const idCasillero = (carpeta: string, casillero: string) => `docs-plan-${carpeta}-${casillero}`;

/** Vacío y de la plantilla, pero este tipo de plan no lo pide. */
export const seEsconde = (k: CasilleroVista, subidas: readonly SubidaEnCurso[]): boolean =>
  k.cuenta === "no_aplica" && k.archivos.length === 0 && (k.conCandado ?? 0) === 0 && subidas.length === 0;

export default function CasillerosDeCarpeta({
  carpeta,
  acciones,
  subidasDe,
}: {
  carpeta: CarpetaVista;
  acciones: AccionesDocs;
  subidasDe: (clave: string | null) => SubidaEnCurso[];
}) {
  const [verTodos, setVerTodos] = useState(false);
  const escondidos = carpeta.casilleros.filter((k) => seEsconde(k, subidasDe(k.clave)));
  const visibles = verTodos ? carpeta.casilleros : carpeta.casilleros.filter((k) => !escondidos.includes(k));
  if (carpeta.casilleros.length === 0) return null;

  return (
    <div className="space-y-2">
      {visibles.length > 0 && (
        <div className="grid grid-cols-1 gap-2 @min-[40rem]:grid-cols-2">
          {visibles.map((k) => (
            <CasilleroArchivos
              key={k.clave}
              domId={idCasillero(carpeta.clave, k.clave)}
              titulo={k.nombre}
              casillero={k}
              archivos={k.archivos}
              subidas={subidasDe(k.clave)}
              ocupado={false}
              vacio="Todavía no está."
              extra={k.soloEstePlan ? <span className="text-xs text-[var(--text-tertiary)]">sólo este plan</span> : undefined}
              onSubir={(files) => acciones.subir(files, carpeta, k)}
              onVer={acciones.ver}
              onQuitar={acciones.quitar}
              onVence={acciones.cambiarVence}
              onDescartarSubida={acciones.descartarSubida}
              conCandado={k.conCandado}
            />
          ))}
        </div>
      )}
      {escondidos.length > 0 && (
        <button
          type="button"
          data-ver-no-aplican
          aria-expanded={verTodos}
          onClick={() => setVerTodos(!verTodos)}
          title={escondidos.map((k) => k.nombre).join(" · ")}
          className={button({ variant: "ghost", className: "justify-start gap-1.5 px-2 text-sm text-[var(--text-secondary)]" })}
        >
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${verTodos ? "" : "-rotate-90"}`} aria-hidden="true" />
          {verTodos
            ? "Ocultar los que no aplican"
            : `Ver ${escondidos.length === 1 ? "1 que no aplica" : `${escondidos.length} que no aplican`} a este tipo de plan`}
        </button>
      )}
    </div>
  );
}
