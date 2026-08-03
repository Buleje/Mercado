"use client";

/**
 * serfor-gtf-print.ts — reimprime la Guía de Transporte Forestal tal como la
 * publica SERFOR, con el layout del formato oficial (los casilleros numerados
 * del papel).
 *
 * Es la guía de INGRESO —la que ampara la madera que entró al CTP—, distinta de
 * `ctp-gtf-print.ts`, que emite la GTF de SALIDA del centro. Acá no se emite
 * nada: se re-imprime lo que ya está registrado en la base del SNIFFS, con su
 * N° de constancia de registro a la vista para que cualquiera lo verifique.
 *
 * Los datos salen de `serforGtf`, la ficha guardada con el ingreso: así la guía
 * se puede reimprimir el día de una fiscalización aunque el servicio de SERFOR
 * esté caído.
 *
 * Formato: A4, Arial (RDE N° 122-2015-SERFOR-DE art. 3). Esto NO reemplaza al
 * talonario visado por la ARFFS — es la copia legible de un registro oficial.
 */

import type { GtfSerfor } from "./serfor-gtf";
import { SERFOR_GTF_FORM, urlConsultaGtf } from "./serfor-gtf";

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Un casillero vacío se imprime vacío: en un documento oficial, "—" es ruido. */
const val = (v: unknown) => (v == null || v === "" ? "" : esc(v));

const num = (v: number | null | undefined, dec = 3) =>
  v == null || !Number.isFinite(v) ? "" : v.toFixed(dec);

