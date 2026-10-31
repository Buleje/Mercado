/**
 * Un aviso del importador dicho en una línea (ADR-504: guía = N° + permiso,
 * troza = código + permiso). «Filas 12 y 13 idénticas: entraron las dos»,
 * «GTF 4 ambigua: elige el permiso del archivo»… y el texto entero del
 * servidor en el ⓘ. Lo que no es un aviso de identidad se muestra tal cual.
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { leerAvisoDeIdentidad } from "@/lib/forestal/guia-por-permiso";

const TITULO: Record<string, string> = {
  identicas: "Filas iguales",
  "guia-ambigua": "La misma GTF en dos permisos",
  "guia-sin-permiso": "Una guía sin permiso con ese N°",
  "codigo-ocupado": "Código ya usado",
  "codigo-varias": "Código en varias trozas",
  "codigo-sin-permiso": "Troza sin permiso",
};

export default function AvisoDeIdentidad({ mensaje }: { mensaje: string }) {
  const aviso = leerAvisoDeIdentidad(mensaje);
  if (!aviso) return <>{mensaje}</>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1" data-aviso-identidad={aviso.tipo}>
      {aviso.corto}
      <InfoTip
        title={TITULO[aviso.tipo] ?? "Aviso"}
        what={mensaje}
        affects="Desde ADR-504 una guía es su N° más su permiso, y una troza es su código más su permiso: dos talonarios pueden repetir números."
      />
    </span>
  );
}

/** Para listas que se unen en texto (sin ⓘ): la línea corta o el mensaje tal cual. */
export const avisoCorto = (mensaje: string): string => leerAvisoDeIdentidad(mensaje)?.corto ?? mensaje;
