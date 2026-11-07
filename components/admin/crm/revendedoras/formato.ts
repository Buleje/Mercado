import { formatCurrency } from "@/lib/format";
import type { CotizacionRevendedora } from "@/lib/revendedoras/reglas";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

export const soles = (n: number) => formatCurrency(n);

/** «20 %», «18.6 %» (punto decimal, como los soles de `formatCurrency`). */
export const pct = (n: number) => `${Math.round(n * 10) / 10} %`;

/** «2026-10» → «octubre». */
export function nombreDelMes(clave: string): string {
  const m = Number(clave.slice(5, 7));
  return MESES[m - 1] ?? clave;
}

/** «2027-02-20» → «20/02/2027» (fecha sin hora: se lee tal cual, sin zona). */
export function fechaCorta(dia: string | null): string {
  if (!dia) return "—";
  const [y, m, d] = dia.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
}

/** Una compra (ISO con hora) en el día de Lima: «20/10/2026». */
export function diaDeLima(iso: string | null): string {
  if (!iso) return "—";
  const l = new Date(new Date(iso).getTime() - 5 * 3_600_000);
  return fechaCorta(l.toISOString().slice(0, 10));
}

/** El pedido en texto, para pegarlo en el WhatsApp de la revendedora. */
export function textoParaWhatsApp(c: CotizacionRevendedora, nombre: string | null): string {
  const filas = c.lineas.map((l) => `${l.cantidad} × ${l.nombre} (${soles(l.precioCatalogo)}) → ${soles(l.subtotal)}${l.motivo === "oferta" ? " · oferta" : ""}`);
  const envio = c.envioGratis
    ? "Envío: gratis"
    : c.faltaEnvioGratis != null
      ? `Envío: lo pagas tú (te faltan ${soles(c.faltaEnvioGratis)} para el envío gratis)`
      : "Envío: lo pagas tú";
  return [
    `Pedido${nombre ? ` de ${nombre}` : ""} · ${pct(c.nivel.descuento)} de descuento`,
    "",
    ...filas,
    "",
    `Precio de catálogo: ${soles(c.catalogo)}`,
    `Pagas: ${soles(c.total)}`,
    `Ganas al revender: ${soles(c.ellaGana)}`,
    envio,
    ...(c.cumpleMinimo ? [] : [`Pedido mínimo ${soles(c.pedidoMinimo)}: te faltan ${soles(c.faltaMinimo)}`]),
  ].join("\n");
}
