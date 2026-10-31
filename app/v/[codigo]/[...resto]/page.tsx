import { Suspense } from "react";
import { notFound } from "next/navigation";
import { tenantIdPorCodigoCorto } from "@/lib/resolve-tenant";
import { leerRutaCorta, negocioDeCodigoEnHost } from "@/lib/tenant-url-publica";
import { fijarTenantVerificacion, negocioDelHost } from "../../../verificar/_componentes/tenant-verificacion";
import { Consultando } from "../../../verificar/_componentes/certificado-troza";
import VerificarCodigoPage from "../../../verificar/[code]/page";
import VerificarTrozaPage from "../../../verificar/troza/[id]/page";
import VerificarGuiaPage from "../../../verificar/guia/[id]/page";
import VerificarDespachoPage from "../../../verificar/despacho/[id]/page";
import VerificarLotePage from "../../../verificar/lote/[id]/page";
import VerificarCacaoPage from "../../../verificar-cacao/[code]/page";

/**
 * /v/… — la dirección CORTA de los QR (ADR-486). Muestra exactamente las
 * páginas de `/verificar/**`, sin redirigir:
 *
 *   · `/v/<letra>/<id>` — el host dice el negocio (dominio propio, subdominio
 *     o el principal), como en `/verificar`.
 *   · `/v/<código del negocio>/<letra>/<id>` — el negocio sale del código de 5
 *     letras (`codigoCortoNegocio`); vale sólo en el host principal (ver
 *     «Seguridad»).
 *
 * Letras: `t` troza (`?c=` aparte), `c` troza por código, `g` guía, `d`
 * despacho, `l` lote, `k` cacao (`RUTAS_CORTAS`). Público, sin sesión.
 *
 * Seguridad: un código desconocido o de un negocio dado de baja muestra el
 * mismo «no encontrado» que un id inventado y nunca cae en otro negocio. El
 * código sólo vale en el host principal: con dominio propio, subdominio o
 * `/t/<slug>` de OTRO negocio → «no encontrado». Una forma que no es de QR
 * llama a `notFound()` dentro del `<Suspense>`: con `cacheComponents` el
 * estado ya salió, así que es un 404 «blando» (estado 200, página de no
 * encontrado, `noindex`). Los códigos no son secretos (van impresos).
 */

export const metadata = {
  title: "Verificación de origen",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ codigo: string; resto: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function VerificarCortoPage(props: Props) {
  return (
    <Suspense fallback={<Consultando />}>
      <Contenido {...props} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: Props) {
  const { codigo, resto } = await params;
  const ruta = leerRutaCorta([codigo, ...(resto ?? [])]);
  if (!ruta) notFound();
  if (ruta.negocio) {
    const [delCodigo, host] = await Promise.all([tenantIdPorCodigoCorto(ruta.negocio), negocioDelHost()]);
    fijarTenantVerificacion(negocioDeCodigoEnHost(delCodigo, host));
  }

  const porId = Promise.resolve({ id: ruta.valor });
  const porCodigo = Promise.resolve({ code: ruta.valor });
  switch (ruta.tipo) {
    case "t":
      return <VerificarTrozaPage params={porId} searchParams={searchParams} />;
    case "c":
      return <VerificarCodigoPage params={porCodigo} />;
    case "g":
      return <VerificarGuiaPage params={porId} />;
    case "d":
      return <VerificarDespachoPage params={porId} />;
    case "l":
      return <VerificarLotePage params={porId} />;
    case "k":
      return <VerificarCacaoPage params={porCodigo} />;
  }
}
