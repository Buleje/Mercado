import type { Metadata } from "next";
import PantallaTv from "@/components/tv/PantallaTv";

/**
 * Modo TV de las cámaras (contrato `lib/camaras/pantallas-tv.ts`): la página
 * que se abre en el navegador del Smart TV. Pública: el TV no inicia sesión;
 * muestra un código y el dueño lo vincula desde el panel. Todo lo que pide va
 * a `/api/tv/**` con la cookie propia del TV (sólo mirar).
 */
export const metadata: Metadata = {
  title: "Cámaras en el televisor",
  /* Pisa el robots del root a propósito: esta página no se indexa. */
  robots: { index: false, follow: false },
};

export default function TvPage() {
  return <PantallaTv />;
}
