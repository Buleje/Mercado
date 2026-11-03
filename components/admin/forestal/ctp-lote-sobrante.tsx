/**
 * La etiqueta roja del sobrante en la tarjeta de cada lote (Brandon, 03-11:
 * «en cada lote quiero al lado que diga el volumen sobrante con una etiqueta
 * roja resaltante… tanto en m³ y pies… para saldo restante de usado como para
 * el volumen de troza, todo adaptado al rendimiento»).
 *
 * La cuenta es `sobranteDeLote`, la MISMA de la barra de los elegidos y de la
 * tarjeta «Volumen sobrante»: lo que falta declarar hasta el 56 % si el lote ya
 * produjo, o el 56 % de lo que entró si sólo tiene consumo (con «≈»: estimado).
 * Un lote abierto o ya en el tope no lleva etiqueta.
 */

import { formatNumber } from "@/lib/format";
import { sobranteDeLote, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";

export default function LoteSobranteEtiqueta({ lote }: { lote: LoteAserrio }) {
  const s = sobranteDeLote(lote);
  if (!s) return null;
  const m3 = formatNumber(s.m3, 2);
  const pt = formatNumber(s.pt, 0);
  const ayuda = s.estimado
    ? `Solo tiene consumo: al 56 % de los ${formatNumber(lote.volumenM3, 2)} m³ que entraron saldrían ${m3} m³ (${pt} pt de aserrada). Es un estimado hasta que declares su producción.`
    : `Todavía puedes declarar ${m3} m³ (${pt} pt de aserrada) hasta el tope del 56 % de lo que entró a la sierra.`;
  return (
    <span
      data-sobrante-lote
      title={ayuda}
      className="whitespace-nowrap rounded-full bg-[var(--data-error-700)] px-2.5 py-0.5 text-sm font-bold text-white shadow-sm"
    >
      Sobra {s.estimado ? "≈ " : ""}
      <span className="font-mono tabular-nums">{m3}</span> m³ · <span className="font-mono tabular-nums">{pt}</span> pt
    </span>
  );
}
