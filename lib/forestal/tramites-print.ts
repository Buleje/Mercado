"use client";

/**
 * tramites-print — el documento que se presenta en mesa de partes.
 *
 * Estructura de una solicitud administrativa peruana (Ley 27444): membrete del
 * administrado, destinatario con cargo, referencia, asunto, cuerpo numerado,
 * base legal, anexos, lugar y fecha, firma. Reusa `ctp-print-shared` — el mismo
 * motor de impresión y el mismo bloque de identidad que los demás reportes del
 * módulo, así el pie legal y el membrete viven en UN lugar (ADR-308).
 *
 * El armado del TEXTO es puro y está en `tramites-catalogo`; acá sólo se maqueta.
 */

import { GEO_PLACENAME } from "@/lib/geo";
import {
  CTP_REPORT_BASE_CSS,
  esc,
  openCtpReport,
  type CtpReportFicha,
} from "./ctp-print-shared";
import {
  AUTORIDADES,
  asuntoDe,
  cuerpoDe,
  type DatosTramite,
  type FormatoTramite,
} from "./tramites-catalogo";

const TRAMITE_CSS = `
  /* Membrete: el nombre del CTP grande con una regla de acento debajo, como un
     papel con logo impreso. La caja gris genérica se veía a formulario interno. */
  .membrete{border-bottom:2.5px solid #0f5132;padding-bottom:10px;margin-bottom:4px}
  .membrete .razon{font-size:19px;font-weight:700;color:#0f5132;letter-spacing:.2px;line-height:1.2}
  .membrete .linea2{margin-top:3px;font-size:11.5px;color:#555}
  .membrete .linea2 span+span:before{content:" · ";color:#bbb}
  .doc-tipo{margin-top:14px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#0f5132;font-weight:700}
  .dest{margin:16px 0 4px;font-size:13px;line-height:1.6}
  .dest .cargo{font-weight:700;text-transform:uppercase;letter-spacing:.3px}
  .dest .ent{color:#444}
  .meta{margin:14px 0 18px;font-size:12.5px}
  .meta div{margin:2px 0}
  .meta .k{color:#888;display:inline-block;min-width:82px}
  .cuerpo p{margin:0 0 11px;text-align:justify}
  .cuerpo .lead{font-weight:600}
  .legal{margin-top:18px;font-size:11.5px;color:#555}
  .legal li{margin:2px 0}
  .anexos li{margin:3px 0;font-size:12px}
  .firma-uno{margin-top:56px;font-size:12px;text-align:center;width:58%}
  .firma-uno .linea{border-top:1px solid #999;padding-top:6px;color:#333}
  .lugar{margin-top:26px;font-size:12.5px;color:#444}
  .aviso{margin-top:16px;padding:9px 12px;border-left:3px solid #b45309;background:#fffbeb;color:#7c2d12;font-size:11.5px}
  @media print{.aviso{display:none}}
`;

export interface TramitePrintOpts {
  formato: FormatoTramite;
  datos: DatosTramite;
  ficha: CtpReportFicha | null;
  /** Ciudad de la firma ("Pucallpa"). El día lo pone el generador. Si el
   *  formulario trae `lugar`, ese gana: lo tipeó quien firma. */
  lugar?: string;
  /** N° de documento propio del CTP, si el titular numera sus oficios. */
  numeroDocumento?: string;
}

const hoyLargo = (): string =>
  new Date().toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Lima",
  });

