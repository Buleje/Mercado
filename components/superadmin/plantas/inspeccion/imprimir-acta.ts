/**
 * Abre el acta de la inspección para imprimir o guardar en PDF, con lo que
 * está en la pantalla (lo último anotado aunque todavía no haya llegado al
 * servidor) y el conteo de trozas de este equipo si lo hay.
 *
 * La ventana se abre en el MISMO clic y sin esperar nada: después de un
 * `await` el navegador la trata como pop-up y la bloquea (ADR-436).
 */
import { openCtpReport } from "@/lib/forestal/ctp-print-shared";
import type { ConteoPatio } from "@/lib/forestal/conteo-patio";
import { actaDeInspeccion, type InspeccionParaActa } from "@/lib/superadmin/plantas-forestales/acta-inspeccion";
import { trozasDeConteo } from "@/lib/superadmin/plantas-forestales/inspeccion";
import type { Borrador, InspeccionDeLaPantalla } from "./inspeccion-datos";

/** La inspección como la ve el acta: el borrador pisa lo guardado; el conteo del equipo, al de la base. */
export function inspeccionParaActa(
  insp: InspeccionDeLaPantalla,
  borrador: Borrador | null,
  conteo: ConteoPatio | null,
): InspeccionParaActa {
  const conteoPatio = conteo ?? insp.conteoPatio ?? null;
  return {
    ...insp,
    ...(borrador
      ? {
          hallazgosDetalle: borrador.hallazgos,
          hallazgos: borrador.hallazgos.length,
          aserrada: borrador.aserrada,
          conclusion: borrador.conclusion.trim() || null,
          responsablePlanta: borrador.responsablePlanta.trim() || null,
        }
      : {}),
    conteoPatio,
    trozas: conteoPatio ? trozasDeConteo(conteoPatio) : insp.trozas,
  };
}

export function imprimirActa(insp: InspeccionDeLaPantalla, borrador: Borrador | null, conteo: ConteoPatio | null): void {
  const ventana = window.open("", "_blank");
  const nombre = insp.planta?.nombre ?? insp.plantaNombre ?? "Planta";
  openCtpReport({ ...actaDeInspeccion(inspeccionParaActa(insp, borrador, conteo), { nombre }), ventana });
}
