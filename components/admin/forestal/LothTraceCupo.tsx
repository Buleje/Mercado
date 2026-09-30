"use client";

/**
 * LothTraceCupo — el cupo por especie dentro del «Avance del permiso».
 *
 * Una línea con las especies excedidas o cerca del cupo (sólo si las hay) y un
 * plegable «Cupo por especie» con la tabla completa. Plegado por defecto: la
 * línea ya dice lo que pide atención.
 */

import { useId, useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { CupoEspecie } from "@/lib/forestal/loth-cupo-especie";
import { alertasDeCupo } from "@/lib/forestal/loth-cupo-vista";
import LothCupoEspecies, { TONO_CUPO } from "./LothCupoEspecies";

export default function LothTraceCupo({ filas }: { filas: readonly CupoEspecie[] }) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  if (filas.length === 0) return null;
  const alertas = alertasDeCupo(filas);

  return (
    <div data-trace-cupo>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {alertas.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-[var(--text-secondary)]" data-cupo-alertas>
            {alertas.map((a) => (
              <span key={a.especie} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${TONO_CUPO[a.veredicto].barra}`} aria-hidden="true" />
                <b className="text-[var(--text-primary)]">{a.especie}</b>
                <span className={`font-semibold ${TONO_CUPO[a.veredicto].texto}`}>
                  {a.veredicto === "excedido" ? "excedida" : "cerca del cupo"} {a.detalle}
                </span>
              </span>
            ))}
            <InfoTip
              title="Cupo por especie"
              what="Lo talado de cada especie contra su cupo: el volumen que autoriza el plan o, si no lo trae, lo censado."
              affects="Excedida = pasa el cupo por más de 0,010 m³. Cerca = desde el 90 %."
              example="Ábrelo abajo para ver todas las especies."
            />
          </p>
        )}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-controls={`${id}-cupo`}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          Cupo por especie
          <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>
      <div id={`${id}-cupo`} hidden={!abierto} className="mt-2">
        {abierto && <LothCupoEspecies filas={filas} titulo="Cupo por especie" />}
      </div>
    </div>
  );
}
