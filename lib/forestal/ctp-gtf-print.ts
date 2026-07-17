"use client";

/**
 * ctp-gtf-print.ts — Guía de Transporte Forestal (GTF) de SALIDA imprimible.
 *
 * El CTP está habilitado a emitir su propia GTF para movilizar el producto que
 * despacha (FAQ GTF · SERFOR). Este documento la arma con la identidad legal del
 * CTP (Ficha), el número formal serie+correlativo ya asignado (`emitirGtf`), el
 * detalle del producto y — si está disponible — el origen (cadena de custodia),
 * más un QR de verificación pública contra el Libro.
 *
 * NO reemplaza el formato/talonario oficial de la ARFFS: lo complementa con un
 * número trazable de la serie autorizada. Mismo patrón de impresión que
 * `ctp-certificado.ts` (window.open + print).
 */

import type { CtpFicha } from "@/lib/forestal/ctp-ficha-types";

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n4 = (v: number) => v.toFixed(4);

export interface GtfDespacho {
  /** id del despacho — target del QR de verificación pública. */
  id: string;
  lineNo: number;
  entryDate: string;
  productType: string | null;
  speciesCommon: string | null;
  speciesScientific: string | null;
  cites: boolean;
  quantity: string | null;
  unitLabel: string;
  pieces: number | null;
  /** N° de GTF formal ya asignado (serie-correlativo). */
  gtfNumber: string | null;
  destino: string | null;
}

export interface GtfCadena {
  corridas: { lineNo: number; quantity: number; guias: string[] }[];
}

