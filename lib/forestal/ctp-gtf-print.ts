"use client";

/**
 * ctp-gtf-print.ts — Guía de Transporte Forestal (GTF) de SALIDA imprimible.
 *
 * El CTP está habilitado a emitir su propia GTF para movilizar el producto que
 * despacha (D.S. 018-2015-MINAGRI art. 172 inciso c). El documento se arma con la
 * identidad legal del CTP (Ficha), el número serie+correlativo asignado
 * (`emitirGtf`), el detalle del producto, la cadena de custodia y —desde 2026-07—
 * los datos que pide un puesto de control: **propietario del producto,
 * destinatario, transportista, vehículo y conductor, títulos habilitantes y los
 * datos del traslado** (ver `ctp-gtf-datos.ts` para el mapeo a la norma).
 *
 * Reglas formales que sí están verificadas contra la RDE 122-2015-SERFOR-DE:
 * · art. 3 — **Arial**, prenumerada, **A4**;
 * · art. 4 — el talonario lo visa la ARFFS: se deja el recuadro del visado;
 * · art. 5 — se imprime **original + 2 copias**, y cada una dice a dónde va
 *   (el original viaja, una copia queda en el primer puesto de control, otra la
 *   conserva el emisor);
 * · Ley 29763 art. 124 — la guía es **declaración jurada**: va el texto y la firma.
 *
 * NO reemplaza el formato/talonario oficial de la ARFFS y no se presenta como tal:
 * los campos exactos viven en los anexos gráficos de la RDE. Esto imprime los
 * mismos datos, ordenados, para llenar o adjuntar al talonario visado.
 */

