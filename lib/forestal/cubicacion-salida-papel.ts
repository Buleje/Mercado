/**
 * cubicacion-salida-papel — la CONSTANCIA DE SALIDA de un viaje de una
 * cubicación guardada (Brandon 28-10): una hoja A4 por viaje con la fecha, a
 * quién, el vehículo, la GTF, lo que se llevó por especie × tipo y cuánto
 * queda DESPUÉS de ese viaje, con firmas. PURA y client-safe (la ventana de
 * impresión no tiene los tokens del panel: colores en hex, como el papel de
 * la planilla). El m³ SALE del PT ÷ 424 (`m3DesdePt`).
 */
import { m3DesdePt } from "./cubicacion";
import { fmtM3, fmtPiezas, fmtPt } from "./cubicacion-formato";
import type { CubicacionRegistro } from "./cubicacion-registro";
import { saldoDeLaCubicacion, type Cantidad, type SaldoCubicacion, type SalidaCubicacion } from "./cubicacion-salidas";

/** Lo que hace falta de la guardada (sin pedir el registro entero). */
export type CubicacionConViajes = Pick<CubicacionRegistro, "nombre" | "piezas" | "salidas" | "precioPt" | "cliente">;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Lo que llevó el viaje en total (el m³ sale del PT). */
export function totalDelViaje(s: Pick<SalidaCubicacion, "lineas">): Cantidad {
  const piezas = s.lineas.reduce((a, l) => a + l.piezas, 0);
  const pt = r2(s.lineas.reduce((a, l) => a + l.pt, 0));
  return { piezas, pt, m3: m3DesdePt(pt) };
}

/**
 * El saldo contando los viajes HASTA el `indice` (0 = el primero), en el orden
 * en que se ven en la lista (por fecha y orden de anotación).
 */
export function saldoDespuesDelViaje(c: Pick<CubicacionConViajes, "piezas" | "salidas" | "precioPt">, indice: number): SaldoCubicacion {
  return saldoDeLaCubicacion(c.piezas, (c.salidas ?? []).slice(0, Math.max(0, indice) + 1), c.precioPt);
}

const esc = (s: string | number | null | undefined): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export interface DatosDeLaConstancia {
  c: CubicacionConViajes;
  salida: SalidaCubicacion;
  /** Posición en la lista (0 = el primero). */
  indice: number;
  /** El código de la cubicación («CUB-2026-0003» / «MA-7K3QX»). */
  codigoCubicacion: string;
  /** La fecha del viaje ya escrita («jueves 10/09»). */
  fechaTexto: string;
  negocio?: string;
}

/** El código impreso de la constancia: el de la cubicación + el N° del viaje. */
export const codigoDeConstancia = (codigoCubicacion: string, indice: number): string => `${codigoCubicacion}-V${indice + 1}`;

const cant = (q: Cantidad) => `${fmtPiezas(q.piezas)} pzas · ${fmtM3(q.m3)} m³ · ${fmtPt(q.pt)} PT`;

/** Los casilleros de arriba que tengan dato (sin datos, un renglón en blanco para llenar a mano). */
export function datosDelViaje(c: Pick<CubicacionConViajes, "cliente">, s: SalidaCubicacion): { etiqueta: string; valor: string }[] {
  return [
    { etiqueta: "A quién", valor: s.cliente || c.cliente || "" },
    { etiqueta: "Vehículo", valor: s.vehiculo ?? "" },
    { etiqueta: "Placa", valor: s.placa ?? "" },
    { etiqueta: "Chofer", valor: s.chofer ?? "" },
    { etiqueta: "GTF de salida", valor: s.gtf ?? "" },
    { etiqueta: "Destino", valor: s.destino ?? "" },
  ];
}

