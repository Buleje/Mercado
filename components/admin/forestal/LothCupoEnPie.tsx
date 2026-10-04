/**
 * La celda «Cupo» de la tabla «En pie»: cuánto de esa especie se taló contra lo
 * que se podía, con el veredicto escrito y de dónde sale el cupo.
 *
 *   9,537 de 320,000 m³ · 3 %
 *   En regla · autorizado
 *   2 de 45 árboles en el censo        ← dato, sin alarma
 */

import { textoCupoEnPie } from "@/lib/forestal/loth-cupo-vista";
import type { CupoEspecie } from "@/lib/forestal/loth-cupo-especie";
import { TONO_CUPO } from "./LothCupoEspecies";

export default function LothCupoEnPie({ fila }: { fila: CupoEspecie | undefined }) {
  if (!fila) return <span className="text-[var(--text-tertiary)]">—</span>;
  const t = textoCupoEnPie(fila);
  return (
    <div className="text-sm" data-cupo-celda data-veredicto={t.veredicto}>
      <div className="tabular-nums text-[var(--text-primary)]">{t.medida}</div>
      <div className="text-xs">
        <span className={`font-semibold ${TONO_CUPO[t.veredicto].texto}`}>{t.etiqueta}</span>
        {t.fuente && <span className="text-[var(--text-tertiary)]"> · {t.fuente}</span>}
      </div>
      {t.censo && <div className="text-xs text-[var(--text-secondary)]">{t.censo}</div>}
    </div>
  );
}
