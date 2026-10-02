"use client";

/**
 * El campo del buscador del encabezado. Muestra lo que se está buscando
 * (`?q=` de la URL): en el catálogo, la persona ve su búsqueda y la corrige
 * ahí mismo. Si el catálogo quita la búsqueda (sin recargar), la URL cambia y
 * el campo se vacía solo (`key`).
 */
import { useSearchParams } from "next/navigation";

export function CampoBuscar({ id, className }: { id: string; className: string }) {
  const q = useSearchParams()?.get("q") ?? "";
  return <input key={q} id={id} name="q" type="search" enterKeyHint="search" defaultValue={q} placeholder="Busca shampoo, keratina, planchas…" className={className} />;
}
