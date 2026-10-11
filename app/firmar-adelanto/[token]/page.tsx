import type { Metadata } from "next";
import { connection } from "next/server";
import { TOKEN_RE } from "@/lib/adelantos/registro-firmas";
import { AdelantoFirmasDB } from "@/lib/db/adelanto-firmas.db";
import { logger } from "@/lib/logger";
import type { VistaPublicaFirma } from "@/lib/adelantos/entregar-tipos";
import { FirmarAdelantoView } from "./FirmarAdelantoView";

/** ADR-491: el token va en la URL; ni buscadores ni el `Referer` deben llevárselo. */
export const metadata: Metadata = {
  title: "Firma tu recibo",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ token: string }> };

export default async function FirmarAdelantoPage({ params }: Props) {
  /* Siempre al momento (nunca prerender ni caché compartida): la página
     lleva monto y persona de un enlace de un uso. Next sirve las rutas
     dinámicas con `Cache-Control: private, no-cache, no-store`. El molde del
     token es el del backend: si no encaja, ni se toca la base. */
  await connection();
  const { token } = await params;
  let vista: VistaPublicaFirma | null = null;
  if (TOKEN_RE.test(token)) {
    try {
      vista = await AdelantoFirmasDB.vistaPublica(token);
    } catch (err) {
      logger.error("firmar-adelanto: no se pudo leer el enlace", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  return <FirmarAdelantoView token={token} vista={vista} />;
}
