/**
 * cubicacion-atar — «atar las guardadas viejas» al Directorio (Cubicador, 24-10).
 * PURO. Una guardada necesita atarse cuando su comprador no es una ficha del
 * Directorio (`ficha.clienteParteId` vacío); la parte sugerida sale del nombre
 * escrito a mano, sin mayúsculas ni tildes.
 */
import { claveBusqueda, partesParecidas } from "./directorio";
import type { CubicacionRegistro } from "./cubicacion-registro";

export const necesitaAtar = (c: Pick<CubicacionRegistro, "ficha">): boolean => !c.ficha?.clienteParteId?.trim();

/**
 * La parte que más probablemente es el comprador escrito. Primero por nombre
 * parecido (uno contenido en el otro); si no, por la primera palabra (≥4 letras) si es
 * EXACTAMENTE una palabra del nombre de una sola parte («Ronal tornillo»
 * → «RONAL PÉREZ»). Con dudas (dos candidatas) no sugiere: elige la persona.
 */
export function sugerirParte<T extends { id: string; nombre: string }>(escrito: string, partes: readonly T[]): T | null {
  if (!claveBusqueda(escrito)) return null;
  const parecidas = partesParecidas(escrito, partes);
  if (parecidas.length === 1) return parecidas[0];
  if (parecidas.length > 1) return null;
  /* Sólo la PRIMERA palabra: es el nombre de la persona; la que sigue suele ser la
     especie («tornillo») y emparejaría a cualquiera que la lleve en su ficha. */
  const primera = claveBusqueda(escrito).split(" ")[0] ?? "";
  if (primera.length < 4) return null;
  const con = partes.filter((p) => claveBusqueda(p.nombre).split(" ").includes(primera));
  return con.length === 1 ? con[0] : null;
}
