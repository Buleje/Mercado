/**
 * cubicacion-salida-whatsapp — el aviso corto de UN viaje para el comprador
 * (Brandon 28-10). PURO. Nunca envía nada: el enlace `wa.me` lo arma
 * `enlaceWhatsApp` (cubicacion-whatsapp.ts) y la persona toca «enviar».
 */
import { m3DesdePt } from "./cubicacion";
import { fmtM3, fmtPiezas, fmtPt } from "./cubicacion-formato";
import type { SalidaCubicacion } from "./cubicacion-salidas";
import { saldoDespuesDelViaje, totalDelViaje, type CubicacionConViajes } from "./cubicacion-salida-papel";

/** «Hoy 28/10» si el viaje es de hoy; si no, «El jueves 10/09» (`fechaTexto` ya escrita). */
export function cuandoSalio(fecha: string, fechaTexto: string, hoyKey: string): string {
  if (fecha === hoyKey) {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(fecha);
    return m ? `Hoy ${m[2]}/${m[1]}` : "Hoy";
  }
  return `El ${fechaTexto}`;
}

const unir = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** «en el camión ABC-123» / «en el vehículo ABC-123» / «» si no hay nada. */
export function enQueSalio(s: Pick<SalidaCubicacion, "vehiculo" | "placa">): string {
  const veh = s.vehiculo?.trim();
  const placa = s.placa?.trim();
  if (!veh && !placa) return "";
  const articulo = veh && /^(camioneta|chata|carreta)/i.test(veh) ? "la" : "el";
  return ` en ${articulo} ${[veh ? veh.toLowerCase() : "vehículo", placa].filter(Boolean).join(" ")}`;
}

/**
 * «Hoy 28/10 salieron 10 pzas de Tornillo Comercial (0,315 m³, 133 PT) en el
 * camión ABC-123. De tu madera quedan 1,965 m³ (80 pzas).» — el saldo es el de
 * DESPUÉS de ese viaje.
 */
export function textoWhatsAppDeSalida(
  c: CubicacionConViajes,
  salida: SalidaCubicacion,
  indice: number,
  fechaTexto: string,
  hoyKey: string,
): string {
  const lineas = salida.lineas.map((l) =>
    `${fmtPiezas(l.piezas)} pzas de ${[l.especie || "madera", l.tipo].join(" ")} (${fmtM3(m3DesdePt(l.pt))} m³, ${fmtPt(l.pt)} PT)`);
  const verbo = salida.lineas.length === 1 && salida.lineas[0].piezas === 1 ? "salió" : "salieron";
  const total = totalDelViaje(salida);
  const que = lineas.length > 1 ? `${unir(lineas)}; en total ${fmtM3(total.m3)} m³` : lineas[0];
  const queda = saldoDespuesDelViaje(c, indice).queda;
  const cierre = queda.piezas === 0 && queda.pt < 1
    ? "Con esto salió toda tu madera."
    : `De tu madera quedan ${fmtM3(queda.m3)} m³ (${fmtPiezas(queda.piezas)} pzas).`;
  return `${cuandoSalio(salida.fecha, fechaTexto, hoyKey)} ${verbo} ${que}${enQueSalio(salida)}. ${cierre}`;
}
