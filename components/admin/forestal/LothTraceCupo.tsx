"use client";

/**
 * LothTraceCupo — el cupo por especie dentro del «Avance del permiso».
 *
 * Una línea con las especies excedidas o cerca del cupo (sólo si las hay) y,
 * dentro del Control del permiso, «Saldo por especie →», que lleva a la tabla
 * por especie de Extracción: desde el 17-10 («compactar el Libro TH») es la
 * única del libro, con lo talado, trozado, despachado y el avance de cada una.
 * Lo único que esta tabla tenía y aquella no —«Cargar lo autorizado» en las
 * especies que se miden contra el censo— queda acá, en la misma línea.
 *
 * Fuera del Control (sin a dónde enlazar) sigue el plegable de siempre con la
 * tabla completa.
 */

import { useId, useState } from "react";
import { ArrowRight, ChevronDown, PencilLine } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { CupoEspecie } from "@/lib/forestal/loth-cupo-especie";
import { alertasDeCupo } from "@/lib/forestal/loth-cupo-vista";
import LothCupoEspecies, { TONO_CUPO } from "./LothCupoEspecies";
import { irACargarAutorizado } from "./loth-autorizar-url";
import { useIrASeccionControl } from "./LothControlPestanas";

const BOTON =
  "inline-flex h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";

export default function LothTraceCupo({
  filas,
  onCargarAutorizado = irACargarAutorizado,
}: {
  filas: readonly CupoEspecie[];
  /** Por defecto navega al Plan de manejo (`?vista=plan&autorizar=`). Inyectable para la prueba. */
  onCargarAutorizado?: (especie: string) => void;
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const irASeccion = useIrASeccionControl();
  if (filas.length === 0) return null;
  const alertas = alertasDeCupo(filas);
  /* Las que se miden contra el censo: les falta lo autorizado del plan. */
  const sinAutorizado = filas.filter((f) => f.fuente != null && f.fuente !== "autorizado");

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
        {irASeccion ? (
          <>
            <button type="button" onClick={() => irASeccion("extraccion")} className={BOTON}>
              Saldo por especie
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            {sinAutorizado.length > 0 && (
              <button
                type="button"
                onClick={() => onCargarAutorizado(sinAutorizado[0].especie)}
                aria-label={`Cargar lo autorizado de ${sinAutorizado[0].especie}`}
                title={`Se miden contra el censo: ${sinAutorizado.map((f) => f.especie).join(", ")}`}
                className={BOTON}
                data-cargar-autorizado={sinAutorizado[0].clave}
              >
                <PencilLine className="h-4 w-4" aria-hidden="true" />
                Cargar lo autorizado
                {sinAutorizado.length > 1 && <span className="font-normal tabular-nums">· {sinAutorizado.length} especies</span>}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            aria-controls={`${id}-cupo`}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            Cupo por especie
            <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        )}
      </div>
      {!irASeccion && (
        <div id={`${id}-cupo`} hidden={!abierto} className="mt-2">
          {abierto && <LothCupoEspecies filas={filas} titulo="Cupo por especie" onCargarAutorizado={onCargarAutorizado} />}
        </div>
      )}
    </div>
  );
}
