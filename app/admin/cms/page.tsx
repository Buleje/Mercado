import { redirect } from "next/navigation";

/** El CMS vive dentro de Mi Tienda: esta ruta sólo lleva a la lista de páginas. */
export default function CmsRedirect() {
  redirect("/admin?tab=pagina-inicio&vista=paginas");
}