/** El HTML del documento. Separado del `open` para poder testear el contenido. */
export function buildTramiteHtml(o: TramitePrintOpts): string {
  const { formato, datos, ficha } = o;
  const asunto = asuntoDe(formato, datos);
  const parrafos = cuerpoDe(formato, datos);
  const autoridad = AUTORIDADES[formato.autoridad];
  const firmante = (datos.firmante ?? "").trim();
  const dni = (datos.firmanteDni ?? "").trim();

  const destinatario = `<div class="dest">
    <div class="cargo">${esc((datos.destinatarioCargo ?? "").trim() || autoridad.label)}</div>
    ${(datos.destinatarioEntidad ?? "").trim() ? `<div class="ent">${esc(datos.destinatarioEntidad)}</div>` : ""}
    <div class="ent">Presente.—</div>
  </div>`;

  const meta = `<div class="meta">
    ${o.numeroDocumento ? `<div><span class="k">Documento:</span> ${esc(o.numeroDocumento)}</div>` : ""}
    <div><span class="k">Asunto:</span> <strong>${esc(asunto)}</strong></div>
    ${(datos.referencia ?? "").trim() ? `<div><span class="k">Referencia:</span> ${esc(datos.referencia)}</div>` : ""}
    ${(datos.expediente ?? "").trim() ? `<div><span class="k">Expediente:</span> ${esc(datos.expediente)}</div>` : ""}
  </div>`;

  // "Tengo el agrado de dirigirme…" y el "Que," de cada párrafo son la fórmula
  // que espera mesa de partes: sin eso el documento se lee como un email.
  const cuerpo = `<div class="cuerpo">
    <p class="lead">Tengo el agrado de dirigirme a usted para saludarlo(a) cordialmente y, a la vez, exponer lo siguiente:</p>
    ${parrafos.map((p) => `<p>${esc(p)}</p>`).join("")}
    <p>Atentamente,</p>
  </div>`;

  const anexos = formato.anexos.length
    ? `<h2>Anexos</h2><ol class="anexos">${formato.anexos.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>`
    : "";

  const legal = `<div class="legal"><h2>Base legal</h2><ul>${formato.baseLegal
    .map((b) => `<li>${esc(b)}</li>`)
    .join("")}</ul></div>`;

  // El lugar sale del formulario, o de la ficha, o del establecimiento. Nunca
  // un guion: un oficio que dice "—, 29 de julio" se ve hecho a las apuradas.
  const lugar =
    (datos.lugar ?? "").trim() ||
    (o.lugar ?? "").trim() ||
    [ficha?.provincia, ficha?.region].map((x) => (x ?? "").trim()).filter(Boolean)[0] ||
    GEO_PLACENAME;

  const firma = `<div class="lugar">${esc(lugar)}, ${esc(hoyLargo())}</div>
  <div class="firma-uno"><div class="linea">${esc(firmante || "Firma del titular o representante legal")}</div>
  ${dni ? `<div style="color:#666;font-size:11.5px">DNI ${esc(dni)}</div>` : ""}
  ${ficha?.razonSocial ? `<div style="color:#666;font-size:11.5px">${esc(ficha.razonSocial)}</div>` : ""}</div>`;

  const aviso = formato.advertencia
    ? `<div class="aviso"><strong>Antes de presentar:</strong> ${esc(formato.advertencia)}</div>`
    : "";

  // Membrete del administrado: razón social grande + los datos que la autoridad
  // cruza (RUC, Código de CTP, registro ARFFS, dirección). Los vacíos se omiten:
  // un membrete con "Registro ARFFS: —" declara que no lo tiene.
  const linea2 = [
    ficha?.ruc ? `RUC ${ficha.ruc}` : "",
    ficha?.codigoCtp ? `Código de CTP ${ficha.codigoCtp}` : "",
    ficha?.registroArffs ? `Registro ARFFS ${ficha.registroArffs}` : "",
  ].filter(Boolean);
  const linea3 = [
    ficha?.direccion,
    [ficha?.distrito, ficha?.provincia, ficha?.region].filter(Boolean).join(", "),
  ]
    .map((x) => (x ?? "").trim())
    .filter(Boolean);

  const membrete = `<div class="membrete">
    <div class="razon">${esc(ficha?.razonSocial || ficha?.nombreCtp || "Centro de Transformación Primaria")}</div>
    ${linea2.length ? `<div class="linea2">${linea2.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
    ${linea3.length ? `<div class="linea2">${linea3.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
  </div>
  <div class="doc-tipo">${esc(formato.nombre)} · ${esc(autoridad.corto)}</div>`;

  return `${membrete}
  ${destinatario}
  ${meta}
  ${cuerpo}
  ${firma}
  ${anexos}
  ${legal}
  ${aviso}`;
}

/** Abre el documento en una ventana imprimible (guardar como PDF). */
export function imprimirTramite(o: TramitePrintOpts): void {
  openCtpReport({
    title: `${o.formato.nombre} — ${o.ficha?.razonSocial ?? "CTP"}`,
    css: TRAMITE_CSS,
    body: buildTramiteHtml(o),
  });
}

/** El CSS del documento, expuesto para la previsualización embebida en la app. */
export const TRAMITE_PREVIEW_CSS = `${CTP_REPORT_BASE_CSS}${TRAMITE_CSS}`;
