import { Suspense } from "react";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { tenantDeVerificacion } from "../_componentes/tenant-verificacion";
import { CertificadoTroza, Consultando } from "../_componentes/certificado-troza";

/**
 * /verificar/[code] — Certificado público de origen legal forestal (Batch 4).
 * Target del QR VIEJO impreso en la troza/producto (sólo el código); los QR
 * nuevos llevan el id de la línea (`/verificar/troza/[id]`). El negocio sale
 * del host (subdominio, dominio propio o `/t/<slug>`) vía `tenantIdPublico`:
 * con el `x-tenant-id` crudo (un slug) ningún negocio ≠ el principal se
 * encontraba. Público (sin auth): sólo origen legal, nunca costos/precios.
 */

export const metadata = {
  title: "Verificación de origen forestal",
  robots: { index: false, follow: false },
};

export default function VerificarPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<Consultando />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  let code = rawCode;
  try {
    code = decodeURIComponent(rawCode);
  } catch {
    /* `%E0` suelto: se busca tal cual */
  }
  // Host (subdominio, dominio propio, `/t/<slug>`) o el código de `/v/…` (ADR-486).
  const tenantId = await tenantDeVerificacion();
  const trace = tenantId ? await ForestLothDB.traceByCode(tenantId, code).catch(() => null) : null;
  return <CertificadoTroza code={code} trace={trace} />;
}
