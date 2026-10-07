/**
 * Los planes del selector agrupados por titular (pedido de Brandon 07-10: «que
 * estén juntos los permisos que tienen la misma comunidad nativa»). Una CCNN
 * con tres registros de plantación salía intercalada con otros titulares y
 * había que leer cada renglón entero para encontrar los suyos.
 *
 * La clave ignora mayúsculas, tildes y espacios dobles: «Comunidad Nativa San
 * Luis» y «COMUNIDAD NATIVA SAN LUIS » son el mismo titular escrito dos veces.
 * El rótulo es el primero que aparece, tal como se escribió. Los grupos van en
 * orden alfabético y, adentro, los planes conservan el orden recibido.
 */

export interface GrupoDeTitular<P> {
  clave: string;
  titular: string;
  planes: P[];
}

const SIN_TITULAR = "Sin titular";

export function claveDeTitular(nombre: string | null | undefined): string {
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function agruparPlanesPorTitular<P extends { titularName?: string | null }>(planes: readonly P[]): GrupoDeTitular<P>[] {
  const grupos = new Map<string, GrupoDeTitular<P>>();
  for (const p of planes) {
    const clave = claveDeTitular(p.titularName);
    const g = grupos.get(clave);
    if (g) g.planes.push(p);
    else grupos.set(clave, { clave, titular: p.titularName?.replace(/\s+/g, " ").trim() || SIN_TITULAR, planes: [p] });
  }
  return [...grupos.values()].sort((a, b) => {
    if (!a.clave) return 1;
    if (!b.clave) return -1;
    return a.clave.localeCompare(b.clave, "es");
  });
}
