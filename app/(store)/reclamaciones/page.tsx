import { redirect } from "next/navigation";

/** Alias histórico → ruta canónica del Libro de Reclamaciones. */
export default function ReclamacionesRedirect() {
  redirect("/libro-de-reclamaciones");
}
