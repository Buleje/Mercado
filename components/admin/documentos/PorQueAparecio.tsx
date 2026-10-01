"use client";

/**
 * PorQueAparecio — la línea que va debajo del nombre en la lista.
 *
 * Sin búsqueda muestra de qué se trata el documento (la descripción). Con
 * búsqueda muestra DÓNDE coincidió y con qué pedazo de texto: "En la
 * descripción: …contrato de alquiler del local…". Es la diferencia entre una
 * lista de nombres crípticos y una lista que se entiende de un vistazo.
 */

import { Sparkles, User, Search } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  coincidenciaDe, descripcionDe, ETIQUETA_CAMPO, type DocBuscable,
} from "@/lib/documentos/relevancia";

interface Props {
  doc: DocBuscable;
  /** Términos buscados (la frase y sus palabras; en modo IA, los sinónimos). */
  terminos: string[];
  /** `grid` recorta a 2 líneas; `list` a 1 (la fila es angosta). */
  variante?: "grid" | "list";
}

export default function PorQueAparecio({ doc, terminos, variante = "grid" }: Props) {
  const coincidencia = terminos.length > 0 ? coincidenciaDe(doc, terminos) : null;
  const recorte = variante === "grid" ? "line-clamp-2" : "line-clamp-1";

  // Con búsqueda: el fragmento exacto, salvo que haya pegado en el nombre (que
  // ya se ve arriba resaltado; repetirlo es ruido).
  if (coincidencia && coincidencia.campo !== "nombre" && coincidencia.fragmento) {
    const { antes, match, despues } = coincidencia.fragmento;
    return (
      <p className={cn("mt-1.5 text-[length:var(--ts-2xs,11px)] leading-snug text-[var(--text-tertiary)]", recorte)}>
        <span className="mr-1 font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          {ETIQUETA_CAMPO[coincidencia.campo]}:
        </span>
        {antes}
        <mark className="rounded bg-[var(--data-warning-500)]/25 px-0.5 text-[var(--text-primary)] dark:bg-[var(--data-warning-500)]/35 dark:text-[var(--text-primary)]">
          {match}
        </mark>
        {despues}
      </p>
    );
  }

  // Sin búsqueda (o coincidió en el nombre): de qué se trata.
  const desc = descripcionDe(doc);
  if (!desc) return null;
  const Icono = desc.fuente === "usuario" ? User : Sparkles;
  return (
    <p
      className={cn("mt-1.5 flex gap-1 text-[length:var(--ts-2xs,11px)] leading-snug text-[var(--text-tertiary)]", recorte)}
      title={desc.texto}
    >
      <Icono
        className={cn("mt-0.5 h-3 w-3 shrink-0", desc.fuente === "usuario" ? "text-[var(--text-tertiary)]" : "text-[var(--accent)]")}
        aria-label={desc.fuente === "usuario" ? "Descripción tuya" : "Descripción de la IA"}
      />
      <span className={recorte}>{desc.texto}</span>
    </p>
  );
}

/** Aviso de que la búsqueda IA amplió la consulta, con los términos usados. */
export function TerminosIA({ terminos }: { terminos: string[] }) {
  if (terminos.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-1 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
      <Search className="h-3 w-3 shrink-0" aria-hidden /> También busqué:
      {terminos.slice(0, 8).map((t) => (
        <span key={t} className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-semibold text-[var(--text-secondary)]">
          {t}
        </span>
      ))}
    </p>
  );
}
