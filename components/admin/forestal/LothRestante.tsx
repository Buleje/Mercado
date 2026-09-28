/**
 * «Lo que queda»: una resta en filas —de dónde se parte, qué se usó, qué
 * queda— con el m³ y su referencia en pie tablar aserrable al lado.
 *
 * El pt es un DERIVADO al 56 % (`ptAserrableDeRolliza`): se rotula «≈» y el ⓘ
 * lo dice. Nunca m³ × 424, que es para madera ya aserrada.
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { ptAserrableDeRolliza } from "@/lib/forestal/loth-restante";
import { formatNumber } from "@/lib/format";
import { CAJA } from "./loth-ficha-ui";

export interface FilaRestante {
  label: string;
  m3: number | null;
  /** Se resta: va con «−» delante. */
  resta?: boolean;
  /** El resultado: con raya arriba y en negrita. */
  total?: boolean;
  /** El resultado se pasó (más trozado que talado…): en ámbar. */
  aviso?: boolean;
}

export interface GrupoRestante {
  /** Sin título, las filas van sueltas (una sola resta). */
  titulo?: string;
  filas: FilaRestante[];
}

const conSigno = (v: number, texto: string) => (v < 0 ? `−${texto.replace(/^-/, "")}` : texto);

function Fila({ f }: { f: FilaRestante }) {
  const tono = f.aviso
    ? "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"
    : f.total
      ? "text-[var(--text-primary)]"
      : "text-[var(--text-secondary)]";
  const pt = f.m3 == null ? null : ptAserrableDeRolliza(f.m3);
  return (
    <tr className={f.total ? "border-t border-[var(--rule-base)]" : ""}>
      <th scope="row" className={`py-0.5 pr-2 text-left text-xs ${f.total ? "font-bold" : "font-medium"} ${tono}`}>
        {f.resta && <span aria-hidden="true">− </span>}
        {f.total && <span aria-hidden="true">= </span>}
        {f.label}
      </th>
      <td className={`whitespace-nowrap py-0.5 text-right font-mono text-xs tabular-nums ${f.total ? "font-bold" : ""} ${tono}`}>
        {f.m3 == null ? "—" : conSigno(f.m3, fmtM3(f.m3))}
      </td>
      <td className={`whitespace-nowrap py-0.5 pl-2 text-right font-mono text-xs tabular-nums ${f.total ? `font-bold ${tono}` : "text-[var(--text-tertiary)]"}`}>
        {pt == null ? "" : `≈ ${conSigno(pt, formatNumber(pt, 0))}`}
      </td>
    </tr>
  );
}

export default function LothRestante({
  titulo,
  grupos,
  what,
  affects,
}: {
  titulo: string;
  grupos: GrupoRestante[];
  what: string;
  affects?: string;
}) {
  return (
    <div className={CAJA} data-restante={titulo}>
      <div className="flex items-center gap-1">
        <p className="text-sm font-bold text-[var(--text-primary)]">{titulo}</p>
        <InfoTip
          title={titulo}
          what={what}
          affects={affects ?? "El pt aserrable (≈) no lo declara el libro: es la referencia al 56 % de rendimiento de la madera en troza."}
          example="10 m³ en troza ≈ 2 374 pt aserrables (10 × 0.56 × 424)."
        />
      </div>
      <table className="mt-1 w-full">
        <thead>
          <tr className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            <th scope="col" className="text-left font-bold"><span className="sr-only">Concepto</span></th>
            <th scope="col" className="text-right font-bold">m³</th>
            <th scope="col" className="pl-2 text-right font-bold">≈ pt aserr.</th>
          </tr>
        </thead>
        {grupos.map((g, i) => (
          <tbody key={g.titulo ?? i}>
            {g.titulo && (
              <tr>
                <th scope="rowgroup" colSpan={3} className={`pb-0.5 text-left text-xs font-bold text-[var(--text-primary)] ${i > 0 ? "pt-2" : "pt-1"}`}>
                  {g.titulo}
                </th>
              </tr>
            )}
            {g.filas.map((f) => (
              <Fila key={f.label} f={f} />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
