"use client";

/**
 * lote-certificado.ts — certificado imprimible + etiqueta de un lote comercial
 * forestal (ADR-136). Mismo patrón que ctp-certificado / loth-labels:
 * window.open + print, QR real vía `qrcode`.
 *
 * El certificado exige cadena de custodia completa (gate ADR-135 D3, heredado):
 * un lote cuyas corridas no tienen todas su materia prima atribuida no puede
 * afirmar un origen que los datos no sostienen.
 *
 * Ni el certificado ni la etiqueta incluyen costos: son documentos para el
 * comprador/fiscalizador, no información interna de la planta.
 */

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n4 = (v: number) => v.toFixed(4);

export interface LoteCertData {
  id: string;
  loteCode: string;
  productType: string | null;
  speciesCommon: string | null;
  speciesScientific: string | null;
  cites: boolean;
  unitLabel: string;
  grade: string | null;
  destino: string | null;
}

export interface LoteCertCadena {
  completa: boolean;
  totalCantidad: number;
  corridas: { lineNo: number; quantity: number; guias: string[] }[];
}

export interface LoteCertEmisor {
  businessName: string | null;
  ruc?: string | null;
}

async function qrPara(id: string): Promise<{ url: string; dataUrl: string }> {
  const url = `${window.location.origin}/verificar/lote/${encodeURIComponent(id)}`;
  const QR = (await import("qrcode")).default;
  const dataUrl = await QR.toDataURL(url, { margin: 1, width: 180, errorCorrectionLevel: "M" });
  return { url, dataUrl };
}

function abrir(html: string, errCtx: string): void {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error(`El navegador bloqueó la ventana. Permití pop-ups para ${errCtx}.`);
  w.document.write(html);
  w.document.close();
  w.focus();
}