export function htmlDeConstanciaDeSalida(d: DatosDeLaConstancia): string {
  const { c, salida: s } = d;
  const codigo = codigoDeConstancia(d.codigoCubicacion, d.indice);
  const total = totalDelViaje(s);
  const saldo = saldoDespuesDelViaje(c, d.indice);
  const filas = s.lineas
    .map((l) => `<tr><td>${esc(l.especie || "Sin especie")}</td><td>${esc(l.tipo)}</td><td class="n">${esc(fmtPiezas(l.piezas))}</td><td class="n">${esc(fmtM3(m3DesdePt(l.pt)))}</td><td class="n">${esc(fmtPt(l.pt))}</td></tr>`)
    .join("");
  const casilleros = datosDelViaje(c, s)
    .map((f) => `<div class="casillero"><span class="etq">${esc(f.etiqueta)}</span><b>${esc(f.valor) || "&nbsp;"}</b></div>`)
    .join("");
  const resumen = [
    { rotulo: "Cubicado", q: saldo.total },
    { rotulo: "Salió hasta hoy", q: saldo.salio },
    { rotulo: "Queda", q: saldo.queda },
  ].map((x) => `<div class="saldo-caja"><span class="etq">${esc(x.rotulo)}</span><b>${esc(fmtM3(x.q.m3))} m³</b><span>${esc(fmtPiezas(x.q.piezas))} pzas · ${esc(fmtPt(x.q.pt))} PT</span></div>`).join("");
  const firmas = ["Entrega", "Recibe", "Chofer"].map((f) => `<div class="firma"><span>${f}</span></div>`).join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>${esc(`Constancia de salida ${codigo}`)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #111827; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hoja { width: 186mm; min-height: 270mm; display: flex; flex-direction: column; gap: 5mm; }
  .titulo { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; }
  h1 { font-size: 17pt; margin: 0; }
  .desc { font-size: 10pt; margin: 1.5mm 0 0; color: #374151; }
  .negocio { font-size: 10pt; font-weight: bold; text-align: right; }
  .derecha { display: flex; flex-direction: column; align-items: flex-end; gap: 1.5mm; }
  .codigo { border: 0.45mm solid #111827; padding: 0.8mm 2.5mm; text-align: center; line-height: 1.1; }
  .codigo .etq { display: block; font-size: 6pt; }
  .codigo b { font: bold 13pt "Courier New", monospace; letter-spacing: .6pt; }
  .etq { font-size: 7pt; color: #374151; text-transform: uppercase; letter-spacing: .3pt; }
  .fecha { font-size: 12pt; font-weight: bold; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; }
  .casillero { border: 0.3mm solid #111827; padding: 1mm 2mm; min-height: 11mm; display: flex; flex-direction: column; }
  .casillero b { font-size: 10.5pt; margin-top: 0.8mm; overflow-wrap: anywhere; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 0.3mm solid #111827; padding: 1.5mm 2mm; font-size: 10pt; text-align: left; }
  th { background: #f3f4f6; font-size: 9pt; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tfoot td { font-weight: bold; background: #f3f4f6; }
  .notas { font-size: 9.5pt; margin: 0; }
  .saldo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; }
  .saldo-caja { border: 0.3mm solid #111827; padding: 1.5mm 2mm; display: flex; flex-direction: column; gap: 0.6mm; font-size: 8.5pt; }
  .saldo-caja b { font-size: 13pt; }
  .firmas { margin-top: auto; padding-top: 22mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10mm; }
  .firma { border-top: 0.3mm solid #111827; padding-top: 1.5mm; text-align: center; font-size: 9pt; }
  .pie { font-size: 8pt; color: #374151; display: flex; justify-content: space-between; }
</style></head>
<body><section class="hoja">
  <header class="titulo">
    <div><h1>Constancia de salida</h1><p class="desc">Cubicación «${esc(c.nombre)}» · ${esc(d.codigoCubicacion)} · viaje ${d.indice + 1} de ${(c.salidas ?? []).length}</p><p class="fecha">${esc(d.fechaTexto)}</p></div>
    <div class="derecha">${d.negocio ? `<div class="negocio">${esc(d.negocio)}</div>` : ""}<div class="codigo"><span class="etq">Código de la constancia</span><b>${esc(codigo)}</b></div></div>
  </header>
  <div class="grid">${casilleros}</div>
  <table>
    <thead><tr><th>Especie</th><th>Tipo</th><th class="n">Piezas</th><th class="n">m³</th><th class="n">PT</th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><td colspan="2">Total del viaje</td><td class="n">${esc(fmtPiezas(total.piezas))}</td><td class="n">${esc(fmtM3(total.m3))}</td><td class="n">${esc(fmtPt(total.pt))}</td></tr></tfoot>
  </table>
  ${s.notas ? `<p class="notas"><b>Notas:</b> ${esc(s.notas)}</p>` : ""}
  <div class="saldo" data-saldo>${resumen}</div>
  <p class="notas">Saldo contado hasta este viaje inclusive (${esc(cant(saldo.queda))} en el patio).</p>
  <div class="firmas">${firmas}</div>
  <footer class="pie"><span>${esc(codigo)}</span><span>m³ = pie tablar ÷ 424</span></footer>
</section></body></html>`;
}
