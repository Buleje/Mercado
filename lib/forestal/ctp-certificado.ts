"use client";

/**
 * ctp-certificado.ts — Certificado de trazabilidad imprimible de un despacho
 * (ADR-135 D3). El LIBRO admite huecos en la atribución (I4 es `≤`); el
 * CERTIFICADO no: acá vive el gate. Este módulo se niega a imprimir una
 * cadena incompleta — la UI deshabilita el botón, esto es la defensa en
 * profundidad.
 *
 * El documento NO incluye costos: el COGS es información interna de la
 * planta; el certificado es para el cliente / fiscalizador.
 *
 * Mismo patrón de impresión que `loth-labels.ts` (window.open + print).
 */

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n4 = (v: number) => v.toFixed(4);

export interface CertificadoDespacho {
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
  gtfNumber: string | null;
  destino: string | null;
}

export interface CertificadoCadena {
  completa: boolean;
  declarado: number;
  atribuido: number;
  corridas: { lineNo: number; quantity: number; guias: string[] }[];
}

export interface CertificadoEmisor {
  businessName: string | null;
  ruc?: string | null;
  /** Identidad legal SERFOR (Ficha del CTP) — le da peso fiscalizable al header. */
  codigoCtp?: string | null;
  arffs?: string | null;
  direccion?: string | null;
}

