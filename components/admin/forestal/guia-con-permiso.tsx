/**
 * El N° de una guía tal como se lee en una lista (ADR-504): «4» mientras haya
 * un solo talonario con ese N°; «4 · permiso 017» cuando la misma lista lo
 * tiene en dos permisos. El código entero del permiso va en el `title`.
 *
 * Quien pinta la lista calcula una vez `numerosEnVariosPermisos(lista)` y le
 * pasa el conjunto: así el permiso aparece sólo donde hace falta.
 */

import { claveDeNumero, etiquetaPermiso } from "@/lib/forestal/guia-por-permiso";

export function NumeroDeGuia({
  gtfNumber,
  permiso,
  repetidos,
  conGtf = false,
  className = "font-mono font-bold text-[var(--text-primary)]",
}: {
  gtfNumber: string | null | undefined;
  /** El código del permiso, tal como está escrito. */
  permiso?: string | null;
  /** Los N° que esta lista tiene en dos o más permisos (`numerosEnVariosPermisos`). */
  repetidos: ReadonlySet<string>;
  /** «GTF 4» en vez de «4». */
  conGtf?: boolean;
  className?: string;
}) {
  const n = (gtfNumber ?? "").trim();
  if (!n) return <span className={className}>—</span>;
  const clave = claveDeNumero(n);
  const conPermiso = clave != null && repetidos.has(clave);
  return (
    <span className={className} title={conPermiso ? (permiso ?? "Sin permiso") : undefined} data-guia-con-permiso={conPermiso || undefined}>
      {conGtf ? `GTF ${n}` : n}
      {conPermiso && <span className="font-sans font-normal text-[var(--text-secondary)]"> · {etiquetaPermiso(permiso)}</span>}
    </span>
  );
}
