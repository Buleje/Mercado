/**
 * Una especie dentro de la tarjeta de un bloque (Brandon 26-10): su nombre con
 * árboles y hectáreas del reparto, el saldo a la derecha (o «Se pasa» en rojo),
 * la barra apilada en el tono del bloque y lo que la llena (Usado · Preliminar ·
 * Saldo hoy) con la muestra del tramo que les toca. Autorizado y «si se
 * registran» van en la línea de arriba («Libre 12,800 de 20,000 m³»).
 */

import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { EspecieEnElBloque } from "@/lib/forestal/loth-plan-bloques-saldo";
import { BarraDeTramos, CifrasEnLinea } from "./LothPlanBloqueBarra";
import { tramosDeEspecie } from "./loth-plan-bloque-visual";

const NUM = "font-mono tabular-nums";
const ROJO = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

/** «Tornillo: usado 0.000, preliminar 38.500, se pasa 8.500 de 30.000 m³ autorizados» — lo que lee el lector de pantalla en la barra. */
function etiquetaDeBarra(e: EspecieEnElBloque): string {
  const partes = [`usado ${fmtM3(e.usadoM3)}`, `preliminar ${fmtM3(e.pendienteM3)}`];
  partes.push(e.excede ? `se pasa ${fmtM3(e.pasaPorM3)}` : `saldo libre ${fmtM3(Math.max(0, e.quedaSiSeRegistranM3))}`);
  return `${e.especie}: ${partes.join(", ")} de ${fmtM3(e.autorizadoM3)} m³ autorizados`;
}

export default function LothPlanBloqueEspecieFila({ e, meta }: { e: EspecieEnElBloque; meta: string | null }) {
  return (
    <li data-especie={e.clave} className="space-y-1.5 border-t border-[var(--rule-soft)] pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="min-w-0 text-sm">
          <span className="font-semibold text-[var(--text-primary)]">{e.especie}</span>
          {meta && <span className={`${NUM} text-[var(--text-tertiary)]`}> · {meta}</span>}
        </p>
        {e.excede ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Autorizado <span className={NUM}>{fmtM3(e.autorizadoM3)}</span> ·{" "}
            <b className={ROJO}>
              se pasa <span className={NUM}>{fmtM3(e.pasaPorM3)}</span> m³
            </b>
          </p>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            Libre <b className={`${NUM} text-[var(--text-primary)]`}>{fmtM3(e.quedaSiSeRegistranM3)}</b> de <span className={NUM}>{fmtM3(e.autorizadoM3)}</span> m³
          </p>
        )}
      </div>
      <BarraDeTramos t={tramosDeEspecie(e)} etiqueta={etiquetaDeBarra(e)} />
      {/* Autorizado y «si se registran» ya van en la línea de arriba («Libre X de Y»): acá, lo que llena la barra. */}
      <CifrasEnLinea
        items={[
          { k: "usado", t: "Usado", v: e.usadoM3, tramo: "usado" },
          { k: "pend", t: "Preliminar", v: e.pendienteM3, tramo: "preliminar" },
          { k: "queda", t: "Saldo hoy", v: e.quedaM3, rojo: e.excedeHoy },
        ]}
      />
      {e.excede && (
        <p className={`text-sm font-semibold ${ROJO}`}>
          {/* El «cuánto» ya está arriba a la derecha: acá va el «cuándo» (y si la especie ni siquiera es del bloque). */}
          {e.enElReparto
            ? e.excedeHoy
              ? "Ya se pasa con lo registrado en el libro."
              : "Se pasaría al registrar las preliminares."
            : `No está en este bloque: ${fmtM3(e.pasaPorM3)} m³ anotados${e.excedeHoy ? " (ya con lo registrado)" : " si se registran las preliminares"}.`}
        </p>
      )}
    </li>
  );
}