export async function printCertificadoTrazabilidad(
  despacho: CertificadoDespacho,
  cadena: CertificadoCadena,
  emisor: CertificadoEmisor,
): Promise<void> {
  // Gate ADR-135 D3: sin cadena completa no hay certificado. Nunca se emite
  // un documento que afirme una trazabilidad que los datos no sostienen.
  if (!cadena.completa) {
    throw new Error("La cadena de custodia no está completa: no se puede emitir el certificado.");
  }

  // QR → /verificar/despacho/[id]: el receptor escanea y contrasta la cadena
  // EN VIVO contra el libro, sin confiar en el papel (mismo patrón que las
  // etiquetas de trozas). QR real vía `qrcode`, como loth-labels.
  const verifyUrl = `${window.location.origin}/verificar/despacho/${encodeURIComponent(despacho.id)}`;
  const QR = (await import("qrcode")).default;
  const qrDataUrl = await QR.toDataURL(verifyUrl, { margin: 1, width: 180, errorCorrectionLevel: "M" });

  const emitido = new Date();
  const fecha = emitido.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
  const hora = emitido.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const nroCert = `CTP-D${despacho.lineNo}-${emitido.getFullYear()}${String(emitido.getMonth() + 1).padStart(2, "0")}${String(emitido.getDate()).padStart(2, "0")}`;
  // timeZone UTC: entryDate es date-only a medianoche UTC — sin esto el
  // certificado decía "28" cuando el libro registró "29" (off-by-one Lima).
  const fechaDespacho = new Date(despacho.entryDate).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
  const totalGuias = new Set(cadena.corridas.flatMap((c) => c.guias)).size;

  const filas = cadena.corridas
    .map(
      (c) => `<tr>
        <td class="mono">#${c.lineNo}</td>
        <td class="mono right">${n4(c.quantity)} ${esc(despacho.unitLabel)}</td>
        <td class="mono">${c.guias.length ? c.guias.map(esc).join(" · ") : "—"}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Certificado de trazabilidad ${esc(nroCert)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; color: #1f2937; font-size: 13px; line-height: 1.55; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px double #14532d; padding-bottom: 12px; }
    .emp { font-size: 17px; font-weight: 700; }
    .ruc { font-size: 11px; color: #4b5563; }
    .nro { text-align: right; font-size: 11px; color: #4b5563; }
    .nro b { display: block; font-size: 14px; color: #14532d; font-family: monospace; }
    h1 { text-align: center; font-size: 20px; letter-spacing: 2px; color: #14532d; margin: 26px 0 2px; }
    .sub { text-align: center; font-size: 11px; color: #6b7280; margin: 0 0 22px; text-transform: uppercase; letter-spacing: 1px; }
    .decl { text-align: justify; margin: 0 0 18px; }
    .box { border: 1.5px solid #14532d; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
    .box h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #14532d; margin: 0 0 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
    .grid div b { color: #111827; }
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
        ${emisor.codigoCtp ? `<div class="ruc">Código de CTP: ${esc(emisor.codigoCtp)}${emisor.arffs ? ` · ${esc(emisor.arffs)}` : ""}</div>` : ""}
        ${emisor.direccion ? `<div class="ruc">${esc(emisor.direccion)}</div>` : ""}
      </div>
      <div class="nro">Certificado N°<b>${esc(nroCert)}</b>${esc(fecha)} · ${esc(hora)}</div>
    </div>

    <h1>CERTIFICADO DE TRAZABILIDAD</h1>
    <p class="sub">Cadena de custodia · Libro de Operaciones CTP</p>

    <p class="decl">Se certifica que el producto forestal detallado a continuación cuenta con
    <b>cadena de custodia completa</b>: el 100% del volumen despachado
    (${n4(cadena.atribuido)} de ${n4(cadena.declarado)} ${esc(despacho.unitLabel)}) está atribuido a
    ${cadena.corridas.length} ${cadena.corridas.length === 1 ? "corrida de producción registrada" : "corridas de producción registradas"},
    y cada corrida tiene su materia prima identificada por ${totalGuias === 1 ? "guía de transporte forestal (GTF) de ingreso" : `${totalGuias} guías de transporte forestal (GTF) de ingreso`}.</p>

    <div class="box">
      <h2>Producto despachado</h2>
      <div class="grid">
        <div><span class="lbl">Fecha de despacho</span><br/><b>${esc(fechaDespacho)}</b></div>
        <div><span class="lbl">Producto</span><br/><b>${esc(despacho.productType ?? "—")}</b></div>
        <div><span class="lbl">Especie</span><br/><b>${esc(despacho.speciesCommon ?? "—")}</b>${despacho.speciesScientific ? ` <i>(${esc(despacho.speciesScientific)})</i>` : ""}${despacho.cites ? ' <span class="cites">· CITES</span>' : ""}</div>
        <div><span class="lbl">Cantidad</span><br/><b class="mono">${despacho.quantity ? n4(Number(despacho.quantity)) : "—"} ${esc(despacho.unitLabel)}</b>${despacho.pieces ? ` · ${despacho.pieces} piezas` : ""}</div>
        <div><span class="lbl">GTF de salida</span><br/><b class="mono">${esc(despacho.gtfNumber ?? "—")}</b></div>
        <div><span class="lbl">Destino</span><br/><b>${esc(despacho.destino ?? "—")}</b></div>
      </div>
    </div>

    <div class="box">
      <h2>Cadena de custodia — origen del volumen</h2>
      <table>
        <thead><tr><th>Corrida de producción</th><th class="right">Cantidad atribuida</th><th>Guías GTF de ingreso (materia prima)</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>

    <div class="firma">
      <div>Responsable del CTP</div>
      <div>Recibí conforme</div>
    </div>

    <div class="verif">
      <img src="${qrDataUrl}" alt="QR de verificación" />
      <div class="vt">
        <b>Verificable en línea:</b> escaneá el QR para contrastar esta cadena de custodia
        en vivo contra el Libro de Operaciones del establecimiento.
        <div class="vu">${esc(verifyUrl)}</div>
      </div>
    </div>

    <p class="foot">Documento interno de cadena de custodia generado desde el Libro de Operaciones CTP.
    No reemplaza a la GTF ni al LOE-CTP oficial de SERFOR. Verificable contra el libro: despacho línea #${despacho.lineNo}.</p>
    <script>setTimeout(function(){ window.print(); }, 400);</script>
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permití pop-ups para imprimir el certificado.");
  w.document.write(html);
  w.document.close();
  w.focus();
}
