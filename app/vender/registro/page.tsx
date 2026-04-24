import type { Metadata } from "next";
import RegistroClient from "./RegistroClient";

export const metadata: Metadata = {
  title: "Registra tu negocio — Vender en Buleje",
  description:
    "Abre tu tienda en Buleje en 5 pasos. Datos del negocio, contacto, verificación, horarios y plan. Gratis el primer mes.",
  robots: { index: false, follow: false },
};

/**
 * /vender/registro — Wizard vendor 5 pasos. Server component wrapper
 * que monta el client `RegistroClient` (no persiste nada backend salvo
 * cuando se envía el form final a /api/vendor/registration).
 */
export default function RegistroPage() {
  return <RegistroClient />;
}
