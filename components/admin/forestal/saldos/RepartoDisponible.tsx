"use client";

/**
 * Dónde está el volumen disponible: una barra por especie (o producto).
 *
 * El volumen se compara mirando, no leyendo. Repartir cero entre N filas no
 * dibuja nada, y una sola fila dibuja una barra al 100 % que no compara con
 * nada: en los dos casos va el motivo escrito en vez de un panel en blanco.
 */

import type { ResumenDeSaldo } from "@/lib/forestal/ctp-saldos-vista";
import { formatNumber } from "@/lib/format";

const n3 = (v: number) => formatNumber(v, 3);

export default function RepartoDisponible({
  vista,
  resumen,
  grafico,
}: {
  vista: "trozas" | "aserrada";
  resumen: ResumenDeSaldo;
  grafico: readonly { nombre: string; valor: number; pct: number }[];
}) {
  const r = resumen;
  const esRolliza = vista === "trozas";
  return (
    <div className="space-y-2 rounded-xl bg-[var(--surface-sunken)] p-4">
      <p className="text-base font-extrabold text-[var(--text-primary)]">
        Dónde está el volumen
        <span className="ml-2 text-sm font-semibold text-[var(--text-tertiary)]">
          · {n3(r.disponibleM3)} m³ disponibles
        </span>
      </p>
      {grafico.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          No hay volumen positivo que repartir:{" "}
          {r.enNegativo > 0
            ? `${r.enNegativo} ${
                r.enNegativo === 1
                  ? esRolliza
                    ? "especie quedó"
                    : "producto quedó"
                  : esRolliza
                    ? "especies quedaron"
                    : "productos quedaron"
              } en negativo.`
            : "todo lo que entró ya se transformó."}{" "}
          El detalle fila por fila está en la pestaña de al lado.
        </p>
      )}
      {grafico.length === 1 && (
        <p className="text-sm text-[var(--text-secondary)]">
          Todo el volumen está en{" "}
          <strong className="font-bold text-[var(--text-primary)]">{grafico[0].nombre}</strong>:{" "}
          {n3(grafico[0].valor)} m³, el 100 %. {esRolliza ? "Una sola especie" : "Un solo producto"}{" "}
          — no hay reparto que mirar hasta que entre {esRolliza ? "otra" : "otro"}.
        </p>
      )}
      {grafico.length > 1 && (
        <ul className="space-y-2">
          {grafico.map((g) => (
            <li key={g.nombre} className="space-y-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-[var(--text-primary)]">{g.nombre}</span>
                <span className="whitespace-nowrap tabular-nums text-[var(--text-secondary)]">
                  {n3(g.valor)} m³ · {g.pct} %
                </span>
              </div>
              {/* Mínimo 1 % para que una especie con poco volumen siga teniendo
                  una barra visible: una barra de 0 px se lee como «no hay». */}
              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(1, g.pct)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
