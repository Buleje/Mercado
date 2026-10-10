"use client";

/**
 * El campo del buscador del encabezado. Muestra lo que se está buscando
 * (`?q=` de la URL): en el catálogo, la persona ve su búsqueda y la corrige
 * ahí mismo. Si el catálogo quita la búsqueda (sin recargar), la URL cambia y
 * el campo se vacía solo (`key`).
 * `corto`: el del celular (a 400 px la frase larga se cortaba en «sérur»).
 */
import { useSearchParams } from "next/navigation";

export function CampoBuscar({ id, className, corto = false }: { id: string; className: string; corto?: boolean }) {
  const q = useSearchParams()?.get("q") ?? "";
  const pista = corto ? "¿Qué buscas? Shampoo, sérum…" : "¿Qué buscas hoy? Shampoo, sérum, FPS…";
  return <input key={q} id={id} name="q" type="search" enterKeyHint="search" defaultValue={q} placeholder={pista} className={`${className} text-ellipsis`} />;
}
