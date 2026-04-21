import { redirect } from "next/navigation";

// `/precios` es alias canónico de `/abrir-tienda#planes` — la página consolidada
// contiene hero + beneficios + 3 planes detallados + FAQ + CTA.
export default function PreciosPage() {
  redirect("/abrir-tienda#planes");
}
