import { leerCotizacionPublica } from "@/lib/cotizaciones/enlace-publico";
import { EnlaceNoValido, HojaCotizacion } from "./_componentes/hoja-cotizacion";

/**
 * /cotizacion/[token] — Cotización PÚBLICA de solo ver (enlace para el cliente).
 *
 * El negocio pide el enlace firmado en el panel (POST /api/cotizaciones/[id]/enlace)
 * y lo manda por WhatsApp. El cliente la abre sin clave. El token (HMAC con
 * propósito `cot`) no es enumerable y vence a la vigencia + 7 días. Si el token
 * está alterado, vencido, es de otro negocio o la cotización ya no existe, se ve
 * la misma página genérica. Noche 04-11: tramo 1 (ver) + tramo 2 (aceptar).
 */
export const metadata = {
  title: "Cotización",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CotizacionPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cotizacion = await leerCotizacionPublica(token);
  if (!cotizacion) return <EnlaceNoValido />;
  return <HojaCotizacion c={cotizacion} token={token} />;
}
