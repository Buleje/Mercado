"use client";

/**
 * Un archivo dentro de su caja: nombre, cuántas filas trae, si entró o falló
 * al importar, el botón para quitarlo y —en las secciones que originan
 * madera— a qué permiso pertenece.
 */

import type { ReactNode } from "react";
import { CheckCircle, FileText, X, XCircle } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { etiquetaDe, type ArchivoCargado } from "./use-archivos-del-libro";
import { filasQueEntran } from "@/lib/forestal/ctp-serfor-a-libro";

export type EstadoDeEnvio = "ok" | "error" | null;

export default function FilaDeArchivo({
  archivo,
  estado,
  onQuitar,
  deshabilitado,
  linea,
  children,
}: {
  archivo: ArchivoCargado;
  estado: EstadoDeEnvio;
  onQuitar: (id: string) => void;
  deshabilitado?: boolean;
  /** Una línea corta de lo que trae (la Rolliza: trozas · m³ · pt). */
  linea?: string | null;
  /** El selector de permiso, si la sección lo lleva. */
  children?: ReactNode;
}) {
  const nombre = etiquetaDe(archivo);
  const listas = filasQueEntran(archivo.formato, archivo.seccion.parseadas).length;
  const malas = archivo.seccion.parseadas.filter((p) => p.problemas.length > 0).length;
  const Icono = estado === "ok" ? CheckCircle : estado === "error" ? XCircle : FileText;

  return (
    <li className="space-y-2 rounded-lg bg-[var(--surface-raised)] p-2" data-archivo={nombre}>
      <div className="flex items-center gap-2">
        <Icono
          className={`h-5 w-5 shrink-0 ${
            estado === "ok"
              ? "text-[var(--data-success)]"
              : estado === "error"
                ? "text-[var(--data-error)]"
                : "text-[var(--text-tertiary)]"
          }`}
          aria-label={estado === "ok" ? "Entró" : estado === "error" ? "Falló" : undefined}
          aria-hidden={estado ? undefined : true}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--text-primary)]" title={nombre}>
            {nombre}
          </span>
          <span className="block text-sm text-[var(--text-secondary)]">
            <strong className="tabular-nums">{listas}</strong> {listas === 1 ? "fila lista" : "filas listas"}
            {malas > 0 && (
              <span className="font-semibold text-[var(--data-warning)]">
                {" · "}
                <span className="tabular-nums">{malas}</span> incompleta{malas === 1 ? "" : "s"}
              </span>
            )}
            {archivo.faltantes.length > 0 && (
              <span className="font-semibold text-[var(--data-warning)]"> · faltan columnas: {archivo.faltantes.join(", ")}</span>
            )}
          </span>
          {linea && <span className="block text-sm font-semibold tabular-nums text-[var(--text-secondary)]">{linea}</span>}
        </span>
        {!deshabilitado && (
          <button
            type="button"
            onClick={() => onQuitar(archivo.id)}
            aria-label={`Quitar ${nombre}`}
            className={button({ variant: "ghost", size: "icon" })}
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      {children}
    </li>
  );
}
