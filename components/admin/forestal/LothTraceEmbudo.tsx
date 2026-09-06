/**
 * LothTraceEmbudo — dónde se fue la madera del árbol, salto por salto.
 *
 * El árbol pierde volumen tres veces y hasta ahora la pantalla sólo nombraba la
 * última: tocón→trozas (copa y despuntes), trozas→lo que efectivamente salió
 * (lo que quedó en patio) y trozas→producto (el aserrío). Cada barra se mide
 * contra lo TALADO, así que la caída se ve, no se calcula mentalmente.
 *
 * El producto terminado sólo entra al embudo si está en m³. Comparar m³ con
 * pies tablares en la misma escala fabrica caídas que no existen.
 */

import type { TraceOperation } from "@/lib/forestal/loth-trace";
import { tonoDe } from "./loth-trace-ui";

const pct = (v: number, total: number) => (total > 0 ? Math.min(100, (v / total) * 100) : 0);

export default function LothTraceEmbudo({ op }: { op: TraceOperation }) {
  const talado = op.talaVolM3;
  if (!(talado > 0)) return null;

  const movilizado = op.trozadoVolM3 - op.patioVolM3;
  const unidadesProducto = new Set(op.producto.map((p) => p.unit ?? ""));
  const productoEnM3 = op.producto.length > 0 && unidadesProducto.size === 1 && unidadesProducto.has("m3");
  const productoM3 = productoEnM3 ? op.productoQty : null;
  /**
   * El producto sin código de troza se atribuye por ESPECIE: la misma línea le
   * aparece a todos los árboles de esa especie. Mostrar esa cifra como si fuera
   * de este árbol es exactamente el error que hace desconfiar de un tablero, así
   * que el paso se marca como estimado en vez de callarlo.
   */
  const productoPorEspecie = op.producto.length > 0 && op.producto.every((p) => !p.trozaCode);

  const pasos: { label: string; valor: number; nota?: string; estimado?: boolean }[] = [
    { label: "Talado", valor: talado },
    { label: "Trozado", valor: op.trozadoVolM3 },
    { label: "Fuera del patio", valor: movilizado, nota: op.patioVolM3 > 0 ? `${op.patioVolM3.toFixed(3)} m³ siguen en patio` : undefined },
  ];
  if (productoM3 != null) pasos.push({ label: "Producto", valor: productoM3, estimado: productoPorEspecie });

  const tono = tonoDe(op.mermaVeredicto);

  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)]/50 p-3">
      <p className="mb-2 text-[length:var(--ts-2xs)] font-black uppercase tracking-widest text-[var(--text-tertiary)]">
        Dónde se fue la madera
      </p>
      <div className="space-y-1.5">
        {pasos.map((p, i) => {
          const previo = i > 0 ? pasos[i - 1].valor : null;
          const caida = previo != null ? previo - p.valor : 0;
          const caidaPct = previo != null && previo > 0 ? (caida / previo) * 100 : 0;
          return (
            <div key={p.label} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-xs font-bold text-[var(--text-secondary)]">
                {p.label}
                {p.estimado && <span className="ml-1 font-normal text-[var(--text-tertiary)]">*</span>}
              </span>
              <div className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-[var(--surface-sunken)]">
                <div
                  className={`h-full rounded transition-all ${i === 0 ? "bg-[var(--text-tertiary)]/40" : tono.barra}`}
                  style={{ width: `${pct(p.valor, talado)}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                {p.valor.toFixed(3)} m³
              </span>
              <span className={`w-32 shrink-0 text-right text-xs font-semibold tabular-nums ${caida > 0.0005 ? tono.texto : "text-[var(--text-tertiary)]"}`}>
                {previo == null ? "" : caida > 0.0005 ? `−${caida.toFixed(3)} (${caidaPct.toFixed(0)}%)` : "sin pérdida"}
              </span>
            </div>
          );
        })}
      </div>
      {pasos.some((p) => p.nota) && (
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">{pasos.find((p) => p.nota)?.nota}</p>
      )}
      {productoPorEspecie && productoM3 != null && (
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          * El producto terminado se registró sin código de troza: se atribuye por especie, así que esa cifra puede incluir madera de
          otros árboles de {op.species ?? "la misma especie"}. Para que este salto sea exacto, la línea de producto tiene que declarar
          de qué troza salió.
        </p>
      )}
      {op.producto.length > 0 && productoM3 == null && (
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          El producto terminado se declaró en {Array.from(unidadesProducto).filter(Boolean).join(" y ") || "otra unidad"} — no entra al embudo
          porque compararlo con m³ en la misma escala inventaría una caída.
        </p>
      )}
    </div>
  );
}