export async function printCertificadoLote(
  lote: LoteCertData,
  cadena: LoteCertCadena,
  emisor: LoteCertEmisor,
): Promise<void> {
  if (!cadena.completa) {
    throw new Error("La cadena de custodia del lote no está completa: no se puede emitir el certificado.");
  }
  const { url, dataUrl } = await qrPara(lote.id);
  const emitido = new Date();
  const fecha = emitido.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
  const hora = emitido.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const totalGuias = new Set(cadena.corridas.flatMap((c) => c.guias)).size;

  const filas = cadena.corridas
    .map(
      (c) => `<tr>
        <td class="mono">#${c.lineNo}</td>
        <td class="mono right">${n4(c.quantity)} ${esc(lote.unitLabel)}</td>
        <td class="mono">${c.guias.length ? c.guias.map(esc).join(" · ") : "—"}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Certificado de lote ${esc(lote.loteCode)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; color: #1f2937; font-size: 13px; line-height: 1.55; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px double #14532d; padding-bottom: 12px; }
    .emp { font-size: 17px; font-weight: 700; }
    .ruc { font-size: 11px; color: #4b5563; }
    .nro { text-align: right; font-size: 11px; color: #4b5563; }
    .nro b { display: block; font-size: 16px; color: #14532d; font-family: monospace; }
    h1 { text-align: center; font-size: 20px; letter-spacing: 2px; color: #14532d; margin: 26px 0 2px; }
    .sub { text-align: center; font-size: 11px; color: #6b7280; margin: 0 0 22px; text-transform: uppercase; letter-spacing: 1px; }
    .decl { text-align: justify; margin: 0 0 18px; }
    .box { border: 1.5px solid #14532d; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
    .box h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #14532d; margin: 0 0 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
    .lbl { font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #14532d; border-bottom: 1.5px solid #14532d; padding: 4px 6px; }
    td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; }
    .mono { font-family: monospace; font-variant-numeric: tabular-nums; }
    .right { text-align: right; }
    .cites { color: #b91c1c; font-weight: 700; }
    .firma { margin-top: 48px; display: flex; justify-content: space-between; gap: 40px; }
    .firma div { flex: 1; text-align: center; border-top: 1px solid #374151; padding-top: 6px; font-size: 11px; color: #4b5563; }
    .verif { margin-top: 22px; display: flex; align-items: center; gap: 14px; border: 1px dashed #14532d; border-radius: 8px; padding: 10px 14px; }
    .verif img { width: 86px; height: 86px; }
    .verif .vt { font-size: 11px; color: #374151; line-height: 1.5; }
    .verif .vt b { color: #14532d; }
    .verif .vu { font-family: monospace; font-size: 9px; color: #6b7280; word-break: break-all; }
    .foot { margin-top: 20px; font-size: 9.5px; color: #9ca3af; border-top: 1px dashed #d1d5db; padding-top: 8px; }
  </style></head><body>
    <div class="head">
      <div>
        <div class="emp">${esc(emisor.businessName || "Centro de Transformación Primaria")}</div>
        ${emisor.ruc ? `<div class="ruc">RUC ${esc(emisor.ruc)}</div>` : ""}
      </div>
      <div class="nro">Lote N°<b>${esc(lote.loteCode)}</b>${esc(fecha)} · ${esc(hora)}</div>
    </div>

    <h1>CERTIFICADO DE LOTE</h1>
    <p class="sub">Producción forestal · Cadena de custodia · ADR-136</p>

    <p class="decl">Se certifica que el lote de producto forestal detallado cuenta con
    <b>cadena de custodia completa</b>: sus ${cadena.corridas.length}
    ${cadena.corridas.length === 1 ? "corrida de producción tiene" : "corridas de producción tienen"} su
    materia prima identificada por ${totalGuias === 1 ? "guía de transporte forestal (GTF) de ingreso" : `${totalGuias} guías de transporte forestal (GTF) de ingreso`},
    con un total de ${n4(cadena.totalCantidad)} ${esc(lote.unitLabel)}.</p>

    <div class="box">
      <h2>Datos del lote</h2>
      <div class="grid">
        <div><span class="lbl">Producto</span><br/><b>${esc(lote.productType ?? "—")}</b></div>
        <div><span class="lbl">Especie</span><br/><b>${esc(lote.speciesCommon ?? "—")}</b>${lote.speciesScientific ? ` <i>(${esc(lote.speciesScientific)})</i>` : ""}${lote.cites ? ' <span class="cites">· CITES</span>' : ""}</div>
        <div><span class="lbl">Cantidad total</span><br/><b class="mono">${n4(cadena.totalCantidad)} ${esc(lote.unitLabel)}</b></div>
        <div><span class="lbl">Grado de calidad</span><br/><b>${esc(lote.grade ?? "—")}</b></div>
        <div><span class="lbl">Destino / comprador</span><br/><b>${esc(lote.destino ?? "—")}</b></div>
      </div>
    </div>

    <div class="box">
      <h2>Cadena de custodia — corridas del lote</h2>
      <table>
        <thead><tr><th>Corrida de producción</th><th class="right">Cantidad</th><th>Guías GTF de ingreso (materia prima)</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>

    <div class="firma">
      <div>Responsable del CTP</div>
      <div>Recibí conforme</div>
    </div>

    <div class="verif">
      <img src="${dataUrl}" alt="QR de verificación" />
      <div class="vt">
        <b>Verificable en línea:</b> escaneá el QR para contrastar este lote y su cadena
        de custodia en vivo contra el Libro de Operaciones del establecimiento.
        <div class="vu">${esc(url)}</div>
      </div>
    </div>

    <p class="foot">Documento interno de lote generado desde el módulo de Lotes de Producción.
    No reemplaza a la GTF ni al LOE-CTP oficial de SERFOR. Verificable contra el libro: lote ${esc(lote.loteCode)}.</p>
    <script>setTimeout(function(){ window.print(); }, 400);</script>
  </body></html>`;

  abrir(html, "imprimir el certificado");
}

/** Etiqueta A6 pegable para el lote físico: código grande + QR + datos clave. */
export async function printEtiquetaLote(lote: LoteCertData, totalCantidad: number): Promise<void> {
  const { dataUrl } = await qrPara(lote.id);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiqueta ${esc(lote.loteCode)}</title>
  <style>
    @page { size: A6 landscape; margin: 6mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; color: #111827; }
    .label { border: 2px solid #14532d; border-radius: 10px; padding: 12px 14px; height: 88mm; display: flex; flex-direction: column; justify-content: space-between; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .code { font-size: 30px; font-weight: 800; letter-spacing: -0.5px; color: #14532d; }
    .prod { font-size: 14px; color: #374151; margin-top: 2px; }
    .sp { font-size: 13px; color: #4b5563; }
    .cites { color: #b91c1c; font-weight: 700; font-size: 11px; }
    .qr { width: 90px; height: 90px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 12px; }
    .meta .k { color: #6b7280; }
    .meta b { font-variant-numeric: tabular-nums; }
    .foot { font-size: 9px; color: #6b7280; border-top: 1px dashed #d1d5db; padding-top: 4px; text-align: center; }
  </style></head><body>
    <div class="label">
      <div class="top">
        <div>
          <div class="code">${esc(lote.loteCode)}</div>
          <div class="prod">${esc(lote.productType ?? "Producto forestal")}</div>
          <div class="sp">${esc(lote.speciesCommon ?? "")}${lote.cites ? ' <span class="cites">CITES</span>' : ""}</div>
        </div>
        <img class="qr" src="${dataUrl}" alt="QR ${esc(lote.loteCode)}" />
      </div>
      <div class="meta">
        <div><span class="k">Cantidad</span><br/><b>${n4(totalCantidad)} ${esc(lote.unitLabel)}</b></div>
        <div><span class="k">Grado</span><br/><b>${esc(lote.grade ?? "—")}</b></div>
        <div><span class="k">Destino</span><br/><b>${esc(lote.destino ?? "—")}</b></div>
        <div><span class="k">Científico</span><br/><b>${esc(lote.speciesScientific ?? "—")}</b></div>
      </div>
      <div class="foot">Escaneá el QR para verificar el origen · Libro de Operaciones CTP</div>
    </div>
    <script>setTimeout(function(){ window.print(); }, 400);</script>
  </body></html>`;

  abrir(html, "imprimir la etiqueta");
}