export async function printGtfSerfor(gtf: GtfSerfor): Promise<void> {
  // El QR apunta a la consulta pública con este número: quien lo escanee ve la
  // guía en la base de SERFOR, no en la nuestra. Es la misma verificación que
  // trae impresa la guía original.
  const urlVerificacion = urlConsultaGtf(gtf.numeroRegistro);
  const QR = (await import("qrcode")).default;
  const qrDataUrl = await QR.toDataURL(urlVerificacion, { margin: 1, width: 180, errorCorrectionLevel: "M" });

  const productos = gtf.productos ?? [];
  const trozas = gtf.trozas ?? [];
  const total = gtf.volumenTotal ?? productos.reduce((a, p) => a + (p.volumen ?? 0), 0);

  const filasProducto = productos
    .map(
      (p) => `<tr>
        <td>${val(p.cientifico)}</td>
        <td>${val(p.comun)}</td>
        <td>${val(p.tipoProducto)}</td>
        <td class="c">${val(p.presentacion)}</td>
        <td class="c">${p.cantidad ?? ""}</td>
        <td class="c">${val(p.unidad)}</td>
        <td class="r">${num(p.volumen)}</td>
      </tr>`,
    )
    .join("");

  // Filas vacías para que la tabla ocupe el alto del formato aunque haya pocas.
  const relleno = Array.from({ length: Math.max(0, 8 - productos.length) })
    .map(() => `<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`)
    .join("");

  const listaTrozas = trozas.length
    ? `<div class="sec">LISTA DE TROZAS</div>
       <table class="t">
         <thead><tr>
           <th>Nombre científico</th><th>Nombre común</th><th>Tipo de producto</th>
           <th>Codificación</th><th>Dimensiones</th><th>Cant.</th><th>Volumen</th>
         </tr></thead>
         <tbody>${trozas
           .map(
             (t) => `<tr>
               <td>${val(t.cientifico)}</td><td>${val(t.comun)}</td><td>${val(t.tipoProducto)}</td>
               <td class="c">${val(t.codificacion)}</td><td class="c">${val(t.dimensiones)}</td>
               <td class="c">${t.cantidad ?? ""}</td><td class="r">${num(t.volumen)}</td>
             </tr>`,
           )
           .join("")}</tbody>
       </table>`
    : "";

  /**
   * (5) Origen del Recurso: el formato tiene una fila de casillas y se marca
   * UNA con una X. SERFOR devuelve el texto ("PERMISO"), así que se marca la que
   * corresponda y las demás quedan en blanco — como el papel.
   */
  const ORIGENES = [
    ["Concesión", "CONCESION"],
    ["Permiso", "PERMISO"],
    ["Autorización", "AUTORIZACION"],
    ["Bosque Local", "BOSQUE LOCAL"],
    ["Desbosque", "DESBOSQUE"],
    ["Cambio de Uso", "CAMBIO DE USO"],
    ["Plantación", "PLANTACION"],
    ["Plan de Manejo Consolidado", "PLAN DE MANEJO CONSOLIDADO"],
    ["Otros", "OTROS"],
  ] as const;
  const origenNorm = (gtf.origenRecurso ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  const casilla = (label: string, clave: string) =>
    `<span class="ox"><span class="oxl">${esc(label)}</span><span class="oxb">${origenNorm === clave ? "X" : "&nbsp;"}</span></span>`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8" />
  <title>GTF ${esc(gtf.gtfNumber ?? gtf.numeroRegistro)}</title>
  <style>
    @page { size: A4; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 7.6pt; color: #000; margin: 0; }
    .hoja { border: 1px solid #000; }
    .top { display: flex; border-bottom: 1px solid #000; }
    .emisor { flex: 1; padding: 5px 7px; }
    .emisor .n { font-weight: bold; font-size: 9.5pt; }
    .qr { width: 66px; padding: 5px 3px; display: flex; align-items: center; justify-content: center; }
    .qr img { width: 60px; height: 60px; }
    .tit { width: 168px; padding: 5px 7px; text-align: center; border-left: 1px solid #000; }
    .tit .t1 { font-weight: bold; font-size: 10pt; line-height: 1.15; }
    .tit .t2 { font-weight: bold; font-size: 11pt; margin-top: 3px; }
    .fila { display: flex; border-bottom: 0.5px solid #bbb; padding: 2.5px 7px; gap: 6px; align-items: baseline; }
    .fila > div { flex: 1; }
    .k { color: #000; }
    b { font-weight: bold; }
    .ox { display: inline-flex; align-items: center; gap: 3px; margin-right: 10px; }
    .oxl { font-size: 7.2pt; }
    .oxb { display: inline-block; width: 26px; height: 12px; border: 0.8px solid #000; text-align: center;
           font-weight: bold; font-size: 8pt; line-height: 11px; }
    .sec { font-weight: bold; padding: 3px 7px; border-top: 1px solid #000; border-bottom: 0.5px solid #bbb; }
    table.t { width: 100%; border-collapse: collapse; }
    table.t th, table.t td { border: 0.8px solid #000; padding: 3px 4px; font-size: 7.2pt; }
    table.t th { text-align: center; font-weight: bold; }
    .c { text-align: center; } .r { text-align: right; }
    .vacia td { height: 13px; }
    .totalrow td { border: 0.8px solid #000; font-weight: bold; }
    .pie { display: flex; gap: 12px; margin: 8px 7px 0; align-items: stretch; }
    .estado { background: #000; color: #fff; padding: 7px 14px; text-align: center; min-width: 172px; }
    .estado .e1 { font-weight: bold; font-size: 11.5pt; }
    .estado .e2 { font-size: 7.6pt; margin-top: 3px; }
    .firmas { flex: 1; display: flex; flex-direction: column; justify-content: space-around; }
    .firmas div { border-bottom: 0.5px solid #000; font-size: 7.4pt; padding-bottom: 12px; }
    .legal { font-size: 6.6pt; margin: 6px 7px 0; line-height: 1.35; }
    .idbox { font-family: "Courier New", monospace; font-size: 7.6pt; margin: 6px 7px 8px; }
  </style></head><body>
  <div class="hoja">
    <div class="top">
      <div class="emisor">
        <div class="n">${val(gtf.titular)}</div>
        <div>${val(gtf.direccionTitular)}</div>
        <div>${[gtf.distrito, gtf.provincia, gtf.departamento].filter(Boolean).map(esc).join(" ")}</div>
        <div><b>RUC: ${val(gtf.rucInstancia)}</b></div>
      </div>
      <div class="qr"><img src="${qrDataUrl}" alt="QR de verificación en SERFOR" /></div>
      <div class="tit">
        <div class="t1">GUIA DE TRANSPORTE<br />FORESTAL</div>
        <div class="t2">N° ${val(gtf.gtfNumber)}</div>
      </div>
    </div>

    <div class="fila"><div>(2) Autoridad Regional Forestal y de Fauna Silvestre: <b>${val(gtf.instanciaRegistra)}</b></div></div>
    <div class="fila">
      <div>(3) Fecha de Expedición: <b>${val(gtf.fechaExpedicion)}</b></div>
      <div>(4) Fecha de Vencimiento: <b>${val(gtf.fechaVencimiento)}</b></div>
    </div>
    <div class="fila"><div>(5) Origen del Recurso: ${ORIGENES.slice(0, 5).map(([l, k]) => casilla(l, k)).join("")}</div></div>
    <div class="fila"><div>${ORIGENES.slice(5).map(([l, k]) => casilla(l, k)).join("")}</div></div>
    <div class="fila"><div>(6) Número: <b>${val(gtf.numeroTitulo)}</b></div></div>
    <div class="fila">
      <div>(7) Nombre del Titular: <b>${val(gtf.titular)}</b></div>
      <div>Representante Legal: <b>${val(gtf.representanteLegal)}</b></div>
    </div>
    <div class="fila">
      <div>(8) N° de Resolución: <b>${val(gtf.numeroResolucion)}</b></div>
      <div>(9) Plan de Manejo (Tipo): <b></b></div>
    </div>
    <div class="fila"><div>(10) Departamento: <b>${val(gtf.departamento)}</b></div></div>
    <div class="fila">
      <div>(11) Provincia: <b>${val(gtf.provincia)}</b></div>
      <div>(12) Distrito: <b>${val(gtf.distrito)}</b></div>
    </div>

    <div class="fila">
      <div>(13) PROPIETARIO DEL PRODUCTO: <b>${val(gtf.propietario)}</b></div>
      <div>(14) D.N.I. N°: <b></b></div>
    </div>
    <div class="fila">
      <div>(15) R.U.C. N°: <b>${val(gtf.propietarioDoc)}</b></div>
      <div>(16) Dirección: <b>${val(gtf.propietarioDireccion)}</b></div>
    </div>
    <div class="fila">
      <div>(17) Departamento: <b>${val(gtf.propietarioDepartamento)}</b></div>
      <div>(18) Provincia: <b>${val(gtf.propietarioProvincia)}</b></div>
      <div>(19) Distrito: <b>${val(gtf.propietarioDistrito)}</b></div>
    </div>
    <div class="fila">
      <div>(20) Tipo de Comprobante de Compra o venta: <b></b></div>
      <div>(21) N° Comprobante: <b></b></div>
    </div>

    <div class="fila">
      <div>(22) DESTINATARIO: <b>${val(gtf.destinatario)}</b></div>
      <div>(23) D.N.I. N°: <b>${val((gtf.destinatarioDoc ?? "").split("/")[1]?.trim() ?? "")}</b></div>
    </div>
    <div class="fila">
      <div>(24) R.U.C. N°: <b>${val((gtf.destinatarioDoc ?? "").split("/")[0]?.trim() ?? "")}</b></div>
      <div>(25) Dirección: <b>${val(gtf.destinatarioDireccion)}</b></div>
    </div>
    <div class="fila">
      <div>(26) Departamento: <b>${val(gtf.destinatarioDepartamento)}</b></div>
      <div>(27) Provincia: <b>${val(gtf.destinatarioProvincia)}</b></div>
      <div>(28) Distrito: <b>${val(gtf.destinatarioDistrito)}</b></div>
    </div>

    <div class="sec">TRANSPORTISTA:</div>
    <div class="fila">
      <div>(29) N° Guía de Remisión: <b>${val(gtf.guiaRemision)}</b></div>
      <div>(30) Tipo de Transporte: <b>${val(gtf.tipoTransporte)}</b></div>
    </div>
    <div class="fila">
      <div>(31) Tipo de Vehículo: <b>${val(gtf.tipoVehiculo)}</b></div>
      <div>(31) Placa(s) N°: <b>${val(gtf.placa)}</b></div>
    </div>
    <div class="fila">
      <div>(32) Conductor: <b>${val(gtf.transportista)}</b></div>
      <div>(33) D.N.I. N°: <b>${val(gtf.transportistaDni)}</b></div>
      <div>(34) Licencia de conducir N°: <b>${val(gtf.licenciaConducir)}</b></div>
    </div>

    <div class="sec">DETALLE DEL PRODUCTO</div>
    <div class="fila">
      <div>(35) Lista(s) de Troza(s): <b>${val(gtf.listaTrozas)}</b></div>
      <div>(36) N° GTF de Origen: <b>-</b></div>
    </div>
    <table class="t">
      <thead>
        <tr>
          <th rowspan="2" style="width:23%">(37a) Nombre Científico</th>
          <th rowspan="2" style="width:16%">(37b) Nombre Común<br />o Comercial</th>
          <th rowspan="2" style="width:19%">(37c) Tipo de Producto</th>
          <th colspan="2">Forma de embalaje o<br />presentación del producto</th>
          <th colspan="2">Cantidad</th>
        </tr>
        <tr>
          <th style="width:11%">(37d) Descripción</th>
          <th style="width:8%">(37e) Cantidad</th>
          <th style="width:12%">(37f) Unidad<br />de medida</th>
          <th style="width:11%">(37g) Total</th>
        </tr>
      </thead>
      <tbody>${filasProducto}${relleno}</tbody>
      <tfoot>
        <tr class="totalrow">
          <td colspan="6" class="r">(38) Observaciones: &nbsp;</td>
          <td class="r">Volumen Total: ${num(total)}</td>
        </tr>
      </tfoot>
    </table>

    ${listaTrozas}

    <div class="pie">
      <div class="estado">
        <div class="e1">ESTADO: ${val((gtf.estado ?? "REGISTRADA")).toUpperCase()}</div>
        <div class="e2">N° REGISTRO : ${val(gtf.numeroRegistro)}</div>
      </div>
      <div class="firmas">
        <div>(39) Firma y sello del emisor :</div>
        <div>(40) Nombres y apellidos del emisor : ${val(gtf.representanteLegal)}</div>
      </div>
    </div>

    <p class="legal">
      Se invalida la GTF cuando contiene enmendaduras y/o alteraciones.<br />
      La presente GTF tiene carácter de declaración jurada y está sujeta a acciones penales contempladas en el
      numeral 32.3 del artículo N° 32 de la Ley 27444 (Ley del Procedimiento Administrativo General)
    </p>
    <div class="idbox">
      ID: ${val(gtf.numeroRegistro)}/${val(gtf.rucInstancia)}-${val(gtf.gtfNumber)}<br />
      Reimpresión del registro consultado en el SNIFFS — SERFOR${gtf.fechaRegistro ? ` · registrada el ${val(gtf.fechaRegistro)}` : ""}.
      Verificable escaneando el QR o en ${esc(SERFOR_GTF_FORM)}
    </div>
  </div>
  <script>setTimeout(function(){ window.print(); }, 400);</script>
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permití pop-ups para imprimir la guía.");
  w.document.write(html);
  w.document.close();
  w.focus();
}