import type { CtpFicha } from "@/lib/forestal/ctp-ficha-types";
import { COPIAS_GTF, faltantesGtf, gtfDatosVacio, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { CSS_GTF_OFICIAL, cuerpoGtfOficial, type LineaProducto } from "@/lib/forestal/ctp-gtf-formato";

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n4 = (v: number) => v.toFixed(4);

/** Cómo viaja la madera. En el papel se lee entero, no el valor del enum. */

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
  /** Ficha del CTP; `Partial` porque una ficha a medio llenar igual imprime. */
  ficha: Partial<CtpFicha>,
  cadena: GtfCadena | null,
  datos: GtfDatos = gtfDatosVacio(),
): Promise<void> {
  if (!despacho.gtfNumber) {
    throw new Error("El despacho todavía no tiene GTF emitida. Emití la GTF antes de imprimirla.");
  }
  // El original es el papel que se muestra en un puesto de control: sin
  // transportista, placa o destinatario no sirve, así que no se imprime a medias.
  const faltan = faltantesGtf(datos);
  if (faltan.length > 0) {
    throw new Error(
      `Falta completar la guía antes de imprimirla: ${faltan.map((f) => f.campo).join(", ")}.`,
    );
  }

  const verifyUrl = `${window.location.origin}/verificar/despacho/${encodeURIComponent(despacho.id)}`;
  const QR = (await import("qrcode")).default;
  const qrDataUrl = await QR.toDataURL(verifyUrl, { margin: 1, width: 180, errorCorrectionLevel: "M" });

  const emitido = new Date();
  const fecha = emitido.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
  const hora = emitido.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  // timeZone UTC: entryDate es date-only a medianoche UTC (off-by-one Lima).

  // Los títulos de la GUÍA, no los de la Ficha de hoy: una guía emitida tiene que
  // seguir diciendo con qué título salió aunque la ficha cambie después.
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

  /** "RUC 20512345678 · Av. Centenario 123" — el documento de identidad y dónde está. */



  // Declaración jurada: la guía LO ES por el art. 124 de la Ley 29763. Sin el
  // texto y la firma, el papel no dice bajo qué responsabilidad se emitió.
  const declaracion = `<div class="dj">
      <b>Declaración jurada.</b> El emisor declara bajo juramento que los productos forestales descritos
      provienen de aprovechamiento autorizado y están amparados por los títulos habilitantes consignados,
      y que la información de esta guía es verdadera (Ley N° 29763, art. 124; D.S. N° 018-2015-MINAGRI, art. 172).
      ${datos.citesPermiso ? `Especie CITES amparada con el permiso N° <b>${esc(datos.citesPermiso)}</b>.` : ""}
      ${datos.observaciones ? `<br/><b>Observaciones:</b> ${esc(datos.observaciones)}` : ""}
    </div>`;

  // El talonario lo visa la ARFFS antes de usarse (art. 4): el recuadro va en el
  // papel para que la marca tenga dónde ir.
  const visado = `<div class="visado">
      <div><span class="lbl">Visado / marca de la ARFFS</span><div class="caja"></div></div>
      <div><span class="lbl">Sello del puesto de control</span><div class="caja"></div></div>
    </div>`;

  // El cuerpo va con los casilleros numerados del formato de SERFOR: en un
  // puesto de control se pide "el (22)" y "el (31)", no "el destinatario".
  const lineasProducto: LineaProducto[] = [{
    cientifico: despacho.speciesScientific ?? "",
    comun: despacho.speciesCommon ?? "",
    tipoProducto: despacho.productType ?? "",
    // El formato pide la forma de presentación; el despacho no la lleva como
    // campo propio, así que va la unidad, que es lo que declara el detalle.
    presentacion: despacho.unitLabel ?? "",
    cantidad: despacho.pieces ?? 0,
    unidad: despacho.unitLabel ?? "",
    total: Number(despacho.quantity ?? 0) || 0,
  }];
  const cuerpoOficial = cuerpoGtfOficial({
    // La ficha llega parcial (se imprime aunque esté a medio llenar): los
    // casilleros sin dato quedan en blanco, que es el comportamiento correcto.
    ficha: ficha as CtpFicha,
    datos,
    lineas: lineasProducto,
    numeroGtf: despacho.gtfNumber ?? "",
    fechaExpedicion: despacho.entryDate ?? "",
    listasTrozas: despacho.gtfNumber ?? "",
    // (36) las GTF con las que ENTRÓ la materia prima: salen de la cadena, sin
    // repetir la misma guía dos veces si dos corridas comparten origen.
    gtfOrigen: [...new Set((cadena?.corridas ?? []).flatMap((c) => c.guias))].join(", "),
    // Sólo si SERFOR lo devolvió: Buleje no registra ante la autoridad.
    // Buleje no registra ante la ARFFS: mientras el operador no cargue el N°
    // que devuelve el SNIFFS, el recuadro va en blanco para llenarlo a mano.
    registroSerfor: "",
  });

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>GTF ${esc(despacho.gtfNumber)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    /* Arial: lo pide el art. 3 de la RDE 122-2015 para la guía de transporte. */
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #1f2937; font-size: 11.5px; line-height: 1.45; }
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
    /* Tres impresiones (art. 5): cada una dice a dónde va y arranca en hoja nueva. */
    .copia { page-break-after: always; }
    .copia:last-child { page-break-after: auto; }
    .tira { display: flex; justify-content: space-between; align-items: center; background: #14532d; color: #fff;
            padding: 4px 10px; border-radius: 6px; font-size: 9.5px; letter-spacing: 1px; text-transform: uppercase; }
    .tira b { color: #fff; font-size: 11px; }
    .visado { border: 1.5px dashed #14532d; border-radius: 8px; padding: 8px 12px; margin-top: 12px;
              display: flex; justify-content: space-between; gap: 16px; font-size: 9.5px; color: #4b5563; }
    .visado div { flex: 1; }
    .visado .caja { height: 46px; border-bottom: 1px solid #9ca3af; }
    .dj { margin-top: 12px; border: 1px solid #14532d; border-radius: 8px; padding: 8px 12px; font-size: 10px; color: #374151; background: #f8faf9; }
    .p3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 18px; }
    ${CSS_GTF_OFICIAL}\n  </style></head><body>
    ${COPIAS_GTF.map((copia) => `
    <section class="copia">
      <div class="tira">
        <b>${esc(copia.titulo)}</b>
        <span>${esc(copia.destino)}</span>
      </div>

      <div class="head" style="margin-top:10px">
        <div>
          <div class="emp">${esc(ficha.nombreCtp || ficha.razonSocial || "Centro de Transformación Primaria")}</div>
          <div class="meta">${ficha.razonSocial ? `${esc(ficha.razonSocial)} · ` : ""}${ficha.ruc ? `RUC ${esc(ficha.ruc)}` : ""}</div>
          <div class="meta">Código de CTP: <b>${esc(ficha.codigoCtp || "—")}</b>${ficha.arffs ? ` · ${esc(ficha.arffs)}` : ""}</div>
          <div class="meta">${esc(direccion)}</div>
        </div>
        <div class="nro">Guía N°<b>${esc(despacho.gtfNumber)}</b>Emitida ${esc(fecha)} · ${esc(hora)}</div>
      </div>

      <h1>GUÍA DE TRANSPORTE FORESTAL</h1>
      <p class="sub">Producto con transformación primaria · Salida del CTP · Declaración jurada</p>

      ${cuerpoOficial}

      ${origenBox}
      ${declaracion}

      ${visado}

      <div class="verif">
        <img src="${qrDataUrl}" alt="QR de verificación" />
        <div class="vt">
          <b>Verificable en línea:</b> escaneá el QR para contrastar el origen de este producto
          en vivo contra el Libro de Operaciones del CTP.
          <div class="vu">${esc(verifyUrl)}</div>
        </div>
      </div>

      <p class="foot">Emitida desde el Libro de Operaciones del CTP con la serie autorizada por la ARFFS.
      Se imprime en original y dos copias (RDE N° 122-2015-SERFOR-DE, art. 5). Complementa —no reemplaza— el
      formato/talonario oficial visado por la Autoridad Regional Forestal. Referencia interna: despacho línea #${despacho.lineNo}.</p>
    </section>`).join("")}

    <script>setTimeout(function(){ window.print(); }, 400);</script>
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permití pop-ups para imprimir la GTF.");
  w.document.write(html);
  w.document.close();
  w.focus();
}
