import { redirect } from "next/navigation";

// `/planes` es alias canónico de `/abrir-tienda#planes`.
// La página consolidada `/abrir-tienda` contiene hero + beneficios +
// 3 planes (Gratis / Pro / Enterprise) + FAQ + CTA.
export default function PlanesPage() {
  redirect("/abrir-tienda#planes");
}
