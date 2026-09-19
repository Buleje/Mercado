/**
 * LothTraceEmbudo — dónde se fue la madera del árbol, salto por salto.
 *
 * El árbol pierde volumen tres veces y la pantalla nombraba sólo la última:
 * tocón→trozas (copa y despuntes), trozas→lo que efectivamente salió (lo que
 * quedó en patio) y trozas→producto (el aserrío). Cada barra se mide contra lo
 * TALADO, así que la caída se ve, no se calcula mentalmente.
 *
 * «Salió del patio» es el MISMO número que la columna «Movilizado» de la tabla
 * (`movilizadoDe`): antes el embudo restaba el patio al trozado y la tabla
 * sumaba lo despachado y consumido — con una troza sin código, el mismo árbol
 * daba dos cifras según dónde se mirara.
 *
 * El producto terminado sólo entra si está en m³. Comparar m³ con pies
 * tablares en la misma escala fabrica caídas que no existen.
 */

import type { TraceOperation } from "@/lib/forestal/loth-trace";
import { movilizadoDe, sinCodigoDe } from "@/lib/forestal/loth-trace-tabla";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { tonoDe } from "./loth-trace-ui";

const pct = (v: number, total: number) => (total > 0 ? Math.min(100, (v / total) * 100) : 0);

export default function LothTraceEmbudo({ op }: { op: TraceOperation }) {
  const talado = op.talaVolM3;
  if (!(talado > 0)) {
    return <p className="text-sm text-[var(--text-secondary)]">— La tala se asentó sin volumen: no hay contra qué medir.</p>;
  }

  const movilizado = movilizadoDe(op);
  const sinCodigo = sinCodigoDe(op);
  const unidadesProducto = new Set(op.producto.map((p) => p.unit ?? ""));
  const productoEnM3 = op.producto.length > 0 && unidadesProducto.size === 1 && unidadesProducto.has("m3");
  const productoM3 = productoEnM3 ? op.productoQty : null;
  /**
   * El producto sin código de troza se atribuye por ESPECIE entre los árboles
   * que fueron al aserrío. Mostrar esa cifra como si fuera de este árbol es el
   * error que hace desconfiar de un tablero: el paso se marca como estimado.
   */
  const productoPorEspecie = op.producto.length > 0 && op.producto.every((p) => !p.trozaCode);

  const pasos: { label: string; valor: number; estimado?: boolean }[] = [
    { label: "Talado", valor: talado },
    { label: "Trozado", valor: op.trozadoVolM3 },
    { label: "Salió del patio", valor: movilizado },
  ];
  if (productoM3 != null) pasos.push({ label: "Producto", valor: productoM3, estimado: productoPorEspecie });

  const tono = tonoDe(op.trozadoVolM3 > 0 ? op.mermaVeredicto : null);
  const notas: string[] = [];
  if (op.trozadoVolM3 === 0) notas.push("Todavía sin trozar: lo que falta no es merma, es madera que no se midió.");
  if (op.patioVolM3 > 0) notas.push(`${fmtM3(op.patioVolM3)} m³ siguen en patio.`);
  if (sinCodigo > 0.0005) notas.push(`${fmtM3(sinCodigo)} m³ en trozas sin código: no se sabe si salieron.`);

  return (
    <div>
      <div className="space-y-1.5">
        {pasos.map((p, i) => {
          const previo = i > 0 ? pasos[i - 1].valor : null;
          const caida = previo != null ? previo - p.valor : 0;
          const caidaPct = previo != null && previo > 0 ? (caida / previo) * 100 : 0;
          return (
            <div key={p.label} className="flex items-center gap-2">
              <span className="w-32 shrink-0 text-sm font-semibold text-[var(--text-secondary)] max-sm:w-24">
                {p.label}
                {p.estimado && <span className="ml-1 font-normal text-[var(--text-tertiary)]">*</span>}
              </span>
              <div className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-[var(--surface-sunken)]" aria-hidden="true">
                <div
                  className={`h-full rounded transition-all ${i === 0 ? "bg-[var(--text-tertiary)]/40" : tono.barra}`}
                  style={{ width: `${pct(p.valor, talado)}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-sm font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(p.valor)} m³</span>
              <span
                className={`w-32 shrink-0 text-right text-sm tabular-nums max-sm:hidden ${caida > 0.0005 ? `font-semibold ${tono.texto}` : "text-[var(--text-tertiary)]"}`}
              >
                {previo == null ? "" : caida > 0.0005 ? `−${fmtM3(caida)} (${caidaPct.toFixed(0)}%)` : "sin pérdida"}
              </span>
            </div>
          );
        })}
      </div>
      {notas.length > 0 && <p className="mt-2 text-sm text-[var(--text-secondary)]">{notas.join(" ")}</p>}
      {productoPorEspecie && productoM3 != null && (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          * El producto terminado se registró sin código de troza: se atribuye por especie entre los árboles de{" "}
          {op.species ?? "la misma especie"} que fueron al aserrío, así que esa cifra puede incluir madera de otros árboles. Para que
          este salto sea exacto, la línea de producto tiene que declarar de qué troza salió.
        </p>
      )}
      {op.producto.length > 0 && productoM3 == null && (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          El producto terminado se declaró en {Array.from(unidadesProducto).filter(Boolean).join(" y ") || "otra unidad"} — no entra al
          embudo porque compararlo con m³ en la misma escala inventaría una caída.
        </p>
      )}
    </div>
  );
}
