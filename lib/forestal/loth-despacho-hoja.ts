/**
 * loth-despacho-hoja — la HOJA DE DESPACHO de una guía del Libro TH (QR3,
 * 08-10): lo que sube al camión, troza por troza, con D1/D2/Largo/m³ (los de
 * SU trozado, como la vista «Por guía») y el total; y UN QR que abre la lista
 * pública de esa guía (`/verificar/guia/<id de una de sus líneas>`), para que
 * el puesto de control contraste la carga con el libro sin llamar a nadie.
 *
 * Blanco y negro (fotocopia/térmica ancha). La hoja no lleva DNI ni teléfonos;
 * la lista pública tampoco.
 *
 * PURO salvo `imprimirHojaDespacho` (base pública + QR + ventana).
 */

import type { LothEntryDTO } from "./loth-constants";
import { medidasDeLinea } from "./loth-despacho-medidas";
import { diaCorto } from "./loth-aprovechamiento";
import { filaAnulada, type FilaPorGuia } from "./loth-despacho-por-guia";
import { esc, openCtpReport } from "./ctp-print-shared";
import { fmtM3 } from "./cubicacion-formato";
import { urlVerificarGuiaLoth } from "@/lib/tenant-url-publica";
import { obtenerBaseVerificacion } from "@/lib/base-verificacion-cliente";

const m = (v: string | null, dp: number) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(dp));

/** La línea cuyo id lleva el QR: la primera vigente (si todas están anuladas, la primera). */
export function lineaDelQr(f: Pick<FilaPorGuia, "lineas">): LothEntryDTO | null {
  return f.lineas.find((e) => e.status !== "anulado") ?? f.lineas[0] ?? null;
}

export interface PermisoDeLaHoja {
  tituloHabilitante: string | null;
  planNumber: string | null;
  titular: string | null;
}

/** El cuerpo HTML de la hoja (puro). `qrSvg`/`url` = el QR a la lista pública. */
export function htmlHojaDespacho(f: FilaPorGuia, opts: { qrSvg: string; url: string; permiso: PermisoDeLaHoja }): string {
  const vigentes = f.lineas.filter((e) => e.status !== "anulado");
  const anulada = filaAnulada(f);
  const filas = (anulada ? f.lineas : vigentes)
    .map((e, i) => {
      const md = medidasDeLinea(e);
      return `<tr><td class="num">${i + 1}</td><td class="cod">${esc(e.trozaCode ?? "—")}</td><td>${esc(md.especie ?? "—")}</td>
        <td class="num">${m(md.d1, 2)}</td><td class="num">${m(md.d2, 2)}</td><td class="num">${m(md.largo, 2)}</td><td class="num b">${m(md.m3, 3)}</td></tr>`;
    })
    .join("");
  const n = anulada ? f.anuladas : f.trozas;
  const m3 = anulada ? f.m3Anuladas : f.m3;
  const p = opts.permiso;
  const dato = (k: string, v: string | null | undefined) => `<div><span class="k">${k}</span> ${esc(v?.trim() || "—")}</div>`;
  return `<div class="cab">
    <div>
      <h1>Hoja de despacho · GTF ${esc(f.gtfNumber ?? "sin número")}</h1>
      <p class="sub">${f.fecha ? esc(diaCorto(f.fecha)) : "—"} · ${n} troza${n === 1 ? "" : "s"} · ${esc(fmtM3(m3))} m³${anulada ? " · GUÍA ANULADA" : ""}</p>
      <div class="id">
        ${dato("Título habilitante", p.tituloHabilitante)}
        ${dato("Plan", p.planNumber)}
        ${dato("Titular", p.titular)}
        ${dato("Especie", f.especies.join(", "))}
        ${dato("Destino", f.guia?.destino)}
        ${dato("Llegada", f.guia?.llegada)}
        ${dato("Placa", f.guia?.placa)}
      </div>
    </div>
    <figure class="qr">${opts.qrSvg}<figcaption>Escanea para ver la lista de esta guía en el libro</figcaption></figure>
  </div>
  <table>
    <thead><tr><th class="num">N°</th><th>Código</th><th>Especie</th><th class="num">D1 (m)</th><th class="num">D2 (m)</th><th class="num">Largo (m)</th><th class="num">m³</th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><td colspan="6"><b>Total · ${n} troza${n === 1 ? "" : "s"}</b>${f.sinMedida > 0 ? ` (${f.sinMedida} sin medida, no suman)` : ""}</td><td class="num b">${esc(fmtM3(m3))}</td></tr></tfoot>
  </table>
  <p class="foot">Medidas de la línea de Trozado de cada troza (Libro de Operaciones TH, RDE 264-2019). Lista en línea: ${esc(opts.url)}</p>`;
}

/** Blanco y negro: el CSS base del reporte pinta verdes y grises claros que la fotocopia se come. */
export const CSS_HOJA_DESPACHO = `
  body{color:#000;border:0}
  h1{color:#000} .sub{color:#000;font-weight:600}
  .cab{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
  .id{background:#fff;border:1px solid #000;border-left:4px solid #000;grid-template-columns:1fr 1fr}
  .id .k{color:#000;min-width:132px}
  .qr{margin:0;width:42mm;flex-shrink:0;text-align:center}
  .qr svg{display:block;width:42mm;height:42mm}
  .qr figcaption{font-size:10px;line-height:1.3;margin-top:4px}
  th{background:#fff;color:#000;border:1px solid #000;border-bottom:2px solid #000}
  td{border:1px solid #000} tbody tr:nth-child(even) td{background:#fff}
  .cod{font-family:"Courier New",monospace;font-weight:800;font-size:14px}
  .b{font-weight:800} tfoot td{border-top:2px solid #000}
  .foot{color:#000;border-top:1px solid #000;word-break:break-all}
`;

/**
 * Abre la hoja. La ventana se abre en el clic (`ventana`); acá se espera la
 * base pública del negocio y se arma el QR. Error = texto para la persona.
 */
export async function imprimirHojaDespacho(
  f: FilaPorGuia,
  opts: { ventana: Window | null; permiso: PermisoDeLaHoja },
): Promise<void> {
  const linea = lineaDelQr(f);
  if (!linea || !f.gtfNumber) throw new Error("Esta fila no tiene N° de guía: la hoja sale de una guía.");
  const url = urlVerificarGuiaLoth(await obtenerBaseVerificacion(), linea.id);
  const QR = (await import("qrcode")).default;
  const qrSvg = await QR.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  openCtpReport({
    title: `Hoja de despacho · GTF ${f.gtfNumber}`,
    css: CSS_HOJA_DESPACHO,
    body: htmlHojaDespacho(f, { qrSvg, url, permiso: opts.permiso }),
    ventana: opts.ventana,
  });
}
