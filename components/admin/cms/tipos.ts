export type EstadoPagina = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface PaginaResumen {
  id: string;
  slug: string;
  title: string;
  status: EstadoPagina;
  updatedAt: string;
  _count: { blocks: number };
}

export const ETIQUETA_ESTADO: Record<EstadoPagina, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicada",
  ARCHIVED: "Archivada",
};

/** «Mi página de ofertas» → «mi-pagina-de-ofertas» (lo que acepta el enlace). */
export function enlaceDesdeTitulo(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Mientras escribe: permite el guion al final (si no, no podría teclear «mi-pagina»). */
export function limpiarEnlace(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
}
