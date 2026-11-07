"use client";

/**
 * Lo preliminar dentro del «Saldo por especie» (Brandon 25-10): el KPI de
 * arriba y, en cada tarjeta, «Preliminar» y «Saldo si se registran». Lo calcula
 * el servidor (`preliminares` de `/loth/saldo-plan`); acá sólo se pinta.
 *
 * NO es lo que frena: el freno sigue midiendo sólo lo registrado («quedan» de
 * la tarjeta). Esto avisa cuánto quedaría cuando esas guías se registren.
 */

import { FileWarning } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { PreliminarDeEspecie, ResumenPreliminares } from "@/lib/forestal/loth-plan-preliminares";

const NUM = "font-mono tabular-nums";
const ROJO = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const CORAL = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

const guiasTxt = (n: number) => `${n} ${n === 1 ? "guía" : "guías"}`;
const trozasTxt = (n: number) => `${n} ${n === 1 ? "troza" : "trozas"}`;

/** «Preliminares: 2 guías · 40.000 m³ por registrar en SERFOR». `null` si no hay ninguna que descuente. */
export function KpiPreliminares({ resumen, className = "" }: { resumen: ResumenPreliminares; className?: string }) {
  if (resumen.guias === 0) return null;
  return (
    <p data-testid="kpi-preliminares" className={`flex flex-wrap items-center gap-x-1.5 text-sm font-semibold ${resumen.excede ? ROJO : CORAL} ${className}`}>
      <FileWarning className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Preliminares: <span className={NUM}>{guiasTxt(resumen.guias)}</span> · <span className={NUM}>{fmtM3(resumen.m3)} m³</span> por registrar en SERFOR
      </span>
      {resumen.quedaSiSeRegistranTotalM3 != null && (
        <span className="font-medium text-[var(--text-secondary)]">
          · si se registran quedan <span className={`${NUM} ${resumen.quedaSiSeRegistranTotalM3 < 0 || resumen.excede ? ROJO : ""}`}>{fmtM3(resumen.quedaSiSeRegistranTotalM3)} m³</span>
        </span>
      )}
    </p>
  );
}

/** Las dos líneas de la tarjeta de una especie: lo preliminar y cómo quedaría. */
export function PreliminarEnLaTarjeta({ pre }: { pre: PreliminarDeEspecie | undefined }) {
  if (!pre || pre.m3 <= 0) return null;
  const queda = pre.quedaSiSeRegistranM3;
  return (
    <div data-testid="preliminar-especie" className="space-y-0.5 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm">
      <p className={`${CORAL} font-semibold`}>
        Preliminar <span className={NUM}>{fmtM3(pre.m3)} m³</span>
        {pre.trozas > 0 && <span className="font-medium"> · {trozasTxt(pre.trozas)}</span>}
        {pre.porBloque.length > 1 && (
          <span className="font-medium text-[var(--text-secondary)]">
            {" "}({pre.porBloque.map((b) => `${b.bloque} ${fmtM3(b.m3)}`).join(" · ")})
          </span>
        )}
      </p>
      {queda != null ? (
        <p className={pre.excede ? `${ROJO} font-bold` : "text-[var(--text-secondary)]"}>
          Saldo si se registran:{" "}
          <span className={NUM}>{queda < 0 ? `se pasa por ${fmtM3(Math.abs(queda))} m³` : `${fmtM3(queda)} m³`}</span>
        </p>
      ) : (
        <p className="text-[var(--text-secondary)]">Sin volumen autorizado: no hay saldo que descontar.</p>
      )}
    </div>
  );
}
