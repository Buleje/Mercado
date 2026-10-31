"use client";

/**
 * «Propiedades» (Alt+Entrar) del explorador del Archivo, como la ventana de
 * Windows: tipo, ubicación, tamaño, qué contiene y fechas de una carpeta, un
 * archivo, varios elegidos o el lugar donde estás parado. El tamaño de una
 * carpeta lo suma esta ventana con la lista de archivos (el servidor no lo da).
 */

import { useEffect, useState, type ReactNode } from "react";
import { Info } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { formatBytes } from "../archivo-visual";
import IconoArchivo from "./IconoArchivo";
import IconoCarpeta from "./IconoCarpeta";
import { tipoDeArchivo } from "./orden-agrupar";
import { contieneTexto, estadisticasDe, fechaLarga, plural, type Estadisticas } from "./propiedades-explorador";

export type ObjetoPropiedades =
  | { tipo: "carpeta"; carpeta: DbDocumentFolder }
  | { tipo: "doc"; doc: DbDocument }
  | { tipo: "varios"; docs: DbDocument[]; carpetas: DbDocumentFolder[] }
  /** Donde estás: una carpeta, la raíz (`carpetaId: null`) o Favoritos, Recientes… (`docs`). */
  | { tipo: "lugar"; nombre: string; carpetaId: string | null; docs?: DbDocument[] };

interface Props {
  objeto: ObjetoPropiedades | null;
  onClose: () => void;
  /** «Archivo › Facturas › 2026» de la carpeta donde está algo (`null` = la raíz). */
  rutaDe: (carpetaId: string | null) => string;
  hijos: ReadonlyMap<string | null, readonly DbDocumentFolder[]>;
  todasLasCarpetas: number;
  etiquetaEstado: (estado: string) => string;
}

/** Todos los archivos del Archivo (para sumar carpetas por dentro): se piden al abrir. */
function useTodosLosArchivos(activo: boolean) {
  const [estado, setEstado] = useState<{ docs: DbDocument[] | null; error: string | null }>({ docs: null, error: null });
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    setEstado({ docs: null, error: null });
    fetch("/api/admin/documents", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const lista = ((await r.json()) as { documents?: DbDocument[] }).documents ?? [];
        if (vivo) setEstado({ docs: lista, error: null });
      })
      .catch((err: unknown) => { if (vivo) setEstado({ docs: null, error: err instanceof Error ? err.message : "error" }); });
    return () => { vivo = false; };
  }, [activo]);
  return estado;
}

type Fila = [string, string];

export default function PropiedadesExplorador({ objeto, onClose, rutaDe, hijos, todasLasCarpetas, etiquetaEstado }: Props) {
  const necesitaSumar = !!objeto && (objeto.tipo === "carpeta" || (objeto.tipo === "varios" && objeto.carpetas.length > 0) || (objeto.tipo === "lugar" && !objeto.docs));
  const todos = useTodosLosArchivos(necesitaSumar);
  if (!objeto) return null;

  const cargando = necesitaSumar && !todos.docs && !todos.error;
  const sumar = (raices: (string | null)[]): Estadisticas | null => (todos.docs ? estadisticasDe(raices, todos.docs, hijos, todasLasCarpetas) : null);
  const tamano = (e: Estadisticas | null, extra = 0) => (e ? `${formatBytes(e.bytes + extra)}` : todos.error ? "No se pudo sumar" : "Sumando…");

  let titulo = "";
  let icono: ReactNode = null;
  let filas: Fila[] = [];
  if (objeto.tipo === "carpeta") {
    const f = objeto.carpeta;
    const e = sumar([f.id]);
    titulo = f.name;
    icono = <IconoCarpeta carpeta={f} tam="mediano" />;
    filas = [
      ["Tipo", "Carpeta de archivos"],
      ["Ubicación", rutaDe(f.parentId)],
      ["Tamaño", tamano(e)],
      ["Contiene", e ? contieneTexto(e) : tamano(e)],
      ["Creada", fechaLarga(f.createdAt)],
      ["Modificada", fechaLarga(f.updatedAt)],
    ];
  } else if (objeto.tipo === "doc") {
    const d = objeto.doc;
    titulo = d.name;
    icono = <IconoArchivo doc={d} tam="mediano" />;
    filas = [
      ["Tipo", tipoDeArchivo(d)],
      ["Ubicación", rutaDe(d.folderId)],
      ["Tamaño", `${formatBytes(d.size)} (${plural(d.size, "byte", "bytes")})`],
      ["Subido", fechaLarga(d.uploadedAt)],
      ["Modificado", fechaLarga(d.updatedAt)],
      ["Vence", d.expiresAt ? fechaLarga(d.expiresAt).replace(/ · .*$/, "") : "No vence"],
      ["Estado", d.status && d.status !== "none" ? etiquetaEstado(d.status) : "Sin estado"],
      ["Etiquetas", d.tags.length > 0 ? d.tags.join(", ") : "Sin etiquetas"],
    ];
  } else if (objeto.tipo === "varios") {
    const { docs, carpetas } = objeto;
    const e = carpetas.length > 0 ? sumar(carpetas.map((c) => c.id)) : { archivos: 0, carpetas: 0, bytes: 0 };
    const sueltos = docs.reduce((n, d) => n + d.size, 0);
    const lugares = new Set([...docs.map((d) => d.folderId), ...carpetas.map((c) => c.parentId)]);
    titulo = `${docs.length + carpetas.length} elementos`;
    filas = [
      ["Elegiste", contieneTexto({ archivos: docs.length, carpetas: carpetas.length })],
      ["Ubicación", lugares.size === 1 ? rutaDe([...lugares][0] ?? null) : "Varias carpetas"],
      ["Tamaño", tamano(e, sueltos)],
      ...(carpetas.length > 0 ? [["Dentro de las carpetas", e ? contieneTexto(e) : tamano(e)] satisfies Fila] : []),
    ];
  } else {
    const e = objeto.docs
      ? { archivos: objeto.docs.length, carpetas: 0, bytes: objeto.docs.reduce((n, d) => n + d.size, 0) }
      : sumar([objeto.carpetaId]);
    titulo = objeto.nombre;
    filas = [
      ["Ubicación", objeto.carpetaId ? rutaDe(objeto.carpetaId) : objeto.docs ? "Vista del Archivo" : "Archivo"],
      ["Tamaño", tamano(e)],
      ["Contiene", e ? contieneTexto(e) : tamano(e)],
    ];
  }

  return (
    <AdminModal open onClose={onClose} size="sm" icon={Info} title={`Propiedades de «${titulo}»`}>
      <div className={MODAL_BODY}>
        {icono && (
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center">{icono}</span>
            <span className="min-w-0 break-words text-base font-bold text-[var(--text-primary)]">{titulo}</span>
          </div>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" aria-busy={cargando}>
          {filas.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-[var(--text-tertiary)]">{k}</dt>
              <dd className="min-w-0 break-words font-medium text-[var(--text-primary)]">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </AdminModal>
  );
}