export async function printGtfSalida(
  despacho: GtfDespacho,
  ficha: CtpFicha,
  cadena: GtfCadena | null,
): Promise<void> {
  if (!despacho.gtfNumber) {
    throw new Error("El despacho todavía no tiene GTF emitida. Emití la GTF antes de imprimirla.");
  }

  const verifyUrl = `${window.location.origin}/verificar/despacho/${encodeURIComponent(despacho.id)}`;
  const QR = (await import("qrcode")).default;
  const qrDataUrl = await QR.toDataURL(verifyUrl, { margin: 1, width: 180, errorCorrectionLevel: "M" });

  const emitido = new Date();
  const fecha = emitido.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
  const hora = emitido.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  // timeZone UTC: entryDate es date-only a medianoche UTC (off-by-one Lima).
  const fechaDespacho = new Date(despacho.entryDate).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });

  const titulos = ficha.titulos?.length
    ? ficha.titulos.map((t) => esc(t.codigo || "—")).join(" · ")
    : "—";
  const direccion = [ficha.direccion, ficha.distrito, ficha.provincia, ficha.region].filter(Boolean).map(esc).join(", ") || "—";

  const filas = (cadena?.corridas ?? [])
    .map(
      (c) => `<tr>
        <td class="mono">#${c.lineNo}</td>
        <td class="mono right">${n4(c.quantity)} ${esc(despacho.unitLabel)}</td>
        <td class="mono">${c.guias.length ? c.guias.map(esc).join(" · ") : "—"}</td>
      </tr>`,
    )
    .join("");

  const origenBox = cadena && cadena.corridas.length
    ? `<div class="box">
        <h2>Origen del producto (cadena de custodia)</h2>
        <table>
          <thead><tr><th>Corrida de producción</th><th class="right">Cantidad</th><th>Guías GTF de ingreso</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`
    : "";

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>GTF ${esc(despacho.gtfNumber)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; color: #1f2937; font-size: 12.5px; line-height: 1.5; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px double #14532d; padding-bottom: 10px; }
    .emp { font-size: 16px; font-weight: 700; }
    .meta { font-size: 10.5px; color: #4b5563; }
    .nro { text-align: right; font-size: 10.5px; color: #4b5563; }
    .nro b { display: block; font-size: 16px; color: #14532d; font-family: monospace; letter-spacing: 1px; }
    h1 { text-align: center; font-size: 18px; letter-spacing: 1.5px; color: #14532d; margin: 20px 0 2px; }
    .sub { text-align: center; font-size: 10px; color: #6b7280; margin: 0 0 18px; text-transform: uppercase; letter-spacing: 1px; }
    .box { border: 1.5px solid #14532d; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; }
    .box h2 { font-size: 10.5px; text-transform: uppercase; letter-spacing: 1px; color: #14532d; margin: 0 0 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
    .lbl { font-size: 9.5px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; }
    b { color: #111827; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #14532d; border-bottom: 1.5px solid #14532d; padding: 4px 6px; }
    td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; }
    .mono { font-family: monospace; font-variant-numeric: tabular-nums; }
    .right { text-align: right; }
    .cites { color: #b91c1c; font-weight: 700; }
    .firma { margin-top: 40px; display: flex; justify-content: space-between; gap: 40px; }
    .firma div { flex: 1; text-align: center; border-top: 1px solid #374151; padding-top: 6px; font-size: 10.5px; color: #4b5563; }
    .verif { margin-top: 18px; display: flex; align-items: center; gap: 14px; border: 1px dashed #14532d; border-radius: 8px; padding: 10px 14px; }
    .verif img { width: 82px; height: 82px; }
    .verif .vt { font-size: 10.5px; color: #374151; line-height: 1.5; }
    .verif .vt b { color: #14532d; }
    .verif .vu { font-family: monospace; font-size: 9px; color: #6b7280; word-break: break-all; }
    .foot { margin-top: 16px; font-size: 9px; color: #9ca3af; border-top: 1px dashed #d1d5db; padding-top: 8px; }
  </style></head><body>
    <div class="head">
      <div>
        <div class="emp">${esc(ficha.nombreCtp || ficha.razonSocial || "Centro de Transformación Primaria")}</div>
        <div class="meta">${ficha.razonSocial ? `${esc(ficha.razonSocial)} · ` : ""}${ficha.ruc ? `RUC ${esc(ficha.ruc)}` : ""}</div>
        <div class="meta">Código de CTP: <b>${esc(ficha.codigoCtp || "—")}</b>${ficha.arffs ? ` · ${esc(ficha.arffs)}` : ""}</div>
        <div class="meta">${esc(direccion)}</div>
      </div>
      <div class="nro">Guía N°<b>${esc(despacho.gtfNumber)}</b>Emitida ${esc(fecha)} · ${esc(hora)}</div>
    </div>

    <h1>GUÍA DE TRANSPORTE FORESTAL</h1>
    <p class="sub">Producto con transformación primaria · Salida del CTP</p>

    <div class="box">
      <h2>Emisor y habilitación</h2>
      <div class="grid">
        <div><span class="lbl">Representante legal</span><br/><b>${esc(ficha.representante || "—")}</b></div>
        <div><span class="lbl">Registro ARFFS</span><br/><b>${esc([ficha.registroArffs, ficha.registroArffsFecha].filter(Boolean).join(" · ") || "—")}</b></div>
        <div style="grid-column:1/-1"><span class="lbl">Títulos habilitantes (origen de la materia prima)</span><br/><b class="mono">${titulos}</b></div>
      </div>
    </div>

    <div class="box">
      <h2>Producto transportado</h2>
      <div class="grid">
        <div><span class="lbl">Fecha de despacho</span><br/><b>${esc(fechaDespacho)}</b></div>
        <div><span class="lbl">Tipo de producto</span><br/><b>${esc(despacho.productType ?? "—")}</b></div>
        <div><span class="lbl">Especie</span><br/><b>${esc(despacho.speciesCommon ?? "—")}</b>${despacho.speciesScientific ? ` <i>(${esc(despacho.speciesScientific)})</i>` : ""}${despacho.cites ? ' <span class="cites">· CITES</span>' : ""}</div>
        <div><span class="lbl">Cantidad</span><br/><b class="mono">${despacho.quantity ? n4(Number(despacho.quantity)) : "—"} ${esc(despacho.unitLabel)}</b>${despacho.pieces ? ` · ${despacho.pieces} piezas` : ""}</div>
        <div style="grid-column:1/-1"><span class="lbl">Destino</span><br/><b>${esc(despacho.destino ?? "—")}</b></div>
      </div>
    </div>

    ${origenBox}

    <div class="firma">
      <div>Responsable del CTP (emisor)</div>
      <div>Transportista</div>
      <div>Recibí conforme (destino)</div>
    </div>

    <div class="verif">
      <img src="${qrDataUrl}" alt="QR de verificación" />
      <div class="vt">
        <b>Verificable en línea:</b> escaneá el QR para contrastar el origen de este producto
        en vivo contra el Libro de Operaciones del CTP.
        <div class="vu">${esc(verifyUrl)}</div>
      </div>
    </div>

    <p class="foot">Guía de transporte forestal emitida desde el Libro de Operaciones del CTP bajo la serie autorizada por la ARFFS.
    Complementa —no reemplaza— el formato/talonario oficial de la Autoridad Regional Forestal. Referencia interna: despacho línea #${despacho.lineNo}.</p>
    <script>setTimeout(function(){ window.print(); }, 400);</script>
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permití pop-ups para imprimir la GTF.");
  w.document.write(html);
  w.document.close();
  w.focus();
}
