"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { tacharSecretosDeRuta } from "@/lib/telemetry/secretos-en-url";

/**
 * Vercel Analytics + Speed Insights con la URL tachada: el enlace del kiosko
 * de asistencia lleva su secreto en la ruta (`/kiosko/asistencia/<token>`) y
 * los dos guardan la URL de cada visita (security 10-10, H2). Componente de
 * cliente porque `beforeSend` es una función y el layout es de servidor.
 */
export default function MedicionVercel() {
  return (
    <>
      <SpeedInsights beforeSend={(ev) => ({ ...ev, url: tacharSecretosDeRuta(ev.url) })} />
      <Analytics beforeSend={(ev) => ({ ...ev, url: tacharSecretosDeRuta(ev.url) })} />
    </>
  );
}
