import { Suspense } from "react";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { tenantDeVerificacion } from "../../_componentes/tenant-verificacion";
import { CertificadoTroza, Consultando } from "../../_componentes/certificado-troza";

/**
 * /verificar/troza/[id]?c=<código> — el QR de las etiquetas del Libro TH desde
 * el 08-10. Lleva el id de la línea (no se repite entre permisos ni cambia
 * cuando el código pase a `12A-0001`) y el código en `?c=` para la pistola sin
 * internet. Sin «/» del código en la ruta: el id va limpio. Público, sólo
 * origen legal.
 */

export const metadata = {
  title: "Verificación de origen forestal",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string | string[] }> };

export default function VerificarTrozaPage(props: Props) {
  return (
    <Suspense fallback={<Consultando />}>
      <Contenido {...props} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = (Array.isArray(sp.c) ? sp.c[0] : sp.c)?.trim().slice(0, 80) || null;
  // Host (subdominio, dominio propio, `/t/<slug>`) o el código de `/v/…` (ADR-486).
  const tenantId = await tenantDeVerificacion();
  const trace = tenantId ? await ForestLothDB.traceByLinea(tenantId, id.slice(0, 64), c).catch(() => null) : null;
  return <CertificadoTroza code={trace?.code ?? c ?? "Troza"} trace={trace} />;
}
