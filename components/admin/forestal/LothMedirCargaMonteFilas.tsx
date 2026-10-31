"use client";

/**
 * Las trozas medidas en el monte antes de guardar la carga (16-10, F3): una
 * línea por troza con su N° (el que va en la foto anotada), Ø, largo y m³.
 * El m³ es la vista previa; el que vale lo calcula el servidor al guardar.
 */
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { PiezaAMano, TrozaAMano } from "@/lib/forestal/loth-trozas-a-mano";
import type { FilaEntrada } from "@/lib/forestal/medicion-carga";

const cm = (m: number) => Math.round(m * 100);
const metros = (m: number) => m.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Las filas como las guarda la carga: una por troza, con el N° que le dio la
 * numeración (`piezasAMano`, mismo orden que las filas expandidas por cantidad).
 */
export function filasDeLaCarga(filas: readonly TrozaAMano[], piezas: readonly PiezaAMano[]): FilaEntrada[] {
  const planas = filas.flatMap((f) => Array.from({ length: f.cantidad }, () => f));
  return piezas.flatMap((p, i) => {
    const f = planas[i];
    if (!f) return [];
    return [
      {
        codigo: p.codigo,
        d1Cm: f.d1Cm,
        d2Cm: f.d2Cm,
        largoM: f.largoM,
        especie: f.especie?.trim() || null,
        medidoPorFoto: f.medidoPorFoto === true,
        d2Supuesto: f.d2Supuesto === true,
      },
    ];
  });
}

export default function LothMedirCargaMonteFilas({ filas, piezas }: { filas: readonly TrozaAMano[]; piezas: readonly PiezaAMano[] }) {
  const especies = new Set(filas.map((f) => f.especie?.trim() || "sin especie"));
  return (
    <div className="space-y-1">
      <p className="text-sm font-bold text-[var(--text-primary)]">
        {piezas.length} {piezas.length === 1 ? "troza" : "trozas"} · {[...especies].join(", ")}
      </p>
      <ol className="max-h-72 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-xl border border-[var(--rule-base)]" data-qa="filas-carga-monte">
        {piezas.map((p) => (
          <li key={p.codigo} className="flex items-baseline gap-3 px-3 py-1.5 text-sm tabular-nums">
            <span className="w-14 shrink-0 font-mono font-bold text-[var(--text-primary)]">N° {p.codigo}</span>
            <span className="text-[var(--text-secondary)]">
              Ø {cm(p.diamMayorM)}
              {p.porFoto === "pareja" ? "" : `/${cm(p.diamMenorM)}`} cm · {metros(p.lengthM)} m
            </span>
            <span className="ml-auto font-bold text-[var(--text-primary)]">{fmtM3(p.volumeM3)} m³</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
